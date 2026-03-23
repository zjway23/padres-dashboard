from flask import Flask, jsonify
from flask_cors import CORS
import requests
from datetime import date

app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "*"}})

def get_padres_game():
    today = date.today().strftime("%Y-%m-%d")
    url = "https://statsapi.mlb.com/api/v1/schedule"
    params = {
        "sportId": 1,
        "teamId": 135,
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

def get_padres_batting_stats():
    roster_url = "https://statsapi.mlb.com/api/v1/teams/135/roster"
    roster_data = requests.get(roster_url, params={
        "rosterType": "active",
        "season": 2026
    }).json()

    players = []
    for player in roster_data.get("roster", []):
        person_id = player["person"]["id"]
        name = player["person"]["fullName"]
        position = player["position"]["abbreviation"]

        if position == "P":
            continue

        stats_data = requests.get(
            f"https://statsapi.mlb.com/api/v1/people/{person_id}/stats",
            params={"stats": "season", "group": "hitting", "season": 2025}
        ).json()

        stats_list = stats_data.get("stats", [])
        splits = stats_list[0].get("splits", []) if stats_list else []

        if splits:
            s = splits[0]["stat"]
            players.append({
                "name": name,
                "position": position,
                "avg": s.get("avg", "N/A"),
                "hr": s.get("homeRuns", "N/A"),
                "rbi": s.get("rbi", "N/A"),
                "ops": s.get("ops", "N/A"),
                "hits": s.get("hits", "N/A"),
                "games": s.get("gamesPlayed", "N/A")
            })
        else:
            players.append({
                "name": name,
                "position": position,
                "avg": "N/A", "hr": "N/A",
                "rbi": "N/A", "ops": "N/A",
                "hits": "N/A", "games": "N/A"
            })

    return sorted(players, key=lambda x: x["avg"] if x["avg"] != "N/A" else "0", reverse=True)

@app.route("/api/game")
def game_api():
    return jsonify(get_padres_game())

@app.route("/api/roster")
def roster_api():
    return jsonify(get_padres_batting_stats())

@app.route("/api/standings")
def standings_api():
    url = "https://statsapi.mlb.com/api/v1/standings"
    params = {
        "leagueId": 104,
        "season": 2026,
        "standingsTypes": "regularSeason",
        "hydrate": "division,team,record(splitRecords)"
    }
    data = requests.get(url, params=params).json()

    for division in data.get("records", []):
        if division.get("division", {}).get("id") == 203:
            teams = []
            for t in division["teamRecords"]:
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
            return jsonify(teams)

    return jsonify([])

@app.route("/api/prevgame")
def prev_game_api():
    today = date.today().strftime("%Y-%m-%d")
    url = "https://statsapi.mlb.com/api/v1/schedule"

    params = {
        "sportId": 1,
        "teamId": 135,
        "season": 2026,
        "gameType": "R",
        "hydrate": "linescore",
        "startDate": "2026-03-01",
        "endDate": today
    }
    data = requests.get(url, params=params).json()
    completed = []
    for d in data.get("dates", []):
        for game in d["games"]:
            if game["status"]["detailedState"] == "Final":
                completed.append(game)

    if not completed:
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
    away = last["teams"]["away"]
    home = last["teams"]["home"]
    return jsonify({
        "away": away["team"]["name"],
        "home": home["team"]["name"],
        "away_score": away.get("score", 0),
        "home_score": home.get("score", 0),
        "date": last["gameDate"][:10],
        "game_type": "Spring Training" if params.get("gameType") == "S" else "Regular Season"
    })

@app.route("/api/live")
def live_game_api():
    today = date.today().strftime("%Y-%m-%d")
    schedule_url = "https://statsapi.mlb.com/api/v1/schedule"
    params = {"sportId": 1, "teamId": 135, "date": today, "hydrate": "linescore"}
    data = requests.get(schedule_url, params=params).json()

    dates = data.get("dates", [])
    if not dates:
        return jsonify(None)

    game = dates[0]["games"][0]
    game_pk = game["gamePk"]

    live_data = requests.get(f"https://statsapi.mlb.com/api/v1.1/game/{game_pk}/feed/live").json()
    linescore = live_data["liveData"]["linescore"]
    plays = live_data["liveData"]["plays"]

    all_plays = plays.get("allPlays", [])
    completed_plays = [p for p in all_plays if p.get("about", {}).get("isComplete", False)]

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
        "status": game["status"]["detailedState"],
        "last_play": last_play,
        "last_play_event": last_play_event,
        "last_play_rbi": last_play_rbi,
        "last_play_scoring": last_play_scoring
    })

if __name__ == "__main__":
    app.run(debug=True, port=5001)