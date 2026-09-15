import { useMemo, useState } from "react"
import { Card, Skeleton, StarButton } from "./ui"
import { stat } from "../lib/format"

const BATTING_COLS = [
  { key: "games", label: "G" },
  { key: "avg", label: "AVG" },
  { key: "hits", label: "H" },
  { key: "hr", label: "HR" },
  { key: "rbi", label: "RBI" },
  { key: "sb", label: "SB" },
  { key: "bb", label: "BB" },
  { key: "k", label: "K" },
  { key: "obp", label: "OBP" },
  { key: "slg", label: "SLG" },
  { key: "ops", label: "OPS" },
]

const PITCHING_COLS = [
  { key: "games", label: "G" },
  { key: "record", label: "W-L", sortable: false },
  { key: "era", label: "ERA", asc: true },
  { key: "ip", label: "IP" },
  { key: "so", label: "SO" },
  { key: "bb", label: "BB" },
  { key: "whip", label: "WHIP", asc: true },
  { key: "saves", label: "SV" },
  { key: "holds", label: "HLD" },
]

function useSorted(rows, initialKey, initialAsc) {
  const [sort, setSort] = useState({ key: initialKey, asc: initialAsc })

  const sorted = useMemo(() => {
    const value = (row) => {
      const raw = row[sort.key]
      if (raw === null || raw === undefined || raw === "") return sort.asc ? Infinity : -Infinity
      const num = parseFloat(raw)
      return Number.isNaN(num) ? raw : num
    }
    return [...rows].sort((a, b) => {
      // Favorites stay pinned to the top regardless of the active sort.
      if (a.favorited !== b.favorited) return a.favorited ? -1 : 1
      const av = value(a)
      const bv = value(b)
      if (av < bv) return sort.asc ? -1 : 1
      if (av > bv) return sort.asc ? 1 : -1
      return 0
    })
  }, [rows, sort])

  const toggle = (col) => {
    if (col.sortable === false) return
    setSort(prev => prev.key === col.key
      ? { key: col.key, asc: !prev.asc }
      : { key: col.key, asc: Boolean(col.asc) })
  }

  return { sorted, sort, toggle }
}

function SortableHeader({ columns, sort, onToggle }) {
  return (
    <>
      {columns.map(col => (
        <th
          key={col.key}
          className={col.sortable === false ? "" : "sortable"}
          onClick={() => onToggle(col)}
          title={col.sortable === false ? undefined : `Sort by ${col.label}`}
        >
          {col.label}
          {sort.key === col.key && <span className="sort-caret">{sort.asc ? "▲" : "▼"}</span>}
        </th>
      ))}
    </>
  )
}

function BattingTable({ players, onToggleFavorite, loading }) {
  const { sorted, sort, toggle } = useSorted(players, "avg", false)
  if (loading) return <Skeleton rows={8} />
  if (!players.length) return <p className="empty">No batting stats available.</p>

  return (
    <div className="table-wrap">
      <table className="data">
        <thead>
          <tr>
            <th style={{ width: 30 }} />
            <th className="col-name">Player</th>
            <th>POS</th>
            <SortableHeader columns={BATTING_COLS} sort={sort} onToggle={toggle} />
          </tr>
        </thead>
        <tbody>
          {sorted.map(player => (
            <tr key={player.player_id} className={player.favorited ? "is-favorite" : ""}>
              <td>
                <StarButton
                  active={player.favorited}
                  label={player.name}
                  onClick={() => onToggleFavorite(player)}
                />
              </td>
              <td className="col-name">{player.name}</td>
              <td><span className="badge">{player.position}</span></td>
              {BATTING_COLS.map(col => <td key={col.key}>{stat(player[col.key])}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function PitchingTable({ pitchers, onToggleFavorite, loading }) {
  const { sorted, sort, toggle } = useSorted(pitchers, "era", true)
  if (loading) return <Skeleton rows={8} />
  if (!pitchers.length) return <p className="empty">No pitching stats available.</p>

  const starters = sorted.filter(p => p.role === "SP")
  const relievers = sorted.filter(p => p.role === "RP")

  const Row = (player) => (
    <tr key={player.player_id} className={player.favorited ? "is-favorite" : ""}>
      <td>
        <StarButton
          active={player.favorited}
          label={player.name}
          onClick={() => onToggleFavorite(player)}
        />
      </td>
      <td className="col-name">{player.name}</td>
      <td><span className="badge">{player.position}</span></td>
      {PITCHING_COLS.map(col => (
        <td key={col.key}>
          {col.key === "record" ? `${player.wins}-${player.losses}` : stat(player[col.key])}
        </td>
      ))}
    </tr>
  )

  const span = PITCHING_COLS.length + 3

  return (
    <div className="table-wrap">
      <table className="data">
        <thead>
          <tr>
            <th style={{ width: 30 }} />
            <th className="col-name">Player</th>
            <th>THR</th>
            <SortableHeader columns={PITCHING_COLS} sort={sort} onToggle={toggle} />
          </tr>
        </thead>
        <tbody>
          {starters.length > 0 && (
            <tr className="row-divider"><td colSpan={span}>Starters</td></tr>
          )}
          {starters.map(Row)}
          {relievers.length > 0 && (
            <tr className="row-divider"><td colSpan={span}>Bullpen</td></tr>
          )}
          {relievers.map(Row)}
        </tbody>
      </table>
    </div>
  )
}

export default function RosterTable({ batters, pitchers, loading, onToggleFavorite, season }) {
  const [view, setView] = useState("batting")

  return (
    <Card
      title={`${season} team stats`}
      action={
        <div className="tabs" style={{ margin: 0, padding: 3 }}>
          <button
            className={`tab${view === "batting" ? " tab--active" : ""}`}
            onClick={() => setView("batting")}
          >
            Batting
          </button>
          <button
            className={`tab${view === "pitching" ? " tab--active" : ""}`}
            onClick={() => setView("pitching")}
          >
            Pitching
          </button>
        </div>
      }
    >
      {view === "batting"
        ? <BattingTable players={batters} onToggleFavorite={onToggleFavorite} loading={loading} />
        : <PitchingTable pitchers={pitchers} onToggleFavorite={onToggleFavorite} loading={loading} />}
    </Card>
  )
}
