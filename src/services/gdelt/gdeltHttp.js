/**
 * Shared HTTP helpers for GDELT 2.0 REST APIs (DOC, GEO, Context, TV).
 *
 * GDELT returns an HTML error page (200 OK) when a query is malformed, so we
 * sniff the response body before parsing. All GDELT services in this project
 * go through this module so query encoding, error detection, and request
 * spacing stay consistent.
 *
 * Rate limiting + telemetry gate
 * ------------------------------
 * api.gdeltproject.org enforces ≥5s between requests per origin. Atlas sources
 * share one gate. Interactive callers (inspector ArtList, analytics) jump ahead
 * of background worker DOC/GEO legs via a priority queue, with fairness so
 * background is not starved. Single-flight coalescing merges identical URLs.
 */

import { gdeltApiProxyUrl } from '../../utils/gdeltProxyUrl.js'
import {
  recordGateWait,
  recordGdelt429,
  recordQueueDepth,
} from './gdeltSignalMetrics.js'

/** Per their docs, GDELT asks for ≥5s between requests from the same origin. */
export const GDELT_REQUEST_GAP_MS = 5500

/** After N interactive starts, allow one background (weighted fairness). */
const INTERACTIVE_BEFORE_BACKGROUND = 3

/** Cap pending jobs per priority so ladders cannot backlog the gate. */
const MAX_QUEUE_PER_PRIORITY = 6

function resolveGdeltFetchUrl(url) {
  return gdeltApiProxyUrl(url)
}

/** Extra wait after a 429 so the shared window is definitely clear. */
const GDELT_BACKOFF_AFTER_429_MS = 9000

/** Default per-request timeout so no single hung fetch holds the shared lock. */
export const GDELT_DEFAULT_TIMEOUT_MS = 20_000

/** Origin-wide lock name; shared between the main thread and all workers. */
const GDELT_LOCK_NAME = 'atlas-gdelt-gate'

const hasWebLocks =
  typeof navigator !== 'undefined' &&
  navigator.locks &&
  typeof navigator.locks.request === 'function'

let pendingBackoffMs = 0

/** @type {{ priority: string, fn: Function, resolve: Function, reject: Function, enqueuedAt: number }[]} */
const interactiveQueue = []
/** @type {{ priority: string, fn: Function, resolve: Function, reject: Function, enqueuedAt: number }[]} */
const backgroundQueue = []

let pumping = false
let interactiveSinceBackground = 0

/** @type {Map<string, Promise<unknown>>} */
const inFlightByUrl = new Map()

/**
 * After the server tells us we've hit the limit, hold the gate open long enough
 * for GDELT's counter to fully reset before the next request runs.
 */
function markGdeltRateLimited() {
  pendingBackoffMs = Math.max(pendingBackoffMs, GDELT_BACKOFF_AFTER_429_MS)
  recordGdelt429()
}

function publishQueueDepth() {
  recordQueueDepth(interactiveQueue.length, backgroundQueue.length)
}

/**
 * Run `fn`, then keep the gate held until at least `GDELT_REQUEST_GAP_MS` has
 * elapsed since the request started (or longer after a 429).
 */
async function spacedRun(fn) {
  const start = Date.now()
  try {
    return await fn()
  } finally {
    let hold = Math.max(0, GDELT_REQUEST_GAP_MS - (Date.now() - start))
    if (pendingBackoffMs > 0) {
      hold = Math.max(hold, pendingBackoffMs)
      pendingBackoffMs = 0
    }
    if (hold > 0) await new Promise((r) => setTimeout(r, hold))
  }
}

function pickNextJob() {
  const hasI = interactiveQueue.length > 0
  const hasB = backgroundQueue.length > 0
  if (!hasI && !hasB) return null
  if (hasI && (!hasB || interactiveSinceBackground < INTERACTIVE_BEFORE_BACKGROUND)) {
    interactiveSinceBackground += 1
    return interactiveQueue.shift()
  }
  if (hasB) {
    interactiveSinceBackground = 0
    return backgroundQueue.shift()
  }
  interactiveSinceBackground += 1
  return interactiveQueue.shift()
}

async function acquireAndRun(fn) {
  if (hasWebLocks) {
    return navigator.locks.request(GDELT_LOCK_NAME, () => spacedRun(fn))
  }
  return spacedRun(fn)
}

async function pumpGate() {
  if (pumping) return
  pumping = true
  try {
    while (interactiveQueue.length || backgroundQueue.length) {
      const job = pickNextJob()
      publishQueueDepth()
      if (!job) break
      const waitMs = Date.now() - job.enqueuedAt
      recordGateWait(waitMs)
      try {
        const result = await acquireAndRun(job.fn)
        job.resolve(result)
      } catch (err) {
        job.reject(err)
      }
    }
  } finally {
    pumping = false
    publishQueueDepth()
    if (interactiveQueue.length || backgroundQueue.length) {
      queueMicrotask(() => {
        pumpGate().catch(() => {})
      })
    }
  }
}

/**
 * Serialize `fn` on the shared GDELT gate with interactive vs background priority.
 * @param {() => Promise<unknown>} fn
 * @param {{ priority?: 'interactive' | 'background' }} [opts]
 */
export async function withGdeltGate(fn, { priority = 'background' } = {}) {
  const queue = priority === 'interactive' ? interactiveQueue : backgroundQueue
  if (queue.length >= MAX_QUEUE_PER_PRIORITY) {
    throw new Error(
      priority === 'interactive'
        ? 'GDELT interactive queue full — try again shortly'
        : 'GDELT background queue shed (interactive traffic)',
    )
  }
  return new Promise((resolve, reject) => {
    queue.push({
      priority,
      fn,
      resolve,
      reject,
      enqueuedAt: Date.now(),
    })
    publishQueueDepth()
    void pumpGate()
  })
}

/**
 * Combine an optional caller `AbortSignal` with a timeout so every gated fetch
 * is bounded. Returns the signal to pass to `fetch` plus a `cleanup` to clear
 * the timer / listener once the request settles.
 */
function withTimeout(signal, timeoutMs) {
  const ctrl = new AbortController()
  const onAbort = () => ctrl.abort(signal?.reason)
  if (signal) {
    if (signal.aborted) ctrl.abort(signal.reason)
    else signal.addEventListener('abort', onAbort, { once: true })
  }
  const timer = setTimeout(() => {
    ctrl.abort(new DOMException(`GDELT request timed out after ${timeoutMs}ms`, 'TimeoutError'))
  }, timeoutMs)
  const cleanup = () => {
    clearTimeout(timer)
    if (signal) signal.removeEventListener('abort', onAbort)
  }
  return { signal: ctrl.signal, cleanup }
}

/**
 * Build a URL with query params. Values that are `null`/`undefined` are skipped
 * so callers can pass optional params as `undefined`.
 */
export function buildGdeltUrl(base, params) {
  const sp = new URLSearchParams()
  for (const [k, v] of Object.entries(params || {})) {
    if (v === undefined || v === null || v === '') continue
    sp.set(k, String(v))
  }
  const qs = sp.toString()
  return qs ? `${base}?${qs}` : base
}

function isHtmlLike(text) {
  const head = String(text || '').trimStart().slice(0, 32).toLowerCase()
  return head.startsWith('<!doctype') || head.startsWith('<html') || head.startsWith('<')
}

/**
 * GDELT emits plain-text (not HTML) rate-limit messages with 200 or 429
 * depending on path, so we pattern-match the body as a second signal.
 */
function isGdeltRateLimitBody(text) {
  const s = String(text || '').trim().toLowerCase()
  return s.startsWith('please limit requests') || s.includes('one every 5 seconds')
}

async function runGdeltFetch(url, { signal, timeoutMs, asJson }) {
  const { signal: gated, cleanup } = withTimeout(signal, timeoutMs)
  try {
    const res = await fetch(resolveGdeltFetchUrl(url), { signal: gated })
    if (res.status === 429) {
      markGdeltRateLimited()
      throw new Error('GDELT HTTP 429 (rate-limited)')
    }
    if (!res.ok) throw new Error(`GDELT HTTP ${res.status}`)
    const ct = res.headers.get('content-type') || ''
    const text = await res.text()
    if (!text) return asJson ? null : ''
    if (isGdeltRateLimitBody(text)) {
      markGdeltRateLimited()
      throw new Error('GDELT rate-limited (please limit requests)')
    }
    if (asJson) {
      if (ct.includes('text/html') || isHtmlLike(text)) {
        const snippet = text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160)
        throw new Error(snippet || 'GDELT returned HTML (invalid query?)')
      }
      try {
        return JSON.parse(text)
      } catch (e) {
        throw new Error(`GDELT JSON parse failed: ${e.message}`)
      }
    }
    if (isHtmlLike(text)) throw new Error('GDELT returned HTML (invalid query?)')
    return text
  } finally {
    cleanup()
  }
}

/**
 * Single-flight + gated fetch. Identical URLs share one in-flight promise.
 * @param {string} url
 * @param {{ signal?: AbortSignal, timeoutMs?: number, priority?: 'interactive' | 'background' }} [opts]
 */
export async function fetchGdeltJson(
  url,
  { signal, timeoutMs = GDELT_DEFAULT_TIMEOUT_MS, priority = 'background' } = {},
) {
  const coalesceKey = `json:${priority}:${url}`
  const existing = inFlightByUrl.get(coalesceKey)
  if (existing) return existing

  const promise = withGdeltGate(
    () => runGdeltFetch(url, { signal, timeoutMs, asJson: true }),
    { priority },
  ).finally(() => {
    inFlightByUrl.delete(coalesceKey)
  })

  inFlightByUrl.set(coalesceKey, promise)
  return promise
}

/** Fetch GeoJSON/CSV/text body; throws when the response appears to be HTML. */
export async function fetchGdeltText(
  url,
  { signal, timeoutMs = GDELT_DEFAULT_TIMEOUT_MS, priority = 'background' } = {},
) {
  const coalesceKey = `text:${priority}:${url}`
  const existing = inFlightByUrl.get(coalesceKey)
  if (existing) return existing

  const promise = withGdeltGate(
    () => runGdeltFetch(url, { signal, timeoutMs, asJson: false }),
    { priority },
  ).finally(() => {
    inFlightByUrl.delete(coalesceKey)
  })

  inFlightByUrl.set(coalesceKey, promise)
  return promise
}

/** Small sleep helper. */
export function delay(ms) {
  return new Promise((r) => setTimeout(r, ms))
}
