import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { useAtlasStore } from '../../store/atlasStore'
import { DIMENSION_COLORS, PRIORITY_LABELS } from '../../core/eventSchema'
import Panel from '../../design/Panel'

function timeAgo(dateStr) {
  if (!dateStr) return ''
  const diff = Date.now() - new Date(dateStr).getTime()
  if (!Number.isFinite(diff)) return ''
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'now'
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  return `${Math.floor(hours / 24)}d`
}

function groupByDay(rows) {
  const groups = new Map()
  for (const row of rows) {
    const d = new Date(row.captured_at || row.event_data?.timestamp)
    const key = Number.isFinite(d.getTime())
      ? d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
      : 'Unknown'
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(row)
  }
  return [...groups.entries()]
}

export default function WorkspaceTimeline() {
  const workspaceEvents = useAtlasStore((s) => s.workspaceEvents)
  const workspaceEventsLoading = useAtlasStore((s) => s.workspaceEventsLoading)
  const activeWorkspaceId = useAtlasStore((s) => s.activeWorkspaceId)
  const workspaces = useAtlasStore((s) => s.workspaces)
  const setSelectedEvent = useAtlasStore((s) => s.setSelectedEvent)
  const flyToLocation = useAtlasStore((s) => s.flyToLocation)
  const addEventToCanvas = useAtlasStore((s) => s.addEventToCanvas)
  const openCanvas = useAtlasStore((s) => s.openCanvas)
  const investigation = useAtlasStore((s) => s.investigation)

  const workspace = workspaces.find((w) => w.id === activeWorkspaceId)
  const canvasIds = useMemo(
    () => new Set((investigation?.evidence || []).map((e) => e.id)),
    [investigation],
  )

  const grouped = useMemo(() => groupByDay(workspaceEvents), [workspaceEvents])

  const handleSelect = (row) => {
    const evt = row.event_data
    if (!evt) return
    setSelectedEvent(evt)
    if (evt.lat != null && evt.lng != null) {
      flyToLocation({ lat: evt.lat, lng: evt.lng, rangeM: 800_000 })
    }
  }

  if (!activeWorkspaceId) return null

  return (
    <motion.aside
      className="workspace-timeline-rail"
      initial={{ opacity: 0, x: -16 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -16 }}
      transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
    >
      <Panel
        title={workspace?.name || 'Timeline'}
        provenance={`${workspaceEvents.length} captured`}
        actions={(
          <button type="button" className="ws-timeline__canvas-btn" onClick={openCanvas}>
            Canvas ({investigation?.evidence?.length || 0})
          </button>
        )}
      >
        {workspaceEventsLoading ? (
          <p className="ws-timeline__empty">Loading timeline…</p>
        ) : workspaceEvents.length === 0 ? (
          <div className="ws-timeline__empty">
            <p>No signals captured yet.</p>
            <p className="ws-timeline__hint">Matching events appear here as the feed updates.</p>
          </div>
        ) : (
          <div className="ws-timeline__groups">
            {grouped.map(([day, rows]) => (
              <section key={day} className="ws-timeline__group">
                <h3 className="ws-timeline__day">{day}</h3>
                <ul className="ws-timeline__list">
                  {rows.map((row) => {
                    const evt = row.event_data || {}
                    const onCanvas = canvasIds.has(row.event_id)
                    return (
                      <li key={row.id || row.event_id}>
                        <button
                          type="button"
                          className="ws-timeline__row"
                          onClick={() => handleSelect(row)}
                        >
                          <span
                            className="ws-timeline__dim"
                            style={{ backgroundColor: DIMENSION_COLORS[row.dimension || evt.dimension] || '#378ADD' }}
                          />
                          <span className={`ws-timeline__sev ws-timeline__sev--${row.priority || evt.priority || 'p3'}`} />
                          <span className="ws-timeline__content">
                            <span className="ws-timeline__title">{row.title || evt.title}</span>
                            <span className="ws-timeline__meta">
                              {row.source || evt.source}
                              {' · '}
                              {PRIORITY_LABELS[row.priority || evt.priority] || row.priority}
                              {' · '}
                              {timeAgo(row.captured_at)}
                            </span>
                          </span>
                        </button>
                        <button
                          type="button"
                          className={`ws-timeline__add ${onCanvas ? 'is-on-canvas' : ''}`}
                          title={onCanvas ? 'On canvas' : 'Add to canvas'}
                          onClick={(e) => {
                            e.stopPropagation()
                            if (!onCanvas && evt.id) addEventToCanvas(evt)
                          }}
                        >
                          {onCanvas ? '✓' : '+'}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </section>
            ))}
          </div>
        )}
      </Panel>
    </motion.aside>
  )
}
