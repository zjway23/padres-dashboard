import { useMemo } from "react"
import { useApi } from "../hooks/useApi"
import { Badge, Card, Empty, ErrorNote, Pill, Skeleton } from "./ui"
import { DASH, dayString, stat } from "../lib/format"

// Everyone the club still carries who is on an injured list, with the earliest
// date each is eligible to be activated. The dates are derived from the IL's
// own rules rather than from reporting: a 60-day stint that began June 30
// cannot end before August 29, whoever says otherwise.

const WINDOWS = ["regular", "postseason", "next_season", "unknown"]

// Icon plus label, so the return window survives greyscale and colorblindness
// instead of resting on the border color alone.
const WINDOW_META = {
  regular: { icon: "◆", blurb: "IL clock runs out before the regular season ends." },
  postseason: { icon: "◇", blurb: "Cannot be activated until October at the earliest." },
  next_season: { icon: "✕", blurb: "Eligible again only once next season starts." },
  unknown: { icon: "?", blurb: "Not enough public record to derive a date." },
}

const READINESS_ICON = {
  rehabbing: "⟳",
  eligible: "●",
  on_clock: "◷",
  stalled: "◌",
  shut_down: "✕",
}

// Where the current absence sits against comparable past injuries. The phrasing
// stays descriptive: the range is a historical base rate, not a projection, and
// it is deliberately absent for diagnoses too broad to say anything useful about.
const STANDING_NOTE = {
  early: "not yet at the usual range",
  within: "inside the usual range",
  beyond: "past the usual range",
}

const PITCHING_STATS = [
  ["ERA", "era"], ["IP", "ip"], ["WHIP", "whip"], ["SO", "so"], ["SV", "saves"],
  ["HLD", "holds"],
]
const HITTING_STATS = [
  ["AVG", "avg"], ["OPS", "ops"], ["HR", "hr"], ["RBI", "rbi"], ["H", "hits"],
  ["SB", "sb"],
]

function shortDay(value) {
  return value ? dayString(value, { month: "short", day: "numeric" }) : DASH
}

/** "Jun 29" this year, "Sep 26, 2024" when the last game was a season ago. */
function lastPlayedLabel(player, season) {
  if (!player.last_played) return "No games on record"
  if (player.last_played_season && player.last_played_season !== season) {
    return dayString(player.last_played, { month: "short", day: "numeric", year: "numeric" })
  }
  return shortDay(player.last_played)
}

function SeasonLine({ player }) {
  const fields = player.group === "pitching" ? PITCHING_STATS : HITTING_STATS
  const line = player.season_line || {}
  if (!line.games) {
    return (
      <div className="injury-card__nostats">
        No {player.group === "pitching" ? "innings" : "at-bats"} this season.
      </div>
    )
  }
  return (
    <div className="injury-card__stats">
      <Pill label="G" value={stat(line.games)} />
      {fields.map(([label, key]) => (
        <Pill key={key} label={label} value={stat(line[key])} />
      ))}
    </div>
  )
}

function InjuryCard({ player, season }) {
  const eligible = shortDay(player.eligible_date)
  const readiness = READINESS_ICON[player.readiness] || "●"

  return (
    <article className={`injury-card injury-card--${player.window}`}>
      <div className="injury-card__top">
        <div style={{ minWidth: 0 }}>
          <span className="injury-card__name">{player.name}</span>
          <span className="injury-card__pos">{player.position}</span>
        </div>
        <Badge>{player.il_label}</Badge>
      </div>

      <div className="injury-card__injury">
        {player.injury || "Injury not disclosed in the transaction record"}
      </div>

      <div className={`injury-readiness injury-readiness--${player.readiness}`}>
        <span aria-hidden="true">{readiness}</span>
        {player.readiness_label}
      </div>

      <dl className="injury-facts">
        <div>
          <dt>Last played</dt>
          <dd>{lastPlayedLabel(player, season)}</dd>
        </div>
        <div>
          <dt>Games missed</dt>
          <dd>{player.games_missed ?? DASH}</dd>
        </div>
        <div>
          <dt>
            Placed on IL
            {player.placed_estimated && (
              <span
                className="injury-facts__est"
                title="No placement transaction is on file, so this is inferred from the last game played."
              > est.</span>
            )}
          </dt>
          <dd>{shortDay(player.placed_date)}</dd>
        </div>
        <div>
          <dt>Eligible to return</dt>
          <dd className={player.eligible_now ? "injury-facts__open" : undefined}>{eligible}</dd>
        </div>
      </dl>

      <p className="injury-card__detail">{player.return_detail}</p>

      {player.typical_absence && (
        <div className="injury-typical">
          <span className="injury-typical__head">Comparable injuries</span>
          <span className="injury-typical__range">{player.typical_absence.label}</span>
          <span className="injury-typical__n">
            middle half of {player.typical_absence.sample} past cases
          </span>
          {player.typical_absence.standing && player.days_out != null && (
            <span className={`injury-typical__standing injury-typical__standing--${player.typical_absence.standing}`}>
              {player.days_out}d out — {STANDING_NOTE[player.typical_absence.standing]}
            </span>
          )}
        </div>
      )}

      <SeasonLine player={player} />

      {player.timeline?.length > 0 && (
        <details className="injury-timeline">
          <summary>Transaction history</summary>
          <ul>
            {player.timeline.slice().reverse().map((event, i) => (
              <li key={`${event.date}-${i}`}>
                <span className="injury-timeline__date">{shortDay(event.date)}</span>
                <span>{event.description}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </article>
  )
}

export default function InjuryWatch({ team, teamName }) {
  const { data, error, loading, refetch } = useApi("/api/injuries", {
    params: { team },
    keepPrevious: true,
  })

  const grouped = useMemo(() => {
    const buckets = { regular: [], postseason: [], next_season: [], unknown: [] }
    for (const player of data?.players || []) buckets[player.window]?.push(player)
    return buckets
  }, [data])

  if (error) {
    return <Card title="Injury watch"><ErrorNote error={error} onRetry={refetch} /></Card>
  }
  if (loading && !data) {
    return <Card title="Injury watch"><Skeleton rows={4} height={132} /></Card>
  }
  if (!data?.players?.length) {
    return (
      <Card title="Injury watch">
        <Empty>Nobody on the injured list. Enjoy it while it lasts.</Empty>
      </Card>
    )
  }

  const { players, season } = data

  return (
    <Card
      title={`${teamName} injury watch`}
      action={<Pill label="On the IL" value={players.length} />}
    >
      <div className="injury-summary">
        {WINDOWS.filter(w => grouped[w].length > 0).map(window => (
          <div key={window} className={`injury-summary__tile injury-summary__tile--${window}`}>
            <div className="injury-summary__count">
              <span aria-hidden="true">{WINDOW_META[window].icon}</span>
              {grouped[window].length}
            </div>
            {/* The label is the server's, so the buckets read the same in both places. */}
            <div className="injury-summary__label">{grouped[window][0].window_label}</div>
            <div className="injury-summary__blurb">{WINDOW_META[window].blurb}</div>
          </div>
        ))}
      </div>

      {WINDOWS.map(window => (
        grouped[window].length > 0 && (
          <section key={window} className="injury-group">
            <div className="stat-tile__label" style={{ marginBottom: 8 }}>
              {grouped[window][0].window_label} · {grouped[window].length}
            </div>
            <div className="injury-grid">
              {grouped[window].map(player => (
                <InjuryCard key={player.player_id} player={player} season={season} />
              ))}
            </div>
          </section>
        )
      ))}

      <p className="muted" style={{ fontSize: 11.5, marginTop: 4, lineHeight: 1.5 }}>
        Dates are the earliest a player may legally be activated, derived from roster
        status and the public transaction feed — not official team reporting. Clubs
        activate players when they are ready, which is usually later. Regular season
        ends {shortDay(data.regular_end)}; postseason ends {shortDay(data.post_end)}.
      </p>
    </Card>
  )
}
