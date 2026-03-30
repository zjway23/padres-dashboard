from flask import Flask, jsonify, request
from flask_cors import CORS
from flask_sqlalchemy import SQLAlchemy
from datetime import date
import os
import requests

mlb_session = requests.Session()
mlb_session.headers.update({
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Accept": "application/json",
    "Cache-Control": "no-cache",
    "Pragma": "no-cache"
})

# All 30 MLB teams mapped to their MLB Stats API team IDs
TEAM_IDS = {
    # NL West
    "padres": 135,
    "dodgers": 119,
    "giants": 137,
    "rockies": 115,
    "diamondbacks": 109,
    "dbacks": 109,
    # NL Central
    "cubs": 112,
    "brewers": 158,
    "cardinals": 138,
    "reds": 113,
    "pirates": 134,
    # NL East
    "braves": 144,
    "mets": 121,
    "phillies": 143,
    "marlins": 146,
    "nationals": 120,
    # AL West
    "astros": 117,
    "angels": 108,
    "athletics": 133,
    "mariners": 136,
    "rangers": 140,
    # AL Central
    "whitesox": 145,
    "guardians": 114,
    "tigers": 116,
    "royals": 118,
    "twins": 142,
    # AL East
    "yankees": 147,
    "redsox": 111,
    "rays": 139,
    "bluejays": 141,
    "orioles": 110,
}

TEAM_FULL_NAMES = {
    135: "San Diego Padres",
    119: "Los Angeles Dodgers",
    137: "San Francisco Giants",
    115: "Colorado Rockies",
    109: "Arizona Diamondbacks",
    112: "Chicago Cubs",
    158: "Milwaukee Brewers",
    138: "St. Louis Cardinals",
    113: "Cincinnati Reds",
    134: "Pittsburgh Pirates",
    144: "Atlanta Braves",
    121: "New York Mets",
    143: "Philadelphia Phillies",
    146: "Miami Marlins",
    120: "Washington Nationals",
    117: "Houston Astros",
    108: "Los Angeles Angels",
    133: "Oakland Athletics",
    136: "Seattle Mariners",
    140: "Texas Rangers",
    145: "Chicago White Sox",
    114: "Cleveland Guardians",
    116: "Detroit Tigers",
    118: "Kansas City Royals",
    142: "Minnesota Twins",
    147: "New York Yankees",
    111: "Boston Red Sox",
    139: "Tampa Bay Rays",
    141: "Toronto Blue Jays",
    110: "Baltimore Orioles",
}


def resolve_team_id(team_param, default=135):
    """Convert a team name slug (e.g. 'dodgers') to an MLB Stats API team ID."""
    return TEAM_IDS.get(normalize_team_key(team_param), default)


def normalize_team_key(team_param, default="padres"):
    """Normalize a team name to a consistent lowercase slug for lookups and storage."""
    if not team_param:
        return default
    return team_param.lower().replace(" ", "").replace("-", "")

app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "*"}})
app.config["SQLALCHEMY_DATABASE_URI"] = os.environ.get("DATABASE_URL", "sqlite:///padres.db")
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
db = SQLAlchemy(app)

# Database model
class FavoritePlayer(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.String(100), nullable=False)
    player_id = db.Column(db.Integer, nullable=False)
    name = db.Column(db.String(100), nullable=False)
    position = db.Column(db.String(20))
    team = db.Column(db.String(100))
    uid = db.Column(db.String(200))
    favorite_team = db.Column(db.String(50), nullable=True, default="padres")

with app.app_context():
    db.create_all()

def get_team_game(team_id=135):
    today = date.today().strftime("%Y-%m-%d")
    url = "https://statsapi.mlb.com/api/v1/schedule"
    params = {
        "sportId": 1,
        "teamId": team_id,
        "date": today,
        "hydrate": "linescore"
    }
    response = requests.get(url, params=params)
    data = response.json()

    dates = data.get("dates", [])
    if not dates:
        return None

    game = dates[0]["games"][0]
    return {
        "date": today,
        "away": game["teams"]["away"]["team"]["name"],
        "home": game["teams"]["home"]["team"]["name"],
        "away_score": game["teams"]["away"].get("score", 0),
        "home_score": game["teams"]["home"].get("score", 0),
        "status": game["status"]["detailedState"]
    }

def get_team_batting_stats(team_id=135):
    team_name = TEAM_FULL_NAMES.get(team_id, "Unknown Team")
    roster_url = f"https://statsapi.mlb.com/api/v1/teams/{team_id}/roster"
    roster_data = requests.get(roster_url, params={
        "rosterType": "active",
        "season": 2026
    }).json()

    players = []
    for player in roster_data.get("roster", []):
        try:
            person_id = player["person"]["id"]
            name = player["person"]["fullName"]
            position = player["position"]["abbreviation"]

            if position == "P":
                continue

            stats_data = requests.get(
                f"https://statsapi.mlb.com/api/v1/people/{person_id}/stats",
                params={"stats": "season", "group": "hitting", "season": 2026}
            ).json()

            stats_list = stats_data.get("stats", [])
            splits = stats_list[0].get("splits", []) if stats_list else []
            if splits:
                s = splits[0]["stat"]
                players.append({
                    "name": name,
                    "position": position,
                    "player_id": person_id,
                    "team": team_name,
                    "avg": s.get("avg", "N/A"),
                    "hr": s.get("homeRuns", "N/A"),
                    "rbi": s.get("rbi", "N/A"),
                    "ops": s.get("ops", "N/A"),
                    "obp": s.get("obp", "N/A"),
                    "slg": s.get("slg", "N/A"),
                    "hits": s.get("hits", "N/A"),
                    "games": s.get("gamesPlayed", "N/A"),
                    "doubles": s.get("doubles", "N/A"),
                    "triples": s.get("triples", "N/A"),
                    "sb": s.get("stolenBases", "N/A"),
                    "cs": s.get("caughtStealing", "N/A"),
                    "bb": s.get("baseOnBalls", "N/A"),
                    "k": s.get("strikeOuts", "N/A")
                })
            else:
                players.append({
                    "name": name,
                    "position": position,
                    "player_id": person_id,
                    "team": team_name,
                    "avg": "N/A", "hr": "N/A",
                    "rbi": "N/A", "ops": "N/A",
                    "obp": "N/A", "slg": "N/A",
                    "hits": "N/A", "games": "N/A",
                    "doubles": "N/A", "triples": "N/A",
                    "sb": "N/A", "cs": "N/A",
                    "bb": "N/A", "k": "N/A"
                })
        except Exception:
            continue

    def sort_key(p):
        try:
            return float(p["avg"]) if p["avg"] != "N/A" else -1.0
        except (ValueError, TypeError):
            return -1.0

    return sorted(players, key=sort_key, reverse=True)

def get_team_pitching_stats(team_id=135):
    team_name = TEAM_FULL_NAMES.get(team_id, "Unknown Team")
    depth_data = requests.get(f"https://statsapi.mlb.com/api/v1/teams/{team_id}/roster", params={
        "rosterType": "depthChart", "season": 2026
    }).json()

    starter_ids = set()
    for player in depth_data.get("roster", []):
        if player["position"]["abbreviation"] == "SP":
            starter_ids.add(player["person"]["id"])

    roster_data = requests.get(f"https://statsapi.mlb.com/api/v1/teams/{team_id}/roster", params={
        "rosterType": "active", "season": 2026
    }).json()

    players = []
    seen_ids = set()
    for player in roster_data.get("roster", []):
        person_id = player["person"]["id"]
        name = player["person"]["fullName"]
        position = player["position"]["abbreviation"]

        if position != "P":
            continue
        if person_id in seen_ids:
            continue
        seen_ids.add(person_id)

        person_data = requests.get(f"https://statsapi.mlb.com/api/v1/people/{person_id}").json()
        pitch_hand = person_data.get("people", [{}])[0].get("pitchHand", {}).get("code", "R")
        hand_label = "LHP" if pitch_hand == "L" else "RHP"

        stats_data = requests.get(
            f"https://statsapi.mlb.com/api/v1/people/{person_id}/stats",
            params={"stats": "season", "group": "pitching", "season": 2026}
        ).json()

        stats_list = stats_data.get("stats", [])
        splits = stats_list[0].get("splits", []) if stats_list else []
        if splits:
            s = splits[0]["stat"]
            games = s.get("gamesPitched", 0)
            wins = s.get("wins", 0)
            losses = s.get("losses", 0)
            era = s.get("era", "-.--")
            ip = s.get("inningsPitched", "0.0")
            so = s.get("strikeOuts", 0)
            bb = s.get("baseOnBalls", 0)
            whip = s.get("whip", "-.--")
            saves = s.get("saves", 0)
        else:
            games = wins = losses = so = bb = saves = 0
            era = whip = "-.--"
            ip = "0.0"

        players.append({
            "name": name,
            "position": hand_label,
            "role": "SP" if person_id in starter_ids else "RP",
            "player_id": person_id,
            "team": team_name,
            "games": games,
            "wins": wins,
            "losses": losses,
            "era": era,
            "ip": ip,
            "so": so,
            "bb": bb,
            "whip": whip,
            "saves": saves,
        })

    return players

@app.route("/api/game")
def game_api():
    team_param = request.args.get("team", "padres")
    team_id = resolve_team_id(team_param)
    return jsonify(get_team_game(team_id))

@app.route("/api/roster")
def roster_api():
    team_param = request.args.get("team", "padres")
    team_id = resolve_team_id(team_param)
    players = get_team_batting_stats(team_id)
    uid = request.args.get("uid", "")
    fav_team_key = normalize_team_key(team_param)
    favorites = {f.player_id for f in FavoritePlayer.query.filter_by(uid=uid, favorite_team=fav_team_key).all()}
    for p in players:
        p["favorited"] = p["player_id"] in favorites
    return jsonify(players)

@app.route("/api/pitchers")
def pitchers_api():
    team_param = request.args.get("team", "padres")
    team_id = resolve_team_id(team_param)
    return jsonify(get_team_pitching_stats(team_id))

@app.route("/api/standings")
def standings_api():
    team_param = request.args.get("team", "padres")
    team_id = resolve_team_id(team_param)
    url = "https://statsapi.mlb.com/api/v1/standings"
    params = {
        "season": 2026,
        "standingsTypes": "regularSeason",
        "hydrate": "division,team,record(splitRecords)"
    }
    data = requests.get(url, params=params).json()

    for division in data.get("records", []):
        team_records = division.get("teamRecords", [])
        if any(t["team"]["id"] == team_id for t in team_records):
            division_name = division.get("division", {}).get("name", "")
            teams = []
            for t in team_records:
                splits = t.get("records", {}).get("splitRecords", [])
                l10 = next((s for s in splits if s["type"] == "lastTen"), None)
                teams.append({
                    "name": t["team"]["name"],
                    "wins": t["wins"],
                    "losses": t["losses"],
                    "pct": t["winningPercentage"],
                    "gb": t["gamesBack"],
                    "l10": f"{l10['wins']}-{l10['losses']}" if l10 else "N/A"
                })
            return jsonify({"division_name": division_name, "teams": teams})

    return jsonify({"division_name": "", "teams": []})

@app.route("/api/nextgame")
def next_game_api():
    from datetime import timedelta
    team_param = request.args.get("team", "padres")
    team_id = resolve_team_id(team_param)
    today = date.today().strftime("%Y-%m-%d")
    future_date = (date.today() + timedelta(days=14)).strftime("%Y-%m-%d")
    url = "https://statsapi.mlb.com/api/v1/schedule"

    for game_type, label in [("R", "Regular Season"), ("S", "Spring Training")]:
        params = {
            "sportId": 1, "teamId": team_id, "season": 2026,
            "gameType": game_type,
            "startDate": today, "endDate": future_date,
            "hydrate": "linescore,venue"
        }
        data = requests.get(url, params=params).json()
        upcoming = []
        for d in data.get("dates", []):
            for game in d["games"]:
                if game["status"]["detailedState"] not in ("Final", "Game Over", "Completed Early"):
                    upcoming.append(game)
        if upcoming:
            g = upcoming[0]
            return jsonify({
                "away": g["teams"]["away"]["team"]["name"],
                "home": g["teams"]["home"]["team"]["name"],
                "game_datetime": g["gameDate"],  # full ISO string in UTC
                "game_type": label,
                "venue": g.get("venue", {}).get("name", "")
            })
    return jsonify(None)

@app.route("/api/player-next-game")
def player_next_game():
    from datetime import timedelta
    team_id = request.args.get("team_id", type=int)
    if not team_id:
        return jsonify(None)

    today = date.today().strftime("%Y-%m-%d")
    future_date = (date.today() + timedelta(days=14)).strftime("%Y-%m-%d")
    url = "https://statsapi.mlb.com/api/v1/schedule"

    for game_type in ["R", "S"]:
        params = {
            "sportId": 1, "teamId": team_id, "season": 2026,
            "gameType": game_type,
            "startDate": today, "endDate": future_date,
            "hydrate": "linescore,venue"
        }
        data = requests.get(url, params=params).json()
        upcoming = []
        for d in data.get("dates", []):
            for game in d["games"]:
                if game["status"]["detailedState"] not in ("Final", "Game Over", "Completed Early"):
                    upcoming.append(game)
        if upcoming:
            g = upcoming[0]
            away = g["teams"]["away"]["team"]["name"]
            home = g["teams"]["home"]["team"]["name"]
            return jsonify({
                "away": away,
                "home": home,
                "game_datetime": g["gameDate"],
                "venue": g.get("venue", {}).get("name", ""),
                "is_home": home != away and g["teams"]["home"]["team"]["id"] == team_id
            })

    return jsonify(None)


@app.route("/api/prevgame")
def prev_game_api():
    team_param = request.args.get("team", "padres")
    team_id = resolve_team_id(team_param)
    today = date.today().strftime("%Y-%m-%d")
    url = "https://statsapi.mlb.com/api/v1/schedule"
    game_label = "Regular Season"

    params = {
        "sportId": 1, "teamId": team_id, "season": 2026,
        "gameType": "R", "hydrate": "linescore",
        "startDate": "2026-03-01", "endDate": today
    }
    data = requests.get(url, params=params).json()
    completed = []
    for d in data.get("dates", []):
        for game in d["games"]:
            if game["status"]["detailedState"] == "Final":
                completed.append(game)

    if not completed:
        game_label = "Spring Training"
        params["gameType"] = "S"
        params["startDate"] = "2026-02-01"
        data = requests.get(url, params=params).json()
        for d in data.get("dates", []):
            for game in d["games"]:
                if game["status"]["detailedState"] == "Final":
                    completed.append(game)

    if not completed:
        return jsonify(None)

    last = completed[-1]
    game_pk = last["gamePk"]
    away = last["teams"]["away"]
    home = last["teams"]["home"]

    scoring_summary = []
    try:
        live_data = requests.get(f"https://statsapi.mlb.com/api/v1.1/game/{game_pk}/feed/live").json()
        all_plays = live_data["liveData"]["plays"].get("allPlays", [])
        for play in all_plays:
            if play.get("about", {}).get("isScoringPlay", False):
                scoring_summary.append({
                    "inning": f"{'Top' if play['about']['isTopInning'] else 'Bot'} {play['about']['inning']}",
                    "description": play["result"].get("description", ""),
                    "away_score": play["result"].get("awayScore", 0),
                    "home_score": play["result"].get("homeScore", 0)
                })
    except Exception:
        pass

    return jsonify({
        "away": away["team"]["name"],
        "home": home["team"]["name"],
        "away_score": away.get("score", 0),
        "home_score": home.get("score", 0),
        "date": last["gameDate"][:10],
        "game_type": game_label,
        "scoring_summary": scoring_summary
    })


@app.route("/api/live")
def live_game_api():
    team_param = request.args.get("team", "padres")
    team_id = resolve_team_id(team_param)
    today = date.today().strftime("%Y-%m-%d")
    schedule_url = "https://statsapi.mlb.com/api/v1/schedule"

    # ONLY check today — never look back at old finished games
    import time
    params = {"sportId": 1, "teamId": team_id, "date": today, "hydrate": "linescore", "_": int(time.time())}
    data = mlb_session.get(schedule_url, params=params).json()    
    dates = data.get("dates", [])

    if not dates:
        return jsonify(None)

    game = dates[0]["games"][0]
    game_pk = game["gamePk"]
    status = game["status"]["detailedState"]

    live_data = mlb_session.get(f"https://statsapi.mlb.com/api/v1.1/game/{game_pk}/feed/live").json()
    linescore = live_data["liveData"]["linescore"]
    plays = live_data["liveData"]["plays"]

    all_plays = plays.get("allPlays", [])
    completed_plays = [p for p in all_plays if p.get("about", {}).get("isComplete", False)]
    scoring_plays = [p for p in all_plays if p.get("about", {}).get("isScoringPlay", False)]
    scoring_summary = []
    for play in scoring_plays:
        scoring_summary.append({
            "inning": f"{'Top' if play['about']['isTopInning'] else 'Bot'} {play['about']['inning']}",
            "description": play["result"].get("description", ""),
            "away_score": play["result"].get("awayScore", 0),
            "home_score": play["result"].get("homeScore", 0)
        })

    if completed_plays:
        last = completed_plays[-1]["result"]
        last_play = last.get("description", "No description available")
        last_play_event = last.get("eventType", "")
        last_play_rbi = last.get("rbi", 0)
        last_play_scoring = completed_plays[-1].get("about", {}).get("isScoringPlay", False)
    else:
        last_play = "No plays yet"
        last_play_event = ""
        last_play_rbi = 0
        last_play_scoring = False

    offense = linescore.get("offense", {})
    current = plays.get("currentPlay", {})
    matchup = current.get("matchup", {})

    return jsonify({
        "inning": linescore.get("currentInningOrdinal", "N/A"),
        "half": linescore.get("inningHalf", ""),
        "outs": linescore.get("outs", 0),
        "balls": linescore.get("balls", 0),
        "strikes": linescore.get("strikes", 0),
        "first": "first" in offense,
        "second": "second" in offense,
        "third": "third" in offense,
        "batter": matchup.get("batter", {}).get("fullName", "N/A"),
        "pitcher": matchup.get("pitcher", {}).get("fullName", "N/A"),
        "away": game["teams"]["away"]["team"]["name"],
        "home": game["teams"]["home"]["team"]["name"],
        "away_score": game["teams"]["away"].get("score", 0),
        "home_score": game["teams"]["home"].get("score", 0),
        "status": status,
        "last_play": last_play,
        "last_play_event": last_play_event,
        "last_play_rbi": last_play_rbi,
        "last_play_scoring": last_play_scoring,
        "scoring_summary": scoring_summary
    })

@app.route("/api/favorites", methods=["GET"])
def get_favorites():
    uid = request.args.get("uid")
    if not uid:
        return jsonify([])
    team_param = request.args.get("team", "padres")
    fav_team_key = normalize_team_key(team_param)
    favorites = FavoritePlayer.query.filter_by(uid=uid, favorite_team=fav_team_key).all()
    result = []
    for f in favorites:
        stats_data = requests.get(
            f"https://statsapi.mlb.com/api/v1/people/{f.player_id}/stats",
            params={"stats": "season", "group": "hitting", "season": 2026}
        ).json()
        stats_list = stats_data.get("stats", [])
        splits = stats_list[0].get("splits", []) if stats_list else []
        if splits:
            s = splits[0]["stat"]
            result.append({
                "player_id": f.player_id,
                "name": f.name,
                "position": f.position,
                "team": f.team,
                "favorited": True,
                "avg": s.get("avg", "N/A"),
                "hr": s.get("homeRuns", "N/A"),
                "rbi": s.get("rbi", "N/A"),
                "ops": s.get("ops", "N/A"),
                "obp": s.get("obp", "N/A"),
                "slg": s.get("slg", "N/A"),
                "hits": s.get("hits", "N/A"),
                "games": s.get("gamesPlayed", "N/A"),
                "doubles": s.get("doubles", "N/A"),
                "triples": s.get("triples", "N/A"),
                "sb": s.get("stolenBases", "N/A"),
                "cs": s.get("caughtStealing", "N/A"),
                "bb": s.get("baseOnBalls", "N/A"),
                "k": s.get("strikeOuts", "N/A")
            })
        else:
            result.append({
                "player_id": f.player_id,
                "name": f.name,
                "position": f.position,
                "team": f.team,
                "favorited": True,
                "avg": "N/A", "hr": "N/A", "rbi": "N/A",
                "ops": "N/A", "obp": "N/A", "slg": "N/A",
                "hits": "N/A", "games": "N/A", "doubles": "N/A",
                "triples": "N/A", "sb": "N/A", "cs": "N/A",
                "bb": "N/A", "k": "N/A"
            })
    return jsonify(result)


@app.route("/api/favorites", methods=["POST"])
def toggle_favorite():
    data = request.json
    uid = data.get("uid")
    if not uid:
        return jsonify({"error": "no uid"}), 400
    player_id = data["player_id"]
    fav_team_key = normalize_team_key(data.get("favorite_team", "padres"))
    existing = FavoritePlayer.query.filter_by(
        player_id=player_id, uid=uid, favorite_team=fav_team_key
    ).first()
    if existing:
        db.session.delete(existing)
        db.session.commit()
        return jsonify({"status": "removed"})
    new_fav = FavoritePlayer(
        player_id=player_id,
        name=data["name"],
        position=data["position"],
        team=data.get("team", ""),
        uid=uid,
        user_id=uid,
        favorite_team=fav_team_key
    )
    db.session.add(new_fav)
    db.session.commit()
    return jsonify({"status": "added"})

@app.route("/api/search")
def search_players():
    name = request.args.get("name", "")
    if not name or len(name) < 3:
        return jsonify([])
    
    url = "https://statsapi.mlb.com/api/v1/people/search"
    data = requests.get(url, params={
        "names": name,
        "sportId": 1,
        "hydrate": "currentTeam"
    }).json()
    
    results = []
    for player in data.get("people", [])[:5]:  # limit to top 5
        person_id = player["id"]
        full_name = player["fullName"]
        position = player.get("primaryPosition", {}).get("abbreviation", "N/A")
        
        # Get team properly
        team = "Unknown"
        current_team = player.get("currentTeam", {})
        if current_team:
            # Fetch full team name
            team_data = requests.get(f"https://statsapi.mlb.com/api/v1/teams/{current_team.get('id', '')}").json()
            team = team_data.get("teams", [{}])[0].get("name", "Unknown")

        stats_data = requests.get(
            f"https://statsapi.mlb.com/api/v1/people/{person_id}/stats",
            params={"stats": "season", "group": "hitting", "season": 2026}
        ).json()
        stats_list = stats_data.get("stats", [])
        splits = stats_list[0].get("splits", []) if stats_list else []

        if splits:
            s = splits[0]["stat"]
            results.append({
                "player_id": person_id,
                "name": full_name,
                "position": position,
                "team": team,
                "avg": s.get("avg", "N/A"),
                "hr": s.get("homeRuns", "N/A"),
                "rbi": s.get("rbi", "N/A"),
                "ops": s.get("ops", "N/A"),
                "obp": s.get("obp", "N/A"),
                "slg": s.get("slg", "N/A"),
                "hits": s.get("hits", "N/A"),
                "games": s.get("gamesPlayed", "N/A"),
                "doubles": s.get("doubles", "N/A"),
                "triples": s.get("triples", "N/A"),
                "sb": s.get("stolenBases", "N/A"),
                "cs": s.get("caughtStealing", "N/A"),
                "bb": s.get("baseOnBalls", "N/A"),
                "k": s.get("strikeOuts", "N/A")
            })
        else:
            results.append({
                "player_id": person_id,
                "name": full_name,
                "position": position,
                "team": team,
                "avg": "N/A", "hr": "N/A",
                "rbi": "N/A", "ops": "N/A",
                "obp": "N/A", "slg": "N/A",
                "hits": "N/A", "games": "N/A",
                "doubles": "N/A", "triples": "N/A",
                "sb": "N/A", "cs": "N/A",
                "bb": "N/A", "k": "N/A"
            })
    
    return jsonify(results)
@app.route("/api/playergame/<int:player_id>")
def player_game_detail(player_id):
    url = f"https://statsapi.mlb.com/api/v1/people/{player_id}/stats"
    
    all_splits = []
    for season, game_type in [("2025", "R"), ("2026", "S"), ("2026", "R")]:
        params = {
            "stats": "gameLog",
            "group": "hitting",
            "season": season,
            "gameType": game_type
        }
        data = requests.get(url, params=params).json()
        stats_list = data.get("stats", [])
        if stats_list:
            splits = stats_list[0].get("splits", [])
            if splits:
                all_splits.extend(splits)

    if not all_splits:
        return jsonify(None)

    # Return game list WITHOUT play by play (fast)
    games = []
    for last in all_splits[-10:]:  # only last 10 games
        s = last["stat"]
        games.append({
            "game_pk": last.get("game", {}).get("gamePk"),
            "game_date": last.get("date", "N/A"),
            "opponent": last.get("opponent", {}).get("name", "N/A"),
            "stat_line": {
                "ab": s.get("atBats", 0),
                "h": s.get("hits", 0),
                "bb": s.get("baseOnBalls", 0),
                "k": s.get("strikeOuts", 0),
                "hr": s.get("homeRuns", 0),
                "doubles": s.get("doubles", 0),
                "triples": s.get("triples", 0),
                "rbi": s.get("rbi", 0),
                "runs": s.get("runs", 0),
                "sb": s.get("stolenBases", 0)
            }
        })

    return jsonify(games)

@app.route("/api/playergame/<int:player_id>/<int:game_pk>")
def player_game_plays(player_id, game_pk):
    live_data = requests.get(f"https://statsapi.mlb.com/api/v1.1/game/{game_pk}/feed/live").json()
    all_plays = live_data["liveData"]["plays"]["allPlays"]
    player_plays = [p for p in all_plays
                   if p.get("matchup", {}).get("batter", {}).get("id") == player_id
                   and p.get("about", {}).get("isComplete", False)]

    plays_detail = []
    for play in player_plays:
        result = play["result"]
        event = result.get("event", "N/A")
        description = result.get("description", "")
        hit_data = None
        for pe in reversed(play.get("playEvents", [])):
            if pe.get("hitData"):
                hit_data = pe["hitData"]
                break
        play_info = {"event": event, "description": description}
        if hit_data:
            play_info["ev"] = hit_data.get("launchSpeed", None)
            play_info["la"] = hit_data.get("launchAngle", None)
            play_info["dist"] = hit_data.get("totalDistance", None)
            play_info["trajectory"] = hit_data.get("trajectory", None)
            play_info["hardness"] = hit_data.get("hardness", None)
            play_info["location"] = hit_data.get("location", None)
        plays_detail.append(play_info)

    return jsonify(plays_detail)

@app.route("/api/wildcard")
def wildcard_api():
    url = "https://statsapi.mlb.com/api/v1/standings"
    params = {
        "leagueId": 104,
        "season": 2026,
        "standingsTypes": "wildCard",
        "hydrate": "division,team"
    }
    data = requests.get(url, params=params).json()
    
    teams = []
    for record in data.get("records", []):
        for t in record.get("teamRecords", []):
            teams.append({
                "name": t["team"]["name"],
                "abbreviation": t["team"].get("abbreviation", ""),
                "division": t["team"].get("division", {}).get("name", ""),
                "wc_rank": int(t.get("wildCardRank", 99)),
                "wins": t["wins"],
                "losses": t["losses"],
                "pct": t["winningPercentage"],
                "wc_gb": t.get("wildCardGamesBack", "-")
            })
    
    teams.sort(key=lambda x: x["wc_rank"])
    return jsonify(teams)


@app.route("/api/nlplayoff")
def nl_playoff_api():
    url = "https://statsapi.mlb.com/api/v1/standings"
    params = {
        "leagueId": 104,
        "season": 2026,
        "standingsTypes": "regularSeason",
        "hydrate": "division,team"
    }
    data = requests.get(url, params=params).json()

    # Group by division, pick rank-1 from each
    divisions = {}
    all_teams = []

    for record in data.get("records", []):
        div_name = record.get("division", {}).get("name", "")
        for t in record["teamRecords"]:
            team = {
                "name": t["team"]["name"],
                "abbreviation": t["team"].get("abbreviation", ""),
                "division": div_name,
                "league_rank": int(t.get("leagueRank", 99)),
                "division_rank": int(t.get("divisionRank", 99)),
                "wins": t["wins"],
                "losses": t["losses"],
                "pct": t["winningPercentage"],
                "gb": t.get("gamesBack", "-"),
                "wc_gb": t.get("wildCardGamesBack", "-"),
                "games_remaining": t.get("gamesRemaining", "-"),
            }
            all_teams.append(team)
            # Track the division-rank-1 team per division
            if int(t.get("divisionRank", 99)) == 1:
                # If tie, keep the one with better league_rank
                if div_name not in divisions or team["league_rank"] < divisions[div_name]["league_rank"]:
                    divisions[div_name] = team

    div_leaders = list(divisions.values())
    div_leaders.sort(key=lambda x: x["league_rank"])
    div_leader_names = {t["name"] for t in div_leaders}

    remaining = [t for t in all_teams if t["name"] not in div_leader_names]
    remaining.sort(key=lambda x: x["league_rank"])

    wild_cards = remaining[:3]
    eliminated = remaining[3:]

    for i, t in enumerate(div_leaders):
        t["seed"] = i + 1
        t["category"] = "division"
    for i, t in enumerate(wild_cards):
        t["seed"] = i + 4
        t["category"] = "wildcard"
    for t in eliminated:
        t["seed"] = None
        t["category"] = "eliminated"

    return jsonify(div_leaders + wild_cards + eliminated)

@app.route("/api/alplayoff")
def al_playoff_api():
    url = "https://statsapi.mlb.com/api/v1/standings"
    params = {
        "leagueId": 103,
        "season": 2026,
        "standingsTypes": "regularSeason",
        "hydrate": "division,team"
    }
    data = requests.get(url, params=params).json()

    divisions = {}
    all_teams = []

    for record in data.get("records", []):
        div_name = record.get("division", {}).get("name", "")
        for t in record["teamRecords"]:
            team = {
                "name": t["team"]["name"],
                "abbreviation": t["team"].get("abbreviation", ""),
                "division": div_name,
                "league_rank": int(t.get("leagueRank", 99)),
                "division_rank": int(t.get("divisionRank", 99)),
                "wins": t["wins"],
                "losses": t["losses"],
                "pct": t["winningPercentage"],
                "gb": t.get("gamesBack", "-"),
                "wc_gb": t.get("wildCardGamesBack", "-"),
                "games_remaining": t.get("gamesRemaining", "-"),
            }
            all_teams.append(team)
            if int(t.get("divisionRank", 99)) == 1:
                if div_name not in divisions or team["league_rank"] < divisions[div_name]["league_rank"]:
                    divisions[div_name] = team

    div_leaders = list(divisions.values())
    div_leaders.sort(key=lambda x: x["league_rank"])
    div_leader_names = {t["name"] for t in div_leaders}

    remaining = [t for t in all_teams if t["name"] not in div_leader_names]
    remaining.sort(key=lambda x: x["league_rank"])

    wild_cards = remaining[:3]
    eliminated = remaining[3:]

    for i, t in enumerate(div_leaders):
        t["seed"] = i + 1
        t["category"] = "division"
    for i, t in enumerate(wild_cards):
        t["seed"] = i + 4
        t["category"] = "wildcard"
    for t in eliminated:
        t["seed"] = None
        t["category"] = "eliminated"

    return jsonify(div_leaders + wild_cards + eliminated)

if __name__ == "__main__":
    app.run(debug=True, port=5001)