import { useMemo } from "react"
import { useApi } from "../hooks/useApi"
import { Card, Empty, ErrorNote, Pill, Skeleton, StatusBadge } from "./ui"
import { DASH, dayString, stat } from "../lib/format"

// Replaces the "Bullpen tracker coming soon!" placeholder. Availability is
// inferred server-side from each reliever's recent game log: who threw
// yesterday, how many pitches they've absorbed over three days, and how many
// straight days they've been used.

const ORDER = ["available", "caution", "unavailable"]
const HEADINGS = {
  available: "Available",
  caution: "Use with caution",
  unavailable: "Unavailable",
}

/** Five slots, most recent day last; a filled slot means they pitched. */
function RestTrack({ reliever }) {
  const worked = useMemo(() => {
    const days = new Set(reliever.recent?.map(a => a.date))
    const today = new Date()
    return Array.from({ length: 5 }, (_, i) => {
      const day = new Date(today)
      day.setDate(today.getDate() - (4 - i))
      return days.has(day.toISOString().slice(0, 10))
    })
  }, [reliever.recent])

  const label = `Pitched on ${worked.filter(Boolean).length} of the last 5 days`
  return (
    <div className="rest-track" role="img" aria-label={label} title={label}>
      {worked.map((on, i) => (
        <span key={i} className={`rest-day${on ? " rest-day--worked" : ""}`} />
      ))}
    </div>
  )
}

function RelieverCard({ reliever }) {
  const rest = reliever.rest_days
  const restLabel = rest === null || rest === undefined
    ? DASH
    : rest === 0 ? "Today" : rest === 1 ? "1 day" : `${rest} days`

  return (
    <div className={`pen-card pen-card--${reliever.status}`}>
      <div className="pen-card__top">
        <div style={{ minWidth: 0 }}>
          <span className="pen-card__name">{reliever.name}</span>
          <span className="pen-card__hand">{reliever.position}</span>
        </div>
        <StatusBadge status={reliever.status} />
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <Pill label="ERA" value={stat(reliever.era)} />
        <Pill label="WHIP" value={stat(reliever.whip)} />
        <Pill label="Rest" value={restLabel} title="Days since last appearance" />
        <Pill label="P/3d" value={reliever.pitches_last_3} title="Pitches thrown in the last 3 days" />
      </div>

      <RestTrack reliever={reliever} />

      <div className="pen-card__reason">
        {reliever.status_reason}
        {reliever.last_pitched && ` · last out ${dayString(reliever.last_pitched, { month: "short", day: "numeric" })}`}
      </div>
    </div>
  )
}

export default function Bullpen({ team, teamName }) {
  const { data, error, loading, refetch } = useApi("/api/bullpen", {
    params: { team },
    keepPrevious: true,
  })

  const grouped = useMemo(() => {
    const buckets = { available: [], caution: [], unavailable: [] }
    for (const reliever of data || []) buckets[reliever.status]?.push(reliever)
    return buckets
  }, [data])

  if (error) {
    return <Card title="Bullpen"><ErrorNote error={error} onRetry={refetch} /></Card>
  }
  if (loading && !data) {
    return <Card title="Bullpen"><Skeleton rows={4} height={92} /></Card>
  }
  if (!data?.length) {
    return (
      <Card title="Bullpen">
        <Empty>No relievers found on the active roster.</Empty>
      </Card>
    )
  }

  const ready = grouped.available.length

  return (
    <Card
      title={`${teamName} bullpen`}
      action={<Pill label="Ready" value={`${ready}/${data.length}`} />}
    >
      <div className="legend">
        <span className="legend__item">
          <span className="legend__swatch" style={{ background: "var(--good)" }} />
          Available — rested
        </span>
        <span className="legend__item">
          <span className="legend__swatch" style={{ background: "var(--warning)" }} />
          Caution — pitched recently
        </span>
        <span className="legend__item">
          <span className="legend__swatch" style={{ background: "var(--critical)" }} />
          Unavailable — needs a day
        </span>
      </div>

      {ORDER.map(status => (
        grouped[status].length > 0 && (
          <div key={status} style={{ marginBottom: 18 }}>
            <div className="stat-tile__label" style={{ marginBottom: 8 }}>
              {HEADINGS[status]} · {grouped[status].length}
            </div>
            <div className="pen-grid">
              {grouped[status].map(reliever => (
                <RelieverCard key={reliever.player_id} reliever={reliever} />
              ))}
            </div>
          </div>
        )
      ))}

      <p className="muted" style={{ fontSize: 11.5, marginTop: 4 }}>
        Availability is estimated from recent game logs, not official team reporting.
      </p>
    </Card>
  )
}
