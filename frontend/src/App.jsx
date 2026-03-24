import { useState, useEffect } from "react"
import LiveGame from "./components/LiveGame"
import RosterTable from "./components/RosterTable"
import Standings from "./components/Standings"
import FavoritesTab from "./components/FavoritesTab"
import "./App.css"

function App() {
  const [live, setLive] = useState(null)
  const [players, setPlayers] = useState([])
  const [standings, setStandings] = useState([])
  const [prevGame, setPrevGame] = useState(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState("dashboard")
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [searchResults, setSearchResults] = useState([])
  const [searching, setSearching] = useState(false)

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (searchOpen && !e.target.closest('.search-container')) {
        setSearchOpen(false)
        setSearchResults([])
        setSearchQuery("")
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [searchOpen])

  const handleGlobalSearch = () => {
    if (!searchQuery.trim()) return
    setSearching(true)
    fetch(`http://127.0.0.1:5001/api/search?name=${encodeURIComponent(searchQuery)}`)
      .then(res => res.json())
      .then(data => {
        setSearchResults(data)
        setSearching(false)
      })
      .catch(() => setSearching(false))
  }

  const fetchLive = () => {
    fetch("http://127.0.0.1:5001/api/live")
      .then(res => res.json())
      .then(data => setLive(data))
      .catch(err => console.error("Live fetch error:", err))
  }

  const fetchFavoritesWithRoster = (rosterData) => {
    fetch("http://127.0.0.1:5001/api/favorites")
      .then(res => res.json())
      .then(favs => {
        const existingIds = new Set(rosterData.map(p => p.player_id))
        const newPlayers = favs.filter(f => !existingIds.has(f.player_id))
        const updated = rosterData.map(p => ({
          ...p,
          favorited: favs.some(f => f.player_id === p.player_id)
        }))
        setPlayers([...updated, ...newPlayers])
      })
      .catch(err => console.error("Favorites fetch error:", err))
  }

  const fetchRoster = () => {
    fetch("http://127.0.0.1:5001/api/roster")
      .then(res => res.json())
      .then(data => {
        setPlayers(data)
        setLoading(false)
        fetchFavoritesWithRoster(data)
      })
      .catch(err => console.error("Roster fetch error:", err))
  }

  const fetchStandings = () => {
    fetch("http://127.0.0.1:5001/api/standings")
      .then(res => res.json())
      .then(data => setStandings(data))
      .catch(err => console.error("Standings fetch error:", err))
  }

  const fetchPrevGame = () => {
    fetch("http://127.0.0.1:5001/api/prevgame")
      .then(res => res.json())
      .then(data => setPrevGame(data))
      .catch(err => console.error("Prev game fetch error:", err))
  }

  const toggleFavorite = (player) => {
    setPlayers(prev => {
      const exists = prev.find(p => p.player_id === player.player_id)
      if (exists) {
        return prev.map(p =>
          p.player_id === player.player_id ? { ...p, favorited: !p.favorited } : p
        )
      } else {
        return [...prev, { ...player, favorited: true }]
      }
    })

    fetch("http://127.0.0.1:5001/api/favorites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        player_id: player.player_id,
        name: player.name,
        position: player.position,
        team: player.team
      })
    }).catch(err => console.error("Favorite error:", err))
  }

  useEffect(() => {
    fetchLive()
    fetchRoster()
    fetchStandings()
    fetchPrevGame()
    const interval = setInterval(fetchLive, 15000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="app">
      <div style={{ position: "relative" }}>
        <h1>Padres Dashboard</h1>

        {activeTab === "favorites" && (
          <div className="search-container" style={{ position: "absolute", top: 0, right: 0 }}>
            <button
              onClick={() => { setSearchOpen(!searchOpen); setSearchResults([]); setSearchQuery("") }}
              style={{
                background: "transparent",
                border: "1.5px solid #ffc425",
                color: "#ffc425",
                borderRadius: "50%",
                width: 36, height: 36,
                cursor: "pointer",
                fontSize: 16
              }}
            >🔍</button>

            {searchOpen && (
              <>
                <div
                  style={{
                    position: "fixed",
                    top: 0, left: 0,
                    width: "100vw", height: "100vh",
                    zIndex: 99
                  }}
                  onClick={() => {
                    setSearchOpen(false)
                    setSearchResults([])
                    setSearchQuery("")
                  }}
                />
                <div style={{
                  position: "absolute",
                  top: 44,
                  right: 0,
                  background: "#1a3a4a",
                  borderRadius: 12,
                  padding: 16,
                  width: 320,
                  zIndex: 100,
                  boxShadow: "0 4px 20px rgba(0,0,0,0.4)"
                }}>
                  <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                    <input
                      autoFocus
                      type="text"
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && handleGlobalSearch()}
                      placeholder="Search any MLB player..."
                      style={{
                        flex: 1,
                        padding: "8px 12px",
                        borderRadius: 8,
                        border: "1.5px solid #ffc425",
                        background: "#0d1f2d",
                        color: "white",
                        fontSize: 13,
                        outline: "none"
                      }}
                    />
                    <button
                      onClick={handleGlobalSearch}
                      style={{
                        background: "#ffc425",
                        color: "#0d1f2d",
                        border: "none",
                        borderRadius: 8,
                        padding: "8px 12px",
                        fontWeight: "bold",
                        cursor: "pointer",
                        fontSize: 13
                      }}
                    >
                      {searching ? "..." : "Go"}
                    </button>
                  </div>

                  {searchResults.map((p, i) => {
                    const isFav = players.some(pl => pl.player_id === p.player_id && pl.favorited)
                    return (
                      <div key={i} style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        padding: "7px 0",
                        borderBottom: i < searchResults.length - 1 ? "1px solid #0d1f2d" : "none",
                        fontSize: 13
                      }}>
                        <div>
                          <span style={{ fontWeight: "bold" }}>{p.name}</span>
                          <span style={{ color: "#aaa", marginLeft: 8, fontSize: 12 }}>
                            {p.position} · {p.team === "Unknown" ? "Prospect" : p.team}
                          </span>
                        </div>
                        <button
                          onClick={() => {
                            toggleFavorite({ ...p, favorited: isFav })
                            setSearchResults(prev => prev.map(r =>
                              r.player_id === p.player_id ? { ...r, _toggled: !isFav } : r
                            ))
                          }}
                          style={{
                            background: isFav ? "rgba(255,196,37,0.2)" : "transparent",
                            border: "1.5px solid #ffc425",
                            color: "#ffc425",
                            borderRadius: 6,
                            padding: "3px 8px",
                            cursor: "pointer",
                            fontSize: 12,
                            fontWeight: "bold"
                          }}
                        >
                          {isFav ? "★" : "☆"}
                        </button>
                      </div>
                    )
                  })}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <div className="tabs">
        <button
          className={`tab ${activeTab === "dashboard" ? "active" : ""}`}
          onClick={() => setActiveTab("dashboard")}
        >
          Dashboard
        </button>
        <button
          className={`tab ${activeTab === "favorites" ? "active" : ""}`}
          onClick={() => setActiveTab("favorites")}
        >
          ⭐ Favorites
        </button>
        <button
          className={`tab ${activeTab === "bullpen" ? "active" : ""}`}
          onClick={() => setActiveTab("bullpen")}
        >
          Bullpen
        </button>
      </div>

      {activeTab === "dashboard" && (
        <>
          <div className="top-row" style={{ minHeight: 280 }}>
            <LiveGame live={live} />
            <Standings teams={standings} prevGame={prevGame} />
          </div>
          {loading ? (
            <p className="loading">Loading roster stats...</p>
          ) : (
            <RosterTable players={players} onToggleFavorite={toggleFavorite} />
          )}
        </>
      )}

      {activeTab === "favorites" && (
        <FavoritesTab players={players} onToggleFavorite={toggleFavorite} />
      )}

      {activeTab === "bullpen" && (
        <p style={{ textAlign: "center", color: "#aaa" }}>Bullpen tracker coming soon!</p>
      )}
    </div>
  )
}

export default App