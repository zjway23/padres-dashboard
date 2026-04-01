import teams from "../data/teams.json"

const DIVISIONS = ["NL West", "NL Central", "NL East", "AL West", "AL Central", "AL East"]

const TIMEZONES = [
  { label: "PT", value: "America/Los_Angeles" },
  { label: "MT", value: "America/Denver" },
  { label: "CT", value: "America/Chicago" },
  { label: "ET", value: "America/New_York" },
]

const TABS = [
  { label: "Dashboard", value: "dashboard" },
  { label: "⭐ Favorites", value: "favorites" },
  { label: "Bullpen", value: "bullpen" },
  { label: "🏆 Playoff Push", value: "wildcard" },
]

function Settings({ favoriteTeam, onSave, onClose, isFirstSetup, timezone, onTimezoneChange, defaultTab, onDefaultTabChange }) {
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
          <h2 style={{ color: "var(--color-accent)", margin: 0, fontSize: 20 }}>
            {isFirstSetup ? "🏟️ Choose Your Team" : "⚙️ Settings"}
          </h2>
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

        {!isFirstSetup && (
          <p style={{ color: "#aaa", fontSize: 13, marginBottom: 20 }}>
            Current team:{" "}
            <span style={{ color: "var(--color-accent)", fontWeight: "bold" }}>
              {currentTeam.name}
            </span>
          </p>
        )}

        {DIVISIONS.map(division => (
          <div key={division} style={{ marginBottom: 16 }}>
            <p style={{ color: "#aaa", fontSize: 11, fontWeight: "bold", letterSpacing: 1, textTransform: "uppercase", marginBottom: 8 }}>
              {division}
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 8 }}>
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

        {/* Divider */}
        <div style={{
          height: 1,
          background: "#444",
          margin: "20px 0"
        }} />

        {/* Timezone Selection */}
        {!isFirstSetup && (
          <div style={{ marginBottom: 20 }}>
            <p style={{ color: "#aaa", fontSize: 11, fontWeight: "bold", letterSpacing: 1, textTransform: "uppercase", marginBottom: 8 }}>
              Timezone
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 8 }}>
              {TIMEZONES.map(tz => {
                const isSelected = timezone === tz.value
                return (
                  <button
                    key={tz.value}
                    onClick={() => onTimezoneChange && onTimezoneChange(tz.value)}
                    style={{
                      background: isSelected ? "var(--color-accent)" : "transparent",
                      border: `1.5px solid ${isSelected ? "var(--color-accent)" : "#444"}`,
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
                    {tz.label}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Default Tab Selection */}
        {!isFirstSetup && (
          <div style={{ marginBottom: 20 }}>
            <p style={{ color: "#aaa", fontSize: 11, fontWeight: "bold", letterSpacing: 1, textTransform: "uppercase", marginBottom: 8 }}>
              Default Tab
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 8 }}>
              {TABS.map(tab => {
                const isSelected = defaultTab === tab.value
                return (
                  <button
                    key={tab.value}
                    onClick={() => onDefaultTabChange && onDefaultTabChange(tab.value)}
                    style={{
                      background: isSelected ? "var(--color-accent)" : "transparent",
                      border: `1.5px solid ${isSelected ? "var(--color-accent)" : "#444"}`,
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
                    {tab.label}
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </>
  )
}

export default Settings
