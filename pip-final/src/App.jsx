import { useEffect, useState } from 'react'
import Navbar from './components/Navbar.jsx'
import Hero from './components/Hero.jsx'
import HealthImportance from './components/HealthImportance.jsx'
import Dashboard from './components/Dashboard.jsx'
import About from './components/About.jsx'
import Footer from './components/Footer.jsx'
import FloatingCheckWindow from './components/FloatingCheckWindow.jsx'
import ProfileSettings from './components/ProfileSettings.jsx'
import ChatWidget from './components/ChatWidget.jsx'
import LoginWindow from './components/LoginWindow.jsx'
import HealthVault from './components/HealthVault.jsx'
import PrescriptionSection from './components/PrescriptionSection.jsx'
import { watchUser, logOut } from './utils/auth.js'
import { loadState, saveState, clearState } from './utils/storage.js'
import { saveCheckInToCloud, loadHistoryFromCloud, clearCloudHistory, mergeHistory } from './utils/cloudHistory.js'
import useReminderAlerts from './utils/useReminderAlerts.js'

function defaultState() {
  return { profile: null, history: [] }
}

export default function App() {
  const [user, setUser] = useState(null)
  const [authChecked, setAuthChecked] = useState(false)

  const [state, setState] = useState(defaultState())
  const [checkWindow, setCheckWindow] = useState(null) // null | 'check' | 'history'
  const [showProfile, setShowProfile] = useState(false)
  const [showLogin, setShowLogin] = useState(false)
  const [loginMode, setLoginMode] = useState('login') // which tab LoginWindow opens on: 'login' | 'signup'
  const [logoutBanner, setLogoutBanner] = useState(false)
  const [pendingAction, setPendingAction] = useState(null) // 'check' | 'profile' | 'history'
  const [welcomeBanner, setWelcomeBanner] = useState(false)
  const [showVault, setShowVault] = useState(false)
  const { due: dueReminders, dismiss: dismissReminder } = useReminderAlerts(user)

  // Listen for Firebase auth state on mount
  useEffect(() => {
    const unsubscribe = watchUser((firebaseUser) => {
      setUser(firebaseUser)
      setAuthChecked(true)
    })
    return unsubscribe
  }, [])

  // Load this user's saved profile/history whenever they log in or out
  useEffect(() => {
    if (user) {
      const local = loadState(user.uid) || defaultState()
      if (!Array.isArray(local.history)) local.history = []
      setState(local)
      // Merge in check-ins saved in Firebase (and push any local-only ones up)
      let cancelled = false
      loadHistoryFromCloud(user.uid).then((cloud) => {
        if (cancelled) return
        const cloudIds = new Set(cloud.map((e) => e.id))
        local.history.filter((e) => !cloudIds.has(e.id)).forEach((e) => saveCheckInToCloud(user.uid, e))
        setState((prev) => ({ ...prev, history: mergeHistory(prev.history, cloud) }))
      })
      return () => {
        cancelled = true
      }
    }
    setState(defaultState())
    return undefined
  }, [user])

  // Persist state for the current user whenever it changes
  useEffect(() => {
    if (user) saveState(user.uid, state)
  }, [user, state])

  function handleSetProfile(profile) {
    setState((prev) => ({ ...prev, profile }))
  }

  function handleSaveCheckIn(entry) {
    const record = { id: crypto.randomUUID(), date: new Date().toISOString(), ...entry }
    setState((prev) => ({ ...prev, history: [record, ...prev.history] }))
    if (user) saveCheckInToCloud(user.uid, record)
  }

  function handleResetData() {
    if (user) {
      clearState(user.uid)
      clearCloudHistory(user.uid)
    }
    setState(defaultState())
    setShowProfile(false)
    setCheckWindow(null)
  }

  function scrollToSection(id) {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
  }

  // --- Login-gated actions -------------------------------------------------
  // "Get started" / "Check my health" / "New check-in" should open the
  // floating check window immediately if logged in, otherwise open the
  // login window first and remember to open it right after login succeeds.

  // Open the login window on the "Log In" tab or the "Sign Up" tab
  function openLogin(mode) {
    setLoginMode(mode)
    setShowLogin(true)
  }

  function handleGetStarted() {
    if (user) {
      setCheckWindow('check')
    } else {
      setPendingAction('check')
      openLogin('login')
    }
  }

  function handleOpenProfile() {
    if (user) {
      setShowProfile(true)
    } else {
      setPendingAction('profile')
      openLogin('login')
    }
  }

  function handleOpenHistory() {
    if (user) {
      setCheckWindow('history')
    } else {
      setPendingAction('history')
      openLogin('login')
    }
  }

  function handleAuthSuccess() {
    setShowLogin(false)
    setLogoutBanner(false)
    setWelcomeBanner(true)
    setTimeout(() => setWelcomeBanner(false), 4000)

    if (pendingAction === 'check') setCheckWindow('check')
    if (pendingAction === 'history') setCheckWindow('history')
    if (pendingAction === 'profile') setShowProfile(true)
    setPendingAction(null)
  }

  function handleOpenVault() {
    if (user) {
      setShowVault(true)
    } else {
      openLogin('login')
    }
  }

  async function handleLogout() {
    await logOut()
    setCheckWindow(null)
    setShowProfile(false)
    setPendingAction(null)
    setWelcomeBanner(false)
    setLogoutBanner(true)
    setTimeout(() => setLogoutBanner(false), 4000)
  }

  const latestEntry = state.history[0]
  const latestVitals = latestEntry
    ? { symptoms: latestEntry.symptoms, mood: latestEntry.mood, temperature: latestEntry.temperature, heartRate: latestEntry.heartRate }
    : null

  if (!authChecked) {
    return (
      <div className="d-flex align-items-center justify-content-center" style={{ minHeight: '60vh' }}>
        <span className="text-secondary">Loading…</span>
      </div>
    )
  }

  return (
    <div>
      <Navbar
        user={user}
        profile={state.profile}
        onOpenProfile={handleOpenProfile}
        onGetStarted={handleGetStarted}
        onNavigate={scrollToSection}
        onLoginClick={() => openLogin('login')}
        onSignupClick={() => openLogin('signup')}
        onLogout={handleLogout}
        onOpenVault={handleOpenVault}
      />

      {dueReminders.map((r) => (
        <div key={r.id} className="alert alert-warning text-center mb-0 rounded-0 py-2">
          ⏰ Doctor visit: <strong>{r.title}</strong> on {new Date(r.visitAt).toLocaleString()}
          <button type="button" className="btn-close ms-3" aria-label="Dismiss" onClick={() => dismissReminder(r.id)}></button>
        </div>
      ))}

      {welcomeBanner && user && (
        <div className="alert alert-success text-center mb-0 rounded-0 py-2">
          Welcome, {state.profile?.name || user.displayName || user.email} 👋
        </div>
      )}

      {logoutBanner && !user && (
        <div className="alert alert-secondary text-center mb-0 rounded-0 py-2">
          You are logged out. See you soon!
        </div>
      )}

      <Hero onGetStarted={handleGetStarted} />
      <HealthImportance />
      <Dashboard
        profile={state.profile}
        history={state.history}
        onOpenHistory={handleOpenHistory}
        onGetStarted={handleGetStarted}
      />
      <PrescriptionSection user={user} onLoginClick={() => openLogin('login')} />
      <About />
      <Footer />

      {checkWindow && (
        <FloatingCheckWindow
          initialTab={checkWindow}
          profile={state.profile}
          onSetProfile={handleSetProfile}
          history={state.history}
          onSaveCheckIn={handleSaveCheckIn}
          onClose={() => setCheckWindow(null)}
        />
      )}

      {showVault && user && (
        <HealthVault user={user} history={state.history} onClose={() => setShowVault(false)} />
      )}

      {showProfile && (
        <ProfileSettings
          user={user}
          profile={state.profile}
          onClose={() => setShowProfile(false)}
          onSaveProfile={handleSetProfile}
          onResetData={handleResetData}
          onLogout={handleLogout}
        />
      )}

      {showLogin && (
        <LoginWindow
          initialMode={loginMode}
          onClose={() => { setShowLogin(false); setPendingAction(null) }}
          onSuccess={handleAuthSuccess}
        />
      )}

      <ChatWidget latestVitals={latestVitals} />
    </div>
  )
}
