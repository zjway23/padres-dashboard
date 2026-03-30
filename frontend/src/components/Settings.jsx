import teams from "../data/teams.json"

const DIVISIONS = ["NL West", "NL Central", "NL East", "AL West", "AL Central", "AL East"]

function Settings({ favoriteTeam, onSave, onClose }) {
  const currentTeam = teams.find(t => t.id === favoriteTeam) || teams[0]

  return (
    <>
      <div
        style={{
          position: "fixed",
          top: 0, left: 0,
          width: "100vw", height: "100vh",
          background: "rgba(0,0,0,0.5)",
          zIndex: 199
        }}
        onClick={onClose}
      />
      <div style={{
        position: "fixed",
        top: "50%", left: "50%",
        transform: "translate(-50%, -50%)",
        background: "#1a3a4a",
        borderRadius: 16,
        padding: 28,
        width: "min(480px, 90vw)",
        maxHeight: "80vh",
        overflowY: "auto",
        zIndex: 200,
        boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
        border: `2px solid ${currentTeam.colors.accent}`
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <h2 style={{ color: "var(--color-accent)", margin: 0, fontSize: 20 }}>⚙️ Settings</h2>
          <button
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              color: "#aaa",
              fontSize: 20,
              cursor: "pointer",
              lineHeight: 1
            }}
          >✕</button>
        </div>

        <p style={{ color: "#aaa", fontSize: 13, marginBottom: 20 }}>
          Current team:{" "}
          <span style={{ color: "var(--color-accent)", fontWeight: "bold" }}>
            {currentTeam.name}
          </span>
        </p>

        {DIVISIONS.map(division => (
          <div key={division} style={{ marginBottom: 16 }}>
            <p style={{ color: "#aaa", fontSize: 11, fontWeight: "bold", letterSpacing: 1, textTransform: "uppercase", marginBottom: 8 }}>
              {division}
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {teams.filter(t => t.division === division).map(team => {
                const isSelected = team.id === favoriteTeam
                return (
                  <button
                    key={team.id}
                    onClick={() => onSave(team.id)}
                    style={{
                      background: isSelected ? team.colors.accent : "transparent",
                      border: `1.5px solid ${isSelected ? team.colors.accent : "#444"}`,
                      color: isSelected ? "#0d1f2d" : "white",
                      borderRadius: 8,
                      padding: "6px 12px",
                      fontSize: 13,
                      fontWeight: isSelected ? "bold" : "normal",
                      cursor: "pointer",
                      transition: "all 0.15s ease",
                      whiteSpace: "nowrap"
                    }}
                  >
                    {team.abbreviation}
                  </button>
                )
              })}
            </div>
          </div>
        ))}

        <div style={{ marginTop: 24, paddingTop: 16, borderTop: "1px solid #0d1f2d", display: "flex", justifyContent: "flex-end" }}>
          <button
            onClick={onClose}
            style={{
              background: "var(--color-accent)",
              color: "#0d1f2d",
              border: "none",
              borderRadius: 8,
              padding: "8px 20px",
              fontWeight: "bold",
              cursor: "pointer",
              fontSize: 14
            }}
          >
            Done
          </button>
        </div>
      </div>
    </>
  )
}

export default Settings
