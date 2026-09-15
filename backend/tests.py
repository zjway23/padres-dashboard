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


@live
def test_pitcher_search_returns_pitching_stats():
    """Searching a pitcher used to return empty hitting stats."""
    results = stats.search_players("cease")
    assert results, "expected at least one match"
    assert results[0]["group"] == "pitching"
    assert "era" in results[0]
