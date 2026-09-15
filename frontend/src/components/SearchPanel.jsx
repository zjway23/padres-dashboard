import { useEffect, useRef, useState } from "react"
import { api } from "../lib/api"
import { Skeleton, StarButton } from "./ui"
import { stat } from "../lib/format"

/** Global player search. Debounced so typing doesn't fire a request per key. */
export default function SearchPanel({ isFavorite, onToggleFavorite }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const containerRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    const onClickOutside = (e) => {
      if (!containerRef.current?.contains(e.target)) setOpen(false)
    }
    const onKey = (e) => { if (e.key === "Escape") setOpen(false) }
    document.addEventListener("mousedown", onClickOutside)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onClickOutside)
      document.removeEventListener("keydown", onKey)
    }
  }, [open])

  const term = query.trim()
  const canSearch = term.length >= 3

  useEffect(() => {
    if (!canSearch) return undefined
    const controller = new AbortController()
    // Debounced so a request fires once the user pauses, not on every keystroke.
    const timer = setTimeout(() => {
      setLoading(true)
      api("/api/search", { params: { name: term }, signal: controller.signal })
        .then(data => { setResults(data); setLoading(false) })
        .catch(err => { if (err.name !== "AbortError") setLoading(false) })
    }, 280)
    return () => { clearTimeout(timer); controller.abort() }
  }, [term, canSearch])

  return (
    <div className="search" ref={containerRef}>
      <button
        className="btn btn--icon"
        onClick={() => { setOpen(o => !o); setQuery(""); setResults([]) }}
        aria-label="Search players"
        aria-expanded={open}
        title="Search players"
      >
        🔍
      </button>

      {open && (
        <div className="search__panel">
          <input
            className="search__input"
            autoFocus
            type="search"
            value={query}
            onChange={e => { setQuery(e.target.value); setResults([]) }}
            placeholder="Search any MLB player…"
            aria-label="Player name"
          />

          <div style={{ marginTop: 10 }}>
            {!canSearch && (
              <p className="muted" style={{ fontSize: 12.5 }}>Type at least 3 characters.</p>
            )}
            {canSearch && loading && <Skeleton rows={2} height={28} />}
            {canSearch && !loading && results.length === 0 && (
              <p className="muted" style={{ fontSize: 12.5 }}>No players found.</p>
            )}
            {canSearch && !loading && results.map(player => (
              <div className="search__result" key={player.player_id}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600 }}>{player.name}</div>
                  <div className="muted" style={{ fontSize: 11.5 }}>
                    {player.position} · {player.team}
                    {player.group === "pitching"
                      ? ` · ${stat(player.era)} ERA`
                      : ` · ${stat(player.avg)} AVG`}
                  </div>
                </div>
                <StarButton
                  active={isFavorite(player.player_id)}
                  label={player.name}
                  onClick={() => onToggleFavorite(player)}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
