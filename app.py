from flask import Flask, jsonify, render_template
import requests
from datetime import date

app = Flask(__name__)

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

@app.route("/")
def index():
    game = get_padres_game()
    return render_template("index.html", game=game)

if __name__ == "__main__":
    app.run(debug=True)