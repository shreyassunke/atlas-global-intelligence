/**
 * Lightweight GDELT / TOP NEWS signal metrics for ?debug=1 verification.
 * Per JS realm (main vs worker); main-thread overlay reads main metrics.
 */

/** @typedef {{
 *   ttfhMs: number | null,
 *   cacheLayer: string | null,
 *   gateWaitMs: number,
 *   gdelt429Count: number,
 *   ladderRungsUsed: number | null,
 *   interactiveQueued: number,
 *   backgroundQueued: number,
 *   lastUpdated: number,
 * }} GdeltSignalMetrics
 */

/** @type {GdeltSignalMetrics} */
const metrics = {
  ttfhMs: null,
  cacheLayer: null,
  gateWaitMs: 0,
  gdelt429Count: 0,
  ladderRungsUsed: null,
  interactiveQueued: 0,
  backgroundQueued: 0,
  lastUpdated: 0,
}

/** @type {Set<(m: GdeltSignalMetrics) => void>} */
const listeners = new Set()

function bump() {
  metrics.lastUpdated = Date.now()
  for (const fn of listeners) {
    try {
      fn(getGdeltSignalMetrics())
    } catch {
      /* ignore */
    }
  }
}

export function getGdeltSignalMetrics() {
  return { ...metrics }
}

export function subscribeGdeltSignalMetrics(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function recordGateWait(ms) {
  if (!Number.isFinite(ms) || ms < 0) return
  metrics.gateWaitMs = Math.round(ms)
  bump()
}

export function recordGdelt429() {
  metrics.gdelt429Count += 1
  bump()
}

export function recordQueueDepth(interactive, background) {
  metrics.interactiveQueued = Math.max(0, interactive | 0)
  metrics.backgroundQueued = Math.max(0, background | 0)
  bump()
}

export function recordTopNewsSignal({
  ttfhMs = null,
  cacheLayer = null,
  ladderRungsUsed = null,
} = {}) {
  if (ttfhMs != null && Number.isFinite(ttfhMs)) metrics.ttfhMs = Math.round(ttfhMs)
  if (cacheLayer) metrics.cacheLayer = String(cacheLayer)
  if (ladderRungsUsed != null && Number.isFinite(ladderRungsUsed)) {
    metrics.ladderRungsUsed = ladderRungsUsed
  }
  bump()
}
