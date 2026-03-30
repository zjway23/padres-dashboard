import { useState, useEffect } from "react"
import { auth } from "./firebase"
import { onAuthStateChanged, signOut } from "firebase/auth"
import Login from "./components/Login"
import LiveGame from "./components/LiveGame"
import RosterTable from "./components/RosterTable"
import Standings from "./components/Standings"
import FavoritesTab from "./components/FavoritesTab"
import Settings from "./components/Settings"
import "./App.css"
import NLPlayoff from "./components/NLPlayoff"
import teamsData from "./data/teams.json"

const API = import.meta.env.VITE_API_URL || "http://localhost:5001"

/* const API = import.meta.env.VITE_API_URL || "http://localhost:5001" */
/* const API = import.meta.env.VITE_API_URL || "https://padres-dashboard.onrender.com" */

function applyTeamTheme(teamId) {
  const team = teamsData.find(t => t.id === teamId) || teamsData[0]
  const root = document.documentElement
  const accentColor = teamId === "padres" ? team.colors.accent : "#AAAAAA"
  root.style.setProperty("--color-accent", accentColor)
  root.style.setProperty("--color-dark", team.colors.primary)
  const hex = accentColor.replace("#", "")
  const r = parseInt(hex.slice(0, 2), 16)
  const g = parseInt(hex.slice(2, 4), 16)
  const b = parseInt(hex.slice(4, 6), 16)
  root.style.setProperty("--color-highlight", `rgba(${r}, ${g}, ${b}, 0.10)`)
}

function App() {
  const [live, setLive] = useState(null)
  const [players, setPlayers] = useState([])
  const [standings, setStandings] = useState([])
  const [standingsDivision, setStandingsDivision] = useState("")
  const [prevGame, setPrevGame] = useState(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState("dashboard")
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [searchResults, setSearchResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [playerGames, setPlayerGames] = useState({})
  const [wildcard, setWildcard] = useState([])
  const [playoffData, setPlayoffData] = useState([])
  const [nextGame, setNextGame] = useState(null)
  const [user, setUser] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [favoritesLoaded, setFavoritesLoaded] = useState(false)
  const [pitchers, setPitchers] = useState([])
  const [pitchersLoading, setPitchersLoading] = useState(true)
  const [favoriteTeam, setFavoriteTeam] = useState(() => localStorage.getItem("favoriteTeam") || "padres")
  const [isFirstSetup] = useState(() => !localStorage.getItem("favoriteTeam"))
  const [settingsOpen, setSettingsOpen] = useState(() => !localStorage.getItem("favoriteTeam"))
  const [timezone, setTimezone] = useState(() => localStorage.getItem("timezone") || "America/New_York")

  useEffect(() => {
    applyTeamTheme(favoriteTeam)
  }, [favoriteTeam])

  const handleTimezoneChange = (tz) => {
    localStorage.setItem("timezone", tz)
    setTimezone(tz)
  }

  const handleTeamChange = (teamId) => {
    localStorage.setItem("favoriteTeam", teamId)
    setFavoriteTeam(teamId)
    setPlayers([])
    setStandings([])
    setLive(null)
    setPrevGame(null)
    setNextGame(null)
    setPitchers([])
    setPitchersLoading(true)
    setLoading(true)
    setFavoritesLoaded(false)
  }

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser)
      setAuthLoading(false)
    })
    return () => unsubscribe()
  }, [])

  const fetchPitchers = (team) => {
    fetch(`${API}/api/pitchers?team=${team}`)
      .then(res => res.json())
      .then(data => { setPitchers(data); setPitchersLoading(false) })
      .catch(err => { console.error("Pitchers fetch error:", err); setPitchersLoading(false) })
  }

  const fetchNextGame = (team) => {
    fetch(`${API}/api/nextgame?team=${team}`)
      .then(res => res.json())
      .then(data => setNextGame(data))
      .catch(err => console.error("Next game fetch error:", err))
  }

  const fetchNlPlayoff = () => {
    fetch(`${API}/api/nlplayoff`)
      .then(res => res.json())
      .then(data => setPlayoffData(data))
      .catch(err => console.error("NL Playoff fetch error:", err))
  }

  const fetchAlPlayoff = () => {
    fetch(`${API}/api/alplayoff`)
      .then(res => res.json())
      .then(data => setPlayoffData(data))
      .catch(err => console.error("AL Playoff fetch error:", err))
  }

  const fetchPlayoff = (team) => {
    const teamData = teamsData.find(t => t.id === team)
    const isAL = teamData?.division?.startsWith("AL") || false
    if (isAL) {
      fetchAlPlayoff()
    } else {
      fetchNlPlayoff()
    }
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

  const fetchLive = (team) => {
     fetch(`${API}/api/live?team=${team}`)
      .then(res => res.json())
      .then(data => setLive(data))
      .catch(err => console.error("Live fetch error:", err))
  }

  const fetchFavoritesWithRoster = (rosterData, team) => {
    fetch(`${API}/api/favorites?uid=${user.uid}&team=${team}`)
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
        setFavoritesLoaded(true)
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

  const fetchRoster = (team) => {
    fetch(`${API}/api/roster?team=${team}&uid=${user.uid}`)
      .then(res => res.json())
      .then(data => {
        setPlayers(data)
        setLoading(false)
        fetchFavoritesWithRoster(data, team)
      })
      .catch(err => console.error("Roster fetch error:", err))
  }

  const fetchStandings = (team) => {
    fetch(`${API}/api/standings?team=${team}`)
      .then(res => res.json())
      .then(data => {
        if (data && data.teams) {
          setStandings(data.teams)
          setStandingsDivision(data.division_name || "")
        } else {
          setStandings(Array.isArray(data) ? data : [])
          setStandingsDivision("")
        }
      })
      .catch(err => console.error("Standings fetch error:", err))
  }

  const fetchPrevGame = (team) => {
    fetch(`${API}/api/prevgame?team=${team}`)
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
      uid: user.uid,
      favorite_team: favoriteTeam
    })
  }).catch(err => console.error("Favorite error:", err))
}

useEffect(() => {
  fetchLive(favoriteTeam)
  fetchStandings(favoriteTeam)
  fetchPrevGame(favoriteTeam)
  fetchNextGame(favoriteTeam)
  fetchWildcard()
  fetchPlayoff(favoriteTeam)
  const interval = setInterval(() => fetchLive(favoriteTeam), 15000)
  return () => clearInterval(interval)
}, [favoriteTeam])

useEffect(() => {
  if (user) {
    fetchRoster(favoriteTeam)
    fetchPitchers(favoriteTeam)
  }
}, [user, favoriteTeam])

  if (authLoading) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0a1929" }}>
      <p style={{ color: "#ffc425" }}>Loading...</p>
    </div>
  )

  if (!user) return <Login />

  const favoriteTeamName = teamsData.find(t => t.id === favoriteTeam)?.shortName || "MLB"

  return (
    <div className="app">
      {settingsOpen && (
        <Settings
          favoriteTeam={favoriteTeam}
          isFirstSetup={isFirstSetup}
          onSave={(teamId) => { handleTeamChange(teamId); setSettingsOpen(false) }}
          onClose={() => setSettingsOpen(false)}
          timezone={timezone}
          onTimezoneChange={handleTimezoneChange}
        />
      )}
      <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 24 }}>
        <h1 style={{ margin: 0 }}>{favoriteTeamName} Dashboard</h1>
        <div style={{ position: "absolute", right: 0, display: "flex", gap: 8 }}>
          <button
            onClick={() => setSettingsOpen(true)}
            title="Settings"
            style={{
              background: "transparent",
              border: "1.5px solid var(--color-accent)",
              color: "var(--color-accent)",
              borderRadius: 8,
              padding: "4px 10px",
              fontSize: 16,
              cursor: "pointer"
            }}
          >
            ⚙️
          </button>
          <button
            onClick={() => signOut(auth)}
            style={{
              background: "transparent",
              border: "1.5px solid #aaa",
              color: "#aaa",
              borderRadius: 8,
              padding: "4px 10px",
              fontSize: 12,
              cursor: "pointer"
            }}
          >
            Log out
          </button>
        </div>
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
            <LiveGame live={live} prevGame={prevGame} nextGame={nextGame} favoriteTeam={favoriteTeam} timezone={timezone} />
            <Standings teams={standings} divisionName={standingsDivision} wildcard={wildcard} playoffData={playoffData} isAL={teamsData.find(t => t.id === favoriteTeam)?.division?.startsWith("AL") || false} favoriteTeam={favoriteTeam} />
          </div>
          <RosterTable
            players={players}
            pitchers={pitchers}
            pitchersLoading={pitchersLoading}
            battersLoading={loading}
            onToggleFavorite={toggleFavorite}
          />
        </>
      )}

      {activeTab === "favorites" && (
        favoritesLoaded 
          ? <FavoritesTab players={players} onToggleFavorite={toggleFavorite} playerGames={playerGames} API={API} />
          : <p style={{ textAlign: "center", color: "#aaa", marginTop: 40 }}>Loading favorites...</p>
      )}

      {activeTab === "bullpen" && (
        <div style={{ position: "relative" }}>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginBottom: 8, visibility: "hidden" }}>
            <div style={{ width: 36, height: 36 }} />
            <div style={{ width: 60, height: 36 }} />
          </div>
          <p style={{ textAlign: "center", color: "#aaa" }}>Bullpen tracker coming soon!</p>
        </div>
      )}

      {activeTab === "wildcard" && (
        <div style={{ position: "relative" }}>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginBottom: 8, visibility: "hidden" }}>
            <div style={{ width: 36, height: 36 }} />
            <div style={{ width: 60, height: 36 }} />
          </div>
          <NLPlayoff teams={playoffData} isAL={teamsData.find(t => t.id === favoriteTeam)?.division?.startsWith("AL") || false} />
        </div>
      )}
    </div>
  )
}

export default App