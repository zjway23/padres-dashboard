import { Card, Skeleton } from "./ui"
import { gamesBack } from "../lib/format"

/** Division leaders are seeds 1-3, wild cards 4-6; a cut line marks the drop. */
export function PlayoffTable({ teams, favoriteTeamId, compact = false }) {
  if (!teams?.length) return <Skeleton rows={6} />

  const seeded = teams.filter(t => t.seed)
  const out = teams.filter(t => !t.seed)
  const bubble = seeded.find(t => t.seed === 6)

  // Games back of the final playoff spot - the number that actually matters in
  // September, and more useful than raw division GB for a wild-card chase.
  const gbOfSixth = (team) => {
    if (!bubble || team.seed === 6) return 0
    return ((bubble.wins - team.wins) + (team.losses - bubble.losses)) / 2
  }

  const Row = ({ team, showSeed }) => (
    <tr className={team.team_id === favoriteTeamId ? "is-me" : ""}>
      <td style={{ width: 30 }}>
        <span className={`seed seed--${showSeed ? (team.category === "division" ? "division" : "wildcard") : "out"}`}>
          {team.seed || ""}
        </span>
      </td>
      <td className="col-name">
        {team.name}
        {team.clinched && <span className="clinch" title="Clinched a playoff berth">✓</span>}
      </td>
      {!compact && <td className="muted">{team.division.replace("NL ", "").replace("AL ", "")}</td>}
      <td>{team.wins}</td>
      <td>{team.losses}</td>
      <td className="muted">{team.pct}</td>
      <td className="muted">{gamesBack(gbOfSixth(team))}</td>
      {!compact && <td className="muted">{team.games_remaining}</td>}
    </tr>
  )

  const colCount = compact ? 6 : 8

  return (
    <div className={`table-wrap${compact ? " table-wrap--capped" : ""}`}>
      <table className="data">
        <thead>
          <tr>
            <th />
            <th className="col-name">Team</th>
            {!compact && <th>Div</th>}
            <th>W</th>
            <th>L</th>
            <th>PCT</th>
            <th title="Games behind the final playoff spot">GB6</th>
            {!compact && <th title="Games remaining">REM</th>}
          </tr>
        </thead>
        <tbody>
          <tr className="row-divider"><td colSpan={colCount}>Division leaders</td></tr>
          {seeded.filter(t => t.category === "division").map(t => <Row key={t.team_id} team={t} showSeed />)}
          <tr className="row-divider"><td colSpan={colCount}>Wild card</td></tr>
          {seeded.filter(t => t.category === "wildcard").map(t => <Row key={t.team_id} team={t} showSeed />)}
          <tr className="cutline"><td colSpan={colCount} /></tr>
          <tr className="row-divider"><td colSpan={colCount}>In the hunt</td></tr>
          {out.map(t => <Row key={t.team_id} team={t} />)}
        </tbody>
      </table>
    </div>
  )
}

export function DivisionTable({ data, favoriteTeamId, loading }) {
  if (loading) return <Skeleton rows={5} />
  const teams = data?.teams || []
  if (!teams.length) return <Skeleton rows={5} />

  return (
    <div className="table-wrap">
      <table className="data">
        <thead>
          <tr>
            <th className="col-name">Team</th>
            <th>W</th>
            <th>L</th>
            <th>PCT</th>
            <th>GB</th>
            <th title="Last 10 games">L10</th>
            <th title="Current streak">STRK</th>
            <th title="Run differential">DIFF</th>
          </tr>
        </thead>
        <tbody>
          {teams.map(team => (
            <tr key={team.team_id} className={team.team_id === favoriteTeamId ? "is-me" : ""}>
              <td className="col-name">
                {team.name}
                {team.clinched && <span className="clinch" title="Clinched">✓</span>}
              </td>
              <td>{team.wins}</td>
              <td>{team.losses}</td>
              <td className="muted">{team.pct}</td>
              <td className="muted">{team.gb}</td>
              <td className="muted">{team.l10}</td>
              <td className="muted">{team.streak}</td>
              <td style={{ color: team.run_diff > 0 ? "var(--good)" : team.run_diff < 0 ? "var(--critical)" : "var(--text-muted)" }}>
                {team.run_diff > 0 ? "+" : ""}{team.run_diff}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function Standings({ division, playoff, favoriteTeamId, loading }) {
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <Card title={division?.division_name ? `${division.division_name} standings` : "Division"}>
        <DivisionTable data={division} favoriteTeamId={favoriteTeamId} loading={loading} />
      </Card>
      <Card title="Playoff picture">
        <PlayoffTable teams={playoff} favoriteTeamId={favoriteTeamId} compact />
      </Card>
    </div>
  )
}
