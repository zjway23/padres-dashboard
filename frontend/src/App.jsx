import { useCallback, useEffect, useMemo, useState } from "react"
import { onAuthStateChanged, signOut } from "firebase/auth"
import { auth, firebaseReady } from "./firebase"

import Login from "./components/Login"
import Settings from "./components/Settings"
import SearchPanel from "./components/SearchPanel"
import LiveGame from "./components/LiveGame"
import Standings, { DivisionTable } from "./components/Standings"
import RosterTable from "./components/RosterTable"
import FavoritesTab from "./components/FavoritesTab"
import Bullpen from "./components/Bullpen"
import InjuryWatch from "./components/InjuryWatch"
import PlayoffPushTab from "./components/PlayoffPushTab"
import { Card, Empty, ErrorNote, Skeleton } from "./components/ui"

import { useApi, useStoredState } from "./hooks/useApi"
import { api } from "./lib/api"
import { applyTeamTheme, getTeam } from "./lib/theme"
import "./App.css"

const TABS = [
  { key: "dashboard", label: "Dashboard" },
  { key: "team", label: "Team" },
  { key: "favorites", label: "Favorites" },
  { key: "bullpen", label: "Bullpen" },
  { key: "injuries", label: "Injury Watch" },
  { key: "playoff", label: "Playoff Push" },
]

// The Playoff Push tab used to be keyed "wildcard". Saved preferences still
// carry the old value, and an unrecognised key would render an empty page.
const LEGACY_TABS = { wildcard: "playoff", roster: "team" }

function normalizeTab(value) {
  const key = LEGACY_TABS[value] || value
  return TABS.some(t => t.key === key) ? key : "dashboard"
}


// Poll hard during a live game, gently otherwise.
const POLL_LIVE = 10000
const POLL_IDLE = 120000

// Guest session. Everything driven by a team - scores, standings, roster,
// bullpen, injuries, the playoff race - works without an account. Only
// favorites and cross-device preferences need a real uid, and they read as
// empty rather than breaking, so a visitor who never signs in still gets the
// whole dashboard rather than a login screen they have to get past first. A
// build with no Firebase config starts here too, since sign-in is not on offer.
const GUEST_USER = { uid: "", displayName: "Guest", email: null, isGuest: true }

// Remembered so a reload doesn't bounce the guest back to the login screen.
const GUEST_KEY = "guestMode"

function storedGuest() {
  if (!firebaseReady) return true
  try { return localStorage.getItem(GUEST_KEY) === "1" } catch { return false }
}

export default function App() {
  // With no Firebase config there is nothing to wait for and nobody to sign in,
  // so start settled on a guest session rather than flashing a loader.
  const [authUser, setAuthUser] = useState(null)
  const [guest, setGuest] = useState(storedGuest)
  // A returning guest is known to be signed out, so there is no listener to
  // wait on before rendering - only a first-time visitor sees the loader.
  const [authLoading, setAuthLoading] = useState(firebaseReady && !storedGuest())

  // A real account always wins over the guest session it was started from.
  const user = authUser || (guest ? GUEST_USER : null)
  const isGuest = Boolean(user?.isGuest)

  const [favoriteTeam, setFavoriteTeam] = useStoredState("favoriteTeam", "padres")
  const [timezone, setTimezone] = useStoredState("timezone", "America/Los_Angeles")
  const [defaultTab, setDefaultTab] = useStoredState("defaultTab", "dashboard")
  const [activeTab, setActiveTab] = useState(() => normalizeTab(defaultTab))
  const [settingsOpen, setSettingsOpen] = useState(false)

  const team = getTeam(favoriteTeam)

  useEffect(() => { applyTeamTheme(favoriteTeam) }, [favoriteTeam])

  // ── Auth & stored preferences ──────────────────────────────────────────────
  useEffect(() => {
    if (!firebaseReady) return undefined
    return onAuthStateChanged(auth, async (firebaseUser) => {
      setAuthUser(firebaseUser)
      if (firebaseUser) {
        // Signing in supersedes guest mode, so the flag shouldn't outlive it.
        setGuest(false)
        try { localStorage.removeItem(GUEST_KEY) } catch { /* private mode */ }
        try {
          const prefs = await api("/api/preferences", { params: { uid: firebaseUser.uid } })
          if (prefs.favorite_team) setFavoriteTeam(prefs.favorite_team)
          if (prefs.timezone) setTimezone(prefs.timezone)
          if (prefs.default_tab) {
            const tab = normalizeTab(prefs.default_tab)
            setDefaultTab(tab)
            setActiveTab(tab)
          }
        } catch {
          // Preferences are a convenience; local values already cover this session.
        }
      }
      setAuthLoading(false)
    })
  }, [setFavoriteTeam, setTimezone, setDefaultTab])

  // Guests have no uid to save against; their choices stay in this browser.
  const savePreference = useCallback((patch) => {
    if (!user || user.isGuest) return
    api("/api/preferences", { method: "POST", body: { uid: user.uid, ...patch } })
      .catch(() => { /* stored locally regardless */ })
  }, [user])

  // ── Data ───────────────────────────────────────────────────────────────────
  const dashboard = useApi("/api/dashboard", {
    params: { team: favoriteTeam },
    keepPrevious: true,
  })

  const isLive = Boolean(dashboard.data?.live?.is_live)

  // A separate lightweight poll keeps the score fresh without refetching
  // standings and schedules every ten seconds.
  const liveFeed = useApi("/api/live", {
    params: { team: favoriteTeam },
    poll: isLive ? POLL_LIVE : POLL_IDLE,
    keepPrevious: true,
  })

  const roster = useApi("/api/roster", {
    params: { team: favoriteTeam, uid: user?.uid },
    enabled: Boolean(user),
    keepPrevious: true,
  })

  const favorites = useApi("/api/favorites", {
    params: { uid: user?.uid },
    enabled: Boolean(user) && !isGuest,
    keepPrevious: true,
  })

  const live = liveFeed.data ?? dashboard.data?.live
  const favoriteIds = useMemo(
    () => new Set((favorites.data || []).map(f => f.player_id)),
    [favorites.data])

  // ── Actions ────────────────────────────────────────────────────────────────
  const handleTeamChange = (teamId) => {
    setFavoriteTeam(teamId)
    savePreference({ favorite_team: teamId })
    setSettingsOpen(false)
  }

  const continueAsGuest = useCallback(() => {
    try { localStorage.setItem(GUEST_KEY, "1") } catch { /* private mode */ }
    setGuest(true)
  }, [])

  // Leaving guest mode drops back to the login screen. With no Firebase config
  // there is nothing to drop back to, so the option isn't offered in that build.
  const leaveGuest = useCallback(() => {
    try { localStorage.removeItem(GUEST_KEY) } catch { /* private mode */ }
    setGuest(false)
  }, [])

  const handleLogout = useCallback(() => {
    setSettingsOpen(false)
    leaveGuest()
    if (firebaseReady && auth.currentUser) signOut(auth)
  }, [leaveGuest])

  const toggleFavorite = useCallback(async (player) => {
    if (!user || user.isGuest) return
    await api("/api/favorites", {
      method: "POST",
      body: {
        uid: user.uid,
        player_id: player.player_id,
        name: player.name,
        position: player.position,
        team: player.team,
      },
    })
    // Refetch both so the star state and the favorites list stay in step.
    favorites.refetch()
    roster.refetch({ quiet: true })
  }, [user, favorites, roster])

  // ── Render ─────────────────────────────────────────────────────────────────
  if (authLoading) {
    return (
      <div className="center-screen">
        <p className="muted">Loading…</p>
      </div>
    )
  }

  if (!user) return <Login onContinueAsGuest={continueAsGuest} />

  const record = dashboard.data?.division?.teams?.find(t => t.team_id === team.teamId)

  return (
    <div className="app">
      <header className="app-header">
        <span className="app-header__mark">{team.abbreviation}</span>
        <span className="app-header__title">{team.shortName}</span>
        {record && (
          <span className="app-header__record">
            {record.wins}-{record.losses}
            {record.gb && record.gb !== "-" ? ` · ${record.gb} GB` : ""}
          </span>
        )}
        <span className="app-header__spacer" />
        <SearchPanel
          isFavorite={id => favoriteIds.has(id)}
          onToggleFavorite={isGuest ? null : toggleFavorite}
        />
        <button
          className="btn btn--icon"
          onClick={() => setSettingsOpen(true)}
          aria-label="Settings"
          title="Settings"
        >
          ⚙
        </button>
      </header>

      {settingsOpen && (
        <Settings
          user={user}
          isGuest={isGuest}
          canSignIn={firebaseReady}
          favoriteTeam={favoriteTeam}
          onTeamChange={handleTeamChange}
          onClose={() => setSettingsOpen(false)}
          onLogout={handleLogout}
          timezone={timezone}
          onTimezoneChange={(tz) => { setTimezone(tz); savePreference({ timezone: tz }) }}
          defaultTab={defaultTab}
          onDefaultTabChange={(tab) => { setDefaultTab(tab); savePreference({ default_tab: tab }) }}
        />
      )}

      {isGuest && (
        <div className={`config-note${firebaseReady ? " config-note--info" : ""}`}>
          <span aria-hidden="true">●</span>
          <span>
            Browsing as a guest — scores, standings, roster, bullpen, injuries and
            the playoff race all work. Your team, time zone and start tab are kept
            in this browser only.{" "}
            {firebaseReady
              ? "Sign in to save favorites and carry your preferences between devices."
              : <>Sign-in is off in this build; add <code>frontend/.env.local</code> to enable it.</>}
          </span>
          {firebaseReady && (
            <button className="btn config-note__action" onClick={leaveGuest}>Sign in</button>
          )}
        </div>
      )}

      <nav className="tabs" aria-label="Sections">
        {TABS.map(tab => (
          <button
            key={tab.key}
            className={`tab${activeTab === tab.key ? " tab--active" : ""}`}
            onClick={() => setActiveTab(tab.key)}
            aria-current={activeTab === tab.key}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {dashboard.error && (
        <div style={{ marginBottom: 16 }}>
          <ErrorNote error={dashboard.error} onRetry={dashboard.refetch} />
        </div>
      )}

      {activeTab === "dashboard" && (
        <div className="grid grid--dash">
          <LiveGame
            live={live}
            previous={dashboard.data?.previous}
            next={dashboard.data?.next}
            favoriteTeamId={team.teamId}
            timezone={timezone}
            loading={dashboard.loading && !dashboard.data}
          />
          <Standings
            division={dashboard.data?.division}
            playoff={dashboard.data?.playoff}
            favoriteTeamId={team.teamId}
            loading={dashboard.loading && !dashboard.data}
          />
        </div>
      )}

      {activeTab === "team" && (
        <div style={{ display: "grid", gap: 16 }}>
          <RosterTable
            batters={roster.data?.batters || []}
            pitchers={roster.data?.pitchers || []}
            loading={roster.loading && !roster.data}
            onToggleFavorite={isGuest ? null : toggleFavorite}
            season={dashboard.data?.season || ""}
          />
          <Card title={`${team.division} standings`}>
            <DivisionTable
              data={dashboard.data?.division}
              favoriteTeamId={team.teamId}
              loading={dashboard.loading && !dashboard.data}
            />
          </Card>
        </div>
      )}

      {activeTab === "favorites" && (isGuest ? (
        <GuestFavorites onSignIn={firebaseReady ? leaveGuest : null} />
      ) : (
        <FavoritesTab
          favorites={favorites.data || []}
          loading={favorites.loading && !favorites.data}
          onToggleFavorite={toggleFavorite}
          timezone={timezone}
        />
      ))}

      {activeTab === "bullpen" && (
        <Bullpen team={favoriteTeam} teamName={team.shortName} />
      )}

      {activeTab === "injuries" && (
        <InjuryWatch team={favoriteTeam} teamName={team.shortName} />
      )}

      {activeTab === "playoff" && (
        <PlayoffPushTab
          playoff={dashboard.data?.playoff}
          division={dashboard.data?.division}
          favoriteTeamId={team.teamId}
          favoriteTeam={favoriteTeam}
          loading={dashboard.loading && !dashboard.data}
        />
      )}
    </div>
  )
}

// Favorites hang off a uid, so there is nothing for a guest to show here.
// Saying why beats an empty list that looks broken.
function GuestFavorites({ onSignIn }) {
  return (
    <Card title="Favorites">
      <Empty>
        Following players needs an account — favorites are saved against your
        sign-in, not this browser.
      </Empty>
      {onSignIn && (
        <div style={{ display: "flex", justifyContent: "center", paddingBottom: 26 }}>
          <button className="btn btn--accent" onClick={onSignIn}>Sign in with Google</button>
        </div>
      )}
    </Card>
  )
}
