function Standings({ teams }) {
    return (
      <div className="standings-section">
        <h2>NL West Standings</h2>
        <table>
          <thead>
            <tr>
              <th>Team</th>
              <th>W</th>
              <th>L</th>
              <th>PCT</th>
              <th>GB</th>
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
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }
  
  export default Standings