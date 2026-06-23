/**
 * Auto-suggested canvas links — corroboration, proximity, temporal overlap.
 * No ML; deterministic rules from crossSourceMerge + CausalThread patterns.
 */
import { haversineKm, titleSimilarity } from './crossSourceMerge.js'

const PROXIMITY_KM = 200
const TEMPORAL_MS = 7 * 24 * 3600_000

/**
 * @param {import('./investigationSchema.js').Investigation} investigation
 * @returns {Array<{ id: string, from: string, to: string, label: string, type: 'fact'|'hypothesis'|'correlation', reason: string }>}
 */
export function suggestCanvasConnections(investigation) {
  if (!investigation?.evidence?.length) return []

  const evidence = investigation.evidence.filter((e) => e.kind === 'event' || e.kind === 'article')
  const existing = new Set(
    (investigation.connections || []).map((c) => `${c.from}|${c.to}|${c.type}`),
  )
  const suggestions = []

  const push = (from, to, label, type, reason) => {
    if (from === to) return
    const key = `${from}|${to}|${type}`
    const rev = `${to}|${from}|${type}`
    if (existing.has(key) || existing.has(rev)) return
    suggestions.push({
      id: `sug-${from}-${to}-${type}`,
      from,
      to,
      label,
      type,
      reason,
    })
  }

  for (let i = 0; i < evidence.length; i++) {
    for (let j = i + 1; j < evidence.length; j++) {
      const a = evidence[i]
      const b = evidence[j]

      const sharedCorroboration = (a.corroborationSources || []).some((s) =>
        (b.corroborationSources || []).includes(s),
      )
      if (sharedCorroboration && a.corroborationSources?.length > 1) {
        push(a.id, b.id, 'Corroborated', 'fact', 'Shared independent sources')
        continue
      }

      if (a.lat != null && b.lat != null && a.lng != null && b.lng != null) {
        const dist = haversineKm(a.lat, a.lng, b.lat, b.lng)
        if (dist <= PROXIMITY_KM) {
          const ta = a.timestamp ? new Date(a.timestamp).getTime() : 0
          const tb = b.timestamp ? new Date(b.timestamp).getTime() : 0
          if (ta && tb && Math.abs(ta - tb) <= TEMPORAL_MS) {
            const sim = titleSimilarity(a.title, b.title)
            if (sim >= 0.35 || a.dimension === b.dimension) {
              push(
                a.id,
                b.id,
                dist < 50 ? 'Co-located' : 'Regional',
                sim >= 0.5 ? 'fact' : 'correlation',
                `${Math.round(dist)} km · ${a.dimension || 'signal'}`,
              )
            }
          }
        }
      }

      if (a.dimension && b.dimension && a.dimension !== b.dimension) {
        const ta = a.timestamp ? new Date(a.timestamp).getTime() : 0
        const tb = b.timestamp ? new Date(b.timestamp).getTime() : 0
        if (ta && tb && Math.abs(ta - tb) <= 48 * 3600_000) {
          if (a.lat != null && b.lat != null && haversineKm(a.lat, a.lng, b.lat, b.lng) <= PROXIMITY_KM) {
            push(a.id, b.id, 'Cross-domain', 'hypothesis', `${a.dimension} ↔ ${b.dimension}`)
          }
        }
      }
    }
  }

  return suggestions.slice(0, 12)
}
