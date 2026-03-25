import { signInWithPopup } from "firebase/auth"
import { auth, googleProvider } from "../firebase"

function Login() {
  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider)
    } catch (err) {
      console.error("Login error:", err)
    }
  }

  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      background: "#0a1929"
    }}>
      <h1 style={{ color: "#ffc425", fontSize: 32, marginBottom: 8 }}>Padres Dashboard</h1>
      <p style={{ color: "#aaa", marginBottom: 32 }}>Sign in to access your dashboard</p>
      <button
        onClick={handleLogin}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          background: "white",
          color: "#333",
          border: "none",
          borderRadius: 8,
          padding: "12px 24px",
          fontSize: 15,
          fontWeight: "bold",
          cursor: "pointer"
        }}
      >
        <img src="https://www.google.com/favicon.ico" width={20} height={20} />
        Sign in with Google
      </button>
    </div>
  )
}

export default Login