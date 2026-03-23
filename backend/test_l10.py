import requests

def get_nl_west_standings():
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
            for team in division["teamRecords"]:
                name = team["team"]["name"]
                splits = team.get("records", {}).get("splitRecords", [])
                l10 = next((s for s in splits if s["type"] == "lastTen"), None)
                if l10:
                    print(f"{name}: L10 {l10['wins']}-{l10['losses']}")
                else:
                    print(f"{name}: L10 N/A")

get_nl_west_standings()