import { useState, useEffect } from "react"
import GameCard from "./components/GameCard"
import RosterTable from "./components/RosterTable"
import "./App.css"

function App() {
  const [game, setGame] = useState(null)
  const [players, setPlayers] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchGame = () => {
    fetch("http://127.0.0.1:5000/api/game")
      .then(res => res.json())
      .then(data => setGame(data))
      .catch(err => console.error("Game fetch error:", err))
  }

  const fetchRoster = () => {
    fetch("http://127.0.0.1:5000/api/roster")
      .then(res => res.json())
      .then(data => {
        setPlayers(data)
        setLoading(false)
      })
      .catch(err => console.error("Roster fetch error:", err))
  }

  useEffect(() => {
    fetchGame()
    fetchRoster()
    // Auto refresh score every 30 seconds
    const interval = setInterval(fetchGame, 30000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="app">
      <h1>⚾ Padres Dashboard</h1>
      <GameCard game={game} />
      {loading ? (
        <p className="loading">Loading roster stats...</p>
      ) : (
        <RosterTable players={players} />
      )}
    </div>
  )
}

export default App