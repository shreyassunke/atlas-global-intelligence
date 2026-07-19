import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import { Globe2, Radar, PenTool } from 'lucide-react'
import { useAtlasStore } from '../../store/atlasStore'
import { supabase } from '../../services/supabase'
import WorkspaceCard from './WorkspaceCard'
import CreateWorkspaceModal from './CreateWorkspaceModal'
import { AtlasWordmark } from '../UI/AtlasWordmark'

export default function WorkspaceDashboard() {
  const user = useAtlasStore((s) => s.user)
  const workspaces = useAtlasStore((s) => s.workspaces)
  const workspacesLoading = useAtlasStore((s) => s.workspacesLoading)
  const loadWorkspaces = useAtlasStore((s) => s.loadWorkspaces)
  const openWorkspace = useAtlasStore((s) => s.openWorkspace)
  const archiveWorkspace = useAtlasStore((s) => s.archiveWorkspace)
  const duplicateWorkspace = useAtlasStore((s) => s.duplicateWorkspace)
  const signOut = useAtlasStore((s) => s.signOut)
  const setAppView = useAtlasStore((s) => s.setAppView)

  const [createOpen, setCreateOpen] = useState(false)
  const [eventCounts, setEventCounts] = useState({})

  useEffect(() => {
    if (user) loadWorkspaces()
  }, [user, loadWorkspaces])

  useEffect(() => {
    if (!supabase || !workspaces.length) return
    const ids = workspaces.map((w) => w.id)
    supabase
      .from('workspace_events')
      .select('workspace_id')
      .in('workspace_id', ids)
      .then(({ data }) => {
        const counts = {}
        for (const row of data || []) {
          counts[row.workspace_id] = (counts[row.workspace_id] || 0) + 1
        }
        setEventCounts(counts)
      })
  }, [workspaces])

  const sorted = useMemo(
    () => [...workspaces].sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at)),
    [workspaces],
  )

  return (
    <div className="ws-dashboard">
      <div className="ws-dashboard__backdrop" aria-hidden />

      <header className="ws-dashboard__header">
        <div className="ws-dashboard__brand">
          <AtlasWordmark className="ws-dashboard__wordmark" />
          <p className="ws-dashboard__tagline">Investigation workstations</p>
        </div>
        <div className="ws-dashboard__header-actions">
          <button type="button" className="ws-dashboard__header-btn" onClick={() => setCreateOpen(true)}>
            New workspace
          </button>
          {!user && (
            <button type="button" className="ws-dashboard__header-btn ws-dashboard__header-btn--ghost" onClick={() => setAppView('workstation')}>
              Globe demo
            </button>
          )}
          {user && (
            <button type="button" className="ws-dashboard__header-btn ws-dashboard__header-btn--ghost" onClick={signOut}>
              Sign out
            </button>
          )}
        </div>
      </header>

      <main className="ws-dashboard__main">
        {!user ? (
          <div className="ws-dashboard__empty">
            <span className="mb-3 block font-data text-[10px] uppercase tracking-[0.18em] text-faint">
              Workspaces / guest
            </span>
            <h2>Sign in to save investigations</h2>
            <p>Workspaces persist scoped globe configs, event timelines, and canvas evidence across sessions.</p>
            <button type="button" className="ws-dashboard__cta" onClick={() => setAppView('workstation')}>
              Continue as guest on the globe
            </button>
          </div>
        ) : workspacesLoading ? (
          <div className="ws-dashboard__loading">Loading workspaces…</div>
        ) : sorted.length === 0 ? (
          <div className="ws-dashboard__empty">
            <span className="mb-3 block font-data text-[10px] uppercase tracking-[0.18em] text-faint">
              Workspaces / 0 active
            </span>
            <h2>No workspaces yet</h2>
            <p>Create a scoped monitor — pick regions and keywords. Open it to capture signals and build a canvas.</p>
            <button type="button" className="ws-dashboard__cta" onClick={() => setCreateOpen(true)}>
              Create your first workspace
            </button>

            <div className="mt-10 grid grid-cols-1 gap-3 text-left sm:grid-cols-3">
              {[
                { icon: Globe2, label: 'Scoped globe', desc: 'Regions and keywords preset every session' },
                { icon: Radar, label: 'Signal capture', desc: 'Matching events accumulate into a timeline automatically' },
                { icon: PenTool, label: 'Evidence canvas', desc: 'Pin signals, link claims, and export a sourced brief' },
              ].map(({ icon: Icon, label, desc }) => (
                <div key={label} className="rounded-lg border border-line bg-surface p-3.5">
                  <Icon size={14} className="mb-2 text-accent" aria-hidden />
                  <div className="font-data text-[10px] uppercase tracking-[0.1em] text-text">{label}</div>
                  <p className="mt-1 font-ui text-[11px] leading-relaxed text-muted" style={{ margin: '4px 0 0' }}>{desc}</p>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <>
            <div className="mb-4 flex items-baseline justify-between">
              <span className="font-data text-[10px] uppercase tracking-[0.18em] text-faint">
                Active investigations · {sorted.length}
              </span>
            </div>
            <div className="ws-dashboard__grid">
              <AnimatePresence mode="popLayout">
                {sorted.map((ws) => (
                  <WorkspaceCard
                    key={ws.id}
                    workspace={ws}
                    eventCount={eventCounts[ws.id] || 0}
                    onOpen={() => openWorkspace(ws.id)}
                    onArchive={() => archiveWorkspace(ws.id)}
                    onDuplicate={() => duplicateWorkspace(ws.id)}
                  />
                ))}
              </AnimatePresence>
            </div>
          </>
        )}
      </main>

      <CreateWorkspaceModal open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  )
}
