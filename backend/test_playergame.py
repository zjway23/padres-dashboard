import requests

def get_player_game_detail(player_id, name, game_pk):
    url = f"https://statsapi.mlb.com/api/v1.1/game/{game_pk}/feed/live"
    data = requests.get(url).json()
    
    all_plays = data["liveData"]["plays"]["allPlays"]
    
    player_plays = [p for p in all_plays 
                   if p.get("matchup", {}).get("batter", {}).get("id") == player_id
                   and p.get("about", {}).get("isComplete", False)]
    
    print(f"\n{name} - Game {game_pk}")
    for play in player_plays:
        result = play["result"]
        event = result.get("event", "N/A")
        desc = result.get("description", "")
        
        # Check for hit data on last pitch
        hit_data = None
        for pe in reversed(play.get("playEvents", [])):
            if pe.get("hitData"):
                hit_data = pe["hitData"]
                break
        
        if hit_data:
            ev = hit_data.get("launchSpeed", "N/A")
            la = hit_data.get("launchAngle", "N/A")
            dist = hit_data.get("totalDistance", "N/A")
            print(f"{event} - EV: {ev} mph | LA: {la}° | Dist: {dist} ft")
        else:
            print(f"{event}")

get_player_game_detail(665487, "Fernando Tatis Jr.", 831735)