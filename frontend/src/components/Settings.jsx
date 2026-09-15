import { useEffect } from "react"
import teams from "../data/teams.json"
import { readableOn } from "../lib/theme"

const DIVISIONS = ["NL West", "NL Central", "NL East", "AL West", "AL Central", "AL East"]

const TIMEZONES = [
  { label: "Pacific", value: "America/Los_Angeles" },
  { label: "Mountain", value: "America/Denver" },
  { label: "Central", value: "America/Chicago" },
  { label: "Eastern", value: "America/New_York" },
]

const TABS = [
  { label: "Dashboard", value: "dashboard" },
  { label: "Team", value: "team" },
  { label: "Favorites", value: "favorites" },
  { label: "Bullpen", value: "bullpen" },
  { label: "Injury Watch", value: "injuries" },
  { label: "Playoff Push", value: "playoff" },
]

function ChipRow({ options, value, onChange, renderChip }) {
  return (
    <div className="chip-row">
      {options.map(option => (
        renderChip
          ? renderChip(option, option.value === value)
          : (
            <button
              key={option.value}
              className={`chip${option.value === value ? " chip--on" : ""}`}
              onClick={() => onChange(option.value)}
            >
              {option.label}
            </button>
          )
      ))}
    </div>
  )
}

export default function Settings({
  favoriteTeam, onTeamChange, onClose, onLogout,
  timezone, onTimezoneChange, defaultTab, onDefaultTabChange, user,
}) {
  // Escape closes the dialog, matching the backdrop click.
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose() }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [onClose])

  return (
    <>
      <div className="modal-backdrop" onClick={onClose} />
      <div className="modal" role="dialog" aria-modal="true" aria-label="Settings">
        <div className="modal__head">
          <h2 style={{ fontSize: 17 }}>Settings</h2>
          <button className="btn btn--icon btn--ghost" onClick={onClose} aria-label="Close settings">✕</button>
        </div>

        <div className="field-label">Favorite team</div>
        {DIVISIONS.map(division => (
          <div key={division} style={{ marginBottom: 12 }}>
            <div className="muted" style={{ fontSize: 11, marginBottom: 6 }}>{division}</div>
            <div className="chip-row" style={{ marginBottom: 0 }}>
              {teams.filter(t => t.division === division).map(team => {
                const selected = team.id === favoriteTeam
                // Tint each chip with the team's own readable accent so the
                // picker is scannable by color, not just by abbreviation.
                const color = readableOn(team.colors.accent)
                return (
                  <button
                    key={team.id}
                    className={`chip team-chip${selected ? " chip--on" : ""}`}
                    style={{
                      "--chip-color": color,
                      ...(selected ? { background: color, borderColor: color, color: "#0a1621" } : {}),
                    }}
                    onClick={() => onTeamChange(team.id)}
                    title={team.name}
                  >
                    {team.abbreviation}
                  </button>
                )
              })}
            </div>
          </div>
        ))}

        <div style={{ height: 1, background: "var(--border)", margin: "18px 0" }} />

        <div className="field-label">Time zone</div>
        <ChipRow options={TIMEZONES} value={timezone} onChange={onTimezoneChange} />

        <div className="field-label">Start on tab</div>
        <ChipRow options={TABS} value={defaultTab} onChange={onDefaultTabChange} />

        <div style={{ height: 1, background: "var(--border)", margin: "18px 0" }} />

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <div style={{ minWidth: 0 }}>
            <div className="muted" style={{ fontSize: 11 }}>Signed in as</div>
            <div style={{ fontSize: 13, overflow: "hidden", textOverflow: "ellipsis" }}>
              {user?.email || "Not signed in"}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn" onClick={onLogout}>Log out</button>
            <button className="btn btn--accent" onClick={onClose}>Done</button>
          </div>
        </div>
      </div>
    </>
  )
}
