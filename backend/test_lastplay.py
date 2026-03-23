import requests
from datetime import date
import json

def get_last_play():
    today = date.today().strftime("%Y-%m-%d")
    
    schedule_url = "https://statsapi.mlb.com/api/v1/schedule"
    params = {"sportId": 1, "teamId": 135, "date": today, "hydrate": "linescore"}
    data = requests.get(schedule_url, params=params).json()
    
    dates = data.get("dates", [])
    if not dates:
        print("No game today")
        return
    
    game_pk = dates[0]["games"][0]["gamePk"]
    live_data = requests.get(f"https://statsapi.mlb.com/api/v1.1/game/{game_pk}/feed/live").json()
    
    plays = live_data["liveData"]["plays"]
    all_plays = plays.get("allPlays", [])
    
    if all_plays:
        # Print raw last play so we can see the structure
        print(json.dumps(all_plays[-1], indent=2))
    else:
        print("No plays found")

get_last_play()