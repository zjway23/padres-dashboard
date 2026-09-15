import { Badge, Card, Diamond, Empty, Outs, Skeleton } from "./ui"
import { dayString, gameDay, gameTime, relativeDay } from "../lib/format"

/** Colour the last play by outcome so a scoring play is obvious at a glance. */
function lastPlayTone(play) {
  if (!play) return ""
  if (play.is_scoring || play.rbi > 0) return " last-play--score"
  const onBase = ["single", "double", "triple", "home_run", "walk", "hit_by_pitch",
                  "intent_walk", "error", "field_error", "catcher_interf"]
  const event = (play.event_type || "").toLowerCase()
  if (onBase.some(e => event.includes(e))) return " last-play--on-base"
  return " last-play--out"
}

function Linescore({ game }) {
  if (!game?.innings?.length) return null
  const scheduled = game.scheduled_innings || 9
  const count = Math.max(scheduled, game.innings.length)
  const innings = Array.from({ length: count }, (_, i) =>
    game.innings.find(inn => inn.num === i + 1) || { num: i + 1 })

  const row = (side) => (
    <tr>
      <td className="col-name">{game[side].abbreviation}</td>
      {innings.map(inn => (
        <td
          key={inn.num}
          className={inn.num === game.inning_num && game.is_live ? "inning-current" : ""}
        >
          {inn[side] ?? (inn.num <= (game.inning_num || 0) ? 0 : "")}
        </td>
      ))}
      <td className="total">{game.totals?.[side]?.runs ?? game[side].score}</td>
      <td className="total">{game.totals?.[side]?.hits ?? 0}</td>
      <td className="total">{game.totals?.[side]?.errors ?? 0}</td>
    </tr>
  )

  return (
    <div className="table-wrap" style={{ marginTop: 12 }}>
      <table className="data linescore">
        <thead>
          <tr>
            <th className="col-name" />
            {innings.map(inn => <th key={inn.num}>{inn.num}</th>)}
            <th className="total">R</th>
            <th className="total">H</th>
            <th className="total">E</th>
          </tr>
        </thead>
        <tbody>
          {row("away")}
          {row("home")}
        </tbody>
      </table>
    </div>
  )
}

function ScoringPlays({ plays }) {
  if (!plays?.length) return null
  return (
    <div style={{ marginTop: 14 }}>
      <div className="stat-tile__label" style={{ marginBottom: 6 }}>Scoring plays</div>
      <div className="scroll-list">
        {plays.map((play, i) => (
          <div className="play-item" key={i}>
            <span className="play-item__inning">{play.inning}</span>
            <span className="play-item__score">{play.away_score}-{play.home_score}</span>
            <span style={{ flex: 1 }}>{play.description}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function ScoreSide({ team, winner, isFavorite }) {
  return (
    <div className={`score-side${winner ? " score-side--winner" : ""}`}>
      <div className="score-side__abbr" style={isFavorite ? { color: "var(--accent)" } : undefined}>
        {team.abbreviation}
      </div>
      <div className="score-side__runs">{team.score}</div>
      <div className="score-side__name">
        {team.wins != null ? `${team.wins}-${team.losses}` : team.name}
      </div>
    </div>
  )
}

function ScoreLine({ game, favoriteTeamId }) {
  const { away, home } = game
  const decided = game.is_final || game.is_live
  const awayWon = decided && away.score > home.score
  const homeWon = decided && home.score > away.score

  return (
    <div className="score-line">
      <ScoreSide team={away} winner={awayWon} isFavorite={away.team_id === favoriteTeamId} />
      <div className="score-mid">
        {game.is_live ? (
          <>
            <div style={{ color: "var(--accent)", fontWeight: 700, fontSize: 13 }}>
              {game.inning_state || game.half} {game.inning}
            </div>
            <div style={{ margin: "8px 0" }}>
              <Diamond first={game.first} second={game.second} third={game.third} />
            </div>
            <Outs count={game.outs} />
            <div className="nums" style={{ marginTop: 6, fontSize: 12 }}>
              {game.balls}-{game.strikes}
            </div>
          </>
        ) : (
          <div style={{ fontSize: 12, fontWeight: 600 }}>{game.status}</div>
        )}
      </div>
      <ScoreSide team={home} winner={homeWon} isFavorite={home.team_id === favoriteTeamId} />
    </div>
  )
}

function UpcomingStrip({ game, timezone }) {
  if (!game) return null
  return (
    <div className="game-strip">
      <span className="game-strip__tag">Next</span>
      <div className="game-strip__body">
        <div style={{ fontWeight: 600 }}>
          {game.is_home ? "vs" : "@"} {game.opponent}
        </div>
        <div className="game-strip__meta">
          {relativeDay(game.date)} · {gameTime(game.game_datetime, timezone)}
          {game.venue ? ` · ${game.venue}` : ""}
        </div>
      </div>
      {game.probable_pitcher && (
        <div style={{ textAlign: "right", minWidth: 0 }}>
          <div className="stat-tile__label">Probable</div>
          <div style={{ fontSize: 12.5 }}>{game.probable_pitcher}</div>
        </div>
      )}
    </div>
  )
}

function PreviousStrip({ game, favoriteTeamId }) {
  if (!game) return null
  const us = game.home.team_id === favoriteTeamId ? game.home : game.away
  const them = game.home.team_id === favoriteTeamId ? game.away : game.home
  const won = us.score > them.score
  return (
    <div className="game-strip">
      <span className="game-strip__tag">Last</span>
      <span className={`result-badge result-badge--${won ? "w" : "l"}`}>{won ? "W" : "L"}</span>
      <div className="game-strip__body">
        <div style={{ fontWeight: 600 }} className="nums">
          {us.score}-{them.score}{" "}
          <span style={{ fontWeight: 400, color: "var(--text-secondary)" }}>
            {game.home.team_id === favoriteTeamId ? "vs" : "@"} {them.name}
          </span>
        </div>
        <div className="game-strip__meta">{dayString(game.date)}</div>
      </div>
    </div>
  )
}

export default function LiveGame({ live, previous, next, favoriteTeamId, timezone, loading }) {
  if (loading && !live && !previous) {
    return <Card title="Today"><Skeleton rows={5} /></Card>
  }

  const hasGameToday = Boolean(live)
  const showLiveDetail = live && (live.is_live || live.is_final)

  return (
    <Card
      title={hasGameToday ? "Today's game" : "Up next"}
      action={live?.is_live
        ? <Badge variant="live">● LIVE</Badge>
        : live?.is_final
          ? <Badge variant="muted">Final</Badge>
          : null}
    >
      {hasGameToday ? (
        <>
          <div className="game-strip__meta" style={{ marginBottom: 4, textAlign: "center" }}>
            {live.venue}
            {live.doubleheader_game > 1 ? ` · Game ${live.doubleheader_game}` : ""}
            {!live.is_live && !live.is_final && live.game_datetime
              ? ` · ${gameDay(live.game_datetime, timezone)} ${gameTime(live.game_datetime, timezone)}`
              : ""}
          </div>

          <ScoreLine game={live} favoriteTeamId={favoriteTeamId} />

          {live.is_live && (
            <div className="matchup-row">
              <div className="matchup-cell">
                <div className="matchup-cell__label">At bat</div>
                <div className="matchup-cell__name">{live.batter || "–"}</div>
              </div>
              <div className="matchup-cell">
                <div className="matchup-cell__label">Pitching</div>
                <div className="matchup-cell__name">{live.pitcher || "–"}</div>
              </div>
            </div>
          )}

          {!live.is_live && !live.is_final && (live.away.probable_pitcher || live.home.probable_pitcher) && (
            <div className="matchup-row">
              <div className="matchup-cell">
                <div className="matchup-cell__label">{live.away.abbreviation} probable</div>
                <div className="matchup-cell__name">{live.away.probable_pitcher || "TBD"}</div>
              </div>
              <div className="matchup-cell">
                <div className="matchup-cell__label">{live.home.abbreviation} probable</div>
                <div className="matchup-cell__name">{live.home.probable_pitcher || "TBD"}</div>
              </div>
            </div>
          )}

          {showLiveDetail && <Linescore game={live} />}

          {live.last_play && (
            <div className={`last-play${lastPlayTone(live.last_play)}`}>
              <div className="last-play__label">
                Last play {live.last_play.inning ? `· ${live.last_play.inning}` : ""}
              </div>
              <div>{live.last_play.description}</div>
            </div>
          )}

          <ScoringPlays plays={live.scoring_summary} />
        </>
      ) : (
        <Empty>No game scheduled today.</Empty>
      )}

      <div style={{ marginTop: 14 }}>
        {(!hasGameToday || live.is_final) && <UpcomingStrip game={next} timezone={timezone} />}
        {/* Once today's game is final it IS the previous game - showing both
            would list the same result twice. */}
        {previous && previous.game_pk !== live?.game_pk && (
          <PreviousStrip game={previous} favoriteTeamId={favoriteTeamId} />
        )}
      </div>
    </Card>
  )
}
