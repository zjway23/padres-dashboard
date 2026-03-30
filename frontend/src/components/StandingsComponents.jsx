// frontend/src/components/StandingsComponents.jsx

const NL_PREFIX = "National League "

export function SectionDivider({ label, standalone = false }) {
  return (
    <div className={`section-divider${standalone ? " section-divider--standalone" : ""}`}>
      <div className="section-divider-line" />
      <span className="section-divider-label">{label}</span>
      <div className="section-divider-line" />
    </div>
  )
}

export function StandingsRow({ team, showSeed = true, favoriteTeamName = "" }) {
  const isFavorite = favoriteTeamName ? team.name === favoriteTeamName : team.name.includes("Padres")
  const isDivision = team.category === "division"
  return (
    <tr className={`playoff-row${isFavorite ? " playoff-row--padres" : ""}`}>
      <td className="playoff-td playoff-td--seed">
        {showSeed && team.seed ? (
          <span className={`seed-badge${isDivision ? " seed-badge--division" : " seed-badge--wildcard"}`}>
            {team.seed}
          </span>
        ) : (
          <span className="seed-badge--empty" />
        )}
      </td>
      <td className={`playoff-td playoff-td--name${isFavorite ? " playoff-td--name-padres" : ""}`}>
        {team.name}
      </td>
      <td className="playoff-td playoff-td--div">
        {team.division?.replace(NL_PREFIX, "")}
      </td>
      <td className="playoff-td playoff-td--center">{team.wins}</td>
      <td className="playoff-td playoff-td--center">{team.losses}</td>
      <td className="playoff-td playoff-td--center playoff-td--muted">
        {team.gb === "-" || team.gb === "0" ? "-" : team.gb}
      </td>
      <td className="playoff-td playoff-td--center playoff-td--muted">{team.pct}</td>
      <td className="playoff-td playoff-td--center playoff-td--muted">
        {team.games_remaining ?? "-"}
      </td>
    </tr>
  )
}

export function StandingsTable({ children }) {
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