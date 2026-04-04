import { useState, useEffect } from "react"

const teamIdCache = {}
const nextGameCache = {} // module-level: persists across tab switches
const playsCache = {}   // module-level: { [playerId_gamePk]: plays[] } — survives tab switches

async function fetchTeamId(playerId) {
  if (teamIdCache[playerId]) return teamIdCache[playerId]
  try {
    const res = await fetch(`https://statsapi.mlb.com/api/v1/people/${playerId}?hydrate=currentTeam`)
    const data = await res.json()
    const id = data.people?.[0]?.currentTeam?.id || null
    teamIdCache[playerId] = id
    return id
  } catch {
    return null
  }
}

function StatBox({ label, value }) {
  return (
    <div style={{
      background: "#0d1f2d",
      borderRadius: 8,
      padding: "8px 12px",
      textAlign: "center",
      minWidth: 55
    }}>
      <div style={{ color: "#ffc425", fontSize: 11, marginBottom: 3 }}>{label}</div>
      <div style={{ fontWeight: "bold", fontSize: 15 }}>{value}</div>
    </div>
  )
}

function getSBDisplay(p) {
  const sb = p.sb
  const cs = p.cs
  if (sb === "N/A" || cs === "N/A" || sb === undefined || cs === undefined) {
    return { pct: "N/A", ratio: "N/A" }
  }
  const total = sb + cs
  const pct = total === 0 ? "N/A" : `${Math.round((sb / total) * 100)}%`
  const ratio = `${sb}/${total}`
  return { pct, ratio }
}

function getKPct(p) {
  const raw = p.k
  const k = typeof raw === "number" ? raw : (raw !== undefined && raw !== "N/A" ? Number(raw) : null)
  if (k === null || isNaN(k)) return "N/A"

  // Prefer an explicit PA field; fall back to computing from components
  let pa = null
  if (typeof p.pa === "number") {
    pa = p.pa
  } else if (typeof p.ab === "number") {
    pa = p.ab
      + (typeof p.bb === "number" ? p.bb : 0)
      + (typeof p.hbp === "number" ? p.hbp : 0)
      + (typeof p.sf === "number" ? p.sf : 0)
  }

  if (!pa || pa === 0) return "N/A"
  return `${Math.round((k / pa) * 100)}%`
}

function SmallDiamond({ first, second, third }) {
  const base = (active) => ({
    width: 10, height: 10,
    background: active ? "#ffc425" : "transparent",
    border: "1.5px solid #ffc425",
    transform: "rotate(45deg)",
    display: "inline-block",
    margin: 2
  })
  return (
    <div style={{ textAlign: "center", lineHeight: 1 }}>
      <div style={{ marginBottom: -5 }}><span style={base(second)}></span></div>
      <div>
        <span style={base(third)}></span>
        <span style={{ display: "inline-block", width: 10, margin: 2 }}></span>
        <span style={base(first)}></span>
      </div>
    </div>
  )
}

function buildStatLine(s) {
  if (!s) return "No data"
  const n = (num, label) => num > 1 ? `${num}${label}` : label
  const hits = []
  if (s.hr > 0) hits.push(n(s.hr, "HR"))
  if (s.doubles > 0) hits.push(n(s.doubles, "2B"))
  if (s.triples > 0) hits.push(n(s.triples, "3B"))
  const singles = s.h - s.hr - s.doubles - s.triples
  if (singles > 0) hits.push(n(singles, "1B"))
  const parts = [`${s.h} for ${s.ab}`]
  if (hits.length > 0) parts.push(hits.join(", "))
  if (s.bb > 0) parts.push(n(s.bb, "BB"))
  if (s.k > 0) parts.push(n(s.k, "K"))
  if (s.rbi > 0) parts.push(n(s.rbi, "RBI"))
  if (s.runs > 0) parts.push(n(s.runs, "R"))
  if (s.sb > 0) parts.push(n(s.sb, "SB"))
  return parts.join(" · ")
}

const LOCATION_MAP = {
  "1": "Pitcher", "2": "Catcher", "3": "1B", "4": "2B",
  "5": "3B", "6": "SS", "7": "LF", "8": "CF", "9": "RF"
}

function PlayRow({ play }) {
  const hasHitData = play.ev !== undefined
  const trajectory = play.trajectory ? play.trajectory.replace(/_/g, " ") : null
  const location = play.location ? LOCATION_MAP[play.location] || play.location : null
  const subtext = [trajectory, location].filter(Boolean).join(" · ")

  const TOP_VALUES = ["top"]
  const BOT_VALUES = ["bot", "bottom"]
  const rawHalf = play.half || play.inning_half || ""
  const halfSymbol = TOP_VALUES.includes(rawHalf) ? "▲" : BOT_VALUES.includes(rawHalf) ? "▼" : null
  const inningNum = play.inning
  const inningStr = halfSymbol && inningNum ? `${halfSymbol}${inningNum}` : (inningNum ? `Inn ${inningNum}` : null)

  const balls = play.balls
  const strikes = play.strikes
  const countStr = (balls !== undefined && strikes !== undefined) ? `${balls}-${strikes}` : null

  const outs = play.outs
  const outsStr = outs !== undefined ? `${outs} out${outs !== 1 ? "s" : ""}` : null

  const first = !!(play.on_first || play.runners?.first)
  const second = !!(play.on_second || play.runners?.second)
  const third = !!(play.on_third || play.runners?.third)

  const hasContext = inningStr || countStr || outsStr || first || second || third

  // For strikeouts the event name already captures the result; the full
  // description is redundant (and often lengthy), so skip it there.
  const description = play.description && play.event !== "Strikeout" ? play.description : null

  return (
    <div style={{
      display: "flex",
      alignItems: "flex-start",
      gap: 10,
      padding: "10px 0",
      borderBottom: "1px solid #1a3a4a"
    }}>
      {hasContext && (
        <div style={{ minWidth: 52, flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 3, paddingTop: 2 }}>
          {inningStr && <div style={{ color: "#ffc425", fontSize: 11, fontWeight: "bold" }}>{inningStr}</div>}
          <SmallDiamond first={first} second={second} third={third} />
          {countStr && <div style={{ color: "#aaa", fontSize: 10 }}>{countStr}</div>}
          {outsStr && <div style={{ color: "#aaa", fontSize: 10 }}>{outsStr}</div>}
        </div>
      )}
      <div style={{ flex: 1, display: "flex", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div style={{ minWidth: 120 }}>
          <div style={{ color: "#ffc425", fontWeight: "bold", fontSize: 13 }}>
            {play.event}
          </div>
          {play.event === "Strikeout" && (
            <div style={{ color: "#aaa", fontSize: 11, marginTop: 2 }}>
              {play.description?.toLowerCase().includes("swinging") ? "Swinging" : "Looking"}
            </div>
          )}
          {subtext && (
            <div style={{ color: "#aaa", fontSize: 11, marginTop: 2, textTransform: "capitalize" }}>
              {subtext}
            </div>
          )}
        </div>
        {hasHitData && (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ display: "flex", gap: 6 }}>
              <div style={{ background: "#1a3a4a", borderRadius: 6, padding: "4px 8px", textAlign: "center", minWidth: 52 }}>
                <div style={{ color: "#ffc425", fontSize: 10 }}>EV</div>
                <div style={{ fontSize: 13, fontWeight: "bold" }}>{play.ev ? `${play.ev}` : "N/A"}</div>
              </div>
              <div style={{ background: "#1a3a4a", borderRadius: 6, padding: "4px 8px", textAlign: "center", minWidth: 52 }}>
                <div style={{ color: "#ffc425", fontSize: 10 }}>LA</div>
                <div style={{ fontSize: 13, fontWeight: "bold" }}>{play.la !== null ? `${play.la}°` : "N/A"}</div>
              </div>
              <div style={{ background: "#1a3a4a", borderRadius: 6, padding: "4px 8px", textAlign: "center", minWidth: 52 }}>
                <div style={{ color: "#ffc425", fontSize: 10 }}>DIST</div>
                <div style={{ fontSize: 13, fontWeight: "bold" }}>{play.dist ? `${play.dist}ft` : "N/A"}</div>
              </div>
            </div>
            {description && (
              <div style={{ color: "#aaa", fontSize: 11, fontStyle: "italic", maxWidth: 280 }}>
                {description}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function PlayerLastGame({ playerId, preloadedGames }) {
  const [games, setGames] = useState([])
  const [index, setIndex] = useState(0)
  const [plays, setPlays] = useState([])
  const [loadingGames, setLoadingGames] = useState(true)
  const [loadingPlays, setLoadingPlays] = useState(false)

  useEffect(() => {
    if (preloadedGames && preloadedGames.length > 0) {
      setGames(preloadedGames)
      const lastIndex = preloadedGames.length - 1
      setIndex(lastIndex)
      fetchPlays(playerId, preloadedGames[lastIndex].game_pk)
      setLoadingGames(false)
    } else {
      fetch(`https://padres-dashboard.onrender.com/api/playergame/${playerId}`)
        .then(res => res.json())
        .then(data => {
          if (data && data.length > 0) {
            setGames(data)
            const lastIndex = data.length - 1
            setIndex(lastIndex)
            fetchPlays(playerId, data[lastIndex].game_pk)
          }
          setLoadingGames(false)
        })
        .catch(() => setLoadingGames(false))
    }
  }, [playerId, preloadedGames])

  const fetchPlays = (pid, gamePk) => {
    if (!gamePk) return
    const cacheKey = `${pid}_${gamePk}`
    if (playsCache[cacheKey]) {
      setPlays(playsCache[cacheKey])
      setLoadingPlays(false)
      return
    }
    setLoadingPlays(true)
    setPlays([])
    fetch(`https://padres-dashboard.onrender.com/api/playergame/${pid}/${gamePk}`)
      .then(res => res.json())
      .then(data => {
        playsCache[cacheKey] = data
        setPlays(data)
        setLoadingPlays(false)
      })
      .catch(() => setLoadingPlays(false))
  }

  const navigate = (newIndex) => {
    setIndex(newIndex)
    fetchPlays(playerId, games[newIndex].game_pk)
  }

  if (loadingGames) return (
    <div style={{
      marginTop: 14,
      background: "#0d1f2d",
      borderRadius: 8,
      padding: "12px 14px",
      minHeight: 80,
      display: "flex",
      alignItems: "center",
      justifyContent: "center"
    }}>
      <p style={{ color: "#aaa", fontSize: 13 }}>Loading game log...</p>
    </div>
  )
  if (!games.length) return <p style={{ color: "#aaa", fontSize: 13, marginTop: 10 }}>No recent game data</p>

  const gameData = games[index]

  return (
    <div style={{ marginTop: 14, background: "#0d1f2d", borderRadius: 8, padding: "12px 14px", minHeight: 120 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <button
          onClick={() => navigate(Math.max(0, index - 1))}
          disabled={index === 0}
          style={{
            background: "transparent",
            border: `1.5px solid ${index === 0 ? "#555" : "#ffc425"}`,
            color: index === 0 ? "#555" : "#ffc425",
            borderRadius: 6, padding: "2px 10px",
            cursor: index === 0 ? "default" : "pointer", fontSize: 16
          }}
        >←</button>
        <p style={{ color: "#ffc425", fontWeight: "bold", fontSize: 13, textAlign: "center" }}>
          {gameData.game_date} vs {gameData.opponent}
        </p>
        <button
          onClick={() => navigate(Math.min(games.length - 1, index + 1))}
          disabled={index === games.length - 1}
          style={{
            background: "transparent",
            border: `1.5px solid ${index === games.length - 1 ? "#555" : "#ffc425"}`,
            color: index === games.length - 1 ? "#555" : "#ffc425",
            borderRadius: 6, padding: "2px 10px",
            cursor: index === games.length - 1 ? "default" : "pointer", fontSize: 16
          }}
        >→</button>
      </div>
      <p style={{ fontSize: 14, fontWeight: "bold", marginBottom: 10, letterSpacing: "0.5px" }}>
        {buildStatLine(gameData.stat_line)}
      </p>
      {loadingPlays ? (
        <p style={{ color: "#aaa", fontSize: 13 }}>Loading plays...</p>
      ) : (
        plays.map((play, i) => <PlayRow key={i} play={play} />)
      )}
    </div>
  )
}

function PlayerNextGame({ playerId, API, timezone = "America/Los_Angeles" }) {
  const [nextGame, setNextGame] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const teamId = await fetchTeamId(playerId)
      if (!teamId || cancelled) { setLoading(false); return }

      // Return cached result immediately without hitting the network
      if (teamId in nextGameCache) {
        if (!cancelled) {
          setNextGame(nextGameCache[teamId])
          setLoading(false)
        }
        return
      }

      try {
        const res = await fetch(`${API}/api/player-next-game?team_id=${teamId}`)
        const data = await res.json()
        nextGameCache[teamId] = data
        if (!cancelled) setNextGame(data)
      } catch {
        // Don't cache on error so the next mount can retry
      }
      if (!cancelled) setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [playerId])

  if (loading) return <p style={{ color: "#aaa", fontSize: 12, marginTop: 10 }}>Loading next game...</p>
  if (!nextGame) return <p style={{ color: "#555", fontSize: 12, marginTop: 10 }}>No upcoming game found</p>

  const dt = new Date(nextGame.game_datetime)
  const formatted = dt.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
  const time = dt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZoneName: "short", timeZone: timezone })

  return (
    <div style={{
      marginTop: 12,
      padding: "8px 12px",
      background: "#0d2235",
      borderRadius: 8,
      borderLeft: "3px solid #ffc425"
    }}>
      <div style={{ color: "#ffc425", fontSize: 11, fontWeight: "bold", marginBottom: 4, letterSpacing: "0.5px" }}>
        NEXT GAME
      </div>
      <div style={{ fontSize: 13, fontWeight: "bold" }}>
        {nextGame.away} @ {nextGame.home}
      </div>
      <div style={{ color: "#aaa", fontSize: 12, marginTop: 2 }}>
        {formatted} · {time}
      </div>
      {nextGame.venue && (
        <div style={{ color: "#7a9db5", fontSize: 11, marginTop: 2 }}>{nextGame.venue}</div>
      )}
    </div>
  )
}

function PlayerCard({ p, onToggleFavorite, preloadedGames, API, timezone }) {
  const sb = getSBDisplay(p)

  return (
    <div style={{
      background: "#1a3a4a",
      borderRadius: 12,
      padding: 20,
      marginBottom: 16,
      minHeight: 280
    }}>
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 14
      }}>
        <div>
          <span style={{ fontWeight: "bold", fontSize: 17 }}>{p.name}</span>
          <span style={{
            marginLeft: 10,
            color: p.team === "San Diego Padres" ? "#ffc425" : "#8ab4c9",
            fontSize: 13
          }}>
            {p.team === "San Diego Padres" ? "SD Padres" : p.team === "Unknown" ? "Prospect" : p.team}
          </span>
          <span className="pos-badge" style={{ marginLeft: 8 }}>{p.position}</span>
        </div>
        <span
          onClick={() => onToggleFavorite(p)}
          style={{ cursor: "pointer", fontSize: 20, color: "#ffc425", userSelect: "none" }}
        >
          ★
        </span>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <StatBox label="AVG" value={p.avg} />
        <StatBox label="OPS" value={p.ops} />
        <StatBox label="HR" value={p.hr} />
        <StatBox label="RBI" value={p.rbi} />
        <StatBox label="BB" value={p.bb || "0"} />
        <StatBox label="K" value={p.k || "0"} />
        <StatBox label="K%" value={getKPct(p)} />
        <StatBox label="SB%" value={sb.pct} />
        <StatBox label="SB/ATT" value={sb.ratio} />
        <StatBox label="SLG" value={p.slg || "N/A"} />
        <StatBox label="OBP" value={p.obp || "N/A"} />
        <StatBox label="H" value={p.hits} />
        <StatBox label="2B" value={p.doubles || "0"} />
        <StatBox label="3B" value={p.triples || "0"} />
        <StatBox label="G" value={p.games} />
      </div>

      <PlayerLastGame playerId={p.player_id} preloadedGames={preloadedGames} />
      <PlayerNextGame playerId={p.player_id} API={API} timezone={timezone} />
    </div>
  )
}

function FavoritesTab({ players, onToggleFavorite, playerGames, API, timezone, isLoading }) {
  if (isLoading) {
    return (
      <div>
        <div style={{ maxWidth: 960, margin: "0 auto" }}>
          <h2 style={{ color: "#ffc425", marginBottom: 16, fontSize: "1.3rem" }}>⭐ Favorite Players</h2>
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} style={{
              background: "#1a3a4a",
              borderRadius: 12,
              padding: 20,
              marginBottom: 16,
              minHeight: 280
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span className="skeleton" style={{ display: "inline-block", width: 120, height: 17 }} />
                  <span className="skeleton" style={{ display: "inline-block", width: 60, height: 13 }} />
                  <span className="skeleton" style={{ display: "inline-block", width: 30, height: 20, borderRadius: 4 }} />
                </div>
                <span className="skeleton" style={{ display: "inline-block", width: 20, height: 20, borderRadius: "50%" }} />
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
                {Array.from({ length: 14 }).map((_, j) => (
                  <span key={j} className="skeleton" style={{ display: "inline-block", width: 55, height: 46, borderRadius: 8 }} />
                ))}
              </div>
              <span className="skeleton" style={{ display: "block", height: 80, borderRadius: 8 }} />
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div>
      <div style={{ maxWidth: 960, margin: "0 auto" }}>
        <h2 style={{ color: "#ffc425", marginBottom: 16, fontSize: "1.3rem" }}>⭐ Favorite Players</h2>
        {(() => {
          const favorites = players.filter(p => p.favorited)
          return favorites.length === 0 ? (
            <p style={{ textAlign: "center", color: "#aaa", padding: 20 }}>
              No favorites yet — click ☆ next to any player in the Dashboard tab or use the 🔍 search to add players!
            </p>
          ) : (
            favorites.map((p, i) => (
              <PlayerCard key={i} p={p} onToggleFavorite={onToggleFavorite} preloadedGames={playerGames[p.player_id]} API={API} timezone={timezone} />
            ))
          )
        })()}
      </div>
    </div>
  )
}

export default FavoritesTab