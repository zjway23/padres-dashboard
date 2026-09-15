import { useEffect, useMemo, useState } from "react"
import { api } from "../lib/api"
import { Badge, Card, Empty, Pill, Skeleton, StatTile } from "./ui"
import { PlayoffTable } from "./Standings"
import { DASH, gamesBack } from "../lib/format"

// The race narrows as the season runs out: early on, anyone within ~10 games is
// a threat; by late September only a couple of games separate contenders. The
// threshold tracks that. This only works now that games_remaining is a real
// number - it was always "-" before, which pinned the threshold at its maximum.
const BASE_GB = 10
const MIN_GB = 2
const SLOPE = 0.8
const SEASON_GAMES = 162

function gbThreshold(gamesRemaining) {
  const played = SEASON_GAMES - (gamesRemaining ?? SEASON_GAMES)
  const progress = Math.max(0, Math.min(1, played / SEASON_GAMES))
  return Math.max(MIN_GB, BASE_GB * (1 - progress * SLOPE))
}

/** Games between two teams, positive when `team` trails `reference`. */
function gapTo(reference, team) {
  return ((reference.wins - team.wins) + (team.losses - reference.losses)) / 2
}

function seriesFrom(games) {
  if (!games?.length) return []
  const out = []
  let current = { ...games[0], count: 1, endDate: games[0].date }
  for (const game of games.slice(1)) {
    const gap = (new Date(`${game.date}T12:00:00`) - new Date(`${current.endDate}T12:00:00`)) / 86400000
    if (game.opponent === current.opponent && game.is_home === current.is_home && gap <= 2) {
      current.count += 1
      current.endDate = game.date
    } else {
      out.push(current)
      current = { ...game, count: 1, endDate: game.date }
    }
  }
  out.push(current)
  return out
}

/** Average win% of a team's remaining opponents. */
function strengthOfSchedule(games, teamsByAbbrev) {
  if (!games?.length) return null
  const values = games
    .map(g => teamsByAbbrev[(g.opponent_abbrev || "").toUpperCase()])
    .filter(Boolean)
    .map(t => parseFloat(t.pct))
    .filter(n => !Number.isNaN(n))
  if (!values.length) return null
  return values.reduce((sum, n) => sum + n, 0) / values.length
}

function ContenderCard({ team, isMe, schedule, h2h, teamsByAbbrev }) {
  const sos = useMemo(() => strengthOfSchedule(schedule?.games, teamsByAbbrev),
    [schedule, teamsByAbbrev])
  const series = useMemo(() => seriesFrom(schedule?.games).slice(0, 3), [schedule])

  let tiebreak = { text: DASH, color: "var(--text-muted)" }
  if (h2h && h2h.played > 0) {
    if (h2h.wins > h2h.losses) tiebreak = { text: "✓ Win", color: "var(--good)" }
    else if (h2h.wins < h2h.losses) tiebreak = { text: "✗ Lose", color: "var(--critical)" }
    else tiebreak = { text: "Tied", color: "var(--text-secondary)" }
  }

  return (
    <div
      className="pen-card"
      style={{
        borderLeftColor: isMe ? "var(--accent)" : "var(--border-strong)",
        background: isMe ? "var(--accent-softer)" : "var(--surface-inset)",
      }}
    >
      <div className="pen-card__top">
        <div style={{ minWidth: 0 }}>
          <span className="pen-card__name" style={isMe ? { color: "var(--accent)" } : undefined}>
            {isMe && "★ "}{team.name}
          </span>
          {team.seed && (
            <span className={`seed seed--${team.category === "division" ? "division" : "wildcard"}`}
                  style={{ marginLeft: 6, verticalAlign: "middle" }}>
              {team.seed}
            </span>
          )}
        </div>
        <span className="nums" style={{ fontWeight: 650 }}>{team.wins}–{team.losses}</span>
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <Pill label="GB" value={team._gap === 0 ? DASH : gamesBack(team._gap)}
              title="Games behind your team" />
        <Pill label="Rem" value={team.games_remaining} title="Games remaining" />
        <Pill label="SOS" value={sos ? sos.toFixed(3).replace(/^0/, "") : DASH}
              title="Strength of schedule: average win% of remaining opponents" />
        <Pill label="STRK" value={team.streak} title="Current streak" />
        {!isMe && (
          <>
            <Pill label="H2H" value={h2h?.played ? `${h2h.wins}-${h2h.losses}` : DASH}
                  title="Head-to-head record vs your team" />
            <span className="pill" title="Head-to-head is the first MLB tiebreaker">
              <span className="pill__label">TB</span>
              <span className="pill__value" style={{ color: tiebreak.color }}>{tiebreak.text}</span>
            </span>
          </>
        )}
      </div>

      {series.length > 0 && (
        <div style={{ display: "flex", gap: 5, marginTop: 9, flexWrap: "wrap", alignItems: "center" }}>
          <span className="muted" style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.05em" }}>
            NEXT
          </span>
          {series.map((s, i) => (
            <span key={i} className="mini-tile">
              {s.is_home ? "vs " : "@ "}{s.opponent_abbrev || s.opponent}
              <span className="muted"> ({s.count})</span>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

function BracketTeam({ team, favoriteTeamId }) {
  if (!team) return <span className="muted" style={{ fontSize: 12 }}>TBD</span>
  const isMe = team.team_id === favoriteTeamId
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 6, minWidth: 0,
      color: isMe ? "var(--accent)" : "var(--text)",
      fontWeight: isMe ? 650 : 400,
      fontSize: 13,
    }}>
      <span className={`seed seed--${team.category === "division" ? "division" : "wildcard"}`}>
        {team.seed}
      </span>
      {team.abbreviation}
      <span className="muted nums" style={{ fontSize: 11 }}>{team.wins}–{team.losses}</span>
    </span>
  )
}

function Matchup({ a, b, label, note, favoriteTeamId }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      gap: 8, padding: "8px 10px", marginBottom: 6,
      borderRadius: 8, background: "var(--surface-inset)",
    }}>
      <BracketTeam team={a} favoriteTeamId={favoriteTeamId} />
      <span className="muted" style={{ fontSize: 11 }}>{label || "vs"}</span>
      {b
        ? <BracketTeam team={b} favoriteTeamId={favoriteTeamId} />
        : <span className="muted" style={{ fontSize: 12 }}>{note}</span>}
    </div>
  )
}

function Bracket({ teams, favoriteTeamId }) {
  const seeded = teams.filter(t => t.seed).sort((a, b) => a.seed - b.seed)
  if (seeded.length < 6) return <Empty>Bracket unavailable.</Empty>
  const seed = n => seeded.find(t => t.seed === n)

  return (
    <>
      <div className="stat-tile__label" style={{ marginBottom: 8 }}>Wild card · best of 3</div>
      <Matchup a={seed(3)} b={seed(6)} favoriteTeamId={favoriteTeamId} />
      <Matchup a={seed(4)} b={seed(5)} favoriteTeamId={favoriteTeamId} />
      <div className="stat-tile__label" style={{ margin: "14px 0 8px" }}>Division series · best of 5</div>
      <Matchup a={seed(1)} label="BYE →" note="WC winner (lower seed)" favoriteTeamId={favoriteTeamId} />
      <Matchup a={seed(2)} label="BYE →" note="WC winner (higher seed)" favoriteTeamId={favoriteTeamId} />
    </>
  )
}

/**
 * Clinch status, playoff berth first.
 *
 * Making the postseason is the number that matters, so it leads. Once the
 * berth is locked up the tile switches to the division race, and only shows
 * "Clinched" outright when there is nothing left to chase.
 */
function ClinchTile({ team }) {
  const berth = team.playoff_magic
  const division = team.division_magic

  if (berth === 0) {
    if (division === 0) {
      return <StatTile label="Status" value="Division ✓" hero title="Division won" />
    }
    if (division != null) {
      return <StatTile label="Div magic #" value={division} hero
                       title="Playoff berth clinched — games needed to win the division" />
    }
    return <StatTile label="Status" value="Clinched ✓" hero title="Playoff berth clinched" />
  }

  if (berth != null) {
    return <StatTile label="Magic #" value={berth} hero
                     title="Any combination of wins by this team and losses by the closest team outside the picture that clinches a playoff berth" />
  }

  if (team.playoff_tragic != null) {
    return <StatTile label="Elim. number" value={team.playoff_tragic}
                     title="Losses (or wins by the last team in) that would end elimination hopes" />
  }
  return <StatTile label="Magic #" value={DASH} />
}

function ClinchNote({ team }) {
  const berth = team.playoff_magic
  let text = null

  if (berth === 0 && team.division_magic === 0) {
    text = "Division won — locked into a top-three seed."
  } else if (berth === 0 && team.division_magic != null) {
    text = `Playoff berth clinched. Any combination of ${team.division_magic} wins or losses by the closest divisional rival wins the division.`
  } else if (berth === 0) {
    text = "Playoff berth clinched."
  } else if (berth != null) {
    const winOut = berth <= team.games_remaining
    text = `Any combination of ${berth} wins or losses by the closest team outside the picture clinches a playoff berth`
      + (winOut ? ` — winning out (${team.games_remaining}) would do it.` : ".")
  } else if (team.playoff_tragic != null) {
    text = `Outside the picture: ${team.playoff_tragic} more losses (or wins by the last team in) would end it.`
  }

  if (!text) return null
  return <p className="muted" style={{ fontSize: 12, marginBottom: 14 }}>{text}</p>
}

export default function PlayoffPushTab({ playoff, favoriteTeamId, favoriteTeam, loading }) {
  const [view, setView] = useState("division")
  const [schedules, setSchedules] = useState({})
  const [h2h, setH2h] = useState({})

  const me = useMemo(
    () => playoff?.find(t => t.team_id === favoriteTeamId),
    [playoff, favoriteTeamId])

  const teamsByAbbrev = useMemo(() => {
    const map = {}
    for (const t of playoff || []) map[t.abbreviation.toUpperCase()] = t
    return map
  }, [playoff])

  const threshold = gbThreshold(me?.games_remaining)

  const contenders = useMemo(() => {
    if (!playoff?.length || !me) return []
    const withGap = playoff.map(t => ({ ...t, _gap: gapTo(me, t) }))

    if (view === "division") {
      return withGap
        .filter(t => t.division === me.division)
        .sort((a, b) => a.div_rank - b.div_rank)
        .filter(t => t.team_id === me.team_id || Math.abs(t._gap) <= threshold)
    }
    // Wild card view: teams clustered around the final playoff spot.
    return withGap
      .filter(t => t.category !== "division")
      .sort((a, b) => parseFloat(b.pct) - parseFloat(a.pct))
      .filter(t => t.team_id === me.team_id || Math.abs(t._gap) <= threshold)
      .slice(0, 8)
  }, [playoff, me, view, threshold])

  // Fetch each contender's remaining schedule and head-to-head record once.
  useEffect(() => {
    if (!contenders.length || !me) return
    let cancelled = false

    for (const team of contenders) {
      if (schedules[team.team_id] === undefined) {
        setSchedules(prev => ({ ...prev, [team.team_id]: { games: [], loading: true } }))
        api("/api/upcoming-games", { params: { team: team.team_id, count: 162 } })
          .then(games => { if (!cancelled) setSchedules(p => ({ ...p, [team.team_id]: { games } })) })
          .catch(() => { if (!cancelled) setSchedules(p => ({ ...p, [team.team_id]: { games: [] } })) })
      }
      if (team.team_id !== me.team_id && h2h[team.team_id] === undefined) {
        setH2h(prev => ({ ...prev, [team.team_id]: null }))
        api("/api/h2h", { params: { team: favoriteTeam, opponent: team.team_id } })
          .then(record => { if (!cancelled) setH2h(p => ({ ...p, [team.team_id]: record })) })
          .catch(() => {})
      }
    }
    return () => { cancelled = true }
    // schedules/h2h are read as caches here; including them would re-run forever.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contenders, me, favoriteTeam])

  // Drop cached schedules when the user switches teams.
  useEffect(() => { setSchedules({}); setH2h({}) }, [favoriteTeam])

  if (loading && !playoff?.length) return <Skeleton rows={6} height={80} />
  if (!me) return <Card><Empty>Standings unavailable.</Empty></Card>

  const gamesPlayed = SEASON_GAMES - me.games_remaining

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <Card
        title="Playoff push"
        action={
          me.playoff_magic === 0
            ? <Badge variant="solid">{me.division_magic === 0 ? "Division ✓" : "Clinched ✓"}</Badge>
            : <Badge>{me.seed ? `Seed ${me.seed}` : "Outside the picture"}</Badge>
        }
      >
        <div className="stat-row" style={{ marginBottom: 14 }}>
          <StatTile label="Record" value={`${me.wins}-${me.losses}`} />
          <StatTile label="Win %" value={me.pct} hero />
          <StatTile label="Games left" value={me.games_remaining} />
          <StatTile label="Div GB" value={me.gb} />
          <StatTile label="WC GB" value={me.wc_gb} />
          <StatTile label="Streak" value={me.streak} />
          <StatTile label="Run diff" value={`${me.run_diff > 0 ? "+" : ""}${me.run_diff}`} />
          <ClinchTile team={me} />
        </div>

        <ClinchNote team={me} />

        <div className="tabs" style={{ maxWidth: 280 }}>
          <button className={`tab${view === "division" ? " tab--active" : ""}`}
                  onClick={() => setView("division")}>Division</button>
          <button className={`tab${view === "wildcard" ? " tab--active" : ""}`}
                  onClick={() => setView("wildcard")}>Wild card</button>
        </div>

        <p className="muted" style={{ fontSize: 11.5, marginBottom: 12 }}>
          Showing teams within {threshold.toFixed(1)} games · {gamesPlayed} played,
          {" "}{me.games_remaining} to go
        </p>

        {contenders.length === 0 ? (
          <Empty>No close contenders right now.</Empty>
        ) : (
          <div className="pen-grid">
            {contenders.map(team => (
              <ContenderCard
                key={team.team_id}
                team={team}
                isMe={team.team_id === favoriteTeamId}
                schedule={schedules[team.team_id]}
                h2h={h2h[team.team_id]}
                teamsByAbbrev={teamsByAbbrev}
              />
            ))}
          </div>
        )}
      </Card>

      <div className="grid grid--halves">
        <Card title={`${me.league} playoff picture`}>
          <PlayoffTable teams={playoff} favoriteTeamId={favoriteTeamId} />
        </Card>
        <Card title="If the season ended today">
          <Bracket teams={playoff} favoriteTeamId={favoriteTeamId} />
        </Card>
      </div>
    </div>
  )
}
