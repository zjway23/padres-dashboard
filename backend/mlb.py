"""Shared MLB Stats API client: pooled HTTP, TTL caching, and team/season lookup.

Every upstream call in the app goes through `get_json` so that timeouts, retries
and caching are applied uniformly. The MLB Stats API is generous but slow, and
the dashboard polls it continuously, so caching is what keeps the app usable.
"""

import os
import threading
import time
from datetime import date, datetime, timedelta

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

try:
    from zoneinfo import ZoneInfo
    EASTERN = ZoneInfo("America/New_York")
except Exception:  # pragma: no cover - zoneinfo is stdlib on 3.9+
    EASTERN = None

BASE_V1 = "https://statsapi.mlb.com/api/v1"
BASE_V11 = "https://statsapi.mlb.com/api/v1.1"

REQUEST_TIMEOUT = (4, 12)  # (connect, read) seconds

# Cache TTLs in seconds, tuned to how fast each kind of data actually changes.
TTL_LIVE = 5          # in-game score/count
TTL_PLAYS = 20        # play-by-play list
TTL_SCHEDULE = 60     # today's slate, upcoming games
TTL_STANDINGS = 120   # W/L records
TTL_ROSTER = 600      # season stat lines
TTL_GAMELOG = 600     # per-player game logs
TTL_SEASON = 21600    # season date boundaries (6h)


def _build_session():
    session = requests.Session()
    retry = Retry(
        total=2,
        backoff_factor=0.3,
        status_forcelist=(429, 500, 502, 503, 504),
        allowed_methods=frozenset(["GET"]),
    )
    adapter = HTTPAdapter(max_retries=retry, pool_connections=20, pool_maxsize=40)
    session.mount("https://", adapter)
    session.headers.update({
        "User-Agent": "padres-dashboard/2.0 (+https://github.com/zjway23)",
        "Accept": "application/json",
    })
    return session


session = _build_session()


class UpstreamError(RuntimeError):
    """Raised when the MLB Stats API cannot be reached or returns bad data."""


class TTLCache:
    """Thread-safe TTL cache with per-key locking.

    Per-key locks matter here: the live endpoint is polled by every open tab at
    the same interval, and without them a cache expiry would let all of those
    requests stampede the upstream API simultaneously.
    """

    def __init__(self):
        self._data = {}
        self._locks = {}
        self._guard = threading.Lock()

    def _lock_for(self, key):
        with self._guard:
            if key not in self._locks:
                self._locks[key] = threading.Lock()
            return self._locks[key]

    def get(self, key):
        entry = self._data.get(key)
        if entry and entry[0] > time.monotonic():
            return entry[1]
        return None

    def get_or_set(self, key, ttl, producer):
        hit = self.get(key)
        if hit is not None:
            return hit
        with self._lock_for(key):
            # Another thread may have populated the key while we waited.
            hit = self.get(key)
            if hit is not None:
                return hit
            value = producer()
            self._data[key] = (time.monotonic() + ttl, value)
            return value

    def get_stale(self, key):
        """Return a value even if expired - used as a fallback when upstream fails."""
        entry = self._data.get(key)
        return entry[1] if entry else None

    def clear(self):
        with self._guard:
            self._data.clear()

    def stats(self):
        now = time.monotonic()
        live = sum(1 for exp, _ in self._data.values() if exp > now)
        return {"entries": len(self._data), "fresh": live}


cache = TTLCache()


def get_json(path, params=None, ttl=TTL_SCHEDULE, base=BASE_V1):
    """Fetch and cache a JSON document from the MLB Stats API.

    On upstream failure we fall back to the most recent cached copy (even if
    expired) so a transient MLB outage degrades the dashboard instead of
    breaking it.
    """
    key = (base, path, tuple(sorted((params or {}).items())))

    def producer():
        url = f"{base}{path}"
        response = session.get(url, params=params, timeout=REQUEST_TIMEOUT)
        response.raise_for_status()
        return response.json()

    try:
        return cache.get_or_set(key, ttl, producer)
    except Exception as exc:
        stale = cache.get_stale(key)
        if stale is not None:
            return stale
        raise UpstreamError(f"MLB API request failed: {path}") from exc


# ─── Teams ────────────────────────────────────────────────────────────────────

# id, slug, full name, abbreviation, division. Single source of truth for the
# backend; the frontend keeps the same list plus colors in src/data/teams.json.
TEAMS = [
    (135, "padres", "San Diego Padres", "SD", "NL West"),
    (119, "dodgers", "Los Angeles Dodgers", "LAD", "NL West"),
    (137, "giants", "San Francisco Giants", "SF", "NL West"),
    (115, "rockies", "Colorado Rockies", "COL", "NL West"),
    (109, "diamondbacks", "Arizona Diamondbacks", "AZ", "NL West"),
    (112, "cubs", "Chicago Cubs", "CHC", "NL Central"),
    (158, "brewers", "Milwaukee Brewers", "MIL", "NL Central"),
    (138, "cardinals", "St. Louis Cardinals", "STL", "NL Central"),
    (113, "reds", "Cincinnati Reds", "CIN", "NL Central"),
    (134, "pirates", "Pittsburgh Pirates", "PIT", "NL Central"),
    (144, "braves", "Atlanta Braves", "ATL", "NL East"),
    (121, "mets", "New York Mets", "NYM", "NL East"),
    (143, "phillies", "Philadelphia Phillies", "PHI", "NL East"),
    (146, "marlins", "Miami Marlins", "MIA", "NL East"),
    (120, "nationals", "Washington Nationals", "WSH", "NL East"),
    (117, "astros", "Houston Astros", "HOU", "AL West"),
    (108, "angels", "Los Angeles Angels", "LAA", "AL West"),
    (133, "athletics", "Athletics", "ATH", "AL West"),
    (136, "mariners", "Seattle Mariners", "SEA", "AL West"),
    (140, "rangers", "Texas Rangers", "TEX", "AL West"),
    (145, "whitesox", "Chicago White Sox", "CWS", "AL Central"),
    (114, "guardians", "Cleveland Guardians", "CLE", "AL Central"),
    (116, "tigers", "Detroit Tigers", "DET", "AL Central"),
    (118, "royals", "Kansas City Royals", "KC", "AL Central"),
    (142, "twins", "Minnesota Twins", "MIN", "AL Central"),
    (147, "yankees", "New York Yankees", "NYY", "AL East"),
    (111, "redsox", "Boston Red Sox", "BOS", "AL East"),
    (139, "rays", "Tampa Bay Rays", "TB", "AL East"),
    (141, "bluejays", "Toronto Blue Jays", "TOR", "AL East"),
    (110, "orioles", "Baltimore Orioles", "BAL", "AL East"),
]

TEAM_BY_ID = {t[0]: {"id": t[0], "slug": t[1], "name": t[2], "abbreviation": t[3], "division": t[4]}
              for t in TEAMS}
_BY_SLUG = {t[1]: t[0] for t in TEAMS}
_BY_ABBREV = {t[3].upper(): t[0] for t in TEAMS}
# Historical / alternate abbreviations still returned by some API responses.
_BY_ABBREV.update({"ARI": 109, "OAK": 133, "CHW": 145, "SDP": 135, "SFG": 137,
                   "TBR": 139, "KCR": 118, "WSN": 120})
_ALIASES = {"dbacks": 109, "d-backs": 109, "redsox": 111, "whitesox": 145,
            "bluejays": 141, "as": 133, "a's": 133}

DEFAULT_TEAM_ID = 135  # Padres - the dashboard's namesake default

NL_TEAM_IDS = {t[0] for t in TEAMS if t[4].startswith("NL")}
DIVISION_NAMES = {200: "AL West", 201: "AL East", 202: "AL Central",
                  203: "NL West", 204: "NL East", 205: "NL Central"}


def normalize_team_key(value, default="padres"):
    """Normalize a team name into a lookup slug ('San Diego' -> 'sandiego')."""
    if not value:
        return default
    return value.lower().replace(" ", "").replace("-", "").replace(".", "")


def resolve_team_id(value, default=DEFAULT_TEAM_ID):
    """Resolve a slug, abbreviation, numeric id, or full name to an MLB team id."""
    if value is None or value == "":
        return default
    if isinstance(value, int):
        return value if value in TEAM_BY_ID else default
    raw = str(value).strip()
    if raw.isdigit():
        return int(raw) if int(raw) in TEAM_BY_ID else default
    upper = raw.upper()
    if upper in _BY_ABBREV:
        return _BY_ABBREV[upper]
    key = normalize_team_key(raw)
    if key in _BY_SLUG:
        return _BY_SLUG[key]
    if key in _ALIASES:
        return _ALIASES[key]
    for team_id, meta in TEAM_BY_ID.items():
        if normalize_team_key(meta["name"]) == key:
            return team_id
    return default


def team_meta(team_id):
    return TEAM_BY_ID.get(team_id, {"id": team_id, "slug": "", "name": "Unknown Team",
                                    "abbreviation": "", "division": ""})


def team_name(team_id):
    return team_meta(team_id)["name"]


def league_id_for(team_id):
    """104 = National League, 103 = American League."""
    return 104 if team_id in NL_TEAM_IDS else 103


# ─── Dates & seasons ──────────────────────────────────────────────────────────

def today_et():
    """Today's date in US/Eastern.

    MLB schedules every game by its Eastern-time date, so a West Coast night
    game is still 'today' well after midnight UTC. Using Eastern here is what
    keeps late Padres games from vanishing from the dashboard.
    """
    if EASTERN:
        return datetime.now(EASTERN).date()
    return (datetime.utcnow() - timedelta(hours=5)).date()


def season_info():
    """Return the current season's key dates, cached for six hours."""
    try:
        data = get_json("/seasons/current", {"sportId": 1}, ttl=TTL_SEASON)
        seasons = data.get("seasons") or []
        if seasons:
            s = seasons[0]
            return {
                "season": int(s.get("seasonId", today_et().year)),
                "regular_start": s.get("regularSeasonStartDate"),
                "regular_end": s.get("regularSeasonEndDate"),
                "spring_start": s.get("springStartDate"),
                "post_start": s.get("postSeasonStartDate"),
                "post_end": s.get("postSeasonEndDate"),
            }
    except Exception:
        pass
    year = today_et().year
    return {"season": year, "regular_start": f"{year}-03-25", "regular_end": f"{year}-09-28",
            "spring_start": f"{year}-02-20", "post_start": f"{year}-09-29",
            "post_end": f"{year}-10-31"}


def current_season():
    return season_info()["season"]


def fmt(d):
    return d.strftime("%Y-%m-%d")


def season_phase():
    """Which part of the calendar we're in: spring, regular, post, or offseason."""
    info = season_info()
    today = fmt(today_et())
    if info["regular_start"] <= today <= info["regular_end"]:
        return "regular"
    if info["spring_start"] <= today < info["regular_start"]:
        return "spring"
    if info["regular_end"] < today <= (info["post_end"] or ""):
        return "post"
    return "offseason"
