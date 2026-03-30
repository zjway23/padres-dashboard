function StandingsTable({ children }) {
  return (
    <table className="playoff-table">
      <thead>
        <tr>
          <th className="playoff-th playoff-th--seed"></th>
          <th className="playoff-th">Team</th>
          <th className="playoff-th">Div</th>
          <th className="playoff-th playoff-th--center">W</th>
          <th className="playoff-th playoff-th--center">L</th>
          <th className="playoff-th playoff-th--center">GB</th>
          <th className="playoff-th playoff-th--center">PCT</th>
          <th className="playoff-th playoff-th--center">REM</th>
        </tr>
      </thead>
      <tbody>{children}</tbody>
    </table>
  )
}

export default StandingsTable
