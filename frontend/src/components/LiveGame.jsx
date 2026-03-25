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
      <div><span style={base(second)}></span></div>
      <div>
        <span style={base(third)}></span>
        <span style={{ display: "inline-block", width: 18, margin: 4 }}></span>
        <span style={base(first)}></span>
      </div>
    </div>
  )
}

function LiveGame({ live, prevGame, nextGame }) {
  const isLive = live && live.status === "In Progress"

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
    const timeStr = formatGameTime(nextGame.game_datetime)
    return (
      <div style={{
        background: "#0d1f2d", borderRadius: 8,
        padding: "12px 14px", textAlign: "left", fontSize: 13,
        marginBottom: 12
      }}>
        <p style={{ color: "#ffc425", fontWeight: "bold", marginBottom: 8, fontSize: 12 }}>
          NEXT GAME {nextGame.game_type === "Spring Training" ? "· Spring Training" : ""}
        </p>
        <p style={{ fontSize: 15, fontWeight: "bold", color: "white", marginBottom: 4 }}>
          {nextGame.away} @ {nextGame.home}
        </p>
        {timeStr && (
          <p style={{ color: "#aaa", fontSize: 13 }}>{timeStr}</p>
        )}
      </div>
    )
  }

  const PrevGameCard = () => {
    if (!prevGame) return null
    const padresScore = prevGame.home.includes("Padres") ? prevGame.home_score : prevGame.away_score
    const oppScore = prevGame.home.includes("Padres") ? prevGame.away_score : prevGame.home_score
    const padresWon = padresScore > oppScore
    return (
      <div style={{
        background: "#0d1f2d", borderRadius: 8,
        padding: "12px 14px", textAlign: "left", fontSize: 13
      }}>
        <p style={{ color: "#ffc425", fontWeight: "bold", marginBottom: 8 }}>
          Previous Game {prevGame.game_type ? `(${prevGame.game_type})` : ""}
        </p>
        {[
          { name: prevGame.away, score: prevGame.away_score },
          { name: prevGame.home, score: prevGame.home_score }
        ].map((team, i) => {
          const isPadres = team.name.includes("Padres")
          const won = isPadres ? padresWon : !padresWon
          return (
            <div key={i} style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "4px 0",
              borderBottom: i === 0 ? "1px solid #1a3a4a" : "none"
            }}>
              <span style={{ color: won ? "#4caf50" : "#f44336", fontWeight: "bold", width: 16 }}>
                {won ? "W" : "L"}
              </span>
              <span style={{
                color: isPadres ? "#ffc425" : "white",
                fontWeight: isPadres ? "bold" : "normal",
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
        <p style={{ color: "#ffc425", fontWeight: "bold", fontSize: 13, marginBottom: 8 }}>
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
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <span style={{
            background: "#f44336", color: "white", fontSize: 10, fontWeight: "bold",
            borderRadius: 4, padding: "2px 6px", letterSpacing: 1
          }}>● LIVE</span>
          <h2 style={{ margin: 0 }}>Today's Game</h2>
        </div>
        <p className="matchup">{live.away} @ {live.home}</p>
        <div className="score">{live.away_score} - {live.home_score}</div>
        <p style={{ color: "#ffc425", marginTop: 12, fontWeight: "bold" }}>
          {live.half} {live.inning} · {live.outs} Out{live.outs !== 1 ? "s" : ""}
        </p>
        <Diamond first={live.first} second={live.second} third={live.third} />
        <p style={{ fontSize: 13, color: "#aaa", marginTop: 6 }}>
          Count: {live.balls}-{live.strikes}
        </p>
        <div style={{ marginTop: 12, fontSize: 13 }}>
          <p>🏏 <strong>Batting:</strong> {live.batter}</p>
          <p>⚾ <strong>Pitching:</strong> {live.pitcher}</p>
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
        <div style={{ marginTop: 16 }}>
          <PrevGameCard />
        </div>
      </div>
    )
  }

  // ── MODE 2: NO GAME / FINAL — next game + prev game + scoring plays ─────────
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