"""Domain layer: turns raw MLB Stats API documents into the shapes the UI needs.

Everything here reads through `mlb.get_json`, so results are cached and no route
fans out into per-player requests.
"""

from datetime import timedelta

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
            try:
                from datetime import date as _d
                y, m, dd = (int(x) for x in last_date.split("-"))
                rest_days = (today - _d(y, m, dd)).days
            except Exception:
                rest_days = None

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
        _assign_seeds([t for t in teams if t["league"] == league])

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
