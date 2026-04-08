// frontend/src/components/Standings.jsx

import teamsData from "../data/teams.json"

const NL_PREFIX = "National League "
const AL_PREFIX = "American League "

/**
 * Format a games-back value as a display string.
 * gb < 0  → ahead of 6th seed → "+1.5"
 * gb = 0  → tied              → "-"
 * gb > 0  → behind 6th seed   → "1.5"
 */
function formatGbValue(gb) {
  if (gb === 0) return "-"
  const abs = Math.abs(gb)
  const str = abs % 1 === 0 ? `${abs}` : abs.toFixed(1)
  return gb < 0 ? `+${str}` : str
}

/**
 * Compute a "playoff GB" for each team, measured relative to the 6th seed
 * (3rd wild card). Rules:
 *  - Division leaders (seeds 1–3): "-"
 *  - 6th seed: "-"
 *  - 4th/5th seeds: "-" if tied, "+X.X" if ahead
 *  - Eliminated teams: games behind the 6th seed
 */
function enrichWithPlayoffGb(playoffData) {
  const sixthSeed = playoffData.find(t => t.seed === 6)
  if (!sixthSeed) return playoffData

  const s6w = sixthSeed.wins
  const s6l = sixthSeed.losses

  return playoffData.map(t => {
    if (t.category === "division" || t.seed === 6) {
      return { ...t, playoffGb: "-" }
    }
    const gb = ((s6w - t.wins) + (t.losses - s6l)) / 2
    return { ...t, playoffGb: formatGbValue(gb) }
  })
}

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
      <td className="playoff-td playoff-td--div playoff-td--center">
        {team.division?.replace(NL_PREFIX, "").replace(AL_PREFIX, "")}
      </td>
      <td className="playoff-td playoff-td--center">{team.wins}</td>
      <td className="playoff-td playoff-td--center">{team.losses}</td>
      <td className="playoff-td playoff-td--center playoff-td--muted">
        {team.playoffGb != null ? team.playoffGb : (team.gb === "-" || team.gb === "0" ? "-" : team.gb)}
      </td>
      <td className="playoff-td playoff-td--center playoff-td--muted">{team.pct}</td>
      <td className="playoff-td playoff-td--center playoff-td--muted">
        {team.games_remaining ?? "-"}
      </td>
    </tr>
  )
}

export function EliminatedRow({ team, favoriteTeamName = "" }) {
  const isFavorite = favoriteTeamName ? team.name === favoriteTeamName : team.name.includes("Padres")
  return (
    <div className={`elim-row${isFavorite ? " elim-row--favorite" : ""}`}>
      <div className="elim-cell elim-cell--seed" />
      <div className={`elim-cell elim-cell--name${isFavorite ? " elim-cell--name-favorite" : ""}`}>
        {team.name}
      </div>
      <div className="elim-cell elim-cell--div">
        {team.division?.replace(NL_PREFIX, "").replace(AL_PREFIX, "")}
      </div>
      <div className="elim-cell elim-cell--stat">{team.wins}</div>
      <div className="elim-cell elim-cell--stat">{team.losses}</div>
      <div className="elim-cell elim-cell--stat elim-cell--muted">
        {team.playoffGb != null ? team.playoffGb : (team.gb === "-" || team.gb === "0" ? "-" : team.gb)}
      </div>
      <div className="elim-cell elim-cell--stat elim-cell--muted">{team.pct}</div>
      <div className="elim-cell elim-cell--stat elim-cell--muted">
        {team.games_remaining ?? "-"}
      </div>
    </div>
  )
}

export function StandingsTable({ children }) {
  return (
    <table className="playoff-table">
      <colgroup>
        <col style={{ width: "38px" }} />  {/* seed */}
        <col />                             {/* name - fills remaining */}
        <col style={{ width: "58px" }} />  {/* div */}
        <col style={{ width: "34px" }} />  {/* W */}
        <col style={{ width: "34px" }} />  {/* L */}
        <col style={{ width: "44px" }} />  {/* GB */}
        <col style={{ width: "50px" }} />  {/* PCT */}
        <col style={{ width: "44px" }} />  {/* REM */}
      </colgroup>
      <thead>
        <tr>
          <th className="playoff-th playoff-th--seed"></th>
          <th className="playoff-th">Team</th>
          <th className="playoff-th playoff-th--center">Div</th>
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

function Standings({ teams, divisionName, playoffData, isAL, favoriteTeam, showDivision = true }) {
  const favoriteTeamName = teamsData.find(t => t.id === favoriteTeam)?.name || ""
  const leagueLabel = isAL ? "AL" : "NL"

  const enriched = playoffData && playoffData.length > 0 ? enrichWithPlayoffGb(playoffData) : (playoffData || [])

  const divLeaders = enriched.filter(t => t.category === "division")
  const wildCards = enriched.filter(t => t.category === "wildcard")
  const eliminated = enriched.filter(t => t.category === "eliminated")

  return (
    <div className="standings-section">

      {showDivision && (
        <>
          <h2>{divisionName ? `${divisionName.replace("National League", "NL").replace("American League", "AL")} Standings` : "Standings"}</h2>
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
                  <tr key={i} className={t.name === favoriteTeamName ? "padres-row" : ""}>
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
        </>
      )}

      {playoffData && playoffData.length > 0 && (
        <div className="playoff-section">
          <h2 className="playoff-section__title">{leagueLabel} Playoff Picture</h2>
          <div className="standings-table-wrapper">
            <StandingsTable>
              <tr className="divider-row">
                <td colSpan={8}><SectionDivider label="DIVISION LEADERS" /></td>
              </tr>
              {divLeaders.map((t, i) => (
                <StandingsRow key={i} team={t} showSeed={true} favoriteTeamName={favoriteTeamName} />
              ))}
              <tr className="divider-row">
                <td colSpan={8}><SectionDivider label="WILD CARD" /></td>
              </tr>
              {wildCards.map((t, i) => (
                <StandingsRow key={i} team={t} showSeed={true} favoriteTeamName={favoriteTeamName} />
              ))}
              <tr className="divider-row">
                <td colSpan={8}>
                  <SectionDivider label="OUT OF PLAYOFFS" />
                  <div className="eliminated-scroll">
                    {eliminated.map((t, i) => (
                      <EliminatedRow key={i} team={t} favoriteTeamName={favoriteTeamName} />
                    ))}
                  </div>
                </td>
              </tr>
            </StandingsTable>
          </div>
        </div>
      )}

    </div>
  )
}

export default Standings