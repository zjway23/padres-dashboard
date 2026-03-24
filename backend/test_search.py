import requests

def search_player(name):
    url = "https://statsapi.mlb.com/api/v1/people/search"
    params = {
        "names": name,
        "sportId": 1
    }
    data = requests.get(url, params=params).json()
    
    for player in data.get("people", []):
        print(f"{player['fullName']} - ID: {player['id']} - Position: {player.get('primaryPosition', {}).get('abbreviation', 'N/A')}")

search_player("JJ Wetherholt")