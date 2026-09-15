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
import { Card, ErrorNote, Skeleton } from "./components/ui"

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

// Stand-in session for a build with no Firebase config. Everything driven by a
// team - scores, standings, roster, bullpen, injuries, the playoff race - works
// without an account. Only favorites and saved preferences need a real uid, and
// they read as empty rather than breaking, so an unconfigured checkout is worth
// far more as a working dashboard than as a login screen nobody can get past.
const SIGNED_OUT_USER = { uid: "", displayName: "Local", email: null }

export default function App() {
  // With no Firebase config there is nothing to wait for and nobody to sign in,
  // so start settled on the stand-in session rather than flashing a loader.
  const [user, setUser] = useState(firebaseReady ? null : SIGNED_OUT_USER)
  const [authLoading, setAuthLoading] = useState(firebaseReady)

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
      setUser(firebaseUser)
      if (firebaseUser) {
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

  const savePreference = useCallback((patch) => {
    if (!user) return
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
    enabled: Boolean(user),
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

  const toggleFavorite = useCallback(async (player) => {
    if (!user) return
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

  if (!user) return <Login />

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
          onToggleFavorite={toggleFavorite}
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
          favoriteTeam={favoriteTeam}
          onTeamChange={handleTeamChange}
          onClose={() => setSettingsOpen(false)}
          onLogout={() => firebaseReady && signOut(auth)}
          timezone={timezone}
          onTimezoneChange={(tz) => { setTimezone(tz); savePreference({ timezone: tz }) }}
          defaultTab={defaultTab}
          onDefaultTabChange={(tab) => { setDefaultTab(tab); savePreference({ default_tab: tab }) }}
        />
      )}

      {!firebaseReady && (
        <div className="config-note">
          <span aria-hidden="true">●</span>
          <span>
            Running signed out — no Firebase config found. Scores, standings, roster,
            bullpen, injuries and the playoff race all work; favorites and saved
            preferences need an account. Add <code>frontend/.env.local</code> to
            enable sign-in.
          </span>
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
            onToggleFavorite={toggleFavorite}
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

      {activeTab === "favorites" && (
        <FavoritesTab
          favorites={favorites.data || []}
          loading={favorites.loading && !favorites.data}
          onToggleFavorite={toggleFavorite}
          timezone={timezone}
        />
      )}

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
