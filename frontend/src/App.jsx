import { useState, useEffect } from "react"
import { auth } from "./firebase"
import { onAuthStateChanged, signOut } from "firebase/auth"
import Login from "./components/Login"
import LiveGame from "./components/LiveGame"
import RosterTable from "./components/RosterTable"
import Standings from "./components/Standings"
import FavoritesTab from "./components/FavoritesTab"
import "./App.css"
import NLPlayoff from "./components/NLPlayoff"

const API = import.meta.env.VITE_API_URL || "https://padres-dashboard.onrender.com"


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
  const [playerGames, setPlayerGames] = useState({})
  const [wildcard, setWildcard] = useState([])
  const [nlPlayoff, setNlPlayoff] = useState([])
  const [nextGame, setNextGame] = useState(null)
  const [user, setUser] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser)
      setAuthLoading(false)
    })
    return () => unsubscribe()
  }, [])

  const fetchNextGame = () => {
    fetch(`${API}/api/nextgame`)
      .then(res => res.json())
      .then(data => setNextGame(data))
      .catch(err => console.error("Next game fetch error:", err))
  }

  const fetchNlPlayoff = () => {
    fetch(`${API}/api/nlplayoff`)
      .then(res => res.json())
      .then(data => setNlPlayoff(data))
      .catch(err => console.error("NL Playoff fetch error:", err))
  }

  const fetchWildcard = () => {
    fetch(`${API}/api/wildcard`)
      .then(res => res.json())
      .then(data => setWildcard(data))
      .catch(err => console.error("Wildcard fetch error:", err))
  }

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
    fetch(`${API}/api/search?name=${encodeURIComponent(searchQuery)}`)
      .then(res => res.json())
      .then(data => {
        setSearchResults(data)
        setSearching(false)
      })
      .catch(() => setSearching(false))
  }

  const fetchLive = () => {
     fetch(`${API}/api/live`)
      .then(res => res.json())
      .then(data => setLive(data))
      .catch(err => console.error("Live fetch error:", err))
  }

  const fetchFavoritesWithRoster = (rosterData) => {
    fetch(`${API}/api/favorites?uid=${user.uid}`)
      .then(res => res.json())
      .then(favs => {
        const existingIds = new Set(rosterData.map(p => p.player_id))
        const newPlayers = favs.filter(f => !existingIds.has(f.player_id))
        const updated = rosterData.map(p => ({
          ...p,
          favorited: favs.some(f => f.player_id === p.player_id)
        }))
        const favoritedPlayers = [...updated, ...newPlayers].filter(p => p.favorited)
        preloadPlayerGames(favoritedPlayers)
        setPlayers([...updated, ...newPlayers])
      })
      .catch(err => console.error("Favorites fetch error:", err))
  }

  const preloadPlayerGames = (favoritedPlayers) => {
    favoritedPlayers.forEach(player => {
      fetch(`${API}/api/playergame/${player.player_id}`)
        .then(res => res.json())
        .then(data => {
          if (data) {
            setPlayerGames(prev => ({
              ...prev,
              [player.player_id]: data
            }))
          }
        })
        .catch(err => console.error("Preload error:", err))
    })
  }

  const fetchRoster = () => {
    fetch(`${API}/api/roster`)
      .then(res => res.json())
      .then(data => {
        setPlayers(data)
        setLoading(false)
        fetchFavoritesWithRoster(data)
      })
      .catch(err => console.error("Roster fetch error:", err))
  }

  const fetchStandings = () => {
    fetch(`${API}/api/standings`)
      .then(res => res.json())
      .then(data => setStandings(data))
      .catch(err => console.error("Standings fetch error:", err))
  }

  const fetchPrevGame = () => {
    fetch(`${API}/api/prevgame`)
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

  fetch(`${API}/api/favorites`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      player_id: player.player_id,
      name: player.name,
      position: player.position,
      team: player.team,
      uid: user.uid
    })
  }).catch(err => console.error("Favorite error:", err))
}

  useEffect(() => {
    fetchLive()
    fetchRoster()
    fetchStandings()
    fetchPrevGame()
    fetchNextGame()
    fetchWildcard()
    fetchNlPlayoff()
    const interval = setInterval(fetchLive, 15000)
    return () => clearInterval(interval)
  }, [])

  if (authLoading) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0a1929" }}>
      <p style={{ color: "#ffc425" }}>Loading...</p>
    </div>
  )

  if (!user) return <Login />

  return (
    <div className="app">
      <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 24 }}>
        <h1 style={{ margin: 0 }}>Padres Dashboard</h1>
        <button
          onClick={() => signOut(auth)}
          style={{
            position: "absolute",
            right: 0,
            background: "transparent",
            border: "1.5px solid #aaa",
            color: "#aaa",
            borderRadius: 8,
            padding: "4px 10px",
            fontSize: 12,
            cursor: "pointer"
          }}
        >
          Sign out
        </button>
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 16, position: "relative" }}>
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
        <button
          className={`tab ${activeTab === "wildcard" ? "active" : ""}`}
          onClick={() => setActiveTab("wildcard")}
        >
          🏆 Wild Card
        </button>

        {activeTab === "favorites" && (
          <div className="search-container" style={{ position: "absolute", right: 0 }}>
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

      {activeTab === "dashboard" && (
        <>
          <div className="top-row" style={{ minHeight: 280 }}>
            <LiveGame live={live} prevGame={prevGame} nextGame={nextGame} />
            <Standings teams={standings} wildcard={wildcard} nlPlayoff={nlPlayoff} />
          </div>
          {loading ? (
            <p className="loading">Loading roster stats...</p>
          ) : (
            <RosterTable players={players} onToggleFavorite={toggleFavorite} />
          )}
        </>
      )}

      {activeTab === "favorites" && (
        <FavoritesTab players={players} onToggleFavorite={toggleFavorite} playerGames={playerGames} />
      )}

      {activeTab === "bullpen" && (
        <p style={{ textAlign: "center", color: "#aaa" }}>Bullpen tracker coming soon!</p>
      )}

      {activeTab === "wildcard" && (
        <NLPlayoff teams={nlPlayoff} />
      )}
    </div>
  )
}

export default App