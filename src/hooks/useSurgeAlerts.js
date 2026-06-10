import { useEffect, useRef } from 'react'
import { useAtlasStore } from '../store/atlasStore'
import { fetchEventSurge } from '../services/gdelt/bigqueryService'
import { loadCountryIndex, resolveWatchlistCountries } from '../services/countryIndex'

/**
 * Phase 4 — watchlist-country surge alerts for the Triage feed.
 *
 * Resolves the user's watchlists to countries, then polls the `eventSurge`
 * BigQuery template (events this week vs the 30-day baseline) hourly per
 * country. Days with z >= SURGE_Z_THRESHOLD become `surgeAlerts` rows in
 * the store, which `buildTriageRows` ranks into the Triage tab.
 */

const SURGE_POLL_MS = 3600_000
const SURGE_Z_THRESHOLD = 2
/** Hard cap on BigQuery fan-out per poll, regardless of watchlist size. */
const MAX_SURGE_COUNTRIES = 6

export function useSurgeAlerts(enabled = true) {
  const watchlists = useAtlasStore((s) => s.watchlists)
  const timerRef = useRef(null)

  useEffect(() => {
    if (!enabled || !watchlists?.length) {
      useAtlasStore.getState().setSurgeAlerts([])
      return undefined
    }

    let cancelled = false
    const controller = new AbortController()

    async function poll() {
      let countries
      try {
        const index = await loadCountryIndex()
        countries = resolveWatchlistCountries(watchlists, index).slice(0, MAX_SURGE_COUNTRIES)
      } catch {
        return
      }
      if (cancelled || countries.length === 0) {
        if (!cancelled) useAtlasStore.getState().setSurgeAlerts([])
        return
      }

      const alerts = []
      for (const country of countries) {
        try {
          const rows = await fetchEventSurge(country.fips, { limit: 8, signal: controller.signal })
          if (cancelled) return
          // Rows come back date-DESC. Today's UTC partition is partial, so
          // consider the two most recent days and keep the stronger signal.
          const candidates = rows.slice(0, 2).filter((r) => Number.isFinite(Number(r.zScore)))
          const best = candidates.sort((a, b) => Number(b.zScore) - Number(a.zScore))[0]
          if (best && Number(best.zScore) >= SURGE_Z_THRESHOLD) {
            alerts.push({
              fips: country.fips,
              iso: country.iso,
              name: country.name,
              lat: country.lat,
              lng: country.lng,
              watchlist: country.watchlist,
              zScore: Number(best.zScore),
              events: Number(best.events) || 0,
              date: best.date?.value || best.date || null,
              checkedAt: new Date().toISOString(),
            })
          }
        } catch {
          // Proxy unavailable (no BigQuery credentials in dev) or aborted —
          // surge alerts simply stay absent for this country.
          if (cancelled) return
        }
      }

      if (!cancelled) useAtlasStore.getState().setSurgeAlerts(alerts)
    }

    poll()
    timerRef.current = setInterval(poll, SURGE_POLL_MS)

    return () => {
      cancelled = true
      controller.abort()
      clearInterval(timerRef.current)
    }
  }, [enabled, watchlists])
}

export default useSurgeAlerts
