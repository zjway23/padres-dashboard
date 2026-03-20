function GameCard({ game }) {
    if (!game) return (
      <div className="game-card">
        <h2>Today's Game</h2>
        <p>No game today.</p>
      </div>
    )
  
    return (
      <div className="game-card">
        <h2>Today's Game</h2>
        <p className="matchup">{game.away} @ {game.home}</p>
        <div className="score">{game.away_score} - {game.home_score}</div>
        <p className="status">{game.status} · {game.date}</p>
      </div>
    )
  }
  
  export default GameCard