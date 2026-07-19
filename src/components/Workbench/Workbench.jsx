/**
 * Workbench — right rail, tabbed (Phase 3 region model).
 *
 * Tabs: Triage, Dossier, Analytics, Layers, Settings (+ Canvas in a workspace).
 * Supports minimize / maximize window chrome (same pattern as Inspector).
 */
import { useCallback, useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X, Inbox, BookOpen, Radar, Layers, Settings, PenTool,
  Minus, Maximize2, Minimize2,
} from 'lucide-react'
import { useAtlasStore } from '../../store/atlasStore'
import { cn } from '../../lib/utils'
import TriageTab from './TriageTab'
import DossierTab from './DossierTab'
import AnalyticsTab from '../UI/GDELTAnalyticsPanel'
import LayersTab from './LayersTab'
import PreferencesTab from './PreferencesTab'
import InvestigationCanvas from '../Workspace/InvestigationCanvas'

const BASE_TABS = [
  { id: 'triage', label: 'Triage', icon: Inbox },
  { id: 'dossier', label: 'Dossier', icon: BookOpen },
  { id: 'analytics', label: 'Analytics', icon: Radar },
  { id: 'layers', label: 'Layers', icon: Layers },
  { id: 'settings', label: 'Settings', icon: Settings },
]

const CANVAS_TAB = { id: 'canvas', label: 'Canvas', icon: PenTool }

export default function Workbench() {
  const workbench = useAtlasStore((s) => s.ui.workbench)
  const activeWorkspaceId = useAtlasStore((s) => s.activeWorkspaceId)
  const openWorkbench = useAtlasStore((s) => s.openWorkbench)
  const closeWorkbench = useAtlasStore((s) => s.closeWorkbench)

  const [mode, setMode] = useState('normal')

  useEffect(() => {
    if (!workbench) setMode('normal')
  }, [workbench])

  const toggleMinimized = useCallback(() => {
    setMode((m) => (m === 'minimized' ? 'normal' : 'minimized'))
  }, [])

  const toggleFullscreen = useCallback(() => {
    setMode((m) => (m === 'fullscreen' ? 'normal' : 'fullscreen'))
  }, [])

  const tabs = activeWorkspaceId ? [CANVAS_TAB, ...BASE_TABS] : BASE_TABS
  const activeTab = tabs.find((t) => t.id === workbench)
  const ActiveIcon = activeTab?.icon

  const handleTab = (id) => {
    if (mode === 'minimized') setMode('normal')
    openWorkbench(id)
  }

  return (
    <AnimatePresence>
      {workbench && (
        <motion.aside
          key="workbench"
          className={cn(
            'workbench-panel',
            mode === 'minimized' && 'workbench-panel--minimized',
            mode === 'fullscreen' && 'workbench-panel--fullscreen',
          )}
          role="dialog"
          aria-label="Workbench"
          aria-expanded={mode !== 'minimized'}
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 24 }}
          transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
        >
          {mode === 'minimized' ? (
            <div
              className="workbench-mini-bar"
              role="button"
              tabIndex={0}
              onClick={toggleMinimized}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  toggleMinimized()
                }
              }}
              title="Click to restore"
            >
              {ActiveIcon && <ActiveIcon size={13} className="workbench-mini-bar__icon" aria-hidden />}
              <span className="workbench-mini-bar__title">{activeTab?.label || 'Workbench'}</span>
              <div
                className="workbench-window-controls"
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  className="workbench-window-btn"
                  aria-label="Restore panel"
                  title="Restore"
                  onClick={toggleMinimized}
                >
                  <Minus size={14} strokeWidth={2} aria-hidden />
                </button>
                <button
                  type="button"
                  className="workbench-window-btn"
                  aria-label="Maximize panel"
                  title="Maximize"
                  onClick={toggleFullscreen}
                >
                  <Maximize2 size={13} strokeWidth={2} aria-hidden />
                </button>
                <button
                  type="button"
                  className="workbench-window-btn"
                  aria-label="Close workbench"
                  title="Close"
                  onClick={closeWorkbench}
                >
                  <X size={14} strokeWidth={2} aria-hidden />
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="workbench-tabs">
                <div className="workbench-tabs__list" role="tablist" aria-label="Workbench tabs">
                  {tabs.map((t) => {
                    const Icon = t.icon
                    return (
                      <button
                        key={t.id}
                        type="button"
                        role="tab"
                        aria-selected={workbench === t.id}
                        className={`workbench-tab ${workbench === t.id ? 'active' : ''}`}
                        onClick={() => handleTab(t.id)}
                        title={t.label}
                      >
                        <Icon size={11} aria-hidden />
                        <span className="workbench-tab__label">{t.label}</span>
                      </button>
                    )
                  })}
                </div>
                <div className="workbench-window-controls">
                  <button
                    type="button"
                    className="workbench-window-btn"
                    aria-label="Minimize panel"
                    title="Minimize"
                    onClick={toggleMinimized}
                  >
                    <Minus size={14} strokeWidth={2} aria-hidden />
                  </button>
                  <button
                    type="button"
                    className="workbench-window-btn"
                    aria-label={mode === 'fullscreen' ? 'Restore panel size' : 'Maximize panel'}
                    title={mode === 'fullscreen' ? 'Restore' : 'Maximize'}
                    onClick={toggleFullscreen}
                  >
                    {mode === 'fullscreen' ? (
                      <Minimize2 size={13} strokeWidth={2} aria-hidden />
                    ) : (
                      <Maximize2 size={13} strokeWidth={2} aria-hidden />
                    )}
                  </button>
                  <button
                    type="button"
                    className="workbench-window-btn"
                    aria-label="Close workbench"
                    title="Close"
                    onClick={closeWorkbench}
                  >
                    <X size={14} strokeWidth={2} aria-hidden />
                  </button>
                </div>
              </div>

              <div className="workbench-body">
                {workbench === 'canvas' && <InvestigationCanvas />}
                {workbench === 'triage' && <TriageTab />}
                {workbench === 'dossier' && <DossierTab />}
                {workbench === 'analytics' && <AnalyticsTab />}
                {workbench === 'layers' && <LayersTab />}
                {workbench === 'settings' && <PreferencesTab />}
              </div>
            </>
          )}
        </motion.aside>
      )}
    </AnimatePresence>
  )
}
