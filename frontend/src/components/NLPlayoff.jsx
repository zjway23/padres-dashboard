import { SectionDivider, StandingsTable, StandingsRow } from "./shared/StandingsComponents"

function NLPlayoff({ teams }) {
  if (!teams || teams.length === 0) return (
    <p className="loading">Loading...</p>
  )

  const divLeaders = teams.filter(t => t.category === "division")
  const wildCards = teams.filter(t => t.category === "wildcard")
  const eliminated = teams.filter(t => t.category === "eliminated")

  return (
    <div className="playoff-card">
      <h2 className="playoff-card__title">🏆 NL Playoff Picture</h2>

      <div className="standings-table-wrapper">
        <StandingsTable>
          <tr className="divider-row">
            <td colSpan={8}><SectionDivider label="DIVISION LEADERS" /></td>
          </tr>
          {divLeaders.map((t, i) => <StandingsRow key={i} team={t} showSeed={true} />)}
          <tr className="divider-row">
            <td colSpan={8}><SectionDivider label="WILD CARD" /></td>
          </tr>
          {wildCards.map((t, i) => <StandingsRow key={i} team={t} showSeed={true} />)}
        </StandingsTable>

        <SectionDivider label="OUT OF PLAYOFFS" standalone={true} />

        <div className="eliminated-scroll">
          <table className="playoff-table">
            <tbody>
              {eliminated.map((t, i) => <StandingsRow key={i} team={t} showSeed={false} />)}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

export default NLPlayoff
