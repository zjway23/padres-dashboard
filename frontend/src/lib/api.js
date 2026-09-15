// Small fetch wrapper: one place for the base URL, aborts, and error shape.

const BASE = import.meta.env.VITE_API_URL || "http://localhost:5001"

export class ApiError extends Error {
  constructor(message, status) {
    super(message)
    this.name = "ApiError"
    this.status = status
  }
}

function toQuery(params = {}) {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") search.set(key, value)
  }
  const s = search.toString()
  return s ? `?${s}` : ""
}

export async function api(path, { params, signal, method = "GET", body } = {}) {
  const response = await fetch(`${BASE}${path}${toQuery(params)}`, {
    method,
    signal,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })

  if (!response.ok) {
    let message = `Request failed (${response.status})`
    try {
      const payload = await response.json()
      if (payload?.message) message = payload.message
    } catch { /* response had no JSON body */ }
    throw new ApiError(message, response.status)
  }
  return response.json()
}

export const API_BASE = BASE
