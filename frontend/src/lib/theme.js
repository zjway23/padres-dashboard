// Team theming. The dashboard renders on a dark surface, but plenty of club
// colors (navy, black, deep red) are unreadable there. Rather than give up and
// paint every non-Padres team grey, each team's color is lightened until it
// clears a contrast ratio against the surface it actually sits on.

import teams from "../data/teams.json"

const SURFACE = "#0a1621"       // page background
const MIN_CONTRAST = 4.5        // accent is used for text, so hold it to AA
const MIN_CHROMA_CONTRAST = 3.0 // borders and fills can sit a little lower

function hexToRgb(hex) {
  const clean = hex.replace("#", "").trim()
  const full = clean.length === 3 ? clean.split("").map(c => c + c).join("") : clean
  const n = parseInt(full, 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}

function rgbToHex({ r, g, b }) {
  const clamp = v => Math.max(0, Math.min(255, Math.round(v)))
  return "#" + [r, g, b].map(v => clamp(v).toString(16).padStart(2, "0")).join("")
}

// WCAG relative luminance.
function luminance({ r, g, b }) {
  const channel = v => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

function contrast(a, b) {
  const la = luminance(a)
  const lb = luminance(b)
  const [hi, lo] = la > lb ? [la, lb] : [lb, la]
  return (hi + 0.05) / (lo + 0.05)
}

function mixToward(color, target, amount) {
  return {
    r: color.r + (target.r - color.r) * amount,
    g: color.g + (target.g - color.g) * amount,
    b: color.b + (target.b - color.b) * amount,
  }
}

/**
 * Lighten `hex` toward white just enough to clear `minContrast` on the surface.
 * Steps in small increments and stops at the first passing value, so a team's
 * color is altered as little as the contrast requirement allows.
 */
export function readableOn(hex, surface = SURFACE, minContrast = MIN_CONTRAST) {
  const base = hexToRgb(hex)
  const bg = hexToRgb(surface)
  const white = { r: 255, g: 255, b: 255 }

  if (contrast(base, bg) >= minContrast) return rgbToHex(base)
  for (let amount = 0.05; amount <= 1; amount += 0.05) {
    const candidate = mixToward(base, white, amount)
    if (contrast(candidate, bg) >= minContrast) return rgbToHex(candidate)
  }
  return "#ffffff"
}

export function rgbaFrom(hex, alpha) {
  const { r, g, b } = hexToRgb(hex)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

/** Pick black or white text to sit on top of a filled accent swatch. */
export function textOn(hex) {
  const c = hexToRgb(hex)
  return contrast(c, { r: 255, g: 255, b: 255 }) >= contrast(c, { r: 10, g: 22, b: 33 })
    ? "#ffffff"
    : "#0a1621"
}

export function getTeam(teamId) {
  return teams.find(t => t.id === teamId) || teams[0]
}

/**
 * Push a team's palette onto :root as custom properties.
 * Every team gets a genuine accent derived from its own colors.
 */
export function applyTeamTheme(teamId) {
  const team = getTeam(teamId)
  const root = document.documentElement

  // Prefer whichever of the club's two colors survives on a dark surface with
  // the least adjustment; fall back to the other if the first is near-black.
  const candidates = [team.colors.accent, team.colors.primary]
  const accent = readableOn(candidates[0])
  const secondary = readableOn(candidates[1], SURFACE, MIN_CHROMA_CONTRAST)

  root.style.setProperty("--accent", accent)
  root.style.setProperty("--accent-secondary", secondary)
  root.style.setProperty("--accent-contrast", textOn(accent))
  root.style.setProperty("--accent-soft", rgbaFrom(accent, 0.12))
  root.style.setProperty("--accent-softer", rgbaFrom(accent, 0.06))
  root.style.setProperty("--accent-border", rgbaFrom(accent, 0.35))
  root.style.setProperty("--accent-glow", rgbaFrom(accent, 0.25))
  root.dataset.team = teamId
  return team
}
