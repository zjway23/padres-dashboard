import requests

def get_padres_batting_stats():
    roster_url = "https://statsapi.mlb.com/api/v1/teams/135/roster"
    params = {"rosterType": "active", "season": 2026}
    roster_data = requests.get(roster_url, params=params).json()

    players = []
    for player in roster_data.get("roster", []):
        person_id = player["person"]["id"]
        name = player["person"]["fullName"]
        position = player["position"]["abbreviation"]

        if position == "P":
            continue

        stats_url = f"https://statsapi.mlb.com/api/v1/people/{person_id}/stats"
        stats_data = requests.get(stats_url, params={
            "stats": "season",
            "group": "hitting",
            "season": 2025
        }).json()

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

    for p in players:
        print(f"{p['name']} ({p['position']}): AVG {p['avg']} | HR {p['hr']} | RBI {p['rbi']} | OPS {p['ops']}")

get_padres_batting_stats()