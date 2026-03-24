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
      <h1>⚾ Padres Dashboard</h1>

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
          ⚾ Bullpen
        </button>
      </div>

      {activeTab === "dashboard" && (
        <>
          <div className="top-row">
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