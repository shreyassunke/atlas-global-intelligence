/**
 * ATLAS 24-hour cycle — live surfaces only show events by publication /
 * event timestamp, never by re-fetch time. Persistence beyond the cycle
 * is user-pin → investigation canvas only (not the globe).
 */

/** Hard retention window for live bus, triage, ticker, and globe pins. */
export const ATLAS_CYCLE_MS = 24 * 3600_000

/** Sub-window for the HUD "live" filter (still capped by the cycle). */
export const ATLAS_LIVE_WINDOW_MS = 2 * 3600_000

/** Tolerate slight clock skew / future-dated feed stamps. */
const FUTURE_SKEW_MS = 60 * 60_000

/**
 * Event age clock — publication / occurrence time only.
 * Does not fall back to fetchedAt for retention (re-poll must not revive
 * multi-day RSS items).
 * @param {object|null|undefined} evt
 * @returns {number} ms epoch, or NaN
 */
export function eventTimestampMs(evt) {
  if (!evt) return NaN
  const t = evt.timestamp ? new Date(evt.timestamp).getTime() : NaN
  return Number.isFinite(t) ? t : NaN
}

/**
 * True if the event belongs in the ATLAS 24h live cycle.
 * @param {object|null|undefined} evt
 * @param {number} [now]
 */
export function isWithinAtlasCycle(evt, now = Date.now()) {
  const ts = eventTimestampMs(evt)
  if (!Number.isFinite(ts)) return false
  const age = now - ts
  if (age < -FUTURE_SKEW_MS) return false
  return age <= ATLAS_CYCLE_MS
}

/**
 * Globe / brief time-filter gate. Windows longer than 24h are clamped to
 * the platform cycle (7d/30d remain analytics query spans elsewhere).
 * @param {object} evt
 * @param {string} [timeFilter] 'live' | '24h' | '7d' | '30d'
 * @param {number} [now]
 */
export function passesAtlasTimeFilter(evt, timeFilter = 'live', now = Date.now()) {
  if (!isWithinAtlasCycle(evt, now)) return false
  const ts = eventTimestampMs(evt)
  const maxAgeMs = timeFilter === 'live' ? ATLAS_LIVE_WINDOW_MS : ATLAS_CYCLE_MS
  return now - ts <= maxAgeMs
}

/**
 * Filter an event array to the live cycle (used at ingest / cache emit).
 * Live tracks without a usable timestamp keep short-TTL handling elsewhere;
 * if timestamp is missing they are dropped from the 24h cycle.
 * @param {object[]} events
 * @param {number} [now]
 */
export function filterToAtlasCycle(events, now = Date.now()) {
  if (!Array.isArray(events) || !events.length) return []
  return events.filter((e) => {
    // Ambient tracks are position snapshots — keep if present; TTL culls them.
    if (e?.trackKind === 'aircraft' || e?.trackKind === 'satellite'
      || e?.trackKind === 'vessel' || e?.trackKind === 'storm') {
      return true
    }
    return isWithinAtlasCycle(e, now)
  })
}

/**
 * Evidence / canvas pin ids — these must never plot on the live globe.
 * @param {{ evidence?: Array<{ id?: string }> }|null|undefined} investigation
 * @returns {Set<string>}
 */
export function pinnedEventIds(investigation) {
  const set = new Set()
  for (const item of investigation?.evidence || []) {
    if (item?.id) set.add(item.id)
  }
  return set
}
