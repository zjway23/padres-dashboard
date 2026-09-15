"""Domain layer: turns raw MLB Stats API documents into the shapes the UI needs.

Everything here reads through `mlb.get_json`, so results are cached and no route
fans out into per-player requests.
"""

import re
from datetime import date, timedelta

from mlb import (
    BASE_V11, DIVISION_NAMES, TTL_GAMELOG, TTL_LIVE, TTL_PLAYS, TTL_ROSTER,
    TTL_SCHEDULE, TTL_STANDINGS, current_season, fmt, get_json, league_id_for,
    resolve_team_id, season_info, team_meta, team_name, today_et,
)

GAMES_IN_SEASON = 162
FINAL_STATES = ("Final", "Game Over", "Completed Early")
LIVE_STATES = ("In Progress", "Manager challenge", "Warmup")


def _num(value):
    """Coerce an API stat value to a number, or None when it's missing."""
    if value in (None, "", "-", ".---", "-.--", "*.**"):
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        try:
            return float(value)
        except (TypeError, ValueError):
            return None


def _rate(value):
    """Keep rate stats (.284, 3.51) as strings so leading zeros render correctly."""
    if value in (None, "", "-", ".---", "-.--", "*.**"):
        return None
    return str(value)


# ─── Rosters & season stat lines ──────────────────────────────────────────────

def _hydrated_roster(team_id, group, season=None):
    """One request returning the active roster with each player's season stats."""
    season = season or current_season()
    return get_json(
        f"/teams/{team_id}/roster",
        {
            "rosterType": "active",
            "season": season,
            # Hydrating stats onto the roster replaces ~30 per-player requests
            # with a single call, which is the difference between a 30s and a
            # 0.3s response for this endpoint.
            "hydrate": f"person(stats(type=season,season={season},gameType=R,group={group}))",
        },
        ttl=TTL_ROSTER,
    )


def _season_split(person, group):
    for block in person.get("stats") or []:
        if block.get("group", {}).get("displayName") != group:
            continue
        splits = block.get("splits") or []
        if splits:
            return splits[0].get("stat", {})
    return {}


def batting_stats(team_id):
    """Season batting lines for a team's position players, best average first."""
    data = _hydrated_roster(team_id, "hitting")
    name = team_name(team_id)
    players = []
    for entry in data.get("roster", []):
        person = entry.get("person", {})
        position = entry.get("position", {}).get("abbreviation", "")
        if position == "P":
            continue
        s = _season_split(person, "hitting")
        players.append({
            "player_id": person.get("id"),
            "name": person.get("fullName", "Unknown"),
            "position": position,
            "team": name,
            "team_id": team_id,
            "bats": person.get("batSide", {}).get("code"),
            "games": _num(s.get("gamesPlayed")),
            "ab": _num(s.get("atBats")),
            "runs": _num(s.get("runs")),
            "hits": _num(s.get("hits")),
            "doubles": _num(s.get("doubles")),
            "triples": _num(s.get("triples")),
            "hr": _num(s.get("homeRuns")),
            "rbi": _num(s.get("rbi")),
            "bb": _num(s.get("baseOnBalls")),
            "k": _num(s.get("strikeOuts")),
            "sb": _num(s.get("stolenBases")),
            "cs": _num(s.get("caughtStealing")),
            "avg": _rate(s.get("avg")),
            "obp": _rate(s.get("obp")),
            "slg": _rate(s.get("slg")),
            "ops": _rate(s.get("ops")),
        })
    players.sort(key=lambda p: float(p["avg"]) if p["avg"] else -1, reverse=True)
    return players


def pitching_stats(team_id):
    """Season pitching lines, tagged SP/RP using the club's own depth chart."""
    data = _hydrated_roster(team_id, "pitching")
    name = team_name(team_id)
    starter_ids = _depth_chart_starters(team_id)

    players = []
    for entry in data.get("roster", []):
        person = entry.get("person", {})
        if entry.get("position", {}).get("abbreviation") != "P":
            continue
        s = _season_split(person, "pitching")
        pid = person.get("id")
        hand = person.get("pitchHand", {}).get("code", "R")
        games = _num(s.get("gamesPlayed")) or 0
        starts = _num(s.get("gamesStarted")) or 0
        # Depth chart is authoritative, but fall back to usage for players the
        # club hasn't slotted yet (callups, recent acquisitions).
        role = "SP" if (pid in starter_ids or (games and starts / games > 0.5)) else "RP"
        players.append({
            "player_id": pid,
            "name": person.get("fullName", "Unknown"),
            "position": "LHP" if hand == "L" else "RHP",
            "role": role,
            "team": name,
            "team_id": team_id,
            "games": games,
            "starts": starts,
            "wins": _num(s.get("wins")) or 0,
            "losses": _num(s.get("losses")) or 0,
            "era": _rate(s.get("era")),
            "ip": _rate(s.get("inningsPitched")),
            "so": _num(s.get("strikeOuts")) or 0,
            "bb": _num(s.get("baseOnBalls")) or 0,
            "whip": _rate(s.get("whip")),
            "saves": _num(s.get("saves")) or 0,
            "holds": _num(s.get("holds")) or 0,
            "hr_allowed": _num(s.get("homeRuns")) or 0,
            "avg_against": _rate(s.get("avg")),
            "k_per_9": _rate(s.get("strikeoutsPer9Inn")),
        })

    # Starters first (by ERA), then the bullpen (by ERA).
    def era_key(p):
        return float(p["era"]) if p["era"] else 99.0

    starters = sorted([p for p in players if p["role"] == "SP"], key=era_key)
    relievers = sorted([p for p in players if p["role"] == "RP"], key=era_key)
    return starters + relievers


def _depth_chart_starters(team_id):
    try:
        data = get_json(f"/teams/{team_id}/roster",
                        {"rosterType": "depthChart", "season": current_season()},
                        ttl=TTL_ROSTER)
    except Exception:
        return set()
    return {e["person"]["id"] for e in data.get("roster", [])
            if e.get("position", {}).get("abbreviation") == "SP"}


# ─── Bullpen usage ────────────────────────────────────────────────────────────

def bullpen(team_id):
    """Reliever availability derived from recent game logs.

    Rest days and three-day pitch counts come from a single hydrated game-log
    request, then get folded into a simple availability signal:
      - 'unavailable' : pitched 3 straight days, or a heavy back-to-back load
      - 'caution'     : pitched yesterday, or 45+ pitches over the last 3 days
      - 'available'   : everyone else
    """
    season = current_season()
    data = get_json(
        f"/teams/{team_id}/roster",
        {
            "rosterType": "active",
            "season": season,
            "hydrate": f"person(stats(type=gameLog,season={season},gameType=R,group=pitching))",
        },
        ttl=TTL_GAMELOG,
    )

    today = today_et()
    starter_ids = _depth_chart_starters(team_id)
    season_lines = {p["player_id"]: p for p in pitching_stats(team_id)}

    out = []
    for entry in data.get("roster", []):
        person = entry.get("person", {})
        if entry.get("position", {}).get("abbreviation") != "P":
            continue
        pid = person.get("id")
        line = season_lines.get(pid, {})
        if line.get("role") == "SP" or pid in starter_ids:
            continue

        appearances = []
        for block in person.get("stats") or []:
            for split in block.get("splits") or []:
                day = split.get("date")
                if not day:
                    continue
                s = split.get("stat", {})
                appearances.append({
                    "date": day,
                    "pitches": _num(s.get("numberOfPitches")) or 0,
                    "ip": _rate(s.get("inningsPitched")) or "0.0",
                    "runs": _num(s.get("earnedRuns")) or 0,
                    "so": _num(s.get("strikeOuts")) or 0,
                    "bb": _num(s.get("baseOnBalls")) or 0,
                })
        appearances.sort(key=lambda a: a["date"])
        recent = appearances[-10:]

        last_date = recent[-1]["date"] if recent else None
        rest_days = None
        if last_date:
            parsed = _parse_day(last_date)
            rest_days = (today - parsed).days if parsed else None

        def pitches_within(days):
            cutoff = fmt(today - timedelta(days=days))
            return sum(a["pitches"] for a in recent if a["date"] >= cutoff)

        p3 = pitches_within(3)
        days_pitched_3 = len({a["date"] for a in recent
                              if a["date"] >= fmt(today - timedelta(days=3))})

        if rest_days is not None and rest_days <= 1 and days_pitched_3 >= 3:
            status, reason = "unavailable", "Pitched 3 straight days"
        elif rest_days == 0:
            status, reason = "unavailable", "Pitched today"
        elif rest_days is not None and rest_days <= 1 and p3 >= 40:
            status, reason = "caution", "Heavy back-to-back workload"
        elif rest_days == 1:
            status, reason = "caution", "Pitched yesterday"
        elif p3 >= 45:
            status, reason = "caution", f"{p3} pitches in last 3 days"
        else:
            status, reason = "available", "Rested"

        out.append({
            "player_id": pid,
            "name": person.get("fullName", "Unknown"),
            "position": line.get("position") or ("LHP" if person.get("pitchHand", {}).get("code") == "L" else "RHP"),
            "team_id": team_id,
            "era": line.get("era"),
            "whip": line.get("whip"),
            "ip": line.get("ip"),
            "so": line.get("so"),
            "saves": line.get("saves"),
            "holds": line.get("holds"),
            "appearances": len(appearances),
            "last_pitched": last_date,
            "rest_days": rest_days,
            "pitches_last_3": p3,
            "days_pitched_last_3": days_pitched_3,
            "status": status,
            "status_reason": reason,
            "recent": list(reversed(recent[-5:])),
        })

    order = {"available": 0, "caution": 1, "unavailable": 2}
    out.sort(key=lambda p: (order[p["status"]], float(p["era"]) if p["era"] else 99))
    return out


# ─── Injury report ────────────────────────────────────────────────────────────

# Roster status codes that mean "hurt", mapped to the minimum stay the list
# imposes. ILF ("Injured - Full Season") has no clock - the year is already over.
IL_STAY = {"D7": 7, "D10": 10, "D15": 15, "D60": 60, "ILF": None}

IL_LABEL = {"D7": "7-day IL", "D10": "10-day IL", "D15": "15-day IL",
            "D60": "60-day IL", "ILF": "Season-ending IL"}

# Which roster views to scan. The 40-man covers everyone under contract, the
# depth chart adds players the club still slots at a position, and fullSeason
# remembers anyone who appeared this year. `fullRoster` is deliberately left
# out: it drags in the whole farm system, where a minor-league 7-day IL stint
# is noise rather than news.
INJURY_ROSTERS = ("40Man", "depthChart", "fullSeason")

# A rehab assignment is capped by rule: 30 days for pitchers, 20 for hitters.
REHAB_LIMIT = {"pitching": 30, "hitting": 20}

_PLACED_RE = re.compile(r"placed .*? on the (\d+)-day injured list", re.I)
_TRANSFER_RE = re.compile(r"transferred .*? to the (\d+)-day injured list", re.I)
_ACTIVATED_RE = re.compile(r"\bactivated\b", re.I)
_REHAB_RE = re.compile(r"on a rehab assignment to (.+?)\.?$", re.I)
# Placements carry the diagnosis as a trailing sentence:
# "... on the 10-day injured list retroactive to May 31, 2026. Right hip inflammation."
_DIAGNOSIS_RE = re.compile(r"injured list(?: retroactive to [^.]*)?\.\s*(.+?)\.?\s*$", re.I)

_PEOPLE_FIELDS = ",".join([
    "people", "id", "fullName", "primaryPosition", "abbreviation",
    "stats", "type", "displayName", "group", "splits", "date", "season", "stat",
    "gamesPlayed", "atBats", "runs", "hits", "doubles", "triples", "homeRuns",
    "rbi", "baseOnBalls", "strikeOuts", "stolenBases", "caughtStealing",
    "avg", "obp", "slg", "ops", "era", "inningsPitched", "whip", "wins",
    "losses", "saves", "holds",
])


def _parse_day(value):
    """'2026-06-30' -> date. Returns None for nulls and malformed values."""
    try:
        y, m, d = (int(part) for part in str(value).split("-"))
        return date(y, m, d)
    except Exception:
        return None


def _short_day(value):
    """'2026-06-30' -> 'Jun 30'. Dates land in sentences here, not just columns."""
    day = _parse_day(value) if not isinstance(value, date) else value
    # Built by hand rather than with %-d, which is not portable off glibc.
    return f"{day.strftime('%b')} {day.day}" if day else ""


def _injured_roster_entries(team_id):
    """Every hurt player the club still carries, merged across roster views.

    No single roster type is enough: a 60-day player drops off the depth chart,
    a just-acquired player may not be on it yet, and fullSeason is the only view
    that remembers someone who played earlier in the year.
    """
    season = current_season()
    found = {}
    for roster_type in INJURY_ROSTERS:
        try:
            data = get_json(f"/teams/{team_id}/roster",
                            {"rosterType": roster_type, "season": season},
                            ttl=TTL_ROSTER)
        except Exception:
            continue
        for entry in data.get("roster", []):
            status = entry.get("status") or {}
            code = status.get("code", "")
            if code not in IL_STAY:
                continue
            person = entry.get("person", {})
            pid = person.get("id")
            if pid is None:
                continue
            known = found.get(pid)
            # Prefer the longest list any view reports: a player transferred to
            # the 60-day can still read as 15-day on a roster view that lagged.
            if known and (IL_STAY[known["il_code"]] or 999) >= (IL_STAY[code] or 999):
                continue
            found[pid] = {
                "player_id": pid,
                "name": person.get("fullName", "Unknown"),
                "position": entry.get("position", {}).get("abbreviation", ""),
                "il_code": code,
                "il_label": IL_LABEL.get(code, status.get("description", "Injured")),
                "il_days": IL_STAY[code],
            }
    return found


def _season_transactions(team_id):
    """This season's transactions for one club, grouped by player.

    A single request covers the whole year, which is what makes the injury
    timeline affordable: the alternative is one lookup per injured player.
    """
    season = current_season()
    data = get_json("/transactions", {
        "teamId": team_id,
        "startDate": f"{season}-01-01",
        "endDate": fmt(today_et()),
    }, ttl=TTL_ROSTER)

    by_player = {}
    for tx in data.get("transactions", []):
        pid = (tx.get("person") or {}).get("id")
        text = tx.get("description") or ""
        if pid is None or not text:
            continue
        # Retroactive placements backdate the IL clock, and `resolutionDate`
        # is where the API records that. Reading `date` would lose the days a
        # player was already out before the paperwork landed.
        day = tx.get("resolutionDate") or tx.get("effectiveDate") or tx.get("date")
        by_player.setdefault(pid, []).append({"date": day, "description": text})

    for events in by_player.values():
        events.sort(key=lambda e: e["date"] or "")
        # The feed repeats some entries (a trade shows up once per player
        # involved); identical text on the same day is the same event.
        seen, unique = set(), []
        for event in events:
            key = (event["date"], event["description"])
            if key in seen:
                continue
            seen.add(key)
            unique.append(event)
        events[:] = unique
    return by_player


def _current_stint(events):
    """Replay a player's transactions down to the IL stint they're still on.

    A placement opens a stint; a transfer to the 60-day extends it without
    restarting the clock (60-day time counts from the original placement date);
    a rehab assignment attaches to it; an activation closes it.
    """
    stint = None
    for event in events:
        text = event["description"]
        placed = _PLACED_RE.search(text)
        transferred = _TRANSFER_RE.search(text)
        diagnosis = _DIAGNOSIS_RE.search(text)

        if placed:
            stint = {"placed": event["date"], "days": int(placed.group(1)),
                     "injury": diagnosis.group(1) if diagnosis else None,
                     "transferred": None, "rehab": None, "placed_estimated": False}
        elif transferred:
            if stint is None:
                # Acquired while already hurt, so the placement belongs to the
                # other club's feed. The start date gets estimated downstream.
                stint = {"placed": None, "days": None, "injury": None,
                         "transferred": None, "rehab": None, "placed_estimated": True}
            stint["days"] = int(transferred.group(1))
            stint["transferred"] = event["date"]
            if diagnosis:
                stint["injury"] = diagnosis.group(1)
        elif _ACTIVATED_RE.search(text):
            stint = None
        elif stint is not None:
            rehab = _REHAB_RE.search(text)
            if rehab:
                stint["rehab"] = {"started": event["date"], "club": rehab.group(1)}
    return stint


def _people_stats(player_ids, season, types="[season,gameLog,yearByYear]"):
    """Hydrated stat bundle for a batch of players in one request."""
    if not player_ids:
        return {}
    people = {}
    ids = sorted(player_ids)
    for i in range(0, len(ids), 40):
        chunk = ids[i:i + 40]
        try:
            data = get_json("/people", {
                "personIds": ",".join(str(pid) for pid in chunk),
                "hydrate": (f"stats(group=[hitting,pitching],type={types},"
                            f"season={season},gameType=R)"),
                "fields": _PEOPLE_FIELDS,
            }, ttl=TTL_ROSTER)
        except Exception:
            continue
        for person in data.get("people", []):
            people[person.get("id")] = person
    return people


def _stat_blocks(person, wanted):
    for block in person.get("stats") or []:
        if block.get("type", {}).get("displayName") == wanted:
            yield block


def _last_game_date(person):
    dates = [split.get("date") for block in _stat_blocks(person, "gameLog")
             for split in block.get("splits") or [] if split.get("date")]
    return max(dates) if dates else None


def _last_season_played(person):
    seasons = [int(split["season"]) for block in _stat_blocks(person, "yearByYear")
               for split in block.get("splits") or []
               if split.get("season") and (_num(split.get("stat", {}).get("gamesPlayed")) or 0) > 0]
    return max(seasons) if seasons else None


def _season_line(person, group):
    for block in _stat_blocks(person, "season"):
        if block.get("group", {}).get("displayName") != group:
            continue
        splits = block.get("splits") or []
        if splits:
            return splits[0].get("stat", {})
    return {}


def _team_game_days(team_id):
    """Dates of the club's completed regular-season games, ascending.

    Used to answer 'how many games has he missed', which is the number fans
    actually track - calendar days out mean little across an off day.
    """
    info = season_info()
    try:
        data = get_json("/schedule", {
            "sportId": 1,
            "teamId": team_id,
            "gameType": "R",
            "startDate": info["regular_start"],
            "endDate": fmt(today_et()),
            "fields": "dates,date,games,status,detailedState",
        }, ttl=TTL_SCHEDULE)
    except Exception:
        return []
    days = []
    for day in data.get("dates", []):
        for game in day.get("games", []):
            if game.get("status", {}).get("detailedState") in FINAL_STATES:
                days.append(day.get("date"))
    return sorted(d for d in days if d)


def _return_window(eligible, il_code, info):
    """Bucket an eligible-return date into the part of the calendar it lands in."""
    if il_code == "ILF" or eligible is None:
        return "next_season" if il_code == "ILF" else "unknown"
    day = fmt(eligible)
    if day <= (info.get("regular_end") or ""):
        return "regular"
    if day <= (info.get("post_end") or ""):
        return "postseason"
    return "next_season"


# The windows are floors, not forecasts: the IL fixes the earliest date a
# player *can* be activated and says nothing about when a club will do it.
WINDOW_LABEL = {
    "regular": "Can return this regular season",
    "postseason": "Postseason at the earliest",
    "next_season": "Not until next season",
    "unknown": "Return window unclear",
}

# How close a player is to actually playing, which is a different question from
# whether his IL clock has run out. A pitcher two years into an elbow rebuild is
# "eligible" the same way a hamstring strain is, and the tab should not say so.
READINESS_LABEL = {
    "rehabbing": "On a rehab assignment",
    "eligible": "Eligible to be activated",
    "on_clock": "IL clock still running",
    "shut_down": "Shut down for the season",
    "stalled": "Eligible, but no game action",
}

# Past this many days without an appearance, "eligible" stops being the useful
# fact about a player and "still not playing" starts being it.
STALLED_DAYS = 45


def _readiness(il_code, eligible, today, rehab, last_played, last_played_season, season):
    if il_code == "ILF":
        return "shut_down"
    if rehab and not rehab["expired"]:
        return "rehabbing"
    if eligible is None or eligible > today:
        return "on_clock"
    if last_played_season != season:
        return "stalled"
    gap = _parse_day(last_played)
    if gap and (today - gap).days >= STALLED_DAYS:
        return "stalled"
    return "eligible"


def injury_report(team_id):
    """Who's hurt, since when, and the earliest date they can be back.

    Three public sources get stitched together: roster status says *who* is on
    which list, the transaction feed says *when* they went on it and *why*, and
    the game log says when they last played. The return date is then derived
    from the IL's own rules rather than guessed - a 60-day stint that began on
    June 30 cannot end before August 29, whatever the club says publicly.
    """
    entries = _injured_roster_entries(team_id)
    info = season_info()
    season = info["season"]
    today = today_et()
    transactions = _season_transactions(team_id)
    people = _people_stats(entries.keys(), season)
    game_days = _team_game_days(team_id)

    # Players with no games this year need a prior season's log for an exact
    # last-played date. Batch them by season so this stays one request each.
    backfill = {}
    for pid, person in people.items():
        if _last_game_date(person):
            continue
        year = _last_season_played(person)
        if year and year < season:
            backfill.setdefault(year, []).append(pid)
    prior = {}
    for year, ids in sorted(backfill.items(), reverse=True)[:3]:
        for pid, person in _people_stats(ids, year, types="gameLog").items():
            prior[pid] = (_last_game_date(person), year)

    players = []
    for pid, entry in entries.items():
        person = people.get(pid, {})
        position = entry["position"] or (person.get("primaryPosition") or {}).get("abbreviation", "")
        group = "pitching" if position == "P" else "hitting"

        stint = _current_stint(transactions.get(pid) or []) or {
            "placed": None, "days": None, "injury": None,
            "transferred": None, "rehab": None, "placed_estimated": True,
        }

        last_played = _last_game_date(person)
        last_played_season = season if last_played else None
        if not last_played and pid in prior:
            last_played, last_played_season = prior[pid]

        # Roster status is the current truth; the transaction feed can lag a
        # transfer by a day. Either way the clock runs from the placement, so a
        # transfer to the 60-day never buys the club a fresh 60 days.
        il_days = None if entry["il_code"] == "ILF" else (entry["il_days"] or stint["days"])
        placed = _parse_day(stint["placed"])
        placed_estimated = stint["placed_estimated"] or placed is None
        if placed is None and last_played and last_played_season == season:
            # A stint always starts the day after the last game played.
            placed = _parse_day(last_played) + timedelta(days=1)

        eligible = placed + timedelta(days=il_days) if (placed and il_days) else None
        window = _return_window(eligible, entry["il_code"], info)

        rehab = None
        if stint["rehab"]:
            started = _parse_day(stint["rehab"]["started"])
            limit = REHAB_LIMIT[group]
            deadline = started + timedelta(days=limit) if started else None
            rehab = {
                "started": stint["rehab"]["started"],
                "club": stint["rehab"]["club"],
                "day": (today - started).days + 1 if started else None,
                "max_days": limit,
                # Rehab has to end by rule, which makes it the tightest public
                # bound on a return date there is - until it lapses, which
                # happens when an assignment is reset or quietly cut short.
                "deadline": fmt(deadline) if deadline else None,
                "expired": bool(deadline and deadline < today),
            }

        readiness = _readiness(entry["il_code"], eligible, today, rehab,
                               last_played, last_played_season, season)

        missed = None
        if game_days:
            since = last_played if (last_played and last_played_season == season) else None
            missed = (len([d for d in game_days if d > since]) if since
                      else len(game_days))

        players.append({
            "player_id": pid,
            "name": entry["name"],
            "position": position,
            "group": group,
            "team_id": team_id,
            "team": team_name(team_id),
            "il_code": entry["il_code"],
            "il_label": entry["il_label"],
            "il_days": il_days,
            "injury": stint["injury"],
            "placed_date": fmt(placed) if placed else None,
            "placed_estimated": placed_estimated,
            "transferred_date": stint["transferred"],
            "days_out": (today - placed).days if placed else None,
            "games_missed": missed,
            "last_played": last_played,
            "last_played_season": last_played_season,
            "eligible_date": fmt(eligible) if eligible else None,
            "eligible_now": bool(eligible and eligible <= today),
            "window": window,
            "window_label": WINDOW_LABEL[window],
            "readiness": readiness,
            "readiness_label": READINESS_LABEL[readiness],
            "return_detail": _return_detail(entry, eligible, today, rehab, readiness, window),
            "rehab": rehab,
            "season_line": _injury_stat_line(_season_line(person, group), group),
            "timeline": [e for e in (transactions.get(pid) or [])
                         if _is_injury_event(e["description"])][-6:],
        })

    order = {"regular": 0, "postseason": 1, "next_season": 2, "unknown": 3}
    closeness = {"rehabbing": 0, "eligible": 1, "on_clock": 2, "stalled": 3,
                 "shut_down": 4}
    players.sort(key=lambda p: (order[p["window"]], closeness[p["readiness"]],
                                p["eligible_date"] or "9999", p["name"]))

    counts = {key: 0 for key in order}
    for player in players:
        counts[player["window"]] += 1

    return {
        "team": team_meta(team_id),
        "season": season,
        "as_of": fmt(today),
        "regular_end": info.get("regular_end"),
        "post_start": info.get("post_start"),
        "post_end": info.get("post_end"),
        "counts": counts,
        "players": players,
    }


def _is_injury_event(text):
    return bool(_PLACED_RE.search(text) or _TRANSFER_RE.search(text)
                or _REHAB_RE.search(text) or _ACTIVATED_RE.search(text))


def _return_detail(entry, eligible, today, rehab, readiness, window):
    """One plain sentence about the return, precise wherever the data allows.

    The IL gives a hard floor on the date and nothing above it, so this says
    what is actually known - the earliest legal activation, and how close to
    game-ready the player looks - rather than inventing a target date.
    """
    if readiness == "shut_down":
        return "On the season-ending injured list; eligible again next season."
    if eligible is None:
        return "No placement date on file, so an eligible date can't be derived."

    when = _short_day(eligible)

    if readiness == "rehabbing":
        opener = f"Eligible since {when}" if eligible <= today else f"Eligible {when}"
        clock = (f"rehabbing with {rehab['club']} since {_short_day(rehab['started'])}, "
                 f"an assignment that has to end by {_short_day(rehab['deadline'])}")
        return f"{opener}; {clock}."

    if readiness == "on_clock":
        days = (eligible - today).days
        soonest = f"Eligible {when}, {days} day{'' if days == 1 else 's'} from now"
        if window == "next_season":
            return f"{soonest} - past the end of the postseason, so not this year."
        if window == "postseason":
            return f"{soonest} - after the regular season ends, so October at best."
        return f"{soonest}."

    if readiness == "stalled":
        lapsed = " The rehab assignment has since lapsed." if rehab else ""
        # Surname only, and no pronoun: the transaction feed carries neither a
        # pronoun nor a reliable one to infer.
        who = entry["name"].split()[-1]
        return (f"IL clock ran out {when}, but {who} has not appeared in a game "
                f"since, so the {entry['il_label']} is no longer the limiting "
                f"factor.{lapsed}")

    return f"Eligible to be activated since {when} - waiting on the club."


def _injury_stat_line(s, group):
    """The season line to show beside an injured player, by stat group."""
    if group == "pitching":
        return {"games": _num(s.get("gamesPlayed")), "era": _rate(s.get("era")),
                "ip": _rate(s.get("inningsPitched")), "whip": _rate(s.get("whip")),
                "so": _num(s.get("strikeOuts")), "wins": _num(s.get("wins")),
                "losses": _num(s.get("losses")), "saves": _num(s.get("saves")),
                "holds": _num(s.get("holds"))}
    return {"games": _num(s.get("gamesPlayed")), "avg": _rate(s.get("avg")),
            "obp": _rate(s.get("obp")), "ops": _rate(s.get("ops")),
            "hr": _num(s.get("homeRuns")), "rbi": _num(s.get("rbi")),
            "hits": _num(s.get("hits")), "runs": _num(s.get("runs")),
            "sb": _num(s.get("stolenBases"))}


# ─── Standings & playoff picture ──────────────────────────────────────────────

def _league_label(league_id):
    return "NL" if league_id == 104 else "AL"


def standings_snapshot():
    """Full standings for both leagues, with playoff seeding, in one request."""
    season = current_season()
    data = get_json("/standings", {
        "leagueId": "103,104",
        "season": season,
        "standingsTypes": "regularSeason",
        "hydrate": "division,team,record(splitRecords)",
    }, ttl=TTL_STANDINGS)

    teams = []
    for record in data.get("records", []):
        division = record.get("division", {})
        div_name = DIVISION_NAMES.get(division.get("id"), division.get("name", ""))
        league_id = record.get("league", {}).get("id")
        for t in record.get("teamRecords", []):
            team_id = t["team"]["id"]
            meta = team_meta(team_id)
            splits = t.get("records", {}).get("splitRecords", [])
            l10 = next((s for s in splits if s.get("type") == "lastTen"), None)
            home = next((s for s in splits if s.get("type") == "home"), None)
            away = next((s for s in splits if s.get("type") == "away"), None)
            games_played = t.get("gamesPlayed") or (t["wins"] + t["losses"])
            teams.append({
                "team_id": team_id,
                "name": meta["name"] or t["team"]["name"],
                "slug": meta["slug"],
                "abbreviation": meta["abbreviation"] or t["team"].get("abbreviation", ""),
                "division": div_name or meta["division"],
                "league": _league_label(league_id if league_id else 104),
                "wins": t["wins"],
                "losses": t["losses"],
                "pct": t.get("winningPercentage", ".000"),
                "gb": t.get("gamesBack", "-"),
                "wc_gb": t.get("wildCardGamesBack", "-"),
                "div_rank": int(t.get("divisionRank", 99) or 99),
                "league_rank": int(t.get("leagueRank", 99) or 99),
                "games_played": games_played,
                # The API has no gamesRemaining field, so derive it. The old
                # dashboard read a key that never existed and showed "-".
                "games_remaining": max(0, GAMES_IN_SEASON - games_played),
                "streak": (t.get("streak") or {}).get("streakCode", "-"),
                "run_diff": t.get("runDifferential", 0),
                "runs_scored": t.get("runsScored", 0),
                "runs_allowed": t.get("runsAllowed", 0),
                "l10": f"{l10['wins']}-{l10['losses']}" if l10 else "-",
                "home_record": f"{home['wins']}-{home['losses']}" if home else "-",
                "away_record": f"{away['wins']}-{away['losses']}" if away else "-",
                "clinched": bool(t.get("clinched")),
                "division_leader": bool(t.get("divisionLeader")),
                "clinch_indicator": t.get("clinchIndicator"),
                "magic_number": t.get("magicNumber", "-"),
                "elimination_number": t.get("eliminationNumber", "-"),
                "wc_elimination_number": t.get("wildCardEliminationNumber", "-"),
            })

    for league in ("NL", "AL"):
        league_teams = [t for t in teams if t["league"] == league]
        _assign_seeds(league_teams)
        _assign_playoff_magic(league_teams)

    return {
        "season": season,
        "teams": teams,
        "season_info": season_info(),
    }


def _pct(team):
    try:
        return float(team["pct"])
    except (TypeError, ValueError):
        return 0.0


def _assign_seeds(league_teams):
    """Assign 1-6 playoff seeds the way MLB actually does it.

    Division winners take seeds 1-3 by record; the three best remaining teams
    take the wild cards. The previous version sorted by the API's leagueRank,
    which quietly mis-seeded teams whenever a division winner had a worse
    record than a wild card.
    """
    by_division = {}
    for t in league_teams:
        by_division.setdefault(t["division"], []).append(t)

    leaders = []
    for teams in by_division.values():
        best = sorted(teams, key=lambda t: (-_pct(t), -t["wins"]))[0]
        leaders.append(best)
    leaders.sort(key=lambda t: (-_pct(t), -t["wins"]))

    leader_ids = {t["team_id"] for t in leaders}
    rest = sorted([t for t in league_teams if t["team_id"] not in leader_ids],
                  key=lambda t: (-_pct(t), -t["wins"]))

    for i, t in enumerate(leaders):
        t["seed"] = i + 1
        t["category"] = "division"
    for i, t in enumerate(rest[:3]):
        t["seed"] = i + 4
        t["category"] = "wildcard"
    for t in rest[3:]:
        t["seed"] = None
        t["category"] = "eliminated"


def _assign_playoff_magic(league_teams):
    """Magic / elimination numbers for a *playoff berth*.

    The API's own `magicNumber` only covers winning a division, and it is
    absent entirely for teams that aren't leading one - so a wild-card team
    showed no magic number at all, even when a clinch was well within reach.

    Measured against the closest team on the other side of the playoff cut:
      - holding a seed  -> `playoff_magic`, combined own wins + chaser losses
                           needed to guarantee the berth
      - outside the cut -> `playoff_tragic`, the same count that eliminates them

    Using each club's remaining games (rather than assuming 162) keeps this
    correct when schedules are uneven from postponements.
    """
    seeded = sorted([t for t in league_teams if t["seed"]], key=lambda t: t["seed"])
    outside = sorted([t for t in league_teams if not t["seed"]],
                     key=lambda t: (-_pct(t), -t["wins"]))

    bubble = seeded[-1] if seeded else None          # last team in
    chaser = outside[0] if outside else None         # best team out

    for team in league_teams:
        team["playoff_magic"] = None
        team["playoff_tragic"] = None

        if team["seed"] and chaser:
            # Beat the ceiling of the best team currently outside.
            ceiling = chaser["wins"] + chaser["games_remaining"]
            magic = ceiling - team["wins"] + 1
            if team["clinched"] or magic <= 0:
                team["playoff_magic"] = 0            # already in
            else:
                team["playoff_magic"] = min(magic, team["games_remaining"] + 1)
        elif not team["seed"] and bubble:
            # Their own ceiling has to clear the last team in.
            ceiling = team["wins"] + team["games_remaining"]
            tragic = ceiling - bubble["wins"] + 1
            team["playoff_tragic"] = max(0, tragic)

    _assign_division_magic(league_teams)


def _assign_division_magic(league_teams):
    """Magic number to win the division, measured against the nearest rival.

    Computed rather than taken from the API so it is available for every team,
    including one that has clinched a berth but is still chasing the division.
    """
    by_division = {}
    for team in league_teams:
        by_division.setdefault(team["division"], []).append(team)

    for teams in by_division.values():
        ranked = sorted(teams, key=lambda t: (-_pct(t), -t["wins"]))
        leader = ranked[0]
        runner_up = ranked[1] if len(ranked) > 1 else None
        for team in teams:
            team["division_magic"] = None
            if team is leader and runner_up:
                ceiling = runner_up["wins"] + runner_up["games_remaining"]
                magic = ceiling - team["wins"] + 1
                team["division_magic"] = 0 if magic <= 0 else min(magic, team["games_remaining"] + 1)


def division_standings(team_id):
    snapshot = standings_snapshot()
    meta = team_meta(team_id)
    division = meta["division"]
    teams = [t for t in snapshot["teams"] if t["division"] == division]
    teams.sort(key=lambda t: (t["div_rank"], -_pct(t)))
    return {"division_name": division, "teams": teams}


def league_playoff_picture(team_id):
    snapshot = standings_snapshot()
    label = "NL" if league_id_for(team_id) == 104 else "AL"
    teams = [t for t in snapshot["teams"] if t["league"] == label]
    teams.sort(key=lambda t: (t["seed"] if t["seed"] else 99, -_pct(t)))
    return teams


# ─── Games ────────────────────────────────────────────────────────────────────

def _schedule(team_id, start, end, game_types=("R",), hydrate="linescore,team"):
    season = current_season()
    return get_json("/schedule", {
        "sportId": 1,
        "teamId": team_id,
        "season": season,
        "gameType": ",".join(game_types),
        "startDate": start,
        "endDate": end,
        "hydrate": hydrate,
    }, ttl=TTL_SCHEDULE)


def _flatten(data):
    games = []
    for day in data.get("dates", []):
        for game in day.get("games", []):
            game["_date"] = day.get("date")
            games.append(game)
    return games


def _pick_today_game(games):
    """Choose the relevant game of the day, handling doubleheaders.

    Prefers a game in progress, then the next scheduled one, then the most
    recent final - the old code always took games[0] and would show the
    finished opener while the nightcap was live.
    """
    if not games:
        return None
    for g in games:
        if g["status"].get("abstractGameState") == "Live":
            return g
    for g in games:
        if g["status"]["detailedState"] not in FINAL_STATES:
            return g
    return games[-1]


def _side(game, key):
    side = game["teams"][key]
    team = side["team"]
    meta = team_meta(team["id"])
    return {
        "team_id": team["id"],
        "name": meta["name"] or team.get("name", ""),
        "abbreviation": meta["abbreviation"],
        "score": side.get("score", 0) or 0,
        "wins": side.get("leagueRecord", {}).get("wins"),
        "losses": side.get("leagueRecord", {}).get("losses"),
        "probable_pitcher": (side.get("probablePitcher") or {}).get("fullName"),
    }


def live_game(team_id):
    """Today's game for a team: score, count, bases, last play, scoring summary."""
    today = fmt(today_et())
    data = get_json("/schedule", {
        "sportId": 1,
        "teamId": team_id,
        "date": today,
        "hydrate": "linescore,team,probablePitcher,venue",
    }, ttl=TTL_LIVE)

    games = _flatten(data)
    game = _pick_today_game(games)
    if not game:
        return None

    status = game["status"]
    state = status.get("abstractGameState", "")
    linescore = game.get("linescore", {}) or {}
    offense = linescore.get("offense", {}) or {}
    defense = linescore.get("defense", {}) or {}

    payload = {
        "game_pk": game["gamePk"],
        "date": game.get("_date", today),
        "status": status.get("detailedState", ""),
        "abstract_state": state,
        "is_live": state == "Live",
        "is_final": state == "Final",
        "venue": (game.get("venue") or {}).get("name"),
        "game_datetime": game.get("gameDate"),
        "doubleheader_game": game.get("gameNumber", 1),
        "away": _side(game, "away"),
        "home": _side(game, "home"),
        "inning": linescore.get("currentInningOrdinal"),
        "inning_num": linescore.get("currentInning"),
        "half": linescore.get("inningHalf", ""),
        "inning_state": linescore.get("inningState", ""),
        "outs": linescore.get("outs", 0),
        "balls": linescore.get("balls", 0),
        "strikes": linescore.get("strikes", 0),
        "first": "first" in offense,
        "second": "second" in offense,
        "third": "third" in offense,
        "batter": (offense.get("batter") or {}).get("fullName"),
        "pitcher": (defense.get("pitcher") or {}).get("fullName"),
        "innings": [
            {
                "num": i.get("num"),
                "away": (i.get("away") or {}).get("runs"),
                "home": (i.get("home") or {}).get("runs"),
            }
            for i in linescore.get("innings", [])
        ],
        "totals": {
            "away": linescore.get("teams", {}).get("away", {}),
            "home": linescore.get("teams", {}).get("home", {}),
        },
        "scheduled_innings": linescore.get("scheduledInnings", 9),
    }

    if state in ("Live", "Final"):
        payload.update(_play_detail(game["gamePk"], live=state == "Live"))
    return payload


# Only these fields are pulled from the live feed. The unfiltered document is
# ~760KB per request; this trims it to ~17KB, which matters because the
# dashboard polls it throughout a game.
_PLAY_FIELDS = ",".join([
    "liveData", "plays", "allPlays", "currentPlay", "scoringPlays",
    "about", "inning", "isTopInning", "isScoringPlay", "isComplete",
    "result", "description", "awayScore", "homeScore", "eventType", "rbi",
    "matchup", "batter", "pitcher", "fullName",
])


def _play_detail(game_pk, live=True):
    try:
        data = get_json(f"/game/{game_pk}/feed/live", {"fields": _PLAY_FIELDS},
                        ttl=TTL_LIVE if live else TTL_PLAYS, base=BASE_V11)
    except Exception:
        return {"last_play": None, "scoring_summary": []}

    plays = (data.get("liveData") or {}).get("plays") or {}
    all_plays = plays.get("allPlays") or []

    scoring = []
    for play in all_plays:
        about = play.get("about") or {}
        if not about.get("isScoringPlay"):
            continue
        result = play.get("result") or {}
        scoring.append({
            "inning": f"{'Top' if about.get('isTopInning') else 'Bot'} {about.get('inning')}",
            "description": result.get("description", ""),
            "away_score": result.get("awayScore", 0),
            "home_score": result.get("homeScore", 0),
        })

    completed = [p for p in all_plays if (p.get("about") or {}).get("isComplete")]
    last = None
    if completed:
        play = completed[-1]
        result = play.get("result") or {}
        about = play.get("about") or {}
        last = {
            "description": result.get("description", ""),
            "event_type": result.get("eventType", ""),
            "rbi": result.get("rbi", 0),
            "is_scoring": bool(about.get("isScoringPlay")),
            "inning": f"{'Top' if about.get('isTopInning') else 'Bot'} {about.get('inning')}",
        }

    return {"last_play": last, "scoring_summary": list(reversed(scoring))}


def previous_game(team_id):
    """The team's most recently completed game, with its scoring summary."""
    today = today_et()
    info = season_info()
    # Two weeks back covers any realistic off-day stretch without scanning the
    # whole season the way the original endpoint did.
    data = _schedule(team_id, fmt(today - timedelta(days=14)), fmt(today),
                     game_types=("R", "S", "P"))
    finals = [g for g in _flatten(data) if g["status"]["detailedState"] in FINAL_STATES]
    if not finals:
        data = _schedule(team_id, info["spring_start"], fmt(today), game_types=("R", "S", "P"))
        finals = [g for g in _flatten(data) if g["status"]["detailedState"] in FINAL_STATES]
    if not finals:
        return None

    finals.sort(key=lambda g: g.get("gameDate", ""))
    game = finals[-1]
    payload = {
        "game_pk": game["gamePk"],
        "date": game.get("_date"),
        "away": _side(game, "away"),
        "home": _side(game, "home"),
        "status": game["status"]["detailedState"],
    }
    payload.update(_play_detail(game["gamePk"], live=False))
    return payload


def upcoming_games(team_id, count=5):
    """Next scheduled games, nearest first."""
    today = today_et()
    info = season_info()
    end = info["post_end"] or fmt(today + timedelta(days=60))
    data = _schedule(team_id, fmt(today), end, game_types=("R", "S", "P"),
                     hydrate="linescore,team,probablePitcher,venue")

    games = []
    for g in _flatten(data):
        if g["status"]["detailedState"] in FINAL_STATES:
            continue
        home = g["teams"]["home"]["team"]
        away = g["teams"]["away"]["team"]
        is_home = home["id"] == team_id
        opponent_id = away["id"] if is_home else home["id"]
        opp = team_meta(opponent_id)
        games.append({
            "game_pk": g["gamePk"],
            "date": g.get("_date"),
            "game_datetime": g.get("gameDate"),
            "is_home": is_home,
            "opponent": opp["name"],
            "opponent_abbrev": opp["abbreviation"],
            "opponent_id": opponent_id,
            "venue": (g.get("venue") or {}).get("name"),
            "status": g["status"]["detailedState"],
            "probable_pitcher": (g["teams"]["home" if is_home else "away"]
                                 .get("probablePitcher") or {}).get("fullName"),
            "opponent_probable": (g["teams"]["away" if is_home else "home"]
                                  .get("probablePitcher") or {}).get("fullName"),
        })
    games.sort(key=lambda g: g.get("game_datetime") or "")
    return games[:count]


def next_game(team_id):
    games = upcoming_games(team_id, count=1)
    return games[0] if games else None


def head_to_head(team_id, opponent_id):
    """Season series record against one opponent."""
    if not opponent_id or team_id == opponent_id:
        return {"wins": 0, "losses": 0, "played": 0}

    info = season_info()
    data = get_json("/schedule", {
        "sportId": 1,
        "teamId": team_id,
        "opponentId": opponent_id,
        "season": current_season(),
        "gameType": "R",
        "startDate": info["regular_start"],
        "endDate": fmt(today_et()),
    }, ttl=TTL_STANDINGS)

    wins = losses = 0
    for g in _flatten(data):
        if g["status"]["detailedState"] not in FINAL_STATES:
            continue
        home = g["teams"]["home"]
        away = g["teams"]["away"]
        if {home["team"]["id"], away["team"]["id"]} != {team_id, opponent_id}:
            continue
        ours, theirs = (home, away) if home["team"]["id"] == team_id else (away, home)
        if (ours.get("score") or 0) > (theirs.get("score") or 0):
            wins += 1
        elif (ours.get("score") or 0) < (theirs.get("score") or 0):
            losses += 1
    return {"wins": wins, "losses": losses, "played": wins + losses}


# ─── Players ──────────────────────────────────────────────────────────────────

def _player_group(player_id):
    """Whether a player should be shown as a hitter or a pitcher."""
    data = get_json(f"/people/{player_id}", {}, ttl=TTL_ROSTER)
    people = data.get("people") or [{}]
    pos = people[0].get("primaryPosition", {}).get("abbreviation", "")
    return "pitching" if pos == "P" else "hitting"


def player_season_stats(player_id, group=None):
    """Season line for one player, in whichever group fits their position."""
    group = group or _player_group(player_id)
    season = current_season()
    data = get_json(f"/people/{player_id}/stats",
                    {"stats": "season", "group": group, "season": season},
                    ttl=TTL_ROSTER)
    blocks = data.get("stats") or []
    splits = blocks[0].get("splits", []) if blocks else []
    s = splits[0]["stat"] if splits else {}

    if group == "pitching":
        return {"group": "pitching",
                "games": _num(s.get("gamesPlayed")), "wins": _num(s.get("wins")),
                "losses": _num(s.get("losses")), "era": _rate(s.get("era")),
                "ip": _rate(s.get("inningsPitched")), "so": _num(s.get("strikeOuts")),
                "bb": _num(s.get("baseOnBalls")), "whip": _rate(s.get("whip")),
                "saves": _num(s.get("saves")), "holds": _num(s.get("holds")),
                "avg_against": _rate(s.get("avg"))}
    return {"group": "hitting",
            "games": _num(s.get("gamesPlayed")), "ab": _num(s.get("atBats")),
            "hits": _num(s.get("hits")), "doubles": _num(s.get("doubles")),
            "triples": _num(s.get("triples")), "hr": _num(s.get("homeRuns")),
            "rbi": _num(s.get("rbi")), "runs": _num(s.get("runs")),
            "bb": _num(s.get("baseOnBalls")), "k": _num(s.get("strikeOuts")),
            "sb": _num(s.get("stolenBases")), "cs": _num(s.get("caughtStealing")),
            "avg": _rate(s.get("avg")), "obp": _rate(s.get("obp")),
            "slg": _rate(s.get("slg")), "ops": _rate(s.get("ops"))}


def search_players(query, limit=8):
    """Search all of MLB by name, returning each player's correct stat group."""
    if not query or len(query.strip()) < 3:
        return []
    data = get_json("/people/search", {
        "names": query.strip(),
        "sportIds": 1,
        "active": "true",
        "hydrate": "currentTeam",
        "limit": limit,
    }, ttl=TTL_ROSTER)

    results = []
    for person in (data.get("people") or [])[:limit]:
        pid = person["id"]
        position = person.get("primaryPosition", {}).get("abbreviation", "")
        team = person.get("currentTeam") or {}
        meta = team_meta(team.get("id")) if team.get("id") else None
        group = "pitching" if position == "P" else "hitting"
        entry = {
            "player_id": pid,
            "name": person.get("fullName", ""),
            "position": position,
            "team": meta["name"] if meta else "Free Agent",
            "team_id": team.get("id"),
        }
        try:
            entry.update(player_season_stats(pid, group))
        except Exception:
            entry["group"] = group
        results.append(entry)
    return results


def player_game_log(player_id, limit=15, group=None):
    """Recent game-by-game lines for a player."""
    group = group or _player_group(player_id)
    season = current_season()
    data = get_json(f"/people/{player_id}/stats", {
        "stats": "gameLog", "group": group, "season": season, "gameType": "R",
    }, ttl=TTL_GAMELOG)

    blocks = data.get("stats") or []
    splits = blocks[0].get("splits", []) if blocks else []
    splits.sort(key=lambda s: s.get("date") or "")

    games = []
    for split in splits[-limit:]:
        s = split.get("stat", {})
        opp = split.get("opponent", {}) or {}
        meta = team_meta(opp.get("id")) if opp.get("id") else None
        row = {
            "game_pk": (split.get("game") or {}).get("gamePk"),
            "game_date": split.get("date"),
            "opponent": meta["name"] if meta else opp.get("name", ""),
            "opponent_abbrev": meta["abbreviation"] if meta else "",
            "is_home": split.get("isHome"),
            "group": group,
        }
        if group == "pitching":
            row["stat_line"] = {
                "ip": _rate(s.get("inningsPitched")) or "0.0",
                "h": _num(s.get("hits")) or 0, "r": _num(s.get("runs")) or 0,
                "er": _num(s.get("earnedRuns")) or 0, "bb": _num(s.get("baseOnBalls")) or 0,
                "k": _num(s.get("strikeOuts")) or 0, "hr": _num(s.get("homeRuns")) or 0,
                "pitches": _num(s.get("numberOfPitches")) or 0,
            }
        else:
            row["stat_line"] = {
                "ab": _num(s.get("atBats")) or 0, "h": _num(s.get("hits")) or 0,
                "bb": _num(s.get("baseOnBalls")) or 0, "k": _num(s.get("strikeOuts")) or 0,
                "hr": _num(s.get("homeRuns")) or 0, "doubles": _num(s.get("doubles")) or 0,
                "triples": _num(s.get("triples")) or 0, "rbi": _num(s.get("rbi")) or 0,
                "runs": _num(s.get("runs")) or 0, "sb": _num(s.get("stolenBases")) or 0,
            }
        games.append(row)
    return games


_PLAY_BY_PLAY_FIELDS = ",".join([
    "liveData", "plays", "allPlays", "about", "inning", "isTopInning",
    "isComplete", "atBatIndex", "count", "outs", "result", "event",
    "description", "rbi", "matchup", "batter", "pitcher", "id", "fullName",
    "postOnFirst", "postOnSecond", "postOnThird", "playEvents", "hitData",
    "launchSpeed", "launchAngle", "totalDistance", "trajectory", "hardness",
    "location",
])


def player_game_plays(player_id, game_pk):
    """Every plate appearance a player had in one game, with Statcast data."""
    try:
        data = get_json(f"/game/{game_pk}/feed/live", {"fields": _PLAY_BY_PLAY_FIELDS},
                        ttl=TTL_PLAYS, base=BASE_V11)
    except Exception:
        return []

    all_plays = ((data.get("liveData") or {}).get("plays") or {}).get("allPlays") or []
    by_index = {(p.get("about") or {}).get("atBatIndex"): p for p in all_plays}

    out = []
    for play in all_plays:
        matchup = play.get("matchup") or {}
        about = play.get("about") or {}
        if (matchup.get("batter") or {}).get("id") != player_id:
            continue
        if not about.get("isComplete"):
            continue

        result = play.get("result") or {}
        events = play.get("playEvents") or []
        hit_data = next((e["hitData"] for e in reversed(events) if e.get("hitData")), None)
        outs_before = (events[0].get("count", {}) or {}).get("outs") if events else None

        prev = by_index.get((about.get("atBatIndex") or 0) - 1)
        prev_matchup = (prev or {}).get("matchup") or {}

        entry = {
            "event": result.get("event", ""),
            "description": result.get("description", ""),
            "rbi": result.get("rbi", 0),
            "inning": about.get("inning"),
            "is_top": about.get("isTopInning"),
            "pitcher": (matchup.get("pitcher") or {}).get("fullName"),
            "outs_before": outs_before,
            "on_first": bool(prev_matchup.get("postOnFirst")),
            "on_second": bool(prev_matchup.get("postOnSecond")),
            "on_third": bool(prev_matchup.get("postOnThird")),
        }
        if hit_data:
            entry.update({
                "ev": hit_data.get("launchSpeed"),
                "la": hit_data.get("launchAngle"),
                "dist": hit_data.get("totalDistance"),
                "trajectory": hit_data.get("trajectory"),
                "hardness": hit_data.get("hardness"),
                "location": hit_data.get("location"),
            })
        out.append(entry)
    return out


def player_live_context(player_id):
    """Live game context for a favorited player: score, and when they bat next."""
    person = get_json(f"/people/{player_id}", {"hydrate": "currentTeam"}, ttl=TTL_ROSTER)
    people = person.get("people") or []
    if not people:
        return None
    team_id = (people[0].get("currentTeam") or {}).get("id")
    if not team_id:
        return None

    game = live_game(team_id)
    if not game:
        return None

    context = {
        "status": game["status"],
        "is_live": game["is_live"],
        "game_pk": game["game_pk"],
        "away": game["away"], "home": game["home"],
        "inning": game.get("inning"), "inning_num": game.get("inning_num"),
        "half": game.get("half"), "outs": game.get("outs", 0),
        "batting_spot": 0, "batters_until": None, "inning_projection": None,
        "is_batting": False,
    }
    if not game["is_live"]:
        return context

    try:
        box = get_json(f"/game/{game['game_pk']}/boxscore", {}, ttl=TTL_LIVE)
    except Exception:
        return context

    is_home = team_id == game["home"]["team_id"]
    side = "home" if is_home else "away"
    order = box.get("teams", {}).get(side, {}).get("battingOrder", []) or []
    if player_id not in order:
        return context

    spot = order.index(player_id)
    context["batting_spot"] = spot + 1

    half = game.get("half", "")
    team_batting = (is_home and half == "Bottom") or (not is_home and half == "Top")
    context["is_batting"] = team_batting

    batter_name = game.get("batter")
    if team_batting and batter_name:
        current = box.get("teams", {}).get(side, {}).get("players", {})
        current_id = next(
            (p["person"]["id"] for p in current.values()
             if p.get("person", {}).get("fullName") == batter_name), None)
        if current_id in order:
            until = (spot - order.index(current_id)) % 9
            context["batters_until"] = until
            if until <= 3:
                projection = 0
            elif until <= 6:
                projection = 1
            else:
                projection = 2
            if until > 0 and game.get("outs") == 2:
                projection = max(projection, 1)
            context["inning_projection"] = projection
    return context
