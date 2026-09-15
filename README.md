# Ballpark — MLB Dashboard

A live baseball dashboard built around one club at a time: scores, standings,
the playoff race, roster stats, bullpen availability, the injured list, and
per-player tracking.
Defaults to the **San Diego Padres**, and works for all 30 teams.

![tabs](https://img.shields.io/badge/tabs-Dashboard%20·%20Team%20·%20Favorites%20·%20Bullpen%20·%20Injury%20Watch%20·%20Playoff%20Push-informational)

## Running it

Two processes. The backend proxies and caches the MLB Stats API; the frontend
is a Vite/React app.

**Backend** (port 5001):

```bash
cd backend
pip install -r requirements.txt
python3 app.py
```

**Frontend** (port 5173):

```bash
cd frontend
npm install
npm run dev
```

Then open http://localhost:5173.

### Configuration

`backend/.env`

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Favorites and preferences store. Defaults to `sqlite:///padres.db`. |
| `CORS_ORIGINS` | Allowed origins for `/api/*`. Defaults to `*`. |
| `PORT` | Backend port. Defaults to `5001`. |

`frontend/.env.local` — copy `frontend/.env.local.example` and fill it in.

| Variable | Purpose |
|---|---|
| `VITE_API_URL` | Backend base URL. Defaults to `http://localhost:5001`. |
| `VITE_FIREBASE_*` | Firebase web config, used for Google sign-in. |

The Firebase values are **required to run the app at all**: `App.jsx` renders
the login screen until a user is authenticated, so without them every tab is
behind a sign-in that cannot succeed.

Only favorites and preferences need the database. If it is unreachable the API
still serves scores, standings, rosters and the bullpen — those two features
disable themselves and `/api/health` reports `"database": "down"`.

## Tests

```bash
cd backend
python3 -m pytest tests.py -v
```

Logic tests (seeding, caching, team resolution, doubleheader selection) run
offline. Tests that need `statsapi.mlb.com` are marked `live` and skip
automatically without a network.

```bash
cd frontend && npm run lint
```

## API

| Endpoint | Returns |
|---|---|
| `GET /api/health` | Status, current season, cache and database state |
| `GET /api/teams` | All 30 clubs with ids, abbreviations, divisions |
| `GET /api/season` | Season boundary dates and current phase |
| `GET /api/dashboard?team=` | Live game, previous, upcoming, division, playoff picture — in one call |
| `GET /api/live?team=` | Today's game: score, count, bases, last play, scoring summary |
| `GET /api/prevgame?team=` · `nextgame` · `upcoming-games` | Schedule views |
| `GET /api/standings?team=` | The team's division |
| `GET /api/playoff?team=` | That league's playoff picture with seeds |
| `GET /api/roster?team=&uid=` | `{batters, pitchers}`, each flagged with favorites |
| `GET /api/bullpen?team=` | Relievers with rest days and availability |
| `GET /api/injuries?team=` | The injured list, with each player's earliest eligible return |
| `GET /api/h2h?team=&opponent=` | Season series record |
| `GET /api/search?name=` | Player search across MLB |
| `GET /api/players/<id>/gamelog` · `/games/<pk>` · `/live` | Player detail |
| `GET·POST /api/favorites` · `/api/preferences` | Per-user state |

`team` accepts a slug (`padres`), an abbreviation (`SD`), or a numeric id.

## How it's put together

```
backend/
  mlb.py      HTTP session, TTL cache, team registry, season/date helpers
  stats.py    Domain layer — turns API documents into UI-shaped data
  app.py      Flask routes (thin; fetching and shaping live in the modules above)
  tests.py    Test suite
frontend/src/
  lib/        api client, theming, formatting
  hooks/      useApi — fetch, abort, visibility-aware polling
  components/ one file per surface, plus ui.jsx primitives
```

### Notes on the design

**Caching is what makes it usable.** Every upstream call goes through
`mlb.get_json`, which caches by URL with a TTL matched to how fast the data
changes (5s for a live score, 10min for season stat lines). Per-key locks stop
concurrent requests from stampeding the same expired entry, and a failed
upstream call falls back to the last good copy rather than erroring.

**Roster stats come from one request.** The MLB API can hydrate season stats
onto a roster (`hydrate=person(stats(...))`), which turns roughly sixty
sequential per-player requests into a single ~0.3s call.

**Live polling is filtered and adaptive.** The raw live feed is ~760KB; a
`fields` projection trims it to ~17KB. Polling runs every 10s during a game,
every 2min otherwise, and pauses entirely while the browser tab is hidden.

**Team colors are contrast-checked, not hardcoded.** Many club colors are
illegible on a dark surface, so `lib/theme.js` lightens each toward white only
until it clears 4.5:1 against the page background. Padres gold already passes
at 11.46:1 and renders unchanged.

**Bullpen availability is inferred.** Rest days and three-day pitch counts come
from each reliever's game log and fold into available / caution / unavailable.
It is an estimate from public data, not official team reporting, and the UI
says so. Status is always shown with an icon and a label so it doesn't rely on
color alone.

**Historical durations are gated hard.** Each card can also show how long
comparable injuries have actually kept players out, measured by pairing IL
placements with the activations that ended them across five seasons of the
transaction feed. It is shown as the middle half of past cases, never a single
date, and two rules decide whether it appears at all: at least 25 completed
spells, and an interquartile range no wider than 1.5x its own median. The
second rule is the important one - "elbow inflammation" spans 22 to 115 days
around a median of 45, covering everything from a cortisone shot to surgery, so
it is suppressed rather than quoted. Roughly 29% of injured players get a range;
the rest get nothing, which is the honest answer. Note also that 19% of IL
placements never end in an activation and so contribute no measurable spell,
which biases every figure optimistic. Building the table reads five seasons of
league-wide transactions and takes about twenty seconds, so it is warmed on a
background thread and cached for a day rather than sitting in front of a page
load.

**Return dates are derived, not reported.** MLB publishes no expected-return
field, so Injury Watch stitches three public sources together: roster status
says which list a player is on, the transaction feed says when he went on it
and why, and the game log says when he last played. The earliest legal
activation is then placement date + the list's length, which sorts every
player into *regular season*, *postseason at the earliest*, or *next season*.
Two rules matter for getting this right: a retroactive placement backdates the
clock (so `resolutionDate` is read, not `date`), and transferring a player to
the 60-day IL does not restart it — the 60 days run from the original
placement. A separate *readiness* signal keeps the tab honest, since a pitcher
whose clock expired in May but who hasn't thrown a pitch since 2024 is
"eligible" in the same technical sense as a healed hamstring.
