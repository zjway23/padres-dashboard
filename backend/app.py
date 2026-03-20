from flask import Flask, jsonify
from flask_cors import CORS
import requests
from datetime import date

app = Flask(__name__)
CORS(app)  # Allows React to talk to Flask

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
        "hydrate": "division"
    }
    data = requests.get(url, params=params).json()
    
    for division in data.get("records", []):
        if division.get("division", {}).get("id") == 203:
            return jsonify([{
                "name": t["team"]["name"],
                "wins": t["wins"],
                "losses": t["losses"],
                "pct": t["winningPercentage"],
                "gb": t["gamesBack"]
            } for t in division["teamRecords"]])
    
    return jsonify([])

if __name__ == "__main__":
    app.run(debug=True)