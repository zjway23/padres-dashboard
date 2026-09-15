"""Test suite for the dashboard API.

Pure-logic tests (seeding, caching, team resolution, availability rules) run
offline against fixtures. The tests that need statsapi.mlb.com are marked
`live` and skip automatically when the network is unavailable, so the suite is
still useful on a plane.

Run:  python3 -m pytest tests.py -v
"""

import os
import time

import pytest

os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")

import mlb  # noqa: E402
import stats  # noqa: E402
from app import app, db  # noqa: E402


# ─── Fixtures ─────────────────────────────────────────────────────────────────

@pytest.fixture
def client():
    app.config["TESTING"] = True
    with app.test_client() as c:
        yield c


def has_network():
    try:
        mlb.season_info()
        return True
    except Exception:
        return False


live = pytest.mark.skipif(not has_network(), reason="requires statsapi.mlb.com")


# ─── Team resolution ──────────────────────────────────────────────────────────

@pytest.mark.parametrize("value,expected", [
    ("padres", 135), ("SD", 135), ("sd", 135), (135, 135), ("135", 135),
    ("San Diego Padres", 135), ("dodgers", 119), ("LAD", 119),
    ("Athletics", 133), ("OAK", 133), ("ATH", 133),
    ("ARI", 109), ("diamondbacks", 109), ("dbacks", 109),
    ("CWS", 145), ("CHW", 145),
])
def test_resolve_team_id(value, expected):
    assert mlb.resolve_team_id(value) == expected


def test_resolve_unknown_falls_back_to_padres():
    assert mlb.resolve_team_id("not-a-team") == mlb.DEFAULT_TEAM_ID == 135
    assert mlb.resolve_team_id(None) == 135
    assert mlb.resolve_team_id("") == 135


def test_league_split_is_complete():
    assert len(mlb.TEAMS) == 30
    assert len(mlb.NL_TEAM_IDS) == 15
    assert mlb.league_id_for(135) == 104   # Padres, NL
    assert mlb.league_id_for(147) == 103   # Yankees, AL


# ─── Cache ────────────────────────────────────────────────────────────────────

def test_cache_returns_hit_within_ttl():
    cache = mlb.TTLCache()
    calls = []

    def producer():
        calls.append(1)
        return "value"

    assert cache.get_or_set("k", 60, producer) == "value"
    assert cache.get_or_set("k", 60, producer) == "value"
    assert len(calls) == 1, "second call should have been served from cache"


def test_cache_expires():
    cache = mlb.TTLCache()
    calls = []
    cache.get_or_set("k", 0.05, lambda: calls.append(1) or "v")
    time.sleep(0.08)
    cache.get_or_set("k", 0.05, lambda: calls.append(1) or "v")
    assert len(calls) == 2


def test_cache_keeps_stale_value_for_fallback():
    cache = mlb.TTLCache()
    cache.get_or_set("k", 0.01, lambda: "old")
    time.sleep(0.03)
    assert cache.get("k") is None          # expired
    assert cache.get_stale("k") == "old"   # still available as a fallback


# ─── Playoff seeding ──────────────────────────────────────────────────────────

def make_team(name, wins, losses, division, league="NL"):
    return {"team_id": abs(hash(name)) % 10000, "name": name, "wins": wins,
            "losses": losses, "pct": f"{wins / (wins + losses):.3f}".lstrip("0"),
            "division": division, "league": league}


def test_division_winner_seeds_ahead_of_better_wildcard():
    """A weak division winner still outranks a stronger wild card.

    This is the case the old leagueRank-based sort got wrong.
    """
    teams = [
        # Weak Champ is the best team in a bad division; Strong WC has a far
        # better record but finishes second in a strong one.
        make_team("Weak Champ", 76, 74, "NL West"),
        make_team("Out", 60, 90, "NL West"),
        make_team("East Champ", 96, 54, "NL East"),
        make_team("Strong WC", 95, 55, "NL East"),
        make_team("Central Champ", 88, 62, "NL Central"),
        make_team("WC Two", 85, 65, "NL Central"),
        make_team("WC Three", 84, 66, "NL East"),
    ]
    stats._assign_seeds(teams)
    by_name = {t["name"]: t for t in teams}

    assert by_name["Weak Champ"]["category"] == "division"
    assert by_name["Weak Champ"]["seed"] == 3
    assert by_name["Strong WC"]["category"] == "wildcard"
    assert by_name["Strong WC"]["seed"] == 4
    assert by_name["East Champ"]["seed"] == 1
    assert by_name["Out"]["seed"] is None
    assert by_name["Out"]["category"] == "eliminated"


def test_exactly_three_wildcards():
    teams = [make_team(f"T{i}", 90 - i, 60 + i, f"NL {d}")
             for i, d in enumerate(["West", "East", "Central"] * 5)]
    stats._assign_seeds(teams)
    assert sum(1 for t in teams if t["category"] == "division") == 3
    assert sum(1 for t in teams if t["category"] == "wildcard") == 3
    assert sorted(t["seed"] for t in teams if t["seed"]) == [1, 2, 3, 4, 5, 6]


# ─── Magic numbers ────────────────────────────────────────────────────────────

def seeded_league():
    """Six playoff teams plus chasers, mirroring a real late-season NL."""
    teams = [
        make_team("Leader", 93, 57, "NL Central"),
        make_team("Second", 91, 59, "NL West"),
        make_team("Third", 88, 62, "NL East"),
        make_team("WC1", 83, 67, "NL East"),
        make_team("WC2", 83, 67, "NL Central"),
        make_team("Bubble", 81, 68, "NL West"),
        make_team("Chaser", 79, 71, "NL West"),
        make_team("Distant", 70, 80, "NL Central"),
    ]
    for t in teams:
        t["games_played"] = t["wins"] + t["losses"]
        t["games_remaining"] = 162 - t["games_played"]
        t["clinched"] = False
    stats._assign_seeds(teams)
    stats._assign_playoff_magic(teams)
    return {t["name"]: t for t in teams}


def test_playoff_magic_matches_hand_calculation():
    """Bubble 81-68 (13 left) vs Chaser 79-71 (12 left, ceiling 91): 91-81+1 = 11."""
    league = seeded_league()
    assert league["Bubble"]["playoff_magic"] == 11


def test_wildcard_team_gets_a_magic_number():
    """The API only supplies magicNumber for division leaders, so a wild-card
    team previously showed nothing at all."""
    league = seeded_league()
    for name in ("WC1", "WC2", "Bubble"):
        assert league[name]["playoff_magic"] is not None
        assert league[name]["playoff_magic"] > 0


def test_magic_number_never_exceeds_games_left_plus_one():
    league = seeded_league()
    for team in league.values():
        if team["playoff_magic"]:
            assert team["playoff_magic"] <= team["games_remaining"] + 1


def test_clinched_team_reports_zero():
    league = seeded_league()
    leader = league["Leader"]
    leader["clinched"] = True
    stats._assign_playoff_magic(list(league.values()))
    assert leader["playoff_magic"] == 0


def test_teams_outside_get_tragic_not_magic():
    league = seeded_league()
    for name in ("Chaser", "Distant"):
        assert league[name]["playoff_magic"] is None
        assert league[name]["playoff_tragic"] is not None


def test_division_magic_only_for_leaders():
    league = seeded_league()
    # "Second" (91-59) leads NL West over Bubble (81-68, ceiling 94): 94-91+1 = 4.
    assert league["Second"]["division_magic"] == 4
    assert league["Bubble"]["division_magic"] is None


@live
def test_real_standings_expose_magic_numbers():
    snapshot = stats.standings_snapshot()
    for team in snapshot["teams"]:
        assert "playoff_magic" in team
        assert "division_magic" in team
        if team["seed"]:
            assert team["playoff_magic"] is not None


# ─── Stat coercion ────────────────────────────────────────────────────────────

@pytest.mark.parametrize("raw,expected", [
    ("12", 12), (7, 7), ("3.5", 3.5), (None, None), ("", None),
    ("-", None), (".---", None), ("-.--", None),
])
def test_num_coercion(raw, expected):
    assert stats._num(raw) == expected


def test_rate_preserves_leading_dot():
    """.284 must stay a string - float() would render it 0.284."""
    assert stats._rate(".284") == ".284"
    assert stats._rate("3.51") == "3.51"
    assert stats._rate("-.--") is None


# ─── Doubleheader selection ───────────────────────────────────────────────────

def game(state, detailed, pk):
    return {"gamePk": pk, "status": {"abstractGameState": state, "detailedState": detailed}}


def test_picks_live_game_over_finished_opener():
    games = [game("Final", "Final", 1), game("Live", "In Progress", 2)]
    assert stats._pick_today_game(games)["gamePk"] == 2


def test_picks_upcoming_when_opener_done():
    games = [game("Final", "Final", 1), game("Preview", "Scheduled", 2)]
    assert stats._pick_today_game(games)["gamePk"] == 2


def test_falls_back_to_last_final():
    games = [game("Final", "Final", 1), game("Final", "Final", 2)]
    assert stats._pick_today_game(games)["gamePk"] == 2


def test_no_games_returns_none():
    assert stats._pick_today_game([]) is None


# ─── Games remaining ──────────────────────────────────────────────────────────

@live
def test_games_remaining_is_a_real_number():
    """The old API read a gamesRemaining key that does not exist upstream."""
    snapshot = stats.standings_snapshot()
    for team in snapshot["teams"]:
        assert isinstance(team["games_remaining"], int)
        assert 0 <= team["games_remaining"] <= 162
        assert team["games_remaining"] == max(0, 162 - team["games_played"])


# ─── HTTP routes ──────────────────────────────────────────────────────────────

def test_health(client):
    body = client.get("/api/health").get_json()
    assert body["status"] == "ok"
    assert isinstance(body["season"], int)


def test_missing_route_is_a_404_not_a_500(client):
    """The catch-all error handler used to turn routing errors into 500s.

    That is actively misleading: calling an endpoint the running build does not
    have reported "internal" server error, which sends you hunting for a crash
    that never happened instead of a stale process.
    """
    response = client.get("/api/does-not-exist")
    assert response.status_code == 404
    assert response.get_json()["error"] == "not_found"


def test_wrong_method_is_a_405(client):
    response = client.delete("/api/teams")
    assert response.status_code == 405


def test_teams_route_lists_all_clubs(client):
    teams = client.get("/api/teams").get_json()
    assert len(teams) == 30
    assert any(t["id"] == "padres" for t in teams)


def test_preferences_require_uid(client):
    assert client.get("/api/preferences").status_code == 400


def test_preferences_default_to_padres(client):
    prefs = client.get("/api/preferences?uid=never-seen-before").get_json()
    assert prefs["favorite_team"] == "padres"
    assert prefs["default_tab"] == "dashboard"


def test_favorites_round_trip(client):
    with app.app_context():
        db.create_all()
    uid = "test-user-round-trip"

    added = client.post("/api/favorites", json={
        "uid": uid, "player_id": 999001, "name": "Test Pitcher", "position": "P",
    }).get_json()
    assert added["status"] == "added"

    removed = client.post("/api/favorites", json={"uid": uid, "player_id": 999001}).get_json()
    assert removed["status"] == "removed"


def test_favorite_group_inferred_from_position(client):
    from app import FavoritePlayer
    assert FavoritePlayer(position="P").group == "pitching"
    assert FavoritePlayer(position="RHP").group == "pitching"
    assert FavoritePlayer(position="SS").group == "hitting"
    assert FavoritePlayer(position="").group == "hitting"


def test_favorites_post_requires_ids(client):
    assert client.post("/api/favorites", json={"uid": "x"}).status_code == 400
    assert client.post("/api/favorites", json={"player_id": 1}).status_code == 400


def test_search_ignores_short_queries(client):
    assert client.get("/api/search?name=ab").get_json() == []


def test_h2h_without_opponent(client):
    assert client.get("/api/h2h?team=padres").get_json()["played"] == 0


# ─── Live data smoke tests ────────────────────────────────────────────────────

@live
def test_roster_returns_both_groups(client):
    body = client.get("/api/roster?team=padres").get_json()
    assert body["batters"] and body["pitchers"]
    assert all(p["role"] in ("SP", "RP") for p in body["pitchers"])


@live
def test_dashboard_contains_every_panel(client):
    body = client.get("/api/dashboard?team=padres").get_json()
    for key in ("team", "division", "playoff", "upcoming"):
        assert key in body, f"dashboard missing {key}"
    assert body["team"]["slug"] == "padres"


@live
def test_bullpen_statuses_are_valid(client):
    for reliever in client.get("/api/bullpen?team=padres").get_json():
        assert reliever["status"] in ("available", "caution", "unavailable")
        assert reliever["status_reason"]


# ─── Injury report ────────────────────────────────────────────────────────────

def _events(*pairs):
    return [{"date": day, "description": text} for day, text in pairs]


def test_transfer_to_60_day_keeps_the_original_placement_date():
    """60-day time counts from the first placement, not from the transfer.

    Reading the transfer date as the start would hand the club a fresh 60 days
    and push every eligible date two months too late.
    """
    stint = stats._current_stint(_events(
        ("2026-06-30", "San Diego Padres placed RHP Jason Adam on the 15-day injured "
                       "list retroactive to June 30, 2026. Right shoulder strain."),
        ("2026-08-03", "San Diego Padres transferred RHP Jason Adam from the 15-day "
                       "injured list to the 60-day injured list. Right shoulder strain."),
    ))
    assert stint["placed"] == "2026-06-30"
    assert stint["days"] == 60
    assert stint["injury"] == "Right shoulder strain"


def test_activation_closes_the_stint():
    stint = stats._current_stint(_events(
        ("2026-04-10", "Padres placed RHP A B on the 15-day injured list. Elbow."),
        ("2026-05-01", "Padres activated RHP A B from the 15-day injured list."),
    ))
    assert stint is None


def test_latest_stint_wins_after_a_return_and_reinjury():
    stint = stats._current_stint(_events(
        ("2026-06-03", "Padres placed RHP A B on the 15-day injured list. Right knee."),
        ("2026-07-29", "Padres activated RHP A B from the 15-day injured list."),
        ("2026-08-25", "Padres placed RHP A B on the 15-day injured list retroactive "
                       "to August 25, 2026. Right shoulder impingement."),
    ))
    assert stint["placed"] == "2026-08-25"
    assert stint["injury"] == "Right shoulder impingement"


def test_rehab_assignment_attaches_to_the_open_stint():
    stint = stats._current_stint(_events(
        ("2026-06-30", "Padres placed RHP A B on the 15-day injured list. Shoulder."),
        ("2026-09-13", "San Diego Padres sent RHP A B on a rehab assignment to "
                       "El Paso Chihuahuas."),
    ))
    assert stint["rehab"] == {"started": "2026-09-13", "club": "El Paso Chihuahuas"}


def test_transfer_without_a_placement_is_flagged_for_estimation():
    """Players acquired while hurt have no placement row in their new club's feed."""
    stint = stats._current_stint(_events(
        ("2026-08-24", "Padres transferred RHP A B from the 15-day injured list to "
                       "the 60-day injured list. Right elbow inflammation."),
    ))
    assert stint["placed"] is None
    assert stint["placed_estimated"] is True
    assert stint["days"] == 60


@pytest.mark.parametrize("eligible,expected", [
    ("2026-09-20", "regular"),
    ("2026-09-27", "regular"),
    ("2026-09-28", "postseason"),
    ("2026-10-31", "postseason"),
    ("2026-11-01", "next_season"),
])
def test_return_window_splits_on_the_season_boundaries(eligible, expected):
    info = {"regular_end": "2026-09-27", "post_end": "2026-10-31"}
    day = stats._parse_day(eligible)
    assert stats._return_window(day, "D60", info) == expected


def test_season_ending_list_is_always_next_season():
    info = {"regular_end": "2026-09-27", "post_end": "2026-10-31"}
    assert stats._return_window(None, "ILF", info) == "next_season"


def test_readiness_separates_eligibility_from_game_readiness():
    """An expired IL clock does not mean a player is close to playing."""
    today = stats.date(2026, 9, 14)
    eligible = stats.date(2026, 5, 24)
    assert stats._readiness("D60", eligible, today, None,
                            "2024-09-26", 2024, 2026) == "stalled"
    assert stats._readiness("D10", eligible, today, None,
                            "2026-09-10", 2026, 2026) == "eligible"
    assert stats._readiness("D60", stats.date(2026, 10, 29), today, None,
                            "2026-08-29", 2026, 2026) == "on_clock"
    rehab = {"expired": False}
    assert stats._readiness("D60", eligible, today, rehab,
                            "2024-09-26", 2024, 2026) == "rehabbing"
    assert stats._readiness("ILF", None, today, None, None, None, 2026) == "shut_down"


@live
def test_injury_report_is_internally_consistent(client):
    body = client.get("/api/injuries?team=padres").get_json()
    assert body["team"]["slug"] == "padres"
    assert sum(body["counts"].values()) == len(body["players"])

    for player in body["players"]:
        assert player["window"] in ("regular", "postseason", "next_season", "unknown")
        assert player["readiness"] in stats.READINESS_LABEL
        assert player["return_detail"]
        # An eligible date is always the placement date plus the list's length,
        # which is the whole basis for the tab's claims.
        if player["eligible_date"] and player["placed_date"]:
            placed = stats._parse_day(player["placed_date"])
            eligible = stats._parse_day(player["eligible_date"])
            assert (eligible - placed).days == player["il_days"]


@live
def test_injury_report_excludes_healthy_players(client):
    body = client.get("/api/injuries?team=padres").get_json()
    hurt = {p["player_id"] for p in body["players"]}
    active = client.get("/api/roster?team=padres").get_json()
    playing = {p["player_id"] for p in active["batters"] + active["pitchers"]}
    assert not (hurt & playing), "a player cannot be on the active roster and the IL"


@live
def test_pitcher_search_returns_pitching_stats():
    """Searching a pitcher used to return empty hitting stats."""
    results = stats.search_players("cease")
    assert results, "expected at least one match"
    assert results[0]["group"] == "pitching"
    assert "era" in results[0]
