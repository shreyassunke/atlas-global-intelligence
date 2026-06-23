/**
 * Shared HTTP helpers for GDELT 2.0 REST APIs (DOC, GEO, Context, TV).
 *
 * GDELT returns an HTML error page (200 OK) when a query is malformed, so we
 * sniff the response body before parsing. All GDELT services in this project
 * go through this module so query encoding, error detection, and request
 * spacing stay consistent.
 *
 * Rate limiting
 * -------------
 * api.gdeltproject.org enforces a strict "≥5s between requests" policy per
 * origin and responds with HTTP 429 (or a plain-text "Please limit requests
 * to one every 5 seconds" body) the moment it's crossed. Different Atlas
 * sources — the fetch worker's DOC chain, analytics panel queries, the geo
 * overlay hook, summary/context/TV services — all call GDELT concurrently,
 * so relying on per-call sleeps is not enough: a shared gate is required.
 *
 * `withGdeltGate` serializes `fn` and guarantees a minimum spacing of
 * `GDELT_REQUEST_GAP_MS` between the *start* of any two GDELT REST calls. When
 * the Web Locks API is available (all modern browsers + Web Workers) the gate
 * is held on a single named lock that is shared across the page and every
 * worker on the same origin, so the fetch-manager worker's DOC chain, the
 * analytics panel, the geo overlay and summary/context/TV calls can no longer
 * fire concurrently and trip GDELT's "1 request / 5s" limiter. Older runtimes
 * fall back to a per-context promise queue. The gate also backs off after a
 * 429 so the rate-limit window clears before the next caller runs.
 */

import { gdeltApiProxyUrl } from '../../utils/gdeltProxyUrl.js'

/** Per their docs, GDELT asks for ≥5s between requests from the same origin. */
export const GDELT_REQUEST_GAP_MS = 5500

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

let gdeltQueueTail = Promise.resolve()
let pendingBackoffMs = 0

/**
 * After the server tells us we've hit the limit, hold the gate open long enough
 * for GDELT's counter to fully reset before the next request runs. Read (and
 * cleared) by `spacedRun` inside the lock so the backoff applies origin-wide.
 */
function markGdeltRateLimited() {
  pendingBackoffMs = Math.max(pendingBackoffMs, GDELT_BACKOFF_AFTER_429_MS)
}

/**
 * Run `fn`, then keep the gate held until at least `GDELT_REQUEST_GAP_MS` has
 * elapsed since the request started (or longer after a 429). Spacing the
 * *starts* of requests — rather than waiting a full gap after each completes —
 * keeps throughput at GDELT's documented ceiling instead of well under it.
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

/**
 * Serialize `fn` on the shared GDELT gate, enforcing the minimum inter-request
 * spacing. Errors from `fn` propagate; the spacing still applies so a failed
 * request counts against the rate-limit window.
 */
async function withGdeltGate(fn) {
  if (hasWebLocks) {
    return navigator.locks.request(GDELT_LOCK_NAME, () => spacedRun(fn))
  }
  // Fallback (older runtimes): serialize within this JS context only.
  const prev = gdeltQueueTail
  let release
  gdeltQueueTail = new Promise((r) => {
    release = r
  })
  try {
    await prev
    return await spacedRun(fn)
  } finally {
    release()
  }
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

/** Fetch JSON from GDELT; throws Error with a human message when the API returns HTML. */
export async function fetchGdeltJson(url, { signal, timeoutMs = GDELT_DEFAULT_TIMEOUT_MS } = {}) {
  return withGdeltGate(async () => {
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
      if (!text) return null
      if (isGdeltRateLimitBody(text)) {
        markGdeltRateLimited()
        throw new Error('GDELT rate-limited (please limit requests)')
      }
      if (ct.includes('text/html') || isHtmlLike(text)) {
        const snippet = text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160)
        throw new Error(snippet || 'GDELT returned HTML (invalid query?)')
      }
      try {
        return JSON.parse(text)
      } catch (e) {
        throw new Error(`GDELT JSON parse failed: ${e.message}`)
      }
    } finally {
      cleanup()
    }
  })
}

/** Fetch GeoJSON/CSV/text body; throws when the response appears to be HTML. */
export async function fetchGdeltText(url, { signal, timeoutMs = GDELT_DEFAULT_TIMEOUT_MS } = {}) {
  return withGdeltGate(async () => {
    const { signal: gated, cleanup } = withTimeout(signal, timeoutMs)
    try {
      const res = await fetch(resolveGdeltFetchUrl(url), { signal: gated })
      if (res.status === 429) {
        markGdeltRateLimited()
        throw new Error('GDELT HTTP 429 (rate-limited)')
      }
      if (!res.ok) throw new Error(`GDELT HTTP ${res.status}`)
      const text = await res.text()
      if (isGdeltRateLimitBody(text)) {
        markGdeltRateLimited()
        throw new Error('GDELT rate-limited (please limit requests)')
      }
      if (isHtmlLike(text)) throw new Error('GDELT returned HTML (invalid query?)')
      return text
    } finally {
      cleanup()
    }
  })
}

/** Small sleep helper. */
export function delay(ms) {
  return new Promise((r) => setTimeout(r, ms))
}
