import { useState, useEffect } from "react"
import LiveGame from "./components/LiveGame"
import RosterTable from "./components/RosterTable"
import Standings from "./components/Standings"
import "./App.css"

function App() {
  const [live, setLive] = useState(null)
  const [players, setPlayers] = useState([])
  const [standings, setStandings] = useState([])
  const [prevGame, setPrevGame] = useState(null)
  const [loading, setLoading] = useState(true)

  const fetchLive = () => {
    fetch("http://127.0.0.1:5001/api/live")
      .then(res => res.json())
      .then(data => setLive(data))
      .catch(err => console.error("Live fetch error:", err))
  }

  const fetchRoster = () => {
    fetch("http://127.0.0.1:5001/api/roster")
      .then(res => res.json())
      .then(data => {
        setPlayers(data)
        setLoading(false)
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
      <div className="top-row">
        <LiveGame live={live} />
        <Standings teams={standings} prevGame={prevGame} />
      </div>
      {loading ? (
        <p className="loading">Loading roster stats...</p>
      ) : (
        <RosterTable players={players} />
      )}
    </div>
  )
}

export default App