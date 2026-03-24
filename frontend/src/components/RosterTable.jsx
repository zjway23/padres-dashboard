function RosterTable({ players, onToggleFavorite }) {
  const padresOnly = players.filter(p => p.team === "San Diego Padres")
  const favorites = padresOnly.filter(p => p.favorited)
  const rest = padresOnly.filter(p => !p.favorited)
  const sorted = [...favorites, ...rest]

  return (
    <div className="roster-section">
      <h2>2026 Batting Stats</h2>
      <table>
        <thead>
          <tr>
            <th></th>
            <th>Player</th>
            <th>POS</th>
            <th>G</th>
            <th>AVG</th>
            <th>H</th>
            <th>HR</th>
            <th>RBI</th>
            <th>OPS</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((p, i) => (
            <tr key={i} style={{ background: p.favorited ? "rgba(255, 196, 37, 0.08)" : "transparent" }}>
              <td>
                <span
                  onClick={() => onToggleFavorite(p)}
                  style={{
                    cursor: "pointer",
                    fontSize: 16,
                    color: p.favorited ? "#ffc425" : "#555",
                    userSelect: "none"
                  }}
                >
                  {p.favorited ? "★" : "☆"}
                </span>
              </td>
              <td>{p.name}</td>
              <td><span className="pos-badge">{p.position}</span></td>
              <td>{p.games}</td>
              <td>{p.avg}</td>
              <td>{p.hits}</td>
              <td>{p.hr}</td>
              <td>{p.rbi}</td>
              <td>{p.ops}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default RosterTable