function RosterTable({ players }) {
    return (
      <div className="roster-section">
        <h2>2025 Batting Stats</h2>
        <table>
          <thead>
            <tr>
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
            {players.map((p, i) => (
              <tr key={i}>
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