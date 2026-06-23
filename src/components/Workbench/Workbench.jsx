/**
 * Workbench — right rail, tabbed (Phase 3 region model).
 *
 * Merges the former GDELTAnalyticsPanel, SettingsPanel, WatchlistPanel, and
 * AlertRulesPanel into one store-driven rail. Tabs: Triage (Phase 4 default —
 * what changed since you looked), Dossier (Phase 5 — everything about one
 * country), Analytics (GDELT topic analysis), Layers (globe layers grouped
 * by archetype, with health), and Settings (preferences, appearance, alerts,
 * account).
 */
import { motion, AnimatePresence } from 'framer-motion'
import { useAtlasStore } from '../../store/atlasStore'
import TriageTab from './TriageTab'
import DossierTab from './DossierTab'
import AnalyticsTab from '../UI/GDELTAnalyticsPanel'
import LayersTab from './LayersTab'
import PreferencesTab from './PreferencesTab'
import InvestigationCanvas from '../Workspace/InvestigationCanvas'

const BASE_TABS = [
  { id: 'triage', label: 'Triage' },
  { id: 'dossier', label: 'Dossier' },
  { id: 'analytics', label: 'Analytics' },
  { id: 'layers', label: 'Layers' },
  { id: 'settings', label: 'Settings' },
]

const CANVAS_TAB = { id: 'canvas', label: 'Canvas' }

export default function Workbench() {
  const workbench = useAtlasStore((s) => s.ui.workbench)
  const activeWorkspaceId = useAtlasStore((s) => s.activeWorkspaceId)
  const openWorkbench = useAtlasStore((s) => s.openWorkbench)
  const closeWorkbench = useAtlasStore((s) => s.closeWorkbench)

  const tabs = activeWorkspaceId ? [CANVAS_TAB, ...BASE_TABS] : BASE_TABS

  return (
    <AnimatePresence>
      {workbench && (
        <motion.aside
          key="workbench"
          className="workbench-panel"
          role="dialog"
          aria-label="Workbench"
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 24 }}
          transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="workbench-tabs">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`workbench-tab ${workbench === t.id ? 'active' : ''}`}
                onClick={() => openWorkbench(t.id)}
              >
                {t.label}
              </button>
            ))}
            <button
              type="button"
              className="workbench-close"
              aria-label="Close workbench"
              onClick={closeWorkbench}
            >
              ✕
            </button>
          </div>

          <div className="workbench-body">
            {workbench === 'canvas' && <InvestigationCanvas />}
            {workbench === 'triage' && <TriageTab />}
            {workbench === 'dossier' && <DossierTab />}
            {workbench === 'analytics' && <AnalyticsTab />}
            {workbench === 'layers' && <LayersTab />}
            {workbench === 'settings' && <PreferencesTab />}
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  )
}
