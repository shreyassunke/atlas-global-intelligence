/**
 * Workbench — Triage tab (Phase 4, default tab).
 *
 * "What changed since you looked": one ranked list of new P1 events,
 * corroboration upgrades, tone disputes, anomalies (spikes / blackouts /
 * composites) and watchlist-country surges. Every row carries severity,
 * a confidence badge and a one-line "why this matters"; clicking flies the
 * globe there and opens the Inspector.
 */
import { useEffect, useMemo, useRef } from 'react'
import { useAtlasStore } from '../../store/atlasStore'
import { DIMENSION_COLORS, DIMENSION_ICONS } from '../../core/eventSchema'
import { buildTriageRows } from '../../core/triage'

const SEVERITY_COLORS = {
  5: '#ff4d4d',
  4: '#ff8a4d',
  3: '#f0b429',
  2: '#6eb5ff',
  1: 'rgba(255,255,255,0.45)',
}

const KIND_LABELS = {
  p1: 'Breaking',
  corroboration: 'Upgrade',
  dispute: 'Dispute',
  anomaly: 'Anomaly',
  surge: 'Surge',
}

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

export default function TriageTab() {
  const events = useAtlasStore((s) => s.events)
  const eventMap = useAtlasStore((s) => s.eventMap)
  const anomalies = useAtlasStore((s) => s.anomalies)
  const surgeAlerts = useAtlasStore((s) => s.surgeAlerts)
  const watchlists = useAtlasStore((s) => s.watchlists)
  const user = useAtlasStore((s) => s.user)
  const setSelectedEvent = useAtlasStore((s) => s.setSelectedEvent)
  const flyToLocation = useAtlasStore((s) => s.flyToLocation)

  // Freeze "last seen" at mount so NEW tags survive this visit, then mark the
  // visit (on mount and again on unmount, covering rows that streamed in
  // while the tab was open).
  const sinceRef = useRef(useAtlasStore.getState().triageLastSeenAt)
  useEffect(() => {
    const { markTriageSeen } = useAtlasStore.getState()
    markTriageSeen()
    return () => markTriageSeen()
  }, [])

  const rows = useMemo(
    () => buildTriageRows({
      events,
      eventMap,
      anomalies,
      surgeAlerts,
      lastSeenAt: sinceRef.current,
    }),
    [events, eventMap, anomalies, surgeAlerts],
  )

  const newCount = useMemo(() => rows.filter((r) => r.isNew).length, [rows])

  const handleRowClick = (row) => {
    if (row.event) setSelectedEvent(row.event)
    const lat = row.lat ?? row.event?.lat
    const lng = row.lng ?? row.event?.lng
    if (lat != null && lng != null) flyToLocation({ lat, lng })
  }

  return (
    <div className="triage-tab">
      <div className="triage-summary">
        <span className="triage-summary-count">
          {newCount > 0 ? `${newCount} new since your last visit` : 'Nothing new since your last visit'}
        </span>
        <span className="triage-summary-window">24h window · {rows.length} items</span>
      </div>

      {user && watchlists.length === 0 && (
        <p className="triage-hint">
          Add watchlists in Settings to get per-country surge alerts here.
        </p>
      )}

      {rows.length === 0 ? (
        <p className="triage-empty">
          Quiet for now — new breaking events, corroboration upgrades,
          anomalies and watchlist surges will appear here.
        </p>
      ) : (
        <ul className="triage-list">
          {rows.map((row) => (
            <li key={row.id}>
              <button
                type="button"
                className={`triage-row ${row.isNew ? 'is-new' : ''}`}
                onClick={() => handleRowClick(row)}
                style={{ '--row-accent': DIMENSION_COLORS[row.dimension] || 'rgba(255,255,255,0.25)' }}
              >
                <span
                  className="triage-sev"
                  style={{ color: SEVERITY_COLORS[row.severity] || SEVERITY_COLORS[1] }}
                  title={`Severity ${row.severity}/5`}
                >
                  S{row.severity}
                </span>

                <span className="triage-row-main">
                  <span className="triage-row-meta">
                    {row.isNew && <span className="triage-new-tag">NEW</span>}
                    <span className="triage-kind">{KIND_LABELS[row.kind] || row.kind}</span>
                    {row.dimension && (
                      <span className="triage-dim" style={{ color: DIMENSION_COLORS[row.dimension] }}>
                        {DIMENSION_ICONS[row.dimension]}
                      </span>
                    )}
                    <span className="triage-time">{timeAgo(row.timestamp)}</span>
                  </span>
                  <span className="triage-title">{row.title}</span>
                  <span className="triage-why">{row.why}</span>
                  <span
                    className={`triage-confidence tone-${row.confidence.tone}`}
                    title={row.confidence.sources?.length
                      ? `Corroborated by: ${row.confidence.sources.join(', ')}`
                      : undefined}
                  >
                    {row.confidence.label}
                    {row.confidence.sources?.length > 1 && (
                      <span className="triage-confidence-sources">
                        {' '}· {row.confidence.sources.slice(0, 3).join(' · ')}
                        {row.confidence.sources.length > 3 ? ` +${row.confidence.sources.length - 3}` : ''}
                      </span>
                    )}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
