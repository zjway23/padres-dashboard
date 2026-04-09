// frontend/src/components/PlayoffPushTab.jsx
// Playoff Push tab: league playoff picture, division standings, bracket, and
// a dynamic "Teams to Watch" section (Division or Wild Card view).

import { useState, useEffect, useMemo } from "react"
import teamsData from "../data/teams.json"
import { StandingsRow, EliminatedRow, StandingsTable, SectionDivider } from "./Standings"

// ─── Constants ────────────────────────────────────────────────────────────────

const NL_PREFIX = "National League "
const AL_PREFIX = "American League "
const MAX_GAMES = 162

/**
 * Narrowing heuristic for "Teams to Watch":
 *
 * As the season progresses, the range of "threatening" teams shrinks.
 * - Early in season (< 40% played): include teams within 10 GB
 * - Mid season (40–70%): scale down linearly toward 5 GB
 * - Late season (> 70%): scale down further toward 2 GB
 *
 * Threshold = max(2, BASE * (1 - season_progress * SLOPE_FACTOR))
 *
 * These values are configurable via the constants below.
 */
const HEURISTIC_BASE_GB = 10      // max GB threshold early in season
const HEURISTIC_MIN_GB  = 2       // floor: never exclude teams within 2 GB
const HEURISTIC_SLOPE   = 0.8     // how fast threshold shrinks (0 = never shrinks, 1 = linear to 0)

function computeGbThreshold(gamesRemaining) {
  const gamesPlayed = MAX_GAMES - (gamesRemaining ?? MAX_GAMES)
  const seasonProgress = Math.max(0, Math.min(1, gamesPlayed / MAX_GAMES))
  return Math.max(HEURISTIC_MIN_GB, HEURISTIC_BASE_GB * (1 - seasonProgress * HEURISTIC_SLOPE))
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseGb(gb) {
  if (!gb || gb === "-" || gb === "0") return 0
  const n = parseFloat(gb)
  return isNaN(n) ? 0 : n
}

function formatDate(dateStr) {
  if (!dateStr) return ""
  // dateStr from API is "YYYY-MM-DD"
  const [, m, d] = dateStr.split("-")
  return `${parseInt(m)}/${parseInt(d)}`
}

// ─── Sub-components ───────────────────────────────────────────────────────────

/** Small loading/placeholder card */
function LoadingCard({ label }) {
  return (
    <div style={{ color: "var(--text-muted)", textAlign: "center", padding: "16px 0", fontSize: 13 }}>
      {label || "Loading…"}
    </div>
  )
}

/** A flex "card" box matching existing .standings-section style */
function FlexCard({ title, children, style }) {
  return (
    <div style={{
      background: "var(--padres-navy)",
      borderRadius: 12,
      padding: 20,
      marginBottom: 20,
      ...style
    }}>
      {title && (
        <h2 style={{
          color: "var(--color-accent)",
          fontSize: "1.1rem",
          marginBottom: 14,
          textAlign: "center"
        }}>
          {title}
        </h2>
      )}
      {children}
    </div>
  )
}

/** Division/Wild Card toggle */
function ViewToggle({ value, onChange }) {
  const btn = (v, label) => (
    <button
      key={v}
      onClick={() => onChange(v)}
      style={{
        flex: 1,
        padding: "7px 0",
        borderRadius: 8,
        border: `1.5px solid var(--color-accent)`,
        background: value === v ? "var(--color-accent)" : "transparent",
        color: value === v ? "var(--padres-dark-navy)" : "var(--color-accent)",
        fontWeight: "bold",
        fontSize: 13,
        cursor: "pointer",
        transition: "all 0.15s",
      }}
    >
      {label}
    </button>
  )

  return (
    <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
      {btn("division", "Division")}
      {btn("wildcard", "Wild Card")}
    </div>
  )
}

/** Shows the next N games for a team, rendered inline */
function UpcomingGames({ games, loading }) {
  if (loading) return <span style={{ color: "var(--text-muted)", fontSize: 12 }}>loading…</span>
  if (!games || games.length === 0) return <span style={{ color: "var(--text-muted)", fontSize: 12 }}>N/A</span>
  return (
    <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 2 }}>
      {games.map((g, i) => (
        <span
          key={i}
          style={{
            background: "var(--padres-dark-navy)",
            borderRadius: 5,
            padding: "2px 6px",
            fontSize: 11,
            color: "var(--text-muted-light)",
            whiteSpace: "nowrap",
          }}
        >
          {formatDate(g.date)} {g.is_home ? "vs" : "@"} {g.opponent_abbrev || g.opponent}
        </span>
      ))}
    </div>
  )
}

/** A card for a single "team to watch" */
function TeamToWatchCard({ team, favoriteTeamName, upcomingGames, gamesLoading }) {
  const isFav = team.name === favoriteTeamName
  const gbDisplay = team._teamsToWatchGb !== undefined
    ? (team._teamsToWatchGb === 0 ? "—" : (team._teamsToWatchGb > 0 ? `+${team._teamsToWatchGb.toFixed(1)} GB` : `${Math.abs(team._teamsToWatchGb).toFixed(1)} ahead`))
    : (team.gb === "-" || team.gb === "0" ? "—" : `${team.gb} GB`)

  return (
    <div style={{
      background: isFav ? "var(--color-highlight)" : "var(--padres-dark-navy)",
      border: `1.5px solid ${isFav ? "var(--color-accent)" : "transparent"}`,
      borderRadius: 10,
      padding: "12px 14px",
      marginBottom: 10,
    }}>
      {/* Header row */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <span style={{
          fontWeight: "bold",
          color: isFav ? "var(--color-accent)" : "var(--text-primary)",
          fontSize: 14,
        }}>
          {isFav && "★ "}{team.name}
          {team.seed && (
            <span style={{
              marginLeft: 6,
              fontSize: 10,
              background: team.category === "division" ? "var(--color-accent)" : "var(--padres-navy-mid)",
              color: team.category === "division" ? "var(--padres-dark-navy)" : "var(--color-accent)",
              borderRadius: 4,
              padding: "2px 5px",
              fontWeight: "bold",
            }}>
              #{team.seed}
            </span>
          )}
        </span>
        <span style={{ fontSize: 13, color: "var(--text-muted)", fontWeight: "bold" }}>
          {team.wins}–{team.losses}
          {team.games_remaining !== undefined && team.games_remaining !== "-" && (
            <span style={{ fontSize: 11, color: "var(--text-muted)", marginLeft: 6 }}>
              ({team.games_remaining} rem)
            </span>
          )}
        </span>
      </div>

      {/* Stats grid */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {/* GB indicator */}
        <StatPill label="GB" value={gbDisplay} />

        {/* PCT */}
        <StatPill label="PCT" value={team.pct || "—"} />

        {/* Tiebreaker — TODO: wire up real tiebreaker data when available */}
        <StatPill label="TB" value="N/A" muted title="Tiebreaker vs your team — data not available yet" />

        {/* Head-to-head remaining — TODO: wire up schedule data */}
        <StatPill label="H2H" value="N/A" muted title="Remaining head-to-head games — data not available yet" />

        {/* Strength of Schedule — TODO: compute from opponents' win% */}
        <StatPill label="SoS" value="N/A" muted title="Remaining strength of schedule — data not available yet" />
      </div>

      {/* Upcoming games */}
      <div style={{ marginTop: 8 }}>
        <span style={{ fontSize: 11, color: "var(--text-muted)", marginRight: 6 }}>Next games:</span>
        <UpcomingGames games={upcomingGames} loading={gamesLoading} />
      </div>
    </div>
  )
}

function StatPill({ label, value, muted, title }) {
  return (
    <div
      title={title}
      style={{
        background: "var(--padres-navy)",
        borderRadius: 6,
        padding: "3px 8px",
        textAlign: "center",
        minWidth: 48,
      }}
    >
      <div style={{ color: "var(--color-accent)", fontSize: 10, fontWeight: "bold" }}>{label}</div>
      <div style={{
        fontSize: 12,
        fontWeight: "bold",
        color: muted ? "var(--text-muted)" : "var(--text-primary)",
      }}>
        {value}
      </div>
    </div>
  )
}

// ─── "If Season Ended Today" Bracket ──────────────────────────────────────────

/**
 * MLB 2024+ playoff format (12 teams total, 6 per league):
 *   Wild Card Round (best-of-3): #3 vs #6, #4 vs #5
 *   Division Series (best-of-5): #1 vs lower-seed winner, #2 vs higher-seed winner
 *   Championship Series (best-of-7)
 *   World Series (best-of-7)
 */
function BracketSection({ playoffData, favoriteTeamName }) {
  const divLeaders = playoffData.filter(t => t.category === "division")
  const wildCards  = playoffData.filter(t => t.category === "wildcard")

  if (divLeaders.length < 3 || wildCards.length < 3) {
    return <LoadingCard label="Bracket data unavailable" />
  }

  const seeds = [...divLeaders, ...wildCards].sort((a, b) => a.seed - b.seed)
  const s = (n) => seeds.find(t => t.seed === n)

  // Wild Card round matchups
  const wc1 = { top: s(3), bot: s(6) }  // #3 vs #6
  const wc2 = { top: s(4), bot: s(5) }  // #4 vs #5

  return (
    <div>
      <div style={{ marginBottom: 12 }}>
        <SectionDivider label="WILD CARD ROUND (Best-of-3)" standalone />
        <MatchupRow a={wc1.top} b={wc1.bot} favoriteTeamName={favoriteTeamName} />
        <MatchupRow a={wc2.top} b={wc2.bot} favoriteTeamName={favoriteTeamName} />
      </div>

      <div style={{ marginBottom: 12 }}>
        <SectionDivider label="DIVISION SERIES (Best-of-5)" standalone />
        <MatchupRow a={s(1)} b={null} bLabel="vs WC winner (lower)" favoriteTeamName={favoriteTeamName} bye />
        <MatchupRow a={s(2)} b={null} bLabel="vs WC winner (higher)" favoriteTeamName={favoriteTeamName} bye />
        <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4, textAlign: "center" }}>
          ↳ Seeds 1 &amp; 2 have first-round byes; they play WC round winners
        </div>
      </div>
    </div>
  )
}

function BracketSeedBadge({ seed, category }) {
  return (
    <span style={{
      background: category === "division" ? "var(--color-accent)" : "var(--padres-navy-mid)",
      color: category === "division" ? "var(--padres-dark-navy)" : "var(--color-accent)",
      borderRadius: 4,
      fontSize: 10,
      fontWeight: "bold",
      padding: "1px 5px",
      minWidth: 18,
      textAlign: "center",
    }}>
      {seed}
    </span>
  )
}

function MatchupRow({ a, b, bLabel, favoriteTeamName, bye }) {
  const teamStyle = (t) => ({
    display: "flex",
    alignItems: "center",
    gap: 6,
    color: t && t.name === favoriteTeamName ? "var(--color-accent)" : "var(--text-primary)",
    fontWeight: t && t.name === favoriteTeamName ? "bold" : "normal",
    fontSize: 13,
  })

  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "7px 8px",
      borderRadius: 7,
      background: "var(--padres-dark-navy)",
      marginBottom: 5,
    }}>
      <div style={teamStyle(a)}>
        {a && <BracketSeedBadge seed={a.seed} category={a.category} />}
        {a ? a.name : "TBD"}
        {a && (
          <span style={{ fontSize: 11, color: "var(--text-muted)", marginLeft: 4 }}>
            {a.wins}–{a.losses}
          </span>
        )}
      </div>
      <span style={{ color: "var(--text-muted)", fontSize: 11, margin: "0 8px" }}>
        {bye ? "BYE →" : "vs"}
      </span>
      {b ? (
        <div style={teamStyle(b)}>
          {b && <BracketSeedBadge seed={b.seed} category={b.category} />}
          {b.name}
          <span style={{ fontSize: 11, color: "var(--text-muted)", marginLeft: 4 }}>
            {b.wins}–{b.losses}
          </span>
        </div>
      ) : (
        <span style={{ color: "var(--text-muted)", fontSize: 12 }}>{bLabel || "TBD"}</span>
      )}
    </div>
  )
}

// ─── Division Standings mini-table ────────────────────────────────────────────

function DivisionStandingsMini({ divisionTeams, favoriteTeamName }) {
  if (!divisionTeams || divisionTeams.length === 0) {
    return <LoadingCard label="Loading division standings…" />
  }

  return (
    <div className="standings-table-wrapper" style={{ marginBottom: 0 }}>
      <table style={{ minWidth: 0 }}>
        <thead>
          <tr>
            <th style={{ textAlign: "left" }}>Team</th>
            <th style={{ textAlign: "center" }}>W</th>
            <th style={{ textAlign: "center" }}>L</th>
            <th style={{ textAlign: "center" }}>PCT</th>
            <th style={{ textAlign: "center" }}>GB</th>
            <th style={{ textAlign: "center" }}>REM</th>
          </tr>
        </thead>
        <tbody>
          {divisionTeams.map((t, i) => {
            const isFav = t.name === favoriteTeamName
            return (
              <tr key={i} className={isFav ? "padres-row" : ""}>
                <td style={{ textAlign: "left", fontSize: 13 }}>{t.name}</td>
                <td style={{ textAlign: "center", fontSize: 13 }}>{t.wins}</td>
                <td style={{ textAlign: "center", fontSize: 13 }}>{t.losses}</td>
                <td style={{ textAlign: "center", fontSize: 13, color: "var(--text-muted)" }}>{t.pct}</td>
                <td style={{ textAlign: "center", fontSize: 13, color: "var(--text-muted)" }}>
                  {t.gb === "-" || t.gb === "0" ? "—" : t.gb}
                </td>
                <td style={{ textAlign: "center", fontSize: 13, color: "var(--text-muted)" }}>
                  {t.games_remaining ?? "—"}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ─── League Playoff Picture (reuses StandingsTable) ───────────────────────────

function LeaguePlayoffPicture({ playoffData, leagueLabel, favoriteTeamName }) {
  const enriched = useMemo(() => enrichWithPlayoffGb(playoffData), [playoffData])
  const divLeaders = enriched.filter(t => t.category === "division")
  const wildCards  = enriched.filter(t => t.category === "wildcard")
  const eliminated = enriched.filter(t => t.category === "eliminated")

  if (!playoffData || playoffData.length === 0) {
    return <LoadingCard label={`Loading ${leagueLabel} standings…`} />
  }

  return (
    <div className="standings-table-wrapper">
      <StandingsTable>
        <tr className="divider-row">
          <td colSpan={8}><SectionDivider label="DIVISION LEADERS" /></td>
        </tr>
        {divLeaders.map((t, i) => (
          <StandingsRow key={i} team={t} showSeed favoriteTeamName={favoriteTeamName} />
        ))}
        <tr className="divider-row">
          <td colSpan={8}><SectionDivider label="WILD CARD" /></td>
        </tr>
        {wildCards.map((t, i) => (
          <StandingsRow key={i} team={t} showSeed favoriteTeamName={favoriteTeamName} />
        ))}
        <tr className="divider-row">
          <td colSpan={8}>
            <SectionDivider label="OUT OF PLAYOFFS" />
            <div className="eliminated-scroll">
              {eliminated.map((t, i) => (
                <EliminatedRow key={i} team={t} favoriteTeamName={favoriteTeamName} />
              ))}
            </div>
          </td>
        </tr>
      </StandingsTable>
    </div>
  )
}

// Re-implement the enrichWithPlayoffGb helper (mirrors Standings.jsx)
function enrichWithPlayoffGb(playoffData) {
  const sixthSeed = playoffData.find(t => t.seed === 6)
  if (!sixthSeed) return playoffData
  const s6w = sixthSeed.wins
  const s6l = sixthSeed.losses
  return playoffData.map(t => {
    if (t.category === "division" || t.seed === 6) return { ...t, playoffGb: "-" }
    const gb = ((s6w - t.wins) + (t.losses - s6l)) / 2
    const abs = Math.abs(gb)
    const str = abs % 1 === 0 ? `${abs}` : abs.toFixed(1)
    const formatted = gb === 0 ? "-" : gb < 0 ? `+${str}` : str
    return { ...t, playoffGb: formatted }
  })
}

// ─── Main Component ────────────────────────────────────────────────────────────

export default function PlayoffPushTab({ playoffData, standings, favoriteTeam, API }) {
  const [teamsToWatchView, setTeamsToWatchView] = useState("division")
  // upcomingGames: { [teamName]: { games: [], loading: bool } }
  const [upcomingGames, setUpcomingGames] = useState({})

  const teamMeta   = teamsData.find(t => t.id === favoriteTeam) || teamsData[0]
  const isAL       = teamMeta.division?.startsWith("AL") || false
  const leagueLabel = isAL ? "AL" : "NL"
  const favoriteTeamName = teamMeta.name

  // ── Derive division teams from playoffData ──────────────────────────────────
  const favDivision = teamMeta.division  // e.g. "NL West"

  // Normalize division name to match the playoff API response
  // playoff API returns e.g. "National League West", teams.json uses "NL West"
  const normalizeDiv = (div) =>
    div?.replace("National League ", "NL ").replace("American League ", "AL ") || ""

  const divisionTeams = useMemo(() => {
    if (!playoffData || playoffData.length === 0) return standings || []
    // Use all teams in the league (playoffData) filtered by division
    return playoffData.filter(t => normalizeDiv(t.division) === favDivision)
      .sort((a, b) => {
        // Sort by division rank if available, else by wins desc
        if (a.division_rank != null && b.division_rank != null) return a.division_rank - b.division_rank
        return b.wins - a.wins
      })
  }, [playoffData, favDivision, standings])

  // ── Derive "Teams to Watch" ──────────────────────────────────────────────────
  const teamsToWatch = useMemo(() => {
    if (!playoffData || playoffData.length === 0) return []

    const favTeam = playoffData.find(t => t.name === favoriteTeamName)
    if (!favTeam) return []

    const gamesRemaining = typeof favTeam.games_remaining === "number"
      ? favTeam.games_remaining
      : parseInt(favTeam.games_remaining) || MAX_GAMES
    const gbThreshold = computeGbThreshold(gamesRemaining)

    if (teamsToWatchView === "division") {
      // Division view: teams in the same division, sorted by division rank
      // Annotate with GB relative to favorite team
      const divTeams = playoffData
        .filter(t => normalizeDiv(t.division) === favDivision)
        .sort((a, b) => (a.division_rank ?? 99) - (b.division_rank ?? 99))

      return divTeams
        .map(t => {
          // GB vs favorite team (positive = behind fav, negative = ahead of fav)
          const gb = ((favTeam.wins - t.wins) + (t.losses - favTeam.losses)) / 2
          return { ...t, _teamsToWatchGb: gb }
        })
        .filter(t => {
          if (t.name === favoriteTeamName) return true
          return Math.abs(t._teamsToWatchGb) <= gbThreshold
        })
    } else {
      // Wild Card view: teams near the favorite in the wild card race
      // Use league_rank as wild card proximity
      const leagueTeams = playoffData
        .filter(t => t.category !== "eliminated" || Math.abs(parseGb(t.wc_gb)) <= gbThreshold)
        .sort((a, b) => (a.league_rank ?? 99) - (b.league_rank ?? 99))

      const favLeagueRank = favTeam.league_rank ?? 99
      const WINDOW = 3  // teams immediately above/below in wild card race

      return leagueTeams
        .map(t => {
          const wcGb = ((favTeam.wins - t.wins) + (t.losses - favTeam.losses)) / 2
          return { ...t, _teamsToWatchGb: wcGb }
        })
        .filter(t => {
          if (t.name === favoriteTeamName) return true
          const rankDiff = Math.abs((t.league_rank ?? 99) - favLeagueRank)
          return rankDiff <= WINDOW && Math.abs(t._teamsToWatchGb) <= gbThreshold
        })
        .sort((a, b) => (a.league_rank ?? 99) - (b.league_rank ?? 99))
    }
  }, [playoffData, favoriteTeamName, teamsToWatchView, favDivision])

  // ── Fetch upcoming games for teams to watch ──────────────────────────────────
  useEffect(() => {
    if (!teamsToWatch || teamsToWatch.length === 0) return

    teamsToWatch.forEach(team => {
      const abbrev = team.abbreviation
      if (!abbrev || upcomingGames[team.name] !== undefined) return

      // Mark as loading
      setUpcomingGames(prev => ({ ...prev, [team.name]: { games: [], loading: true } }))

      fetch(`${API}/api/upcoming-games?team=${encodeURIComponent(abbrev)}&count=5`)
        .then(r => r.json())
        .then(games => {
          setUpcomingGames(prev => ({ ...prev, [team.name]: { games: games || [], loading: false } }))
        })
        .catch(() => {
          setUpcomingGames(prev => ({ ...prev, [team.name]: { games: [], loading: false } }))
        })
    })
    // upcomingGames intentionally omitted from deps to avoid infinite loop; it
    // is used as a guard inside the effect but must not re-trigger it on change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamsToWatch, API])

  // Clear upcoming games cache when favorite team changes
  useEffect(() => { setUpcomingGames({}) }, [favoriteTeam])

  // ── Derive GB threshold for display ──────────────────────────────────────────
  const favTeam = playoffData?.find(t => t.name === favoriteTeamName)
  const gamesRemaining = typeof favTeam?.games_remaining === "number"
    ? favTeam.games_remaining
    : parseInt(favTeam?.games_remaining) || MAX_GAMES
  const gbThreshold = computeGbThreshold(gamesRemaining)

  return (
    <div style={{ display: "flex", gap: 20, alignItems: "flex-start", flexWrap: "wrap" }}>

      {/* ── LEFT COLUMN ─────────────────────────────────────────────────── */}
      <div style={{ flex: "1 1 340px", minWidth: 300 }}>

        {/* League Playoff Picture */}
        <FlexCard title={`${leagueLabel} Playoff Picture`}>
          <LeaguePlayoffPicture
            playoffData={playoffData}
            leagueLabel={leagueLabel}
            favoriteTeamName={favoriteTeamName}
          />
        </FlexCard>

        {/* If Season Ended Today – Bracket */}
        <FlexCard title="If Season Ended Today…">
          {playoffData && playoffData.length > 0 ? (
            <BracketSection
              playoffData={playoffData}
              favoriteTeamName={favoriteTeamName}
            />
          ) : (
            <LoadingCard label="Loading bracket…" />
          )}
        </FlexCard>

      </div>

      {/* ── RIGHT COLUMN ─────────────────────────────────────────────────── */}
      <div style={{ flex: "1 1 300px", minWidth: 260 }}>

        {/* Division Standings */}
        <FlexCard title={`${favDivision} Standings`}>
          <DivisionStandingsMini
            divisionTeams={divisionTeams}
            favoriteTeamName={favoriteTeamName}
          />
        </FlexCard>

        {/* Teams to Watch */}
        <FlexCard
          title="Teams to Watch"
          style={{ paddingBottom: 8 }}
        >
          <ViewToggle value={teamsToWatchView} onChange={setTeamsToWatchView} />

          {/* Heuristic info */}
          <div style={{
            fontSize: 11,
            color: "var(--text-muted)",
            marginBottom: 12,
            textAlign: "center",
          }}>
            {teamsToWatchView === "division" ? "Division" : "Wild Card"} threats
            {" "}· showing teams within {gbThreshold.toFixed(1)} GB
            {" "}({MAX_GAMES - gamesRemaining} games played)
          </div>

          {teamsToWatch.length === 0 ? (
            <LoadingCard label="No teams to watch (data loading…)" />
          ) : (
            teamsToWatch.map((team) => (
              <TeamToWatchCard
                key={team.name}
                team={team}
                favoriteTeamName={favoriteTeamName}
                upcomingGames={upcomingGames[team.name]?.games}
                gamesLoading={upcomingGames[team.name]?.loading ?? true}
              />
            ))
          )}
        </FlexCard>

      </div>
    </div>
  )
}
