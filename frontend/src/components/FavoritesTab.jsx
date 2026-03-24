import { useState, useEffect } from "react"

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

const getEventLabel = (play) => {
if (play.event === "Strikeout") {
    const desc = play.description?.toLowerCase() || ""
    if (desc.includes("swinging")) return "Strikeout Swinging"
    if (desc.includes("called")) return "Strikeout Looking"
}
return play.event
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
            {/* Event + subtext */}
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
    
            {/* Stat boxes */}
            {hasHitData && (
            <div style={{ display: "flex", gap: 6 }}>
                <div style={{
                background: "#1a3a4a", borderRadius: 6,
                padding: "4px 8px", textAlign: "center", minWidth: 52
                }}>
                <div style={{ color: "#ffc425", fontSize: 10 }}>EV</div>
                <div style={{ fontSize: 13, fontWeight: "bold" }}>
                    {play.ev ? `${play.ev}` : "N/A"}
                </div>
                </div>
                <div style={{
                background: "#1a3a4a", borderRadius: 6,
                padding: "4px 8px", textAlign: "center", minWidth: 52
                }}>
                <div style={{ color: "#ffc425", fontSize: 10 }}>LA</div>
                <div style={{ fontSize: 13, fontWeight: "bold" }}>
                    {play.la !== null ? `${play.la}°` : "N/A"}
                </div>
                </div>
                <div style={{
                background: "#1a3a4a", borderRadius: 6,
                padding: "4px 8px", textAlign: "center", minWidth: 52
                }}>
                <div style={{ color: "#ffc425", fontSize: 10 }}>DIST</div>
                <div style={{ fontSize: 13, fontWeight: "bold" }}>
                    {play.dist ? `${play.dist}ft` : "N/A"}
                </div>
                </div>
            </div>
            )}
        </div>
        )
    }

function PlayerLastGame({ playerId }) {
    const [games, setGames] = useState([])
    const [index, setIndex] = useState(0)
    const [plays, setPlays] = useState([])
    const [loadingGames, setLoadingGames] = useState(true)
    const [loadingPlays, setLoadingPlays] = useState(false)
  
    useEffect(() => {
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
    }, [playerId])
  
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
        <div style={{ marginTop: 14, background: "#0d1f2d", borderRadius: 8, padding: "12px 14px", minHeight: 120 }}>           <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
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

function PlayerCard({ p, onToggleFavorite }) {
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
        <StatBox label="BB" value={p.bb || "N/A"} />
        <StatBox label="K" value={p.k || "N/A"} />
        <StatBox label="SB%" value={sb.pct} />
        <StatBox label="SB/ATT" value={sb.ratio} />
        <StatBox label="SLG" value={p.slg || "N/A"} />
        <StatBox label="OBP" value={p.obp || "N/A"} />
        <StatBox label="H" value={p.hits} />
        <StatBox label="2B" value={p.doubles || "N/A"} />
        <StatBox label="3B" value={p.triples || "N/A"} />
        <StatBox label="G" value={p.games} />
      </div>

      <PlayerLastGame playerId={p.player_id} />
    </div>
  )
}

function FavoritesTab({ players, onToggleFavorite }) {
    const favorites = players.filter(p => p.favorited)
  
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
              <PlayerCard key={i} p={p} onToggleFavorite={onToggleFavorite} />
            ))
          )}
        </div>
      </div>
    )
  }
  
  export default FavoritesTab