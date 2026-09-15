import { useMemo, useState } from "react"
import { useApi } from "../hooks/useApi"
import { Badge, Card, Empty, Skeleton, StarButton, StatTile } from "./ui"
import { battingLine, dayString, gameTime, pitchingLine, relativeDay, stat } from "../lib/format"

const FIELDER = {
  1: "P", 2: "C", 3: "1B", 4: "2B", 5: "3B", 6: "SS", 7: "LF", 8: "CF", 9: "RF",
}

/** Live game context for one favorited player: score, and when they bat next. */
function LiveContext({ playerId }) {
  const { data } = useApi(`/api/players/${playerId}/live`, {
    poll: 30000,
    keepPrevious: true,
  })
  if (!data?.is_live) return null

  const arrow = data.half === "Top" ? "▲" : "▼"
  let dueUp = null
  if (data.batting_spot > 0 && data.batters_until != null) {
    const n = data.batters_until
    const when = data.inning_projection === 0 ? "this inning"
      : data.inning_projection === 1 ? "next inning"
      : `in ~${data.inning_projection} innings`
    dueUp = n === 0 ? "At bat now" : `${n} batter${n === 1 ? "" : "s"} away · ${when}`
  }

  return (
    <div className="live-strip">
      <Badge variant="live">● LIVE</Badge>
      <span className="nums" style={{ fontWeight: 700 }}>
        {arrow}{data.inning_num}
      </span>
      <span className="nums">
        {data.away.abbreviation} {data.away.score} – {data.home.score} {data.home.abbreviation}
      </span>
      <span className="muted">{data.outs} out{data.outs === 1 ? "" : "s"}</span>
      {data.batting_spot > 0 && <span className="muted">Batting #{data.batting_spot}</span>}
      {dueUp && <span style={{ color: "var(--accent)", fontWeight: 600 }}>{dueUp}</span>}
    </div>
  )
}

function PlateAppearance({ play }) {
  const location = play.location ? FIELDER[play.location] || play.location : null
  const trajectory = play.trajectory ? play.trajectory.replace(/_/g, " ") : null
  const detail = [trajectory, location].filter(Boolean).join(" · ")

  return (
    <div className="pa-row">
      <div className="pa-row__ctx">
        <div className="muted" style={{ fontSize: 11 }}>
          {play.is_top ? "Top" : "Bot"} {play.inning}
        </div>
        {play.outs_before != null && (
          <div className="muted" style={{ fontSize: 10.5 }}>{play.outs_before} out</div>
        )}
      </div>
      <div className="pa-row__event">
        {play.event}
        {detail && (
          <div className="muted" style={{ fontWeight: 400, fontSize: 10.5, textTransform: "capitalize" }}>
            {detail}
          </div>
        )}
      </div>
      <div className="pa-row__desc">
        {play.description}
        {play.ev != null && (
          <div className="pa-row__hit">
            <span className="mini-tile"><span>EV</span>{play.ev}</span>
            {play.la != null && <span className="mini-tile"><span>LA</span>{play.la}°</span>}
            {play.dist != null && <span className="mini-tile"><span>DIST</span>{play.dist} ft</span>}
          </div>
        )}
      </div>
    </div>
  )
}

/** Game log with arrow navigation; the newest game opens first. */
function GameLog({ player }) {
  const { data: games, loading } = useApi(`/api/players/${player.player_id}/gamelog`, {
    params: { limit: 15, group: player.group },
  })
  // null means "newest game"; deriving it avoids resetting state in an effect
  // every time the game list reloads.
  const [selected, setSelected] = useState(null)
  const lastIndex = games?.length ? games.length - 1 : 0
  const index = selected === null ? lastIndex : Math.min(selected, lastIndex)
  const game = games?.length ? games[index] : null
  const { data: plays, loading: playsLoading } = useApi(
    game?.game_pk ? `/api/players/${player.player_id}/games/${game.game_pk}` : null,
    { enabled: Boolean(game?.game_pk && player.group !== "pitching") },
  )

  if (loading) return <Skeleton rows={3} />
  if (!games?.length) return <Empty>No recent games.</Empty>
  if (!game) return null

  return (
    <div style={{ marginTop: 14, padding: 12, borderRadius: 10, background: "var(--surface-inset)" }}>
      <div className="game-nav">
        <button
          className="btn btn--icon"
          onClick={() => setSelected(Math.max(0, index - 1))}
          disabled={index === 0}
          aria-label="Previous game"
        >←</button>
        <div className="game-nav__title">
          {dayString(game.game_date, { month: "short", day: "numeric" })}
          {" "}{game.is_home ? "vs" : "@"} {game.opponent_abbrev || game.opponent}
        </div>
        <button
          className="btn btn--icon"
          onClick={() => setSelected(Math.min(lastIndex, index + 1))}
          disabled={index === games.length - 1}
          aria-label="Next game"
        >→</button>
      </div>

      <div className="stat-line">
        {game.group === "pitching" ? pitchingLine(game.stat_line) : battingLine(game.stat_line)}
      </div>

      {player.group !== "pitching" && (
        playsLoading
          ? <Skeleton rows={2} height={28} />
          : plays?.length
            ? plays.map((play, i) => <PlateAppearance key={i} play={play} />)
            : <p className="muted" style={{ fontSize: 12.5 }}>No plate appearances recorded.</p>
      )}
    </div>
  )
}

function NextGame({ player, timezone }) {
  const { data } = useApi("/api/nextgame", {
    params: { team: player.team_id },
    enabled: Boolean(player.team_id),
  })
  if (!data) return null
  return (
    <div className="game-strip" style={{ marginTop: 10 }}>
      <span className="game-strip__tag">Next</span>
      <div className="game-strip__body">
        <div style={{ fontWeight: 600 }}>{data.is_home ? "vs" : "@"} {data.opponent}</div>
        <div className="game-strip__meta">
          {relativeDay(data.date)} · {gameTime(data.game_datetime, timezone)}
        </div>
      </div>
    </div>
  )
}

const BATTING_TILES = [
  ["AVG", "avg"], ["OPS", "ops"], ["HR", "hr"], ["RBI", "rbi"], ["H", "hits"],
  ["R", "runs"], ["BB", "bb"], ["K", "k"], ["SB", "sb"], ["OBP", "obp"],
  ["SLG", "slg"], ["G", "games"],
]

const PITCHING_TILES = [
  ["ERA", "era"], ["WHIP", "whip"], ["IP", "ip"], ["SO", "so"], ["BB", "bb"],
  ["SV", "saves"], ["HLD", "holds"], ["G", "games"],
]

function PlayerCard({ player, onToggleFavorite, timezone }) {
  const isPitcher = player.group === "pitching"
  const tiles = isPitcher ? PITCHING_TILES : BATTING_TILES
  const heroKey = isPitcher ? "era" : "avg"

  return (
    <Card className="player-card">
      <div className="player-card__head">
        <div style={{ minWidth: 0 }}>
          <span className="player-card__name">{player.name}</span>
          <span className="badge" style={{ marginLeft: 8 }}>{player.position}</span>
          <div className="player-card__team">{player.team || "Free agent"}</div>
        </div>
        <StarButton active onClick={() => onToggleFavorite(player)} label={player.name} />
      </div>

      <LiveContext playerId={player.player_id} />

      <div className="stat-row">
        {tiles.map(([label, key]) => (
          <StatTile key={key} label={label} value={stat(player[key])} hero={key === heroKey} />
        ))}
      </div>

      <GameLog player={player} />
      <NextGame player={player} timezone={timezone} />
    </Card>
  )
}

export default function FavoritesTab({ favorites, loading, onToggleFavorite, timezone }) {
  const [filter, setFilter] = useState("all")

  const shown = useMemo(() => {
    if (filter === "all") return favorites
    return favorites.filter(p => (filter === "pitchers" ? p.group === "pitching" : p.group !== "pitching"))
  }, [favorites, filter])

  if (loading) return <Skeleton rows={3} height={150} />

  if (!favorites.length) {
    return (
      <Card title="Favorites">
        <Empty>
          No favorites yet — tap ☆ beside any player on the Team tab,
          or use search to follow players from any club.
        </Empty>
      </Card>
    )
  }

  return (
    <div>
      <div className="tabs" style={{ maxWidth: 320 }}>
        {[["all", "All"], ["hitters", "Hitters"], ["pitchers", "Pitchers"]].map(([key, label]) => (
          <button
            key={key}
            className={`tab${filter === key ? " tab--active" : ""}`}
            onClick={() => setFilter(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {shown.length === 0
        ? <Card><Empty>No {filter} in your favorites.</Empty></Card>
        : shown.map(player => (
            <PlayerCard
              key={player.player_id}
              player={player}
              onToggleFavorite={onToggleFavorite}
              timezone={timezone}
            />
          ))}
    </div>
  )
}
