function NLPlayoff({ teams }) {
  if (!teams || teams.length === 0) return (
    <p style={{ textAlign: "center", color: "#aaa" }}>Loading...</p>
  )

  const divLeaders = teams.filter(t => t.category === "division")
  const wildCards = teams.filter(t => t.category === "wildcard")
  const eliminated = teams.filter(t => t.category === "eliminated")

  const TeamRow = ({ t, showSeed }) => (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: 10,
      padding: "8px 12px",
      background: t.name.includes("Padres") ? "rgba(255,196,37,0.08)" : "transparent",
      borderRadius: 6
    }}>
      {showSeed ? (
        <span style={{
          background: t.category === "division" ? "#ffc425" : "#1f4a5e",
          color: t.category === "division" ? "#0d1f2d" : "#ffc425",
          borderRadius: 4,
          fontSize: 11,
          fontWeight: "bold",
          width: 22,
          height: 22,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0
        }}>
          {t.seed}
        </span>
      ) : (
        <span style={{ width: 22, flexShrink: 0 }} />
      )}

      <span style={{
        flex: 1,
        fontSize: 13,
        fontWeight: t.name.includes("Padres") ? "bold" : "normal",
        color: t.name.includes("Padres") ? "#ffc425" : "white"
      }}>
        {t.name}
      </span>

      {/* Division */}
      <span style={{ fontSize: 12, color: "#aaa", minWidth: 36, textAlign: "center" }}>
        {t.division.replace("National League ", "")}
      </span>

      {/* W-L */}
      <span style={{ fontSize: 13, fontWeight: "bold", minWidth: 52, textAlign: "right" }}>
        {t.wins}-{t.losses}
      </span>

      {/* GB */}
      <span style={{ fontSize: 12, color: "#aaa", minWidth: 34, textAlign: "right" }}>
        {t.gb === "-" || t.gb === "0" ? "-" : t.gb}
      </span>

      {/* PCT */}
      <span style={{ fontSize: 12, color: "#ccc", minWidth: 38, textAlign: "right" }}>
        {t.pct}
      </span>

      {/* Games Remaining */}
      <span style={{ fontSize: 12, color: "#8fc9e0", minWidth: 38, textAlign: "right" }}>
        {t.games_remaining !== undefined && t.games_remaining !== "-" ? t.games_remaining : "-"}
      </span>
    </div>
  )

  const Divider = ({ label }) => (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: 8,
      margin: "8px 0",
      padding: "0 12px"
    }}>
      <div style={{ flex: 1, height: 1, background: "#ffc425", opacity: 0.4 }} />
      <span style={{ color: "#ffc425", fontSize: 10, fontWeight: "bold", opacity: 0.8 }}>
        {label}
      </span>
      <div style={{ flex: 1, height: 1, background: "#ffc425", opacity: 0.4 }} />
    </div>
  )

  return (
    <div style={{
      background: "#1a3a4a",
      borderRadius: 12,
      padding: 20,
      maxWidth: 1100,
      margin: "0 auto"
    }}>
      <h2 style={{ color: "#ffc425", marginBottom: 16, fontSize: "1.3rem", textAlign: "center" }}>
        🏆 NL Playoff Picture
      </h2>

      {/* Header */}
      <div style={{
        display: "flex",
        padding: "0 12px",
        marginBottom: 4,
        fontSize: 11,
        color: "#aaa"
      }}>
        <span style={{ width: 22, marginRight: 10, flexShrink: 0 }} />
        <span style={{ flex: 1 }}>Team</span>
        <span style={{ minWidth: 36, textAlign: "center" }}>Div</span>
        <span style={{ minWidth: 52, textAlign: "right" }}>W-L</span>
        <span style={{ minWidth: 34, textAlign: "right" }}>GB</span>
        <span style={{ minWidth: 38, textAlign: "right" }}>PCT</span>
        <span style={{ minWidth: 38, textAlign: "right", color: "#8fc9e0" }}>REM</span>
      </div>

      {/* Division Leaders */}
      <div style={{ marginBottom: 4 }}>
        {divLeaders.map((t, i) => <TeamRow key={i} t={t} showSeed={true} />)}
      </div>

      <Divider label="WILD CARD" />

      {/* Wild Cards */}
      <div style={{ marginBottom: 4 }}>
        {wildCards.map((t, i) => <TeamRow key={i} t={t} showSeed={true} />)}
      </div>

      <Divider label="OUT OF PLAYOFFS" />

      {/* Eliminated - scrollable */}
      <div>
        {eliminated.map((t, i) => <TeamRow key={i} t={t} showSeed={false} />)}
      </div>
    </div>
  )
}

export default NLPlayoff