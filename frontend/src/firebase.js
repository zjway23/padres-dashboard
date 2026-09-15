import { initializeApp } from "firebase/app"
import { getAuth, GoogleAuthProvider } from "firebase/auth"

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
}

/**
 * Whether sign-in is even possible in this build.
 *
 * Without `frontend/.env.local` every VITE_FIREBASE_* value is undefined, and
 * `getAuth()` then throws `auth/invalid-api-key` at module scope. That kills the
 * import before React mounts, so the entire app renders as a blank page with no
 * console breadcrumb worth the name. Checking first lets `App` fall back to a
 * signed-out session instead, which keeps every team-level view usable.
 */
export const firebaseReady = Boolean(firebaseConfig.apiKey)

const app = firebaseReady ? initializeApp(firebaseConfig) : null

export const auth = firebaseReady ? getAuth(app) : null
export const googleProvider = firebaseReady ? new GoogleAuthProvider() : null
