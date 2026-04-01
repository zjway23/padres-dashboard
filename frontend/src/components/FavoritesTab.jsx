import { useState, useEffect } from "react"

const teamIdCache = {}

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

  return (
    <div style={{
      display: "flex",
      alignItems: "flex-start",
      gap: 16,
      padding: "10px 0",
      borderBottom: "1px solid #1a3a4a"
    }}>
      <div style={{ minWidth: 130 }}>
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
      )}
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
    setLoadingPlays(true)
    setPlays([])
    fetch(`https://padres-dashboard.onrender.com/api/playergame/${pid}/${gamePk}`)
      .then(res => res.json())
      .then(data => {
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
      try {
        const res = await fetch(`${API}/api/player-next-game?team_id=${teamId}`)
        const data = await res.json()
        if (!cancelled) setNextGame(data)
      } catch {}
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

function FavoritesTab({ players, onToggleFavorite, playerGames, API, timezone, loadingState = "ready", basicInfo = [] }) {
  const favorites = players.filter(p => p.favorited)

  if (loadingState !== "ready") {
    return (
      <div>
        <div style={{ maxWidth: 960, margin: "0 auto" }}>
          <h2 style={{ color: "#ffc425", marginBottom: 16, fontSize: "1.3rem" }}>⭐ Favorite Players</h2>
          {basicInfo.length === 0 ? (
            <p style={{ textAlign: "center", color: "#aaa", padding: 20 }}>Loading favorites...</p>
          ) : (
            basicInfo.map((p, i) => (
              <div key={i} style={{
                background: "#1a3a4a",
                borderRadius: 12,
                padding: 20,
                marginBottom: 16
              }}>
                <div style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 14
                }}>
                  <div>
                    <span style={{ fontWeight: "bold", fontSize: 17 }}>{p.name}</span>
                    <span style={{ marginLeft: 10, color: "#8ab4c9", fontSize: 13 }}>
                      {p.team === "Unknown" ? "Prospect" : p.team}
                    </span>
                    <span className="pos-badge" style={{ marginLeft: 8 }}>{p.position}</span>
                  </div>
                  <span style={{ fontSize: 20, color: "#ffc425" }}>★</span>
                </div>
                <p style={{ color: "#aaa", fontSize: 13 }}>Stats loading for {p.name}...</p>
              </div>
            ))
          )}
        </div>
      </div>
    )
  }

  return (
    <div>
      <div style={{ maxWidth: 960, margin: "0 auto" }}>
        <h2 style={{ color: "#ffc425", marginBottom: 16, fontSize: "1.3rem" }}>⭐ Favorite Players</h2>
        {favorites.length === 0 ? (
          <p style={{ textAlign: "center", color: "#aaa", padding: 20 }}>
            No favorites yet — click ☆ next to any player in the Dashboard tab or use the 🔍 search to add players!
          </p>
        ) : (
          favorites.map((p, i) => (
            <PlayerCard key={i} p={p} onToggleFavorite={onToggleFavorite} preloadedGames={playerGames[p.player_id]} API={API} timezone={timezone} />
          ))
        )}
      </div>
    </div>
  )
}

export default FavoritesTab