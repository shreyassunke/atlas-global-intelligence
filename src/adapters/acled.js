/**
 * ACLED conflict events adapter — Tier C, keyed.
 * https://acleddata.com
 */
import { SOURCE_TIERS } from './types.js'

/** @type {import('./types.js').SourceAdapter} */
export const acledAdapter = {
  id: 'acled',
  tier: SOURCE_TIERS.C,
  pollIntervalMs: 300_000,
  requiredEnv: ['ACLED_KEY', 'ACLED_EMAIL'],

  metadata() {
    return {
      label: 'ACLED Conflict Events',
      module: 'conflict',
      dimension: 'safety',
      tier: SOURCE_TIERS.C,
      coverage: 'regional',
      authoritative: true,
      requiresKey: true,
      pollIntervalMs: 300_000,
      sourceUrl: 'https://acleddata.com',
      apiKeyHelpUrl: 'https://acleddata.com/data-export-tool/',
    }
  },

  buildPollConfig(envKeys) {
    const key = envKeys.ACLED_KEY?.trim()
    const email = envKeys.ACLED_EMAIL?.trim()
    if (!key || !email) return null
    return {
      url: `https://api.acleddata.com/acled/read?key=${key}&email=${email}&limit=50&fields=event_date|event_type|actor1|fatalities|latitude|longitude|notes|country`,
      format: 'json',
      pollInterval: 300_000,
    }
  },

  normalize(data, { createEventId, makeEvent }) {
    if (!data?.data) return []
    return data.data.slice(0, 50).map((e) => {
      const lat = parseFloat(e.latitude)
      const lng = parseFloat(e.longitude)
      if (Number.isNaN(lat) || Number.isNaN(lng)) return null
      const fatalities = parseInt(e.fatalities, 10) || 0
      let priority = 'p2'
      let severity = 2
      if (fatalities >= 100) { priority = 'p1'; severity = 5 }
      else if (fatalities >= 21) { priority = 'p1'; severity = 4 }
      else if (fatalities >= 6) { priority = 'p2'; severity = 3 }
      else if (fatalities === 0) { priority = 'p3'; severity = 1 }
      return makeEvent({
        id: createEventId(lat, lng, Date.parse(e.event_date || Date.now()), 'acled', e.notes?.substring(0, 50) || ''),
        priority,
        dimension: 'safety',
        lat,
        lng,
        severity,
        corroborationSources: ['acled'],
        authoritative: true,
        ttl: 300,
        title: `${e.event_type || 'Conflict'}: ${e.country || 'Unknown'} — ${e.actor1 || ''}`,
        detail: `${e.notes || ''}${fatalities > 0 ? ` Fatalities: ${fatalities}.` : ''}`,
        source: 'ACLED',
        sourceUrl: 'https://acleddata.com',
        tags: ['conflict', e.event_type, e.country].filter(Boolean),
        timestamp: e.event_date ? new Date(e.event_date).toISOString() : new Date().toISOString(),
        actor1: e.actor1 || undefined,
      })
    }).filter(Boolean)
  },

  health(ctx = {}) {
    if (ctx.lastError) {
      return { status: 'degraded', message: ctx.lastError }
    }
    return { status: 'ok', message: 'ACLED polling active' }
  },
}
