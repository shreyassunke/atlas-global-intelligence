import { useMemo } from 'react'
import { useAtlasStore } from '../../store/atlasStore'
import { formatToneScore } from '../../core/eventSchema'

function timeAgo(dateStr) {
  if (!dateStr) return ''
  const diff = Date.now() - new Date(dateStr).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

function formatDay(dateStr) {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleDateString([], { month: 'short', day: 'numeric' })
}

/**
 * EventTimeline — same-story thread across days (shared threadId / correlated IDs).
 */
export default function EventTimeline({ event }) {
  const events = useAtlasStore((s) => s.events)
  const setSelectedEvent = useAtlasStore((s) => s.setSelectedEvent)

  const threadEvents = useMemo(() => {
    if (!event) return []

    const correlated = new Set(event.correlatedEventIds || [])

    return events
      .filter((e) => {
        if (e.id === event.id) return false
        if (event.threadId && e.threadId === event.threadId) return true
        if (correlated.has(e.id)) return true
        if (e.correlatedEventIds?.includes(event.id)) return true
        return false
      })
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
      .slice(0, 12)
  }, [event, events])

  if (!event?.threadId && !(event?.correlatedEventIds?.length)) return null

  return (
    <div className="causal-thread">
      <div className="causal-thread-header">Story Thread</div>

      {threadEvents.length === 0 ? (
        <div className="causal-thread-empty">No linked updates yet</div>
      ) : (
        <div className="causal-thread-list">
          {threadEvents.map((item, index) => {
            const tone = item.toneScore != null ? formatToneScore(item.toneScore) : null
            return (
              <button
                key={item.id}
                type="button"
                className="causal-thread-item"
                onClick={() => setSelectedEvent(item)}
              >
                <div className="causal-thread-connector">
                  <div className="causal-thread-dot" style={{ backgroundColor: 'rgba(55, 138, 221, 0.85)' }} />
                  {index < threadEvents.length - 1 && <div className="causal-thread-line" />}
                </div>
                <div className="causal-thread-content">
                  <span className="causal-thread-dim" style={{ color: 'rgba(55, 138, 221, 0.9)' }}>
                    {formatDay(item.timestamp)} · {timeAgo(item.timestamp)}
                  </span>
                  <span className="causal-thread-title">{item.title}</span>
                  <span className="causal-thread-meta">
                    {(item.corroborationSources || []).join(', ') || item.source}
                    {tone && (
                      <>
                        {' '}
                        · tone {tone.score} ({tone.label})
                      </>
                    )}
                  </span>
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
