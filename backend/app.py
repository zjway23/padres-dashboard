"""Padres Dashboard API.

Thin HTTP layer over `stats.py`. Routes stay small on purpose: fetching,
caching and shaping all live in the data modules, so handlers only parse
arguments and serialize results.
"""

import os
from concurrent.futures import ThreadPoolExecutor

from dotenv import load_dotenv
from flask import Flask, jsonify, request
from flask_cors import CORS
from flask_sqlalchemy import SQLAlchemy

import stats
from mlb import (TEAMS, UpstreamError, cache, current_season, resolve_team_id,
                 season_info, season_phase, team_meta)

load_dotenv()

app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": os.environ.get("CORS_ORIGINS", "*")}})

database_url = os.environ.get("DATABASE_URL", "sqlite:///padres.db")
# Heroku/Render hand out legacy postgres:// URLs that SQLAlchemy 2 rejects.
if database_url.startswith("postgres://"):
    database_url = database_url.replace("postgres://", "postgresql://", 1)
app.config["SQLALCHEMY_DATABASE_URI"] = database_url
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
app.config["JSON_SORT_KEYS"] = False

db = SQLAlchemy(app)

# Shared pool for fanning out independent upstream calls within one request.
pool = ThreadPoolExecutor(max_workers=8, thread_name_prefix="mlb")


class FavoritePlayer(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    uid = db.Column(db.String(200), index=True, nullable=False)
    player_id = db.Column(db.Integer, nullable=False)
    name = db.Column(db.String(120), nullable=False)
    position = db.Column(db.String(20))
    team = db.Column(db.String(120))
    # Retained because the deployed table declares it NOT NULL.
    user_id = db.Column(db.String(100))

    __table_args__ = (db.UniqueConstraint("uid", "player_id", name="uq_fav_uid_player"),)

    @property
    def group(self):
        """Pitchers and hitters need different stat lines."""
        return "pitching" if (self.position or "").upper() in ("P", "SP", "RP", "LHP", "RHP") else "hitting"


class UserPreference(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    uid = db.Column(db.String(200), unique=True, nullable=False)
    favorite_team = db.Column(db.String(50), default="padres")
    default_tab = db.Column(db.String(50), default="dashboard")
    timezone = db.Column(db.String(100), default="America/Los_Angeles")


def _reconcile_columns():
    """Add model columns that an older deployed table is missing.

    `create_all()` only creates absent tables - it never alters existing ones,
    so a table created by a previous version of this app silently lacks any
    column added since. Rather than require a migration tool for a two-table
    schema, add the missing nullable columns directly.
    """
    inspector = db.inspect(db.engine)
    for model in (FavoritePlayer, UserPreference):
        table = model.__tablename__
        if not inspector.has_table(table):
            continue
        existing = {c["name"] for c in inspector.get_columns(table)}
        for column in model.__table__.columns:
            if column.name in existing or column.primary_key:
                continue
            ddl = f"ALTER TABLE {table} ADD COLUMN {column.name} {column.type.compile(db.engine.dialect)}"
            app.logger.warning("Adding missing column %s.%s", table, column.name)
            db.session.execute(db.text(ddl))
    db.session.commit()


with app.app_context():
    try:
        db.create_all()
        _reconcile_columns()
        DB_AVAILABLE = True
    except Exception as exc:  # pragma: no cover - depends on deployment
        # Favorites and preferences need the database, but the live scores,
        # standings and roster views do not. A database outage degrades those
        # two features instead of taking the whole API down.
        app.logger.error("Database unavailable (%s); favorites and preferences "
                         "will be disabled this session.", exc)
        DB_AVAILABLE = False


# ─── Error handling ───────────────────────────────────────────────────────────

@app.errorhandler(UpstreamError)
def handle_upstream(exc):
    """MLB being unreachable is an expected condition, not a server crash."""
    return jsonify({"error": "mlb_unavailable", "message": str(exc)}), 503


@app.errorhandler(Exception)
def handle_unexpected(exc):
    app.logger.exception("Unhandled error on %s", request.path)
    return jsonify({"error": "internal", "message": str(exc)}), 500


def team_param(name="team"):
    return resolve_team_id(request.args.get(name))


# ─── Meta ─────────────────────────────────────────────────────────────────────

@app.route("/api/health")
def health():
    return jsonify({
        "status": "ok",
        "database": "up" if DB_AVAILABLE else "down",
        "season": current_season(),
        "phase": season_phase(),
        "cache": cache.stats(),
    })


@app.route("/api/teams")
def teams_api():
    return jsonify([
        {"id": slug, "team_id": tid, "name": name, "abbreviation": abbr, "division": div}
        for tid, slug, name, abbr, div in TEAMS
    ])


@app.route("/api/season")
def season_api():
    info = dict(season_info())
    info["phase"] = season_phase()
    return jsonify(info)


# ─── Composite dashboard ──────────────────────────────────────────────────────

@app.route("/api/dashboard")
def dashboard_api():
    """Everything the dashboard tab needs, fetched in parallel.

    Collapsing five sequential round trips into one keeps the initial paint
    fast and prevents the panels from popping in at different times.
    """
    team_id = team_param()
    jobs = {
        "live": pool.submit(stats.live_game, team_id),
        "previous": pool.submit(stats.previous_game, team_id),
        "upcoming": pool.submit(stats.upcoming_games, team_id, 5),
        "division": pool.submit(stats.division_standings, team_id),
        "playoff": pool.submit(stats.league_playoff_picture, team_id),
    }
    result = {"team": team_meta(team_id), "season": current_season()}
    for key, future in jobs.items():
        try:
            result[key] = future.result(timeout=20)
        except Exception as exc:
            app.logger.warning("dashboard.%s failed: %s", key, exc)
            result[key] = None
    result["next"] = (result.get("upcoming") or [None])[0]
    return jsonify(result)


# ─── Games ────────────────────────────────────────────────────────────────────

@app.route("/api/live")
def live_api():
    return jsonify(stats.live_game(team_param()))


@app.route("/api/prevgame")
def prev_game_api():
    return jsonify(stats.previous_game(team_param()))


@app.route("/api/nextgame")
def next_game_api():
    return jsonify(stats.next_game(team_param()))


@app.route("/api/upcoming-games")
def upcoming_games_api():
    count = max(1, min(request.args.get("count", 5, type=int) or 5, 162))
    return jsonify(stats.upcoming_games(team_param(), count))


@app.route("/api/h2h")
def h2h_api():
    opponent = request.args.get("opponent")
    if not opponent:
        return jsonify({"wins": 0, "losses": 0, "played": 0})
    return jsonify(stats.head_to_head(team_param(), resolve_team_id(opponent, None)))


# ─── Standings ────────────────────────────────────────────────────────────────

@app.route("/api/standings")
def standings_api():
    return jsonify(stats.division_standings(team_param()))


@app.route("/api/playoff")
def playoff_api():
    return jsonify(stats.league_playoff_picture(team_param()))


# ─── Roster ───────────────────────────────────────────────────────────────────

@app.route("/api/roster")
def roster_api():
    """Batters and pitchers together, each flagged with the user's favorites."""
    team_id = team_param()
    uid = request.args.get("uid", "")
    batters = pool.submit(stats.batting_stats, team_id)
    pitchers = pool.submit(stats.pitching_stats, team_id)

    favorites = set()
    if uid and DB_AVAILABLE:
        favorites = {f.player_id for f in FavoritePlayer.query.filter_by(uid=uid).all()}

    def mark(players):
        for p in players:
            p["favorited"] = p["player_id"] in favorites
        return players

    return jsonify({
        "batters": mark(batters.result(timeout=25)),
        # Pitcher favorites were previously dropped here, so a starred pitcher
        # reverted to unstarred on every reload.
        "pitchers": mark(pitchers.result(timeout=25)),
    })


@app.route("/api/bullpen")
def bullpen_api():
    return jsonify(stats.bullpen(team_param()))


# ─── Players ──────────────────────────────────────────────────────────────────

@app.route("/api/search")
def search_api():
    return jsonify(stats.search_players(request.args.get("name", "")))


@app.route("/api/players/<int:player_id>/gamelog")
def player_gamelog_api(player_id):
    limit = max(1, min(request.args.get("limit", 15, type=int) or 15, 40))
    group = request.args.get("group")
    return jsonify(stats.player_game_log(player_id, limit, group))


@app.route("/api/players/<int:player_id>/games/<int:game_pk>")
def player_game_plays_api(player_id, game_pk):
    return jsonify(stats.player_game_plays(player_id, game_pk))


@app.route("/api/players/<int:player_id>/live")
def player_live_api(player_id):
    return jsonify(stats.player_live_context(player_id))


# ─── Favorites ────────────────────────────────────────────────────────────────

@app.route("/api/favorites", methods=["GET"])
def get_favorites():
    uid = request.args.get("uid")
    if not uid or not DB_AVAILABLE:
        return jsonify([])

    rows = FavoritePlayer.query.filter_by(uid=uid).all()
    # Stat lines are fetched concurrently; serially this scaled linearly with
    # the number of favorites.
    jobs = [(row, pool.submit(stats.player_season_stats, row.player_id, row.group))
            for row in rows]

    result = []
    for row, future in jobs:
        entry = {
            "player_id": row.player_id,
            "name": row.name,
            "position": row.position,
            "team": row.team,
            "favorited": True,
            "group": row.group,
        }
        try:
            entry.update(future.result(timeout=20))
        except Exception as exc:
            app.logger.warning("favorite stats failed for %s: %s", row.player_id, exc)
        result.append(entry)
    return jsonify(result)


@app.route("/api/favorites", methods=["POST"])
def toggle_favorite():
    data = request.get_json(silent=True) or {}
    uid = data.get("uid")
    player_id = data.get("player_id")
    if not uid or not player_id:
        return jsonify({"error": "uid and player_id are required"}), 400
    if not DB_AVAILABLE:
        return jsonify({"error": "database_unavailable"}), 503

    existing = FavoritePlayer.query.filter_by(uid=uid, player_id=player_id).first()
    if existing:
        db.session.delete(existing)
        db.session.commit()
        return jsonify({"status": "removed", "player_id": player_id})

    db.session.add(FavoritePlayer(
        uid=uid,
        user_id=uid,
        player_id=player_id,
        name=data.get("name", "Unknown"),
        position=data.get("position", ""),
        team=data.get("team", ""),
    ))
    db.session.commit()
    return jsonify({"status": "added", "player_id": player_id})


# ─── Preferences ──────────────────────────────────────────────────────────────

DEFAULT_PREFS = {"favorite_team": "padres", "default_tab": "dashboard",
                 "timezone": "America/Los_Angeles"}


@app.route("/api/preferences", methods=["GET"])
def get_preferences():
    uid = request.args.get("uid")
    if not uid:
        return jsonify({"error": "uid parameter is required"}), 400
    if not DB_AVAILABLE:
        return jsonify(dict(DEFAULT_PREFS))
    pref = UserPreference.query.filter_by(uid=uid).first()
    if not pref:
        return jsonify(dict(DEFAULT_PREFS))
    return jsonify({
        "favorite_team": pref.favorite_team or DEFAULT_PREFS["favorite_team"],
        "default_tab": pref.default_tab or DEFAULT_PREFS["default_tab"],
        "timezone": pref.timezone or DEFAULT_PREFS["timezone"],
    })


@app.route("/api/preferences", methods=["POST"])
def save_preferences():
    data = request.get_json(silent=True) or {}
    uid = data.get("uid")
    if not uid:
        return jsonify({"error": "uid is required"}), 400
    if not DB_AVAILABLE:
        return jsonify({"error": "database_unavailable"}), 503

    pref = UserPreference.query.filter_by(uid=uid).first()
    if not pref:
        pref = UserPreference(uid=uid, **DEFAULT_PREFS)
        db.session.add(pref)

    if "favorite_team" in data:
        team_id = resolve_team_id(data["favorite_team"])
        pref.favorite_team = team_meta(team_id)["slug"]
    if "default_tab" in data:
        pref.default_tab = data["default_tab"]
    if "timezone" in data:
        pref.timezone = data["timezone"]

    db.session.commit()
    return jsonify({"status": "saved", "favorite_team": pref.favorite_team,
                    "default_tab": pref.default_tab, "timezone": pref.timezone})


if __name__ == "__main__":
    app.run(debug=True, port=int(os.environ.get("PORT", 5001)), threaded=True)
