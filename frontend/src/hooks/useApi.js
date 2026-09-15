import { useCallback, useEffect, useRef, useState } from "react"
import { api } from "../lib/api"

/**
 * Fetch a resource, with in-flight requests cancelled when inputs change.
 *
 * `poll` re-fetches on an interval. Polling pauses while the tab is hidden so a
 * backgrounded dashboard stops hammering the API - the previous version polled
 * every five seconds forever, in every open tab.
 */
export function useApi(path, { params, enabled = true, poll = 0, keepPrevious = false } = {}) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(enabled)
  const abortRef = useRef(null)
  const key = JSON.stringify([path, params])

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!enabled || !path) return
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    if (!quiet) setLoading(true)
    try {
      const result = await api(path, { params, signal: controller.signal })
      setData(result)
      setError(null)
    } catch (err) {
      if (err.name === "AbortError") return
      setError(err)
      if (!keepPrevious) setData(null)
    } finally {
      if (!controller.signal.aborted) setLoading(false)
    }
    // `key` captures path+params; listing them directly would compare by identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled, keepPrevious])

  useEffect(() => {
    load()
    return () => abortRef.current?.abort()
  }, [load])

  useEffect(() => {
    if (!poll || !enabled) return undefined
    let timer = null
    const tick = () => {
      if (!document.hidden) load({ quiet: true })
    }
    const start = () => { timer = setInterval(tick, poll) }
    const stop = () => { if (timer) clearInterval(timer); timer = null }

    const onVisibility = () => {
      if (document.hidden) { stop() } else { load({ quiet: true }); start() }
    }
    start()
    document.addEventListener("visibilitychange", onVisibility)
    return () => { stop(); document.removeEventListener("visibilitychange", onVisibility) }
  }, [poll, enabled, load])

  return { data, error, loading, refetch: load }
}

/** Persist a value to localStorage under `key`. */
export function useStoredState(key, initial) {
  const [value, setValue] = useState(() => {
    try { return localStorage.getItem(key) ?? initial } catch { return initial }
  })
  const update = useCallback((next) => {
    setValue(next)
    try { localStorage.setItem(key, next) } catch { /* private mode */ }
  }, [key])
  return [value, update]
}
