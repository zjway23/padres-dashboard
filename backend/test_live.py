import requests

def get_live_game():
    # First get today's Padres game ID
    from datetime import date
    today = date.today().strftime("%Y-%m-%d")
    
    schedule_url = "https://statsapi.mlb.com/api/v1/schedule"
    params = {
        "sportId": 1,
        "teamId": 135,
        "date": today,
        "hydrate": "linescore"
    }
    data = requests.get(schedule_url, params=params).json()
    
    dates = data.get("dates", [])
    if not dates:
        print("No game today")
        return
    
    game = dates[0]["games"][0]
    game_pk = game["gamePk"]
    print(f"Game ID: {game_pk}")
    
    # Now get the live feed for that game
    live_url = f"https://statsapi.mlb.com/api/v1.1/game/{game_pk}/feed/live"
    live_data = requests.get(live_url).json()
    
    linescore = live_data["liveData"]["linescore"]
    plays = live_data["liveData"]["plays"]
    
    print(f"Inning: {linescore.get('currentInningOrdinal', 'N/A')} {linescore.get('inningHalf', '')}")
    print(f"Outs: {linescore.get('outs', 0)}")
    print(f"Count: {linescore.get('balls', 0)}-{linescore.get('strikes', 0)}")
    
    # Runners
    offense = linescore.get("offense", {})
    print(f"Runner on 1st: {'Yes' if 'first' in offense else 'No'}")
    print(f"Runner on 2nd: {'Yes' if 'second' in offense else 'No'}")
    print(f"Runner on 3rd: {'Yes' if 'third' in offense else 'No'}")
    
    # Current batter and pitcher
    current = plays.get("currentPlay", {})
    matchup = current.get("matchup", {})
    batter = matchup.get("batter", {}).get("fullName", "N/A")
    pitcher = matchup.get("pitcher", {}).get("fullName", "N/A")
    print(f"Batter: {batter}")
    print(f"Pitcher: {pitcher}")

get_live_game()