import { SEVERITY_SIZES, CORROBORATION_OPACITY, getRecencyState } from './eventSchema.js'

export function getSeveritySize(severity) {
  return SEVERITY_SIZES[severity] || SEVERITY_SIZES[1]
}

export function getOpacity(corroborationCount, authoritative) {
  const count = Math.min(Math.max(corroborationCount || 1, 1), 5)
  const base = CORROBORATION_OPACITY[count] || 0.35
  return authoritative && count === 1 ? Math.max(0.75, base) : base
}

export function getAnimationState(timestamp) {
  return getRecencyState(timestamp)
}

export function getTtlProgress(fetchedAt, ttl) {
  const elapsed = (Date.now() - new Date(fetchedAt).getTime()) / 1000
  return Math.min(1, elapsed / ttl)
}

export function getStaleOpacity(event) {
  const progress = getTtlProgress(event.fetchedAt, event.ttl)
  if (progress < 0.8) return event.opacity
  const fadeProgress = (progress - 0.8) / 0.2
  return event.opacity * (1 - fadeProgress)
}
