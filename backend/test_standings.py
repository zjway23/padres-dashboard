import requests

def get_nl_west_standings():
    url = "https://statsapi.mlb.com/api/v1/standings"
    params = {
        "leagueId": 104,
        "season": 2026,
        "standingsTypes": "regularSeason",
        "hydrate": "division"
    }
    response = requests.get(url, params=params)
    data = response.json()

    for division in data.get("records", []):
        div_id = division.get("division", {}).get("id")
        if div_id == 203:  # NL West division ID
            print("NL West Standings:")
            for team in division["teamRecords"]:
                name = team["team"]["name"]
                wins = team["wins"]
                losses = team["losses"]
                pct = team["winningPercentage"]
                gb = team["gamesBack"]
                print(f"{name}: {wins}-{losses} ({pct}) GB: {gb}")

get_nl_west_standings()