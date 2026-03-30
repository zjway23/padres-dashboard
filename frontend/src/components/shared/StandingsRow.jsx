const NL_PREFIX = "National League "

function StandingsRow({ team, showSeed = true }) {
  const isPadres = team.name.includes("Padres")
  const isDivision = team.category === "division"

  return (
    <tr className={`playoff-row${isPadres ? " playoff-row--padres" : ""}`}>
      <td className="playoff-td playoff-td--seed">
        {showSeed && team.seed ? (
          <span className={`seed-badge${isDivision ? " seed-badge--division" : " seed-badge--wildcard"}`}>
            {team.seed}
          </span>
        ) : (
          <span className="seed-badge--empty" />
        )}
      </td>
      <td className={`playoff-td playoff-td--name${isPadres ? " playoff-td--name-padres" : ""}`}>
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

export default StandingsRow
