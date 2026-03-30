import { SectionDivider, StandingsTable, StandingsRow } from "./StandingsComponents"
import teamsData from "../data/teams.json"

function Standings({ teams, divisionName, nlPlayoff, favoriteTeam }) {
  const favoriteTeamName = teamsData.find(t => t.id === favoriteTeam)?.name || ""

  return (
    <div className="standings-section">
      <h2>{divisionName ? `${divisionName} Standings` : "Standings"}</h2>
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

      {nlPlayoff && nlPlayoff.length > 0 && (
        <div className="playoff-section">
          <h2 className="playoff-section__title">NL Playoff Picture</h2>
          <div className="standings-table-wrapper">
            {(() => {
              const divLeaders = nlPlayoff.filter(t => t.category === "division")
              const wildCards = nlPlayoff.filter(t => t.category === "wildcard")
              const eliminated = nlPlayoff.filter(t => t.category === "eliminated")

              return (
                <>
                  <StandingsTable>
                    <tr className="divider-row">
                      <td colSpan={8}><SectionDivider label="DIVISION LEADERS" /></td>
                    </tr>
                    {divLeaders.map((t, i) => <StandingsRow key={i} team={t} showSeed={true} favoriteTeamName={favoriteTeamName} />)}
                    <tr className="divider-row">
                      <td colSpan={8}><SectionDivider label="WILD CARD" /></td>
                    </tr>
                    {wildCards.map((t, i) => <StandingsRow key={i} team={t} showSeed={true} favoriteTeamName={favoriteTeamName} />)}
                  </StandingsTable>

                  <SectionDivider label="OUT OF PLAYOFFS" standalone={true} />

                  <div className="eliminated-scroll">
                    <table className="playoff-table">
                      <tbody>
                        {eliminated.map((t, i) => <StandingsRow key={i} team={t} showSeed={false} favoriteTeamName={favoriteTeamName} />)}
                      </tbody>
                    </table>
                  </div>
                </>
              )
            })()}
          </div>
        </div>
      )}
    </div>
  )
}

export default Standings
