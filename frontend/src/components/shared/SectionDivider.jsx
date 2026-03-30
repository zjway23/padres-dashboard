function SectionDivider({ label, standalone = false }) {
  return (
    <div className={`section-divider${standalone ? " section-divider--standalone" : ""}`}>
      <div className="section-divider-line" />
      <span className="section-divider-label">{label}</span>
      <div className="section-divider-line" />
    </div>
  )
}

export default SectionDivider
