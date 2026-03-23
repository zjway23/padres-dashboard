import requests

def get_previous_game():
    url = "https://statsapi.mlb.com/api/v1/schedule"
    params = {
        "sportId": 1,
        "teamId": 135,
        "season": 2026,
        "gameType": "S",  # S = Spring Training
        "hydrate": "linescore",
        "startDate": "2026-02-01",
        "endDate": "2026-03-23"
    }
    data = requests.get(url, params=params).json()

    dates = data.get("dates", [])
    
    completed = []
    for d in dates:
        for game in d["games"]:
            if game["status"]["detailedState"] == "Final":
                completed.append(game)
    
    if not completed:
        print("No completed games found")
        return
        
    last = completed[-1]
    away = last["teams"]["away"]
    home = last["teams"]["home"]
    print(f"{away['team']['name']} {away.get('score', 0)} @ {home['team']['name']} {home.get('score', 0)}")
    print(f"Date: {last['gameDate'][:10]}")

get_previous_game()