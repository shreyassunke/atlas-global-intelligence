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

const TABS = [
  { id: 'triage', label: 'Triage' },
  { id: 'dossier', label: 'Dossier' },
  { id: 'analytics', label: 'Analytics' },
  { id: 'layers', label: 'Layers' },
  { id: 'settings', label: 'Settings' },
]

export default function Workbench() {
  const workbench = useAtlasStore((s) => s.ui.workbench)
  const openWorkbench = useAtlasStore((s) => s.openWorkbench)
  const closeWorkbench = useAtlasStore((s) => s.closeWorkbench)

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
            {TABS.map((t) => (
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
