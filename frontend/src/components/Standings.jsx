function Standings({ teams, prevGame }) {
  const getPadresResult = () => {
    if (!prevGame) return null
    const padresHome = prevGame.home.includes("Padres")
    const padresScore = padresHome ? prevGame.home_score : prevGame.away_score
    const oppScore = padresHome ? prevGame.away_score : prevGame.home_score
    return padresScore > oppScore ? "W" : "L"
  }

  const result = getPadresResult()
  const TeamRow = ({ name, score, isHome }) => {
      const isPadres = name.includes("Padres")
      const won = result === "W" ? isPadres : !isPadres
      return (
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "6px 0",
          borderBottom: isHome ? "none" : "1px solid #0d1f2d",
          fontSize: 13
        }}>
          <span style={{
            color: won ? "#4caf50" : "#f44336",
            fontWeight: "bold",
            width: 16,
            flexShrink: 0
          }}>
            {won ? "W" : "L"}
          </span>
          <span style={{
            color: isPadres ? "#ffc425" : "white",
            fontWeight: isPadres ? "bold" : "normal",
            minWidth: 0, width: "fit-content", flexShrink: 1
          }}>
            {name}
          </span>
          <span style={{ fontWeight: "bold" }}>
            {score}
          </span>
        </div>
      )
    }

  return (
    <div className="standings-section">
      <h2>NL West Standings</h2>
      <div className="standings-table-wrapper">
        <table>
          <thead>
            <tr>
              <th>Team</th>
              <th>W</th>
              <th>L</th>
              <th>PCT</th>
              <th>GB</th>
              <th>L10</th>
            </tr>
          </thead>
          <tbody>
            {teams.map((t, i) => (
              <tr key={i} className={t.name.includes("Padres") ? "padres-row" : ""}>
                <td>{t.name}</td>
                <td>{t.wins}</td>
                <td>{t.losses}</td>
                <td>{t.pct}</td>
                <td>{t.gb}</td>
                <td>{t.l10}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {prevGame && (
        <div style={{
          marginTop: 16,
          background: "#0d1f2d",
          borderRadius: 8,
          padding: "12px 14px",
          fontSize: 13,
          textAlign: "left"
        }}>
          <p style={{ color: "#ffc425", fontWeight: "bold", marginBottom: 10 }}>
            Previous Game {prevGame.game_type ? `(${prevGame.game_type})` : ""}
          </p>
          <TeamRow name={prevGame.away} score={prevGame.away_score} isHome={false} />
          <TeamRow name={prevGame.home} score={prevGame.home_score} isHome={true} />
          <p style={{ color: "#aaa", fontSize: 11, marginTop: 8 }}>{prevGame.date}</p>
        </div>
      )}
    </div>
  )
}

export default Standings