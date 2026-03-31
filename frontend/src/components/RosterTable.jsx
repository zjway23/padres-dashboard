function RosterTable({ players, pitchers, pitchersLoading, battersLoading, onToggleFavorite, currentTeamName }) {
  const teamPlayers = currentTeamName
    ? players.filter(p => p.team === currentTeamName)
    : players
  const favoriteBatters = teamPlayers.filter(p => p.favorited)
  const restBatters = teamPlayers.filter(p => !p.favorited)
  const sortedBatters = [...favoriteBatters, ...restBatters]

  const allStarters = (pitchers || []).filter(p => p.role === "SP")
  const allRelievers = (pitchers || []).filter(p => p.role === "RP")
  const starters = [
    ...allStarters.filter(p => p.favorited),
    ...allStarters.filter(p => !p.favorited)
  ]
  const relievers = [
    ...allRelievers.filter(p => p.favorited),
    ...allRelievers.filter(p => !p.favorited)
  ]

  const renderPitcherRow = (p, i) => (
    <tr key={i} style={{ background: p.favorited ? "rgba(255, 196, 37, 0.08)" : "transparent" }}>
      <td>
        <span
          onClick={() => onToggleFavorite(p)}
          style={{ cursor: "pointer", fontSize: 16, color: p.favorited ? "#ffc425" : "#555", userSelect: "none" }}
        >
          {p.favorited ? "★" : "☆"}
        </span>
      </td>
      <td>{p.name}</td>
      <td><span className="pos-badge">{p.position}</span></td>
      <td>{p.games}</td>
      <td>{p.wins}-{p.losses}</td>
      <td>{p.era}</td>
      <td>{p.ip}</td>
      <td>{p.so}</td>
      <td>{p.bb}</td>
      <td>{p.whip}</td>
      <td>{p.saves}</td>
    </tr>
  )

  return (
    <>
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
            {battersLoading ? (
              <tr>
                <td colSpan={9} style={{ textAlign: "center", color: "#aaa", padding: 20 }}>
                  Loading batting stats...
                </td>
              </tr>
            ) : sortedBatters.map((p, i) => (
              <tr key={i} style={{ background: p.favorited ? "rgba(255, 196, 37, 0.08)" : "transparent" }}>
                <td>
                  <span
                    onClick={() => onToggleFavorite(p)}
                    style={{ cursor: "pointer", fontSize: 16, color: p.favorited ? "#ffc425" : "#555", userSelect: "none" }}
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

      <div className="roster-section" style={{ marginTop: 24 }}>
        <h2>2026 Pitching Stats</h2>
        <table>
          <thead>
            <tr>
              <th></th>
              <th>Player</th>
              <th></th>
              <th>G</th>
              <th>W-L</th>
              <th>ERA</th>
              <th>IP</th>
              <th>SO</th>
              <th>BB</th>
              <th>WHIP</th>
              <th>SV</th>
            </tr>
          </thead>
          <tbody>
            {pitchersLoading ? (
              <tr>
                <td colSpan={11} style={{ textAlign: "center", color: "#aaa", padding: 20 }}>
                  Loading pitching stats...
                </td>
              </tr>
            ) : (
              <>
                {starters.map((p, i) => renderPitcherRow(p, i))}
                <tr>
                  <td colSpan={11} style={{ padding: "4px 0" }}>
                    <div style={{ borderTop: "1px solid #ffc425", opacity: 0.3 }} />
                  </td>
                </tr>
                {relievers.map((p, i) => renderPitcherRow(p, i))}
              </>
            )}
          </tbody>
        </table>
      </div>
    </>
  )
}

export default RosterTable