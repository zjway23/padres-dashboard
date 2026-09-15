// Display formatting. Stats arrive as null when a player has no line yet, so
// every formatter has to render an explicit placeholder rather than "N/A".

export const DASH = "–"

export function stat(value, fallback = DASH) {
  if (value === null || value === undefined || value === "") return fallback
  return value
}

const TZ_SHORT = [
  [/\bEDT\b|\bEST\b/g, "ET"],
  [/\bCDT\b|\bCST\b/g, "CT"],
  [/\bMDT\b|\bMST\b/g, "MT"],
  [/\bPDT\b|\bPST\b/g, "PT"],
]

export function gameTime(iso, timezone) {
  if (!iso) return ""
  try {
    const tz = timezone || Intl.DateTimeFormat().resolvedOptions().timeZone
    let out = new Date(iso).toLocaleTimeString("en-US", {
      hour: "numeric", minute: "2-digit", timeZoneName: "short", timeZone: tz,
    })
    for (const [pattern, short] of TZ_SHORT) out = out.replace(pattern, short)
    return out
  } catch { return "" }
}

export function gameDay(iso, timezone) {
  if (!iso) return ""
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      weekday: "short", month: "short", day: "numeric", timeZone: timezone || undefined,
    })
  } catch { return "" }
}

/** Format a bare YYYY-MM-DD without letting UTC parsing shift it a day. */
export function dayString(value, opts = { weekday: "short", month: "short", day: "numeric" }) {
  if (!value) return ""
  try {
    return new Date(`${value}T12:00:00`).toLocaleDateString("en-US", opts)
  } catch { return value }
}

export function relativeDay(value) {
  if (!value) return ""
  const today = new Date()
  const target = new Date(`${value}T12:00:00`)
  const days = Math.round((target - new Date(today.toDateString())) / 86400000)
  if (days === 0) return "Today"
  if (days === 1) return "Tomorrow"
  if (days === -1) return "Yesterday"
  return dayString(value)
}

/** "2 for 4 · HR, 2B · 2 RBI" - a readable box-score line. */
export function battingLine(s) {
  if (!s) return "Did not play"
  const plural = (n, label) => (n > 1 ? `${n} ${label}` : label)
  const extras = []
  if (s.hr > 0) extras.push(plural(s.hr, "HR"))
  if (s.doubles > 0) extras.push(plural(s.doubles, "2B"))
  if (s.triples > 0) extras.push(plural(s.triples, "3B"))

  const parts = [`${s.h} for ${s.ab}`]
  if (extras.length) parts.push(extras.join(", "))
  if (s.rbi > 0) parts.push(plural(s.rbi, "RBI"))
  if (s.runs > 0) parts.push(`${s.runs} R`)
  if (s.bb > 0) parts.push(plural(s.bb, "BB"))
  if (s.k > 0) parts.push(`${s.k} K`)
  if (s.sb > 0) parts.push(plural(s.sb, "SB"))
  return parts.join(" · ")
}

export function pitchingLine(s) {
  if (!s) return "Did not pitch"
  const parts = [`${s.ip} IP`, `${s.h} H`, `${s.er} ER`, `${s.bb} BB`, `${s.k} K`]
  if (s.pitches > 0) parts.push(`${s.pitches} P`)
  return parts.join(" · ")
}

/** Games back relative to a reference team: negative means ahead. */
export function gamesBack(value) {
  if (value === 0) return DASH
  const abs = Math.abs(value)
  const text = abs % 1 === 0 ? `${abs}` : abs.toFixed(1)
  return value < 0 ? `+${text}` : text
}

export function recordOf(team) {
  return `${team.wins}-${team.losses}`
}
