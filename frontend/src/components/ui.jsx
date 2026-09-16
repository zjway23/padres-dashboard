// Shared presentational primitives. These exist so the rest of the app can stop
// re-declaring the same inline style objects in every component.

export function Card({ title, action, children, className = "", ...rest }) {
  return (
    <section className={`card ${className}`} {...rest}>
      {(title || action) && (
        <div className="card__header">
          {title && <h2 className="section-title">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  )
}

export function StatTile({ label, value, hero = false, title }) {
  return (
    <div className={`stat-tile${hero ? " stat-tile--hero" : ""}`} title={title}>
      <div className="stat-tile__label">{label}</div>
      <div className="stat-tile__value">{value}</div>
    </div>
  )
}

export function Pill({ label, value, title }) {
  return (
    <span className="pill" title={title}>
      <span className="pill__label">{label}</span>
      <span className="pill__value">{value}</span>
    </span>
  )
}

const STATUS_META = {
  available: { icon: "●", label: "Available" },
  caution: { icon: "▲", label: "Caution" },
  unavailable: { icon: "■", label: "Unavailable" },
}

/**
 * Availability badge. The icon and text carry the meaning; color only
 * reinforces it, so the state survives colorblindness and greyscale printing.
 */
export function StatusBadge({ status }) {
  const meta = STATUS_META[status] || STATUS_META.available
  return (
    <span className={`status status--${status}`}>
      <span className="status__icon" aria-hidden="true">{meta.icon}</span>
      {meta.label}
    </span>
  )
}

export function Badge({ children, variant, className = "" }) {
  const suffix = variant ? ` badge--${variant}` : ""
  return <span className={`badge${suffix} ${className}`}>{children}</span>
}

export function Skeleton({ rows = 4, height }) {
  return (
    <div aria-busy="true" aria-live="polite">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton skeleton-row" style={height ? { height } : undefined} />
      ))}
    </div>
  )
}

export function Empty({ children }) {
  return <div className="empty">{children}</div>
}

export function ErrorNote({ error, onRetry }) {
  if (!error) return null
  return (
    <div className="error-note">
      <span aria-hidden="true">⚠</span>
      <span style={{ flex: 1 }}>{error.message || "Something went wrong."}</span>
      {onRetry && <button className="btn btn--ghost" onClick={() => onRetry()}>Retry</button>}
    </div>
  )
}

export function StarButton({ active, onClick, label }) {
  // Guests have nowhere to save a favorite, so they get no star rather than a
  // button that quietly does nothing.
  if (!onClick) return null
  return (
    <button
      className={`star${active ? " star--on" : ""}`}
      onClick={onClick}
      aria-pressed={active}
      aria-label={`${active ? "Remove" : "Add"} ${label} ${active ? "from" : "to"} favorites`}
      title={active ? "Remove from favorites" : "Add to favorites"}
    >
      {active ? "★" : "☆"}
    </button>
  )
}

export function Outs({ count = 0 }) {
  return (
    <span className="outs" aria-label={`${count} out${count === 1 ? "" : "s"}`}>
      {[0, 1, 2].map(i => (
        <span key={i} className={`out-dot${i < count ? " out-dot--on" : ""}`} />
      ))}
    </span>
  )
}

export function Diamond({ first, second, third }) {
  const bases = [
    ["second", second], ["third", third], ["first", first],
  ]
  const occupied = bases.filter(([, on]) => on).map(([name]) => name)
  return (
    <div
      className="diamond"
      role="img"
      aria-label={occupied.length ? `Runners on ${occupied.join(", ")}` : "Bases empty"}
    >
      {bases.map(([name, on]) => (
        <span key={name} className={`diamond__base diamond__base--${name}${on ? " diamond__base--on" : ""}`} />
      ))}
    </div>
  )
}
