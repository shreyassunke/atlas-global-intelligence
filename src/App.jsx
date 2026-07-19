import { useEffect, useState, useCallback, useMemo, lazy, Suspense, Component } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useAtlasStore } from './store/atlasStore'
import { useNewsData } from './hooks/useNewsData'
import Header from './components/UI/Header'
import Inspector from './components/Inspector/Inspector'
import Workbench from './components/Workbench/Workbench'
import LiveTicker from './components/Feed/LiveTicker'
import HoverLabel from './components/UI/HoverLabel'
import StreetViewOverlay from './components/UI/StreetViewOverlay'
import YouTubeEmbedOverlay from './components/UI/YouTubeEmbedOverlay'
import FetchStatusOverlay from './components/UI/FetchStatusOverlay'
import { usePreferencesSync } from './hooks/usePreferencesSync'
import useLandmarkPresets from './hooks/useLandmarkPresets'
import useAtlasUrlSync from './hooks/useAtlasUrlSync'
import useWatchlistAlerts from './hooks/useWatchlistAlerts'
import useSurgeAlerts from './hooks/useSurgeAlerts'
import useAlertDispatch from './hooks/useAlertDispatch'
import useWorkspaceEventCapture from './hooks/useWorkspaceEventCapture'
import ToastHost from './components/UI/ToastHost'
import CountryContextMenu from './components/UI/CountryContextMenu'
import GlobeLegend from './components/UI/GlobeLegend'
import { supabase } from './services/supabase'
import { loadCountryPolygons } from './services/countryIndex'
import { LANDMARK_SHORTCUT_KEYS } from './config/landmarkPresets'
import LandingPage from './components/Landing/LandingPage'
import WorkspaceDashboard from './components/Workspace/WorkspaceDashboard'
import WorkspaceTimeline from './components/Workspace/WorkspaceTimeline'

// Lazy-load heavy 3D components — Google Map3D / globe.gl / Leaflet load after landing.
const GoogleGlobe = lazy(() => import('./components/Globe/GoogleGlobe'))
const GlobeGLView = lazy(() => import('./components/Globe/GlobeGLView'))
const FlatMap = lazy(() => import('./components/Globe/FlatMap'))
const ParticleEarthTransition = lazy(() => import('./components/Transition/ParticleEarthTransition'))

class GlobeLoadErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="fixed inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-[#050810] px-6 text-center">
          <p className="text-sm font-medium text-slate-200">Globe failed to load</p>
          <p className="max-w-md text-xs text-slate-500">
            {this.state.error.message || 'Check the browser console, then refresh the page.'}
          </p>
        </div>
      )
    }
    return this.props.children
  }
}

export default function App() {
  const [pathTick, setPathTick] = useState(0)
  const hasCompletedOnboarding = useAtlasStore((s) => s.hasCompletedOnboarding)
  const landingAcknowledged = useAtlasStore((s) => s.landingAcknowledged)
  const launchTransitionActive = useAtlasStore((s) => s.launchTransitionActive)
  const [hudHidden, setHudHidden] = useState(false)
  const [globeReady, setGlobeReady] = useState(false)
  const globeMode = useAtlasStore((s) => s.globeMode)
  const launchWithAllSources = useAtlasStore((s) => s.launchWithAllSources)
  const tacticalMode = useAtlasStore((s) => s.tacticalMode)
  const user = useAtlasStore((s) => s.user)
  const appView = useAtlasStore((s) => s.appView)
  const activeWorkspaceId = useAtlasStore((s) => s.activeWorkspaceId)
  const loadWorkspaces = useAtlasStore((s) => s.loadWorkspaces)
  const initEventBusSystem = useAtlasStore((s) => s.initEventBusSystem)
  const colorblindMode = useAtlasStore((s) => s.colorblindMode)
  useNewsData()
  usePreferencesSync()
  const onGlobeView = hasCompletedOnboarding && !launchTransitionActive
  useAtlasUrlSync(onGlobeView)
  useWatchlistAlerts(onGlobeView)
  useSurgeAlerts(onGlobeView)
  useAlertDispatch(onGlobeView)
  useWorkspaceEventCapture(onGlobeView && appView === 'workstation' && Boolean(activeWorkspaceId))

  useEffect(() => {
    if (user && onGlobeView) loadWorkspaces()
  }, [user, onGlobeView, loadWorkspaces])

  // Signed-in users should not sit on the bare globe — route to dashboard unless a workspace is open.
  useEffect(() => {
    if (!onGlobeView || !user) return
    const { appView: view, activeWorkspaceId: wsId } = useAtlasStore.getState()
    if (view === 'workstation' && !wsId) {
      useAtlasStore.getState().setAppView('dashboard')
    }
  }, [user, onGlobeView, appView, activeWorkspaceId])

  const showDashboard = onGlobeView && user && appView === 'dashboard'
  const showGlobeWorkstation = onGlobeView && !showDashboard
  const inWorkspace = showGlobeWorkstation && Boolean(activeWorkspaceId)
  const mobileMode = useAtlasStore((s) => s.mobileMode)
  const inspectorType = useAtlasStore((s) => s.ui.inspector?.type)

  // Country context-menu panels live in the HUD inspector — reveal HUD if needed.
  useEffect(() => {
    if (
      inspectorType === 'economy' ||
      inspectorType === 'countryNews' ||
      inspectorType === 'weather'
    ) {
      setHudHidden(false)
    }
  }, [inspectorType])

  useEffect(() => {
    loadCountryPolygons().catch(() => {})
  }, [])

  useEffect(() => {
    if (!supabase) return undefined
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        const store = useAtlasStore.getState()
        store.setUser(session.user)
        if (!store.activeWorkspaceId) store.setAppView('dashboard')
      }
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      useAtlasStore.getState().setUser(session?.user ?? null)
    })
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    document.body.setAttribute('data-colorblind', String(colorblindMode))
  }, [colorblindMode])

  useEffect(() => {
    const onHistory = () => setPathTick((t) => t + 1)
    window.addEventListener('atlas-history', onHistory)
    return () => window.removeEventListener('atlas-history', onHistory)
  }, [])

  useEffect(() => {
    const isMobile = window.innerWidth < 768 || 'ontouchstart' in window
    useAtlasStore.getState().setMobileMode(isMobile)

    const resizeHandler = () => {
      useAtlasStore.getState().setMobileMode(window.innerWidth < 768)
    }
    window.addEventListener('resize', resizeHandler)

    if (navigator.connection) {
      const checkBandwidth = () => {
        const conn = navigator.connection
        const slow = conn.effectiveType === '2g' || conn.effectiveType === 'slow-2g' || (conn.downlink && conn.downlink < 1.5)
        useAtlasStore.getState().setLowBandwidthMode(slow)
      }
      checkBandwidth()
      navigator.connection.addEventListener('change', checkBandwidth)
      return () => {
        window.removeEventListener('resize', resizeHandler)
        navigator.connection.removeEventListener('change', checkBandwidth)
      }
    }

    return () => window.removeEventListener('resize', resizeHandler)
  }, [])

  const pathname = useMemo(() => {
    if (typeof window === 'undefined') return '/'
    return window.location.pathname.replace(/\/$/, '') || '/'
  }, [pathTick])

  const showLandingLayer = !landingAcknowledged

  const { flyToLandmark } = useLandmarkPresets()

  useEffect(() => {
    if (!onGlobeView) setGlobeReady(false)
  }, [onGlobeView])

  // Safety net: if landing was dismissed but launch never started, enter the globe.
  useEffect(() => {
    if (landingAcknowledged && !hasCompletedOnboarding && !launchTransitionActive) {
      launchWithAllSources()
    }
  }, [landingAcknowledged, hasCompletedOnboarding, launchTransitionActive, launchWithAllSources])

  // Warm data workers as soon as the user enters the app (landing / transition / globe).
  useEffect(() => {
    if (landingAcknowledged || launchTransitionActive || onGlobeView) {
      initEventBusSystem()
    }
  }, [landingAcknowledged, launchTransitionActive, onGlobeView]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const handleKeyDown = (e) => {
      const tag = e.target?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return

      if (e.key === 'Escape') {
        // Close the top-most open layer only: modal → workbench → inspector.
        // When everything is already closed, restore a hidden HUD.
        const closed = useAtlasStore.getState().closeTopPanel()
        if (!closed) setHudHidden(false)
        return
      }

      if ((e.key === 'f' || e.key === 'F') && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault()
        setHudHidden((v) => !v)
      }

      if (
        LANDMARK_SHORTCUT_KEYS.includes(e.key.toLowerCase()) &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey &&
        !e.shiftKey
      ) {
        e.preventDefault()
        flyToLandmark(e.key.toLowerCase())
      }

      if (e.key === 'Tab' && !e.ctrlKey && !e.metaKey) {
        const state = useAtlasStore.getState()
        const sorted = [...state.events]
          .sort((a, b) => b.severity - a.severity || new Date(b.timestamp) - new Date(a.timestamp))
        if (sorted.length === 0) return

        e.preventDefault()
        const currentId = state.selectedEvent?.id
        const currentIdx = sorted.findIndex(ev => ev.id === currentId)
        const nextIdx = e.shiftKey
          ? (currentIdx <= 0 ? sorted.length - 1 : currentIdx - 1)
          : (currentIdx + 1) % sorted.length
        state.setSelectedEvent(sorted[nextIdx])
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [flyToLandmark])

  return (
    <>
      <AnimatePresence mode="wait">
        {showLandingLayer ? (
          <LandingPage key="atlas-landing" />
        ) : launchTransitionActive || !hasCompletedOnboarding ? (
          <motion.div
            key="transition"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="fixed inset-0 z-10"
          >
            <Suspense fallback={
              <div className="fixed inset-0 flex items-center justify-center text-xs uppercase tracking-widest text-slate-500">
                Launching…
              </div>
            }>
              <ParticleEarthTransition />
            </Suspense>
          </motion.div>
        ) : showDashboard ? (
          <motion.div
            key="workspace-dashboard"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
            className="fixed inset-0 z-50"
          >
            <WorkspaceDashboard />
          </motion.div>
        ) : (
          <motion.div
            key="globe-view"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.45 }}
            className={`fixed inset-0${tacticalMode ? ' atlas-tactical-mode' : ''}${inWorkspace ? ' atlas-workstation-mode' : ''}`}
          >
            <GlobeLoadErrorBoundary>
              <Suspense fallback={
                <div className="atlas-globe-loading-backdrop fixed inset-0 z-10 flex items-center justify-center text-xs uppercase tracking-widest text-slate-500">
                  Loading globe…
                </div>
              }>
                {globeMode === 'globegl' ? (
                  <GlobeGLView onGlobeReady={() => setGlobeReady(true)} />
                ) : globeMode === 'leaflet' ? (
                  <FlatMap onGlobeReady={() => setGlobeReady(true)} />
                ) : (
                  <GoogleGlobe onGlobeReady={() => setGlobeReady(true)} />
                )}
              </Suspense>
            </GlobeLoadErrorBoundary>
            {globeReady && <CountryContextMenu />}
            <AnimatePresence>
              {globeReady && !hudHidden && (
                <motion.div
                  key="hud-layer"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.4 }}
                >
                  <Header
                    hudHidden={hudHidden}
                    onToggleHud={() => setHudHidden((v) => !v)}
                    inWorkspace={inWorkspace}
                  />
                  {inWorkspace && <WorkspaceTimeline />}

                  <Inspector />
                  <Workbench />
                  <StreetViewOverlay />
                  <YouTubeEmbedOverlay />
                  <HoverLabel />
                  <LiveTicker />
                  {!mobileMode && <GlobeLegend />}
                  <FetchStatusOverlay />
                  <ToastHost />
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
