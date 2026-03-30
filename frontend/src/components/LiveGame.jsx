import teamsData from "../data/teams.json"

function Diamond({ first, second, third }) {
  const base = (active) => ({
    width: 18, height: 18,
    background: active ? "#ffc425" : "transparent",
    border: "2px solid #ffc425",
    transform: "rotate(45deg)",
    display: "inline-block",
    margin: 4
  })
  return (
    <div style={{ textAlign: "center", margin: "10px 0" }}>
      <div style={{ marginBottom: -8}}><span style={base(second)}></span></div>
      <div>
        <span style={base(third)}></span>
        <span style={{ display: "inline-block", width: 18, margin: 4 }}></span>
        <span style={base(first)}></span>
      </div>
    </div>
  )
}

function LiveGame({ live, prevGame, nextGame, favoriteTeam }) {
  const isLive = live && live.status === "In Progress"
  const favoriteTeamName = teamsData.find(t => t.id === favoriteTeam)?.name || ""

  const getLastPlayColor = () => {
    if (!live?.last_play_event) return "transparent"
    const event = live.last_play_event.toLowerCase()
    if (live.last_play_scoring || live.last_play_rbi > 0) return "rgba(33, 150, 243, 0.2)"
    const onBase = ["single", "double", "triple", "home_run", "walk", "hit_by_pitch", "intent_walk", "error", "field_error", "catcher_interf"]
    if (onBase.some(e => event.includes(e))) return "rgba(76, 175, 80, 0.2)"
    return "rgba(244, 67, 54, 0.2)"
  }

  const formatGameTime = (isoString) => {
    if (!isoString) return ""
    try {
      const dt = new Date(isoString)
      return dt.toLocaleTimeString("en-US", {
        hour: "numeric", minute: "2-digit",
        timeZoneName: "short"
      })
    } catch { return "" }
  }

  const formatDate = (dateStr) => {
    const d = new Date(dateStr + "T12:00:00")
    return d.toLocaleDateString("en-US", { weekday: "long", month: "numeric", day: "numeric", year: "numeric" })
  }

  const NextGameCard = () => {
    if (!nextGame) return null
    const dt = new Date(nextGame.game_datetime)
    const formatted = dt.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
    const timeStr = formatGameTime(nextGame.game_datetime)
    return (
      <div style={{
        marginBottom: 12,
        padding: "8px 12px 16px",
        background: "#0d1f2d",
        borderRadius: 8,
      }}>
        <div style={{ color: "#ffc425", fontSize: 13, fontWeight: "bold", marginBottom: 4, letterSpacing: "0.5px" }}>
          NEXT GAME {nextGame.game_type === "Spring Training" ? "· Spring Training" : ""}
        </div>
        <div style={{ fontSize: 13, fontWeight: "bold" }}>
          {nextGame.away} vs {nextGame.home}
        </div>
        <div style={{ color: "#aaa", fontSize: 12, lineHeight: 2.2}}>
          {formatted} · {timeStr}
          {nextGame.venue && (
            <span style={{ color: "#7a9db5", fontSize: 11, display: "block", lineHeight: 1.9 }}>{nextGame.venue}</span>
          )}
        </div>
      </div>
    )
  }

  const PrevGameCard = () => {
    if (!prevGame) return null
    const awayWon = prevGame.away_score > prevGame.home_score
    return (
      <div style={{
        background: "#0d1f2d", borderRadius: 8,
        padding: "12px 14px 4px", textAlign: "left", fontSize: 13
      }}>
        <p style={{ color: "#ffc425", fontWeight: "bold", marginBottom: 8 }}>
          PREVIOUS GAME
        </p>
        {[
          { name: prevGame.away, score: prevGame.away_score, won: awayWon },
          { name: prevGame.home, score: prevGame.home_score, won: !awayWon }
        ].map((team, i) => {
          const isFavorite = favoriteTeamName && team.name.includes(favoriteTeamName)
          return (
            <div key={i} style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "4px 0",
              borderBottom: i === 0 ? "1px solid #1a3a4a" : "none"
            }}>
              <span style={{ color: team.won ? "#4caf50" : "#f44336", fontWeight: "bold", width: 16 }}>
                {team.won ? "W" : "L"}
              </span>
              <span style={{
                color: isFavorite ? "var(--color-accent)" : "white",
                fontWeight: isFavorite ? "bold" : "normal",
                minWidth: 160
              }}>
                {team.name}
              </span>
              <span style={{ fontWeight: "bold" }}>{team.score}</span>
            </div>
          )
        })}
        <p style={{ color: "#aaa", fontSize: 11, marginTop: 8 }}>{formatDate(prevGame.date)}</p>
      </div>
    )
  }


  const ScoringPlays = ({ summary }) => {
    if (!summary || summary.length === 0) return null
    return (
      <div style={{ marginTop: 12, textAlign: "left" }}>
        <p style={{ color: "#ffc425", fontWeight: "bold", fontSize: 13, marginTop: 5 }}>
          Scoring Plays
        </p>
        {summary.map((play, i) => (
          <div key={i} style={{
            fontSize: 12, padding: "6px 0",
            borderBottom: "1px solid #0d1f2d", color: "#ccc"
          }}>
            <span style={{ color: "#ffc425", fontWeight: "bold", marginRight: 8, fontSize: 11 }}>
              {play.inning}
            </span>
            <span style={{ marginRight: 8, fontWeight: "bold", color: "white" }}>
              {play.away_score}-{play.home_score}
            </span>
            {play.description}
          </div>
        ))}
      </div>
    )
  }

  // ── MODE 1: GAME IN PROGRESS ────────────────────────────────────────────────
  if (isLive) {
    return (
      <div className="game-card" style={{ display: "flex", flexDirection: "column" }}>

        {/* Header: centered title, LIVE badge pinned top-right */}
        <div style={{ position: "relative", textAlign: "center", marginBottom: 4 }}>
          <h2 style={{ margin: 0 }}>Today's Game</h2>
          <span style={{
            position: "absolute", top: 0, right: 0,
            background: "#f44336", color: "white",
            fontSize: 8, fontWeight: "bold",
            borderRadius: 3, padding: "2px 5px",
            letterSpacing: 0.8, lineHeight: 1.4
          }}>● LIVE</span>
        </div>

        <p className="matchup" style={{ textAlign: "center" }}>{live.away} @ {live.home}</p>
        <div className="score" style={{ textAlign: "center" }}>{live.away_score} - {live.home_score}</div>
        <p style={{ color: "#ffc425", marginTop: 12, fontWeight: "bold", textAlign: "center" }}>
          {live.half} {live.inning} · {live.outs} Out{live.outs !== 1 ? "s" : ""}
        </p>
        <Diamond first={live.first} second={live.second} third={live.third} />
        <p style={{ fontSize: 13, color: "#aaa", marginTop: 6, textAlign: "center" }}>
          Count: {live.balls}-{live.strikes}
        </p>
        <div style={{ marginTop: 12, fontSize: 13, textAlign: "center" }}>
          <p><strong>Batting:</strong> {live.batter}</p>
          <p><strong>Pitching:</strong> {live.pitcher}</p>
        </div>
        <div style={{
          marginTop: 16, background: getLastPlayColor(),
          borderRadius: 8, padding: "10px 14px",
          fontSize: 13, color: "#ccc", textAlign: "left",
          transition: "background 0.5s ease"
        }}>
          <p style={{ color: "#ffc425", fontWeight: "bold", marginBottom: 4 }}>Last Play</p>
          <p>{live.last_play}</p>
        </div>
        <div style={{ marginTop: 16, maxHeight: 384, overflowY: "auto" }}>
          {live?.scoring_summary?.length > 0 && (
            <ScoringPlays summary={live.scoring_summary} />          )}
        </div>
        <div style={{ marginTop: 16 }}>
          <PrevGameCard />
        </div>
      </div>
    )
  }

  // ── MODE 2: NO GAME / FINAL ─────────────────────────────────────────────────
  return (
    <div className="game-card" style={{ display: "flex", flexDirection: "column" }}>
      <NextGameCard />
      <PrevGameCard />
      {prevGame?.scoring_summary?.length > 0 && (
        <ScoringPlays summary={prevGame.scoring_summary} />
      )}
    </div>
  )
}

export default LiveGame