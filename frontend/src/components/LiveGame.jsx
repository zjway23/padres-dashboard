function Diamond({ first, second, third }) {
  const base = (active) => ({
    width: 18,
    height: 18,
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

function LiveGame({ live }) {
  if (!live) return (
    <div className="game-card" style={{ display: "flex", flexDirection: "column" }}>
      <h2>Today's Game</h2>
      <p>No game today.</p>
    </div>
  )

  const getLastPlayColor = () => {
    if (!live.last_play_event) return "transparent"
    const event = live.last_play_event.toLowerCase()
    if (live.last_play_scoring || live.last_play_rbi > 0) return "rgba(33, 150, 243, 0.2)"
    const onBase = ["single", "double", "triple", "home_run", "walk", "hit_by_pitch", "intent_walk", "error", "field_error", "catcher_interf"]
    if (onBase.some(e => event.includes(e))) return "rgba(76, 175, 80, 0.2)"
    return "rgba(244, 67, 54, 0.2)"
  }

  return (
    <div className="game-card">
      <h2>Today's Game</h2>
      <p className="matchup">{live.away} @ {live.home}</p>
      <div className="score">{live.away_score} - {live.home_score}</div>
      <p className="status">{live.status}</p>

      {live.status === "In Progress" && (
        <>
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
            marginTop: 16,
            background: getLastPlayColor(),
            borderRadius: 8,
            padding: "10px 14px",
            fontSize: 13,
            color: "#ccc",
            textAlign: "left",
            transition: "background 0.5s ease"
          }}>
            <p style={{ color: "#ffc425", fontWeight: "bold", marginBottom: 4 }}>Last Play</p>
            <p>{live.last_play}</p>
          </div>
        </>
      )}

      {live.status === "Final" && live.scoring_summary && live.scoring_summary.length > 0 && (
        <div style={{
          marginTop: 16,
          flex: 1,
          overflowY: "auto",
          textAlign: "left",
          minHeight: 0
        }}>
          <p style={{ color: "#ffc425", fontWeight: "bold", fontSize: 13, marginBottom: 8 }}>
            Scoring Plays
          </p>
          {live.scoring_summary.map((play, i) => (
            <div key={i} style={{
              fontSize: 12,
              padding: "6px 0",
              borderBottom: "1px solid #0d1f2d",
              color: "#ccc"
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
      )}
    </div>
  )
}

export default LiveGame