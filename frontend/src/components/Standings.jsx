function Standings({ teams, nlPlayoff }) {
  return (
    <div className="standings-section">
      <h2>NL West Standings</h2>
      <div className="standings-table-wrapper">
        <table>
          <thead>
            <tr>
              <th>Team</th>
              <th>W</th>
              <th>L</th>
              <th>PCT</th>
              <th>GB</th>
              <th>L10</th>
            </tr>
          </thead>
          <tbody>
            {teams.map((t, i) => (
              <tr key={i} className={t.name.includes("Padres") ? "padres-row" : ""}>
                <td>{t.name}</td>
                <td>{t.wins}</td>
                <td>{t.losses}</td>
                <td>{t.pct}</td>
                <td>{t.gb}</td>
                <td>{t.l10}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {nlPlayoff && nlPlayoff.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <h2 style={{ color: "#ffc425", marginBottom: 12, fontSize: "1.1rem", textAlign: "center" }}>
            NL Playoff Picture
          </h2>
          <div style={{ border: "3.2px solid #ffc425", borderRadius: 10, overflow: "hidden" }}>
            {(() => {
              const divLeaders = nlPlayoff.filter(t => t.category === "division")
              const wildCards = nlPlayoff.filter(t => t.category === "wildcard")
              const eliminated = nlPlayoff.filter(t => t.category === "eliminated")

              const Divider = ({ label }) => (
                <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 8px", background: "#0d1f2d" }}>
                  <div style={{ flex: 1, height: 1, background: "#ffc425", opacity: 0.3 }} />
                  <span style={{ color: "#ffc425", fontSize: 9, fontWeight: "bold", opacity: 0.8 }}>{label}</span>
                  <div style={{ flex: 1, height: 1, background: "#ffc425", opacity: 0.3 }} />
                </div>
              )

              return (
                <table style={{ width: "100%", borderCollapse: "collapse", background: "#1a3a4a" }}>
                  <thead>
                    <tr>
                      <th style={{ background: "#ffc425", color: "#0d1f2d", padding: "10px 8px", textAlign: "left", fontSize: 13, width: 30 }}></th>
                      <th style={{ background: "#ffc425", color: "#0d1f2d", padding: "10px 8px", textAlign: "left", fontSize: 13 }}>Team</th>
                      <th style={{ background: "#ffc425", color: "#0d1f2d", padding: "10px 8px", textAlign: "left", fontSize: 13 }}>Div</th>
                      <th style={{ background: "#ffc425", color: "#0d1f2d", padding: "10px 8px", textAlign: "center", fontSize: 13 }}>W</th>
                      <th style={{ background: "#ffc425", color: "#0d1f2d", padding: "10px 8px", textAlign: "center", fontSize: 13 }}>L</th>
                      <th style={{ background: "#ffc425", color: "#0d1f2d", padding: "10px 8px", textAlign: "center", fontSize: 13 }}>PCT</th>
                      <th style={{ background: "#ffc425", color: "#0d1f2d", padding: "10px 8px", textAlign: "center", fontSize: 13 }}>GB</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr><td colSpan={7} style={{ padding: 0 }}><Divider label="DIVISION LEADERS" /></td></tr>
                    {divLeaders.map((t, i) => (
                      <tr key={i} style={{ background: t.name.includes("Padres") ? "rgba(255,196,37,0.08)" : "transparent" }}>
                        <td style={{ padding: "10px 8px", borderBottom: "1px solid #0d1f2d" }}>
                          <span style={{
                            background: "#ffc425", color: "#0d1f2d",
                            borderRadius: 4, fontSize: 10, fontWeight: "bold",
                            width: 18, height: 18, display: "flex", alignItems: "center", justifyContent: "center"
                          }}>{t.seed}</span>
                        </td>
                        <td style={{ padding: "10px 8px", borderBottom: "1px solid #0d1f2d", fontSize: 13, color: t.name.includes("Padres") ? "#ffc425" : "white", fontWeight: t.name.includes("Padres") ? "bold" : "normal" }}>{t.name}</td>
                        <td style={{ padding: "10px 8px", borderBottom: "1px solid #0d1f2d", fontSize: 12, color: "#aaa" }}>{t.division.replace("National League ", "")}</td>
                        <td style={{ padding: "10px 8px", borderBottom: "1px solid #0d1f2d", fontSize: 13, textAlign: "center" }}>{t.wins}</td>
                        <td style={{ padding: "10px 8px", borderBottom: "1px solid #0d1f2d", fontSize: 13, textAlign: "center" }}>{t.losses}</td>
                        <td style={{ padding: "10px 8px", borderBottom: "1px solid #0d1f2d", fontSize: 13, textAlign: "center", color: "#aaa" }}>{t.pct}</td>
                        <td style={{ padding: "10px 8px", borderBottom: "1px solid #0d1f2d", fontSize: 13, textAlign: "center", color: "#aaa" }}>{t.gb}</td>
                      </tr>
                    ))}
                    <tr><td colSpan={7} style={{ padding: 0 }}><Divider label="WILD CARD" /></td></tr>
                    {wildCards.map((t, i) => (
                      <tr key={i} style={{ background: t.name.includes("Padres") ? "rgba(255,196,37,0.08)" : "transparent" }}>
                        <td style={{ padding: "10px 8px", borderBottom: "1px solid #0d1f2d" }}>
                          <span style={{
                            background: "#1f4a5e", color: "#ffc425",
                            borderRadius: 4, fontSize: 10, fontWeight: "bold",
                            width: 18, height: 18, display: "flex", alignItems: "center", justifyContent: "center"
                          }}>{t.seed}</span>
                        </td>
                        <td style={{ padding: "10px 8px", borderBottom: "1px solid #0d1f2d", fontSize: 13, color: t.name.includes("Padres") ? "#ffc425" : "white", fontWeight: t.name.includes("Padres") ? "bold" : "normal" }}>{t.name}</td>
                        <td style={{ padding: "10px 8px", borderBottom: "1px solid #0d1f2d", fontSize: 12, color: "#aaa" }}>{t.division.replace("National League ", "")}</td>
                        <td style={{ padding: "10px 8px", borderBottom: "1px solid #0d1f2d", fontSize: 13, textAlign: "center" }}>{t.wins}</td>
                        <td style={{ padding: "10px 8px", borderBottom: "1px solid #0d1f2d", fontSize: 13, textAlign: "center" }}>{t.losses}</td>
                        <td style={{ padding: "10px 8px", borderBottom: "1px solid #0d1f2d", fontSize: 13, textAlign: "center", color: "#aaa" }}>{t.pct}</td>
                        <td style={{ padding: "10px 8px", borderBottom: "1px solid #0d1f2d", fontSize: 13, textAlign: "center", color: "#aaa" }}>{t.gb}</td>
                      </tr>
                    ))}
                    <tr><td colSpan={7} style={{ padding: 0 }}><Divider label="OUT OF PLAYOFFS" /></td></tr>
                    {eliminated.map((t, i) => (
                      <tr key={i} style={{ background: t.name.includes("Padres") ? "rgba(255,196,37,0.08)" : "transparent" }}>
                        <td style={{ padding: "10px 8px", borderBottom: "1px solid #0d1f2d" }}>
                          <span style={{ width: 18, display: "inline-block" }} />
                        </td>
                        <td style={{ padding: "10px 8px", borderBottom: "1px solid #0d1f2d", fontSize: 13, color: t.name.includes("Padres") ? "#ffc425" : "white", fontWeight: t.name.includes("Padres") ? "bold" : "normal" }}>{t.name}</td>
                        <td style={{ padding: "10px 8px", borderBottom: "1px solid #0d1f2d", fontSize: 12, color: "#aaa" }}>{t.division.replace("National League ", "")}</td>
                        <td style={{ padding: "10px 8px", borderBottom: "1px solid #0d1f2d", fontSize: 13, textAlign: "center" }}>{t.wins}</td>
                        <td style={{ padding: "10px 8px", borderBottom: "1px solid #0d1f2d", fontSize: 13, textAlign: "center" }}>{t.losses}</td>
                        <td style={{ padding: "10px 8px", borderBottom: "1px solid #0d1f2d", fontSize: 13, textAlign: "center", color: "#aaa" }}>{t.pct}</td>
                        <td style={{ padding: "10px 8px", borderBottom: "1px solid #0d1f2d", fontSize: 13, textAlign: "center", color: "#aaa" }}>{t.gb}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
            })()}
          </div>
        </div>
      )}
    </div>
  )
}

export default Standings