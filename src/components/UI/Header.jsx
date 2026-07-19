import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Inbox,
  Layers,
  Settings,
  MoreHorizontal,
  RotateCw,
  Eye,
  EyeOff,
  Compass,
  Crosshair,
  LayoutGrid,
  Search,
  Link as LinkIcon,
  FileDown,
  FileText,
  PersonStanding,
  Radar,
  X,
} from 'lucide-react'
import { useAtlasStore } from '../../store/atlasStore'
import SourceSearch from '../Onboarding/SourceSearch'
import HeaderUserMenu from './HeaderUserMenu'
import HeaderSearchBar from './HeaderSearchBar'
import { AtlasWordmark } from './AtlasWordmark'
import { MissionClock } from './MissionClock'
import { copyShareUrl } from '../../core/urlState'
import { buildBriefMarkdown, downloadMarkdownBrief, exportBriefPdf } from '../../core/briefExport'
import { countUnseenHighSeverity } from '../../core/triage'

const ICON_SIZE = 14

/** Street View control — only rendered in workspace or mobile mode. */
function FilterStrip({ inWorkspace = false }) {
  const streetViewMode = useAtlasStore((s) => s.streetViewMode)
  const toggleStreetViewMode = useAtlasStore((s) => s.toggleStreetViewMode)
  const mobileMode = useAtlasStore((s) => s.mobileMode)

  if (!(inWorkspace || mobileMode)) return null

  return (
    <motion.div
      className="hud-filter-strip"
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 1.7, duration: 0.5 }}
      role="toolbar"
      aria-label="View controls"
    >
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
  const streetViewMode = useAtlasStore((s) => s.streetViewMode)
  const toggleStreetViewMode = useAtlasStore((s) => s.toggleStreetViewMode)
  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId)
  const [moreOpen, setMoreOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const pushToast = useAtlasStore((s) => s.pushToast)
  const openReportExport = useAtlasStore((s) => s.openReportExport)
  const unseenTriage = useAtlasStore((s) =>
    countUnseenHighSeverity(s.events, s.triageLastSeenAt, undefined, s.investigation))

  const handleCopyShareLink = async () => {
    const state = useAtlasStore.getState()
    const ok = await copyShareUrl({
      activeDimensions: state.activeDimensions,
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
                  <Compass size={ICON_SIZE} />
                </button>
              )}

              <button
                onClick={() => toggleWorkbench('triage')}
                className={`hud-icon-btn hud-icon-btn-badged ${workbench === 'triage' ? 'active' : ''}`}
                title="Triage — what changed since you looked"
              >
                <Inbox size={ICON_SIZE} />
                {unseenTriage > 0 && (
                  <span className="hud-icon-badge">{unseenTriage > 99 ? '99+' : unseenTriage}</span>
                )}
              </button>

              <button
                type="button"
                onClick={() => toggleWorkbench('analytics')}
                className={`hud-icon-btn ${workbench === 'analytics' ? 'active' : ''}`}
                title="Analytics"
              >
                <Radar size={ICON_SIZE} />
              </button>

              <button
                onClick={() => toggleWorkbench('layers')}
                className={`hud-icon-btn ${workbench === 'layers' ? 'active' : ''}`}
                title="Globe layers"
              >
                <Layers size={ICON_SIZE} />
              </button>

              <button
                onClick={() => toggleWorkbench('settings')}
                className={`hud-icon-btn ${workbench === 'settings' ? 'active' : ''}`}
                title="Settings"
              >
                <Settings size={ICON_SIZE} />
              </button>

              {!inWorkspace && (
                <button
                  type="button"
                  className={`hud-icon-btn ${streetViewMode ? 'active' : ''}`}
                  onClick={toggleStreetViewMode}
                  title={streetViewMode
                    ? 'Street View mode on — click globe for panorama (click to disable)'
                    : 'Enable Street View mode — then click the globe to open a panorama'}
                  aria-label="Toggle Street View mode"
                >
                  <PersonStanding size={ICON_SIZE} />
                </button>
              )}

              <button
                type="button"
                className="hud-icon-btn"
                onClick={() => resetView()}
                title="Reset globe to default overview"
                aria-label="Reset globe view to default overview"
              >
                <Crosshair size={ICON_SIZE} />
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
              <MoreHorizontal size={ICON_SIZE} />
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
                        <LayoutGrid size={ICON_SIZE} />
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
                        <Inbox size={ICON_SIZE} />
                        <span>Triage</span>
                        {unseenTriage > 0 && (
                          <span className="hud-dropdown-badge">{unseenTriage > 99 ? '99+' : unseenTriage}</span>
                        )}
                      </button>
                      <button
                        className={`hud-dropdown-item ${workbench === 'layers' ? 'is-active' : ''}`}
                        onClick={() => { toggleWorkbench('layers'); setMoreOpen(false) }}
                      >
                        <Layers size={ICON_SIZE} />
                        <span>Globe Layers</span>
                      </button>
                      <button
                        className={`hud-dropdown-item ${workbench === 'settings' ? 'is-active' : ''}`}
                        onClick={() => { toggleWorkbench('settings'); setMoreOpen(false) }}
                      >
                        <Settings size={ICON_SIZE} />
                        <span>Settings</span>
                      </button>
                      <div className="hud-dropdown-divider" />
                    </>
                  )}
                  <button
                    className="hud-dropdown-item"
                    onClick={() => { resetView(); setMoreOpen(false) }}
                  >
                    <Crosshair size={ICON_SIZE} />
                    <span>Reset View</span>
                  </button>
                  <button
                    className="hud-dropdown-item"
                    onClick={() => { onToggleHud?.(); setMoreOpen(false) }}
                  >
                    {hudHidden ? <Eye size={ICON_SIZE} /> : <EyeOff size={ICON_SIZE} />}
                    <span>{hudHidden ? 'Show HUD' : 'Hide HUD'}</span>
                    <span className="hud-dropdown-shortcut">F</span>
                  </button>
                  <button
                    className="hud-dropdown-item"
                    onClick={handleCopyShareLink}
                  >
                    <LinkIcon size={ICON_SIZE} />
                    <span>Copy Share Link</span>
                  </button>
                  <button
                    className="hud-dropdown-item"
                    onClick={handleExportMarkdown}
                  >
                    <FileDown size={ICON_SIZE} />
                    <span>Export Brief (Markdown)</span>
                  </button>
                  <button
                    className="hud-dropdown-item"
                    onClick={handleExportPdf}
                  >
                    <FileDown size={ICON_SIZE} />
                    <span>Export Brief (PDF)</span>
                  </button>
                  <button
                    className="hud-dropdown-item"
                    onClick={() => { openReportExport(); setMoreOpen(false) }}
                  >
                    <FileText size={ICON_SIZE} />
                    <span>Export Report (Templates)</span>
                  </button>
                  <div className="hud-dropdown-divider" />
                  <button
                    className="hud-dropdown-item"
                    onClick={() => { triggerManualRefresh?.(); setMoreOpen(false) }}
                    disabled={manualRefreshUsedToday || isLoading}
                  >
                    <RotateCw size={ICON_SIZE} />
                    <span>Refresh Data</span>
                  </button>
                  <button
                    className="hud-dropdown-item"
                    onClick={() => { setSearchOpen(true); setMoreOpen(false) }}
                  >
                    <Search size={ICON_SIZE} />
                    <span>News Sources</span>
                    <span className="hud-dropdown-badge">{selectedSources.length}</span>
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          </div>
        </div>
      </motion.header>

      <FilterStrip inWorkspace={inWorkspace} />

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
              <button
                onClick={() => setSearchOpen(false)}
                aria-label="Close source search"
                className="inline-flex items-center justify-center text-white/40 hover:text-white transition-colors cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>
            <SourceSearch compact />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
