import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAtlasStore } from '../../store/atlasStore'
import SourceSearch from '../Onboarding/SourceSearch'
import HeaderUserMenu from './HeaderUserMenu'
import HeaderSearchBar from './HeaderSearchBar'
import { AtlasWordmark } from './AtlasWordmark'
import { MissionClock } from './MissionClock'
import { copyShareUrl } from '../../core/urlState'
import { buildBriefMarkdown, downloadMarkdownBrief, exportBriefPdf } from '../../core/briefExport'
import { DIMENSIONS, DIMENSION_COLORS, DIMENSION_LABELS, DIMENSION_ICONS } from '../../core/eventSchema'
import { countUnseenP1 } from '../../core/triage'

/** Inbox tray — the Triage feed ("what changed since you looked"). */
const IconTriage = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
    <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
  </svg>
)

const IconLayers = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="12 2 2 7 12 12 22 7 12 2" />
    <polyline points="2 17 12 22 22 17" />
    <polyline points="2 12 12 17 22 12" />
  </svg>
)

const IconSettings = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
)

const IconMore = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="1" />
    <circle cx="19" cy="12" r="1" />
    <circle cx="5" cy="12" r="1" />
  </svg>
)

const IconRefresh = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="23 4 23 10 17 10" />
    <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
  </svg>
)

const IconEye = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
)

const IconEyeOff = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
    <line x1="1" y1="1" x2="23" y2="23" />
  </svg>
)

const IconCompass = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
  </svg>
)

/** Crosshair / “recenter” — distinct from refresh (circular arrow) and filter. */
const IconResetView = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <circle cx="12" cy="12" r="3" />
    <line x1="12" y1="2" x2="12" y2="7" />
    <line x1="12" y1="17" x2="12" y2="22" />
    <line x1="2" y1="12" x2="7" y2="12" />
    <line x1="17" y1="12" x2="22" y2="12" />
  </svg>
)

const IconWorkspaces = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="7" height="7" rx="1" />
    <rect x="14" y="3" width="7" height="7" rx="1" />
    <rect x="3" y="14" width="7" height="7" rx="1" />
    <rect x="14" y="14" width="7" height="7" rx="1" />
  </svg>
)

const IconSearch = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
)

const IconSetup = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
  </svg>
)

const DIMENSION_DEFS = Object.values(DIMENSIONS).map((dim) => ({
  id: dim,
  label: DIMENSION_LABELS[dim],
  icon: DIMENSION_ICONS[dim],
  color: DIMENSION_COLORS[dim],
}))

const PRIORITY_OPTIONS = [
  { value: 'p1', label: 'P1', description: 'Breaking only' },
  { value: 'p1p2', label: 'P1+P2', description: 'Breaking + Active' },
  { value: 'all', label: 'All', description: 'Everything' },
]

const TIME_OPTIONS = [
  { value: 'live', label: 'Live', title: 'Last 2 hours of geocoded signals' },
  { value: '24h', label: '24h', title: 'Events from the past 24 hours' },
  { value: '7d', label: '7d', title: 'Events from the past 7 days' },
  { value: '30d', label: '30d', title: 'Events from the past 30 days' },
]

/** Phase 3 — compact dimension chips + one global time control under the header. */
function FilterStrip() {
  const activeDimensions = useAtlasStore((s) => s.activeDimensions)
  const toggleDimension = useAtlasStore((s) => s.toggleDimension)
  const priorityFilter = useAtlasStore((s) => s.priorityFilter)
  const setPriorityFilter = useAtlasStore((s) => s.setPriorityFilter)
  const timeFilter = useAtlasStore((s) => s.timeFilter)
  const setTimeFilter = useAtlasStore((s) => s.setTimeFilter)
  const streetViewMode = useAtlasStore((s) => s.streetViewMode)
  const toggleStreetViewMode = useAtlasStore((s) => s.toggleStreetViewMode)
  const mobileMode = useAtlasStore((s) => s.mobileMode)

  return (
    <motion.div
      className="hud-filter-strip"
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 1.7, duration: 0.5 }}
      role="toolbar"
      aria-label="Dimension and time filters"
    >
      {DIMENSION_DEFS.map((d) => {
        const active = activeDimensions.has(d.id)
        return (
          <button
            key={d.id}
            type="button"
            className={`hud-dim-chip ${active ? 'active' : ''}`}
            style={{ '--chip-color': d.color }}
            onClick={() => toggleDimension(d.id)}
            title={`${d.label} — ${active ? 'on' : 'off'}`}
          >
            <span className="hud-dim-chip-dot" style={{ backgroundColor: d.color }} />
            {mobileMode ? d.icon : d.label}
          </button>
        )
      })}

      <span className="hud-strip-divider" aria-hidden />

      <div className="hud-strip-group" role="group" aria-label="Priority filter">
        {PRIORITY_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            className={`hud-strip-btn ${priorityFilter === opt.value ? 'active' : ''}`}
            onClick={() => setPriorityFilter(opt.value)}
            title={opt.description}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div className="hud-strip-group" role="group" aria-label="Time range">
        {TIME_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            className={`hud-strip-btn ${timeFilter === opt.value ? 'active' : ''}`}
            onClick={() => setTimeFilter(opt.value)}
            title={opt.title}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <span className="hud-strip-divider" aria-hidden />

      <button
        type="button"
        className={`hud-strip-btn hud-strip-btn--streetview${streetViewMode ? ' active' : ''}`}
        onClick={toggleStreetViewMode}
        title={streetViewMode
          ? 'Street View mode on — click globe for panorama (click to disable)'
          : 'Enable Street View mode — then click the globe to open a panorama'}
      >
        {mobileMode ? 'SV' : 'Street View'}
      </button>
    </motion.div>
  )
}

export default function Header({ hudHidden = false, onToggleHud, inWorkspace = false }) {
  const isLoading = useAtlasStore((s) => s.isLoading)
  const workbench = useAtlasStore((s) => s.ui.workbench)
  const toggleWorkbench = useAtlasStore((s) => s.toggleWorkbench)
  const resetView = useAtlasStore((s) => s.resetView)
  const reopenOnboarding = useAtlasStore((s) => s.reopenOnboarding)
  const reopenLanding = useAtlasStore((s) => s.reopenLanding)
  const triggerManualRefresh = useAtlasStore((s) => s.triggerManualRefresh)
  const manualRefreshUsedToday = useAtlasStore((s) => s.manualRefreshUsedToday)
  const selectedSources = useAtlasStore((s) => s.selectedSources)
  const mobileMode = useAtlasStore((s) => s.mobileMode)
  const user = useAtlasStore((s) => s.user)
  const workspaces = useAtlasStore((s) => s.workspaces)
  const activeWorkspaceId = useAtlasStore((s) => s.activeWorkspaceId)
  const exitWorkspace = useAtlasStore((s) => s.exitWorkspace)
  const openCanvas = useAtlasStore((s) => s.openCanvas)
  const setAppView = useAtlasStore((s) => s.setAppView)
  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId)
  const [moreOpen, setMoreOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const pushToast = useAtlasStore((s) => s.pushToast)
  const openReportExport = useAtlasStore((s) => s.openReportExport)
  const unseenTriage = useAtlasStore((s) => countUnseenP1(s.events, s.triageLastSeenAt))

  const handleCopyShareLink = async () => {
    const state = useAtlasStore.getState()
    const ok = await copyShareUrl({
      activeDimensions: state.activeDimensions,
      priorityFilter: state.priorityFilter,
      timeFilter: state.timeFilter,
      dataLayers: state.dataLayers,
      globeMode: state.globeMode,
      tacticalMode: state.tacticalMode,
      detectionMode: state.detectionMode,
      detectionLabelDensity: state.detectionLabelDensity,
      shareCamera: state.shareCamera,
      zoomLevel: state.zoomLevel,
      selectedEventId: state.selectedEvent?.id ?? null,
      workspaceId: state.activeWorkspaceId || null,
    })
    pushToast({
      label: 'Share',
      message: ok ? 'Link copied to clipboard' : 'Could not copy link',
    })
    setMoreOpen(false)
  }

  const handleExportMarkdown = () => {
    const md = buildBriefMarkdown(useAtlasStore.getState())
    downloadMarkdownBrief(md)
    pushToast({ label: 'Brief', message: 'Markdown brief downloaded' })
    setMoreOpen(false)
  }

  const handleExportPdf = async () => {
    try {
      await exportBriefPdf(useAtlasStore.getState())
      pushToast({ label: 'Brief', message: 'PDF brief saved' })
    } catch {
      pushToast({ label: 'Brief', message: 'PDF export failed — try Markdown' })
    }
    setMoreOpen(false)
  }
  const moreRef = useRef(null)
  const searchRef = useRef(null)

  useEffect(() => {
    if (!moreOpen && !searchOpen) return
    function handleClickOutside(e) {
      if (moreOpen && moreRef.current && !moreRef.current.contains(e.target)) {
        setMoreOpen(false)
      }
      if (searchOpen && searchRef.current && !searchRef.current.contains(e.target)) {
        setSearchOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('touchstart', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('touchstart', handleClickOutside)
    }
  }, [moreOpen, searchOpen])

  return (
    <>
      <motion.header
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.5, duration: 0.6 }}
        className="hud-header"
      >
        {/* Left: logo + status */}
        <div className="hud-header-left-zone">
          <div className="hud-header-left">
            <button
              type="button"
              className="atlas-logo-header atlas-logo-header-btn"
              aria-label="ATLAS — open introduction"
              title="Open ATLAS introduction"
              onClick={() => reopenLanding()}
            >
              <AtlasWordmark height={22} className="atlas-wordmark--header" aria-hidden />
            </button>

            {isLoading && (
              <span className="hud-loading-pulse">Syncing</span>
            )}

            {inWorkspace && activeWorkspace && (
              <div className="hud-workspace-chip">
                <span className="hud-workspace-chip__pulse" />
                <span className="hud-workspace-chip__name">{activeWorkspace.name}</span>
              </div>
            )}
          </div>

          <HeaderSearchBar />
        </div>

        <div className="hud-header-center-zone">
          <MissionClock />
        </div>

        {/* Right: icon actions */}
        <div className="hud-header-right-zone">
          <div className="hud-header-right">
          {/* On mobile we collapse Filters, Settings and Reset-view into
              the overflow menu so the header can't overlap on narrow
              screens. Desktop keeps the full, faster-access icon row. */}
          {!mobileMode && (
            <>
              {user && !inWorkspace && (
                <button
                  type="button"
                  className="hud-workspaces-pill"
                  onClick={() => setAppView('dashboard')}
                  title="Create or open an investigation workspace"
                >
                  Workspaces
                </button>
              )}

              {user && inWorkspace && (
                <button
                  type="button"
                  className="hud-workspaces-pill hud-workspaces-pill--active"
                  onClick={exitWorkspace}
                  title="Back to workspace list"
                >
                  Exit
                </button>
              )}

              {inWorkspace && (
                <button
                  type="button"
                  className={`hud-icon-btn ${workbench === 'canvas' ? 'active' : ''}`}
                  onClick={openCanvas}
                  title="Investigation canvas"
                >
                  <IconCompass />
                </button>
              )}

              <button
                onClick={() => toggleWorkbench('triage')}
                className={`hud-icon-btn hud-icon-btn-badged ${workbench === 'triage' ? 'active' : ''}`}
                title="Triage — what changed since you looked"
              >
                <IconTriage />
                {unseenTriage > 0 && (
                  <span className="hud-icon-badge">{unseenTriage > 99 ? '99+' : unseenTriage}</span>
                )}
              </button>

              <button
                onClick={() => toggleWorkbench('layers')}
                className={`hud-icon-btn ${workbench === 'layers' ? 'active' : ''}`}
                title="Globe layers"
              >
                <IconLayers />
              </button>

              <button
                onClick={() => toggleWorkbench('settings')}
                className={`hud-icon-btn ${workbench === 'settings' ? 'active' : ''}`}
                title="Settings"
              >
                <IconSettings />
              </button>

              <button
                type="button"
                className="hud-icon-btn"
                onClick={() => resetView()}
                title="Reset globe to default overview"
                aria-label="Reset globe view to default overview"
              >
                <IconResetView />
              </button>
            </>
          )}

          {mobileMode && user && !inWorkspace && (
            <button
              type="button"
              className="hud-workspaces-pill hud-workspaces-pill--compact"
              onClick={() => setAppView('dashboard')}
            >
              Workspaces
            </button>
          )}

          <HeaderUserMenu />

          {!mobileMode && <div className="hud-separator" />}

          {/* Overflow menu */}
          <div style={{ position: 'relative' }} ref={moreRef}>
            <button
              onClick={() => setMoreOpen(v => !v)}
              className={`hud-icon-btn ${moreOpen ? 'active' : ''}`}
              title="More actions"
            >
              <IconMore />
            </button>

            <AnimatePresence>
              {moreOpen && (
                <motion.div
                  className="hud-dropdown"
                  initial={{ opacity: 0, y: -6, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -6, scale: 0.96 }}
                  transition={{ duration: 0.15 }}
                >
                  {user && (
                    <>
                      <button
                        type="button"
                        className="hud-dropdown-item"
                        onClick={() => {
                          if (inWorkspace) exitWorkspace()
                          else setAppView('dashboard')
                          setMoreOpen(false)
                        }}
                      >
                        <IconWorkspaces />
                        <span>{inWorkspace ? 'Back to workspaces' : 'Workspaces — create & open'}</span>
                      </button>
                      <div className="hud-dropdown-divider" />
                    </>
                  )}
                  {mobileMode && (
                    <>
                      <button
                        className={`hud-dropdown-item ${workbench === 'triage' ? 'is-active' : ''}`}
                        onClick={() => { toggleWorkbench('triage'); setMoreOpen(false) }}
                      >
                        <IconTriage />
                        <span>Triage</span>
                        {unseenTriage > 0 && (
                          <span className="hud-dropdown-badge">{unseenTriage > 99 ? '99+' : unseenTriage}</span>
                        )}
                      </button>
                      <button
                        className={`hud-dropdown-item ${workbench === 'layers' ? 'is-active' : ''}`}
                        onClick={() => { toggleWorkbench('layers'); setMoreOpen(false) }}
                      >
                        <IconLayers />
                        <span>Globe Layers</span>
                      </button>
                      <button
                        className={`hud-dropdown-item ${workbench === 'settings' ? 'is-active' : ''}`}
                        onClick={() => { toggleWorkbench('settings'); setMoreOpen(false) }}
                      >
                        <IconSettings />
                        <span>Settings</span>
                      </button>
                      <div className="hud-dropdown-divider" />
                    </>
                  )}
                  <button
                    className="hud-dropdown-item"
                    onClick={() => { resetView(); setMoreOpen(false) }}
                  >
                    <IconCompass />
                    <span>Reset View</span>
                  </button>
                  <button
                    className="hud-dropdown-item"
                    onClick={() => { onToggleHud?.(); setMoreOpen(false) }}
                  >
                    {hudHidden ? <IconEye /> : <IconEyeOff />}
                    <span>{hudHidden ? 'Show HUD' : 'Hide HUD'}</span>
                    <span className="hud-dropdown-shortcut">F</span>
                  </button>
                  <button
                    className="hud-dropdown-item"
                    onClick={handleCopyShareLink}
                  >
                    <IconSearch />
                    <span>Copy Share Link</span>
                  </button>
                  <button
                    className="hud-dropdown-item"
                    onClick={handleExportMarkdown}
                  >
                    <IconSearch />
                    <span>Export Brief (Markdown)</span>
                  </button>
                  <button
                    className="hud-dropdown-item"
                    onClick={handleExportPdf}
                  >
                    <IconSearch />
                    <span>Export Brief (PDF)</span>
                  </button>
                  <button
                    className="hud-dropdown-item"
                    onClick={() => { openReportExport(); setMoreOpen(false) }}
                  >
                    <IconSearch />
                    <span>Export Report (Templates)</span>
                  </button>
                  <div className="hud-dropdown-divider" />
                  <button
                    className="hud-dropdown-item"
                    onClick={() => { triggerManualRefresh?.(); setMoreOpen(false) }}
                    disabled={manualRefreshUsedToday || isLoading}
                  >
                    <IconRefresh />
                    <span>Refresh Data</span>
                  </button>
                  <button
                    className="hud-dropdown-item"
                    onClick={() => { setSearchOpen(true); setMoreOpen(false) }}
                  >
                    <IconSearch />
                    <span>News Sources</span>
                    <span className="hud-dropdown-badge">{selectedSources.length}</span>
                  </button>
                  <button
                    className="hud-dropdown-item"
                    onClick={() => { reopenOnboarding(); setMoreOpen(false) }}
                  >
                    <IconSetup />
                    <span>Setup</span>
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          </div>
        </div>
      </motion.header>

      <FilterStrip />

      {/* Source search panel */}
      <AnimatePresence>
        {searchOpen && (
          <motion.div
            ref={searchRef}
            initial={{ opacity: 0, y: -10, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.97 }}
            transition={{ duration: 0.2 }}
            className="fixed top-14 right-3 z-50 w-[min(420px,calc(100vw-24px))] glass rounded-xl p-4 shadow-2xl border border-white/[0.08] pointer-events-auto"
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-white tracking-wide">Manage Sources</h3>
              <button onClick={() => setSearchOpen(false)} className="text-white/40 hover:text-white transition-colors cursor-pointer text-lg leading-none">
                ×
              </button>
            </div>
            <SourceSearch compact />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
