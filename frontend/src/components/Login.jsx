import { useState } from "react"
import { signInWithPopup } from "firebase/auth"
import { auth, googleProvider } from "../firebase"

export default function Login({ onContinueAsGuest }) {
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  const handleLogin = async () => {
    setBusy(true)
    setError(null)
    try {
      await signInWithPopup(auth, googleProvider)
    } catch (err) {
      // Closing the popup is a normal user action, not an error worth showing.
      if (err.code !== "auth/popup-closed-by-user") {
        setError(err.message || "Sign-in failed. Please try again.")
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="center-screen">
      <div style={{ maxWidth: 380 }}>
        <div className="app-header__mark" style={{ margin: "0 auto 18px", width: 46, height: 46, fontSize: 18 }}>
          ⚾
        </div>
        <h1 style={{ fontSize: 27, marginBottom: 8 }}>Ballpark</h1>
        <p className="muted" style={{ marginBottom: 28 }}>
          Live scores, standings, bullpen status and player tracking for all 30 clubs.
        </p>

        <button className="btn btn--accent" onClick={handleLogin} disabled={busy}
                style={{ padding: "11px 22px", fontSize: 14.5 }}>
          {busy ? "Signing in…" : "Sign in with Google"}
        </button>

        {/* An account only buys favorites and synced preferences. Everything
            else works without one, so it shouldn't be a wall on the way in. */}
        <div style={{ marginTop: 16 }}>
          <button className="btn btn--ghost" onClick={onContinueAsGuest} disabled={busy}>
            Continue as guest
          </button>
          <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
            Full dashboard for any club — no favorites, and preferences stay in
            this browser.
          </p>
        </div>

        {error && (
          <div className="error-note" style={{ marginTop: 18, textAlign: "left" }}>
            <span aria-hidden="true">⚠</span>
            <span>{error}</span>
          </div>
        )}
      </div>
    </div>
  )
}
