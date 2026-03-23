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
    <div className="game-card">
      <h2>Today's Game</h2>
      <p>No game today.</p>
    </div>
  )

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
            background: "#0d1f2d",
            borderRadius: 8,
            padding: "10px 14px",
            fontSize: 13,
            color: "#ccc",
            textAlign: "left"
          }}>
            <p style={{ color: "#ffc425", fontWeight: "bold", marginBottom: 4 }}>Last Play</p>
            <p>{live.last_play}</p>
          </div>
        </>
      )}
    </div>
  )
}

export default LiveGame