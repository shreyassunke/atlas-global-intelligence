/**
 * Data-layer catalog — globe wiring, API keys, and mode compatibility for Settings UI.
 */

/** @typedef {'cesium'|'globegl'|'leaflet'} GlobeModeId */

/**
 * @typedef {object} LayerCatalogEntry
 * @property {string} label
 * @property {string[]} [sources] — fetchManager source ids
 * @property {GlobeModeId[]} globeModes — where the layer renders
 * @property {string} [globeModeNote] — shown when current mode unsupported
 * @property {string} [apiKeyEnv] — VITE_* (client) or server env name
 * @property {boolean} [apiKeyServerOnly] — key must be in .env.local / Vercel, not VITE_
 * @property {string} [apiKeyHelpUrl]
 * @property {boolean} [optIn] — layer defaults OFF (must be === true to enable)
 * @property {boolean} [subLayer] — depends on parent layer (e.g. adsbMilitary)
 * @property {string} [parentLayer]
 */

/** @type {Record<string, LayerCatalogEntry>} */
export const LAYER_CATALOG = {
  gdelt: {
    label: 'GDELT Geopolitics',
    sources: ['gdelt', 'gdelt-cameo'],
    globeModes: ['cesium', 'globegl', 'leaflet'],
  },
  gdeltHeatmap: {
    label: 'GDELT Heatmap',
    sources: ['gdelt', 'gdelt-cameo'],
    globeModes: ['cesium', 'globegl', 'leaflet'],
    optIn: true,
  },
  gdeltChoropleth: {
    label: 'GDELT Country Tone',
    sources: ['gdelt', 'gdelt-cameo'],
    globeModes: ['cesium', 'globegl', 'leaflet'],
    optIn: true,
  },
  firms: {
    label: 'NASA FIRMS Fires',
    sources: ['firms'],
    globeModes: ['cesium', 'globegl', 'leaflet'],
    apiKeyEnv: 'VITE_FIRMS_MAP_KEY',
    apiKeyHelpUrl: 'https://firms.modaps.eosdis.nasa.gov/api/map_key/',
  },
  usgs: {
    label: 'USGS Earthquakes',
    sources: ['usgs'],
    globeModes: ['cesium', 'globegl', 'leaflet'],
  },
  gdacs: {
    label: 'GDACS Disasters',
    sources: ['gdacs'],
    globeModes: ['cesium', 'globegl', 'leaflet'],
  },
  eonet: {
    label: 'NASA EONET',
    sources: ['eonet'],
    globeModes: ['cesium', 'globegl', 'leaflet'],
  },
  adsb: {
    label: 'ADS-B Aircraft',
    sources: ['opensky'],
    globeModes: ['cesium', 'globegl', 'leaflet'],
  },
  adsbMilitary: {
    label: 'Military Aircraft',
    sources: ['opensky'],
    globeModes: ['cesium', 'globegl', 'leaflet'],
    subLayer: true,
    parentLayer: 'adsb',
  },
  satellites: {
    label: 'Satellites',
    sources: ['celestrak-tle'],
    globeModes: ['cesium', 'globegl', 'leaflet'],
    optIn: true,
  },
  ais: {
    label: 'AIS Vessels',
    sources: ['aisstream'],
    globeModes: ['cesium', 'globegl', 'leaflet'],
    apiKeyEnv: 'AISSTREAM_API_KEY',
    apiKeyServerOnly: true,
    apiKeyHelpUrl: 'https://aisstream.io/apikeys',
    optIn: true,
  },
  nhcStorms: {
    label: 'Hurricane Tracks',
    sources: ['noaa-nhc'],
    globeModes: ['cesium', 'globegl', 'leaflet'],
    optIn: true,
  },
  gibsTrueColor: {
    label: 'GIBS True Color',
    globeModes: ['globegl', 'leaflet'],
    globeModeNote: 'Switch to Globe.GL or 2D Map — Google 3D has no WMTS overlay',
    optIn: true,
  },
  gibsFires: {
    label: 'GIBS Fires',
    globeModes: ['globegl', 'leaflet'],
    globeModeNote: 'Switch to Globe.GL or 2D Map',
    optIn: true,
  },
  gibsAerosol: {
    label: 'GIBS Aerosol',
    globeModes: ['globegl', 'leaflet'],
    globeModeNote: 'Switch to Globe.GL or 2D Map',
    optIn: true,
  },
  gibsDust: {
    label: 'GIBS Dust',
    globeModes: ['globegl', 'leaflet'],
    globeModeNote: 'Switch to Globe.GL or 2D Map',
    optIn: true,
  },
  gibsClouds: {
    label: 'GIBS Clouds',
    globeModes: ['globegl', 'leaflet'],
    globeModeNote: 'Switch to Globe.GL or 2D Map',
    optIn: true,
  },
  gibsBlackMarble: {
    label: 'Night City Lights',
    globeModes: ['globegl'],
    globeModeNote: 'Globe.GL only',
    optIn: true,
  },
  terminator: {
    label: 'Day/Night Terminator',
    globeModes: ['cesium', 'globegl', 'leaflet'],
  },
  windOverlay: {
    label: 'Wind Particles',
    globeModes: ['globegl'],
    globeModeNote: 'Globe.GL only — animated Open-Meteo wind field',
    optIn: true,
  },
  bluesky: {
    label: 'Bluesky Social',
    sources: ['bluesky'],
    globeModes: ['cesium', 'globegl', 'leaflet'],
    optIn: true,
  },
  factCheck: {
    label: 'Fact Check Claims',
    sources: ['fact-check'],
    globeModes: ['cesium', 'globegl', 'leaflet'],
    apiKeyEnv: 'GOOGLE_FACT_CHECK_API_KEY',
    apiKeyServerOnly: true,
    apiKeyHelpUrl: 'https://developers.google.com/fact-check/tools/api',
    optIn: true,
  },
}

const GLOBE_MODE_LABELS = {
  cesium: 'Google 3D',
  globegl: 'Globe.GL',
  leaflet: '2D Map',
}

/**
 * @param {string} layerKey
 * @param {GlobeModeId} globeMode
 */
export function layerAppliesToMode(layerKey, globeMode) {
  const cfg = LAYER_CATALOG[layerKey]
  if (!cfg?.globeModes) return true
  return cfg.globeModes.includes(globeMode)
}

export { GLOBE_MODE_LABELS }

/**
 * @param {string} layerKey
 * @param {Record<string, boolean>} dataLayers
 */
export function isLayerToggleOn(layerKey, dataLayers) {
  const cfg = LAYER_CATALOG[layerKey]
  if (cfg?.optIn) return dataLayers?.[layerKey] === true
  if (layerKey === 'terminator') return dataLayers?.[layerKey] !== false
  return dataLayers?.[layerKey] !== false
}

/**
 * @param {string} envName
 * @param {boolean} [serverOnly]
 */
export function hasApiKeyConfigured(envName, serverOnly = false) {
  if (!envName) return true
  if (serverOnly) {
    // Client cannot read server keys; defer to source status warnings
    return true
  }
  const viteName = envName.startsWith('VITE_') ? envName : `VITE_${envName}`
  const val = import.meta.env?.[viteName] || import.meta.env?.[envName]
  return Boolean(val && String(val).trim())
}

/**
 * @param {string} layerKey
 * @param {{
 *   dataLayers: Record<string, boolean>,
 *   sourceStatuses: Record<string, object>,
 *   globeMode: string,
 *   events?: object[],
 * }} ctx
 * @returns {{ tone: 'off'|'ok'|'empty'|'warn'|'error'|'mode', message: string } | null}
 */
export function getLayerHealth(layerKey, ctx) {
  const cfg = LAYER_CATALOG[layerKey]
  if (!cfg) return null

  const on = isLayerToggleOn(layerKey, ctx.dataLayers)
  if (!on) return { tone: 'off', message: 'Off' }

  const mode = ctx.globeMode || 'cesium'
  if (cfg.globeModes && !cfg.globeModes.includes(/** @type {GlobeModeId} */ (mode))) {
    return {
      tone: 'mode',
      message: cfg.globeModeNote || `Use ${cfg.globeModes.map((m) => GLOBE_MODE_LABELS[m] || m).join(' or ')}`,
    }
  }

  if (cfg.apiKeyEnv && !cfg.apiKeyServerOnly && !hasApiKeyConfigured(cfg.apiKeyEnv)) {
    return {
      tone: 'warn',
      message: `Add ${cfg.apiKeyEnv} to .env.local`,
    }
  }

  if (cfg.subLayer && cfg.parentLayer && !isLayerToggleOn(cfg.parentLayer, ctx.dataLayers)) {
    return { tone: 'warn', message: `Enable ${LAYER_CATALOG[cfg.parentLayer]?.label || cfg.parentLayer} first` }
  }

  const sources = cfg.sources || []
  if (sources.length) {
    const statuses = sources.map((id) => ctx.sourceStatuses?.[id]).filter(Boolean)
    const anyError = statuses.some((s) => s.status === 'error')
    const anyWarning = statuses.some((s) => s.warning)
    const totalEvents = statuses.reduce((n, s) => n + (s.eventCount || 0), 0)

    if (layerKey === 'ais' && anyWarning) {
      return {
        tone: 'warn',
        message: statuses.find((s) => s.warning)?.warning || 'Set AISSTREAM_API_KEY in .env.local',
      }
    }

    if (anyError) {
      const err = statuses.map((s) => s.error).filter(Boolean)[0]
      return { tone: 'error', message: err || 'Feed error — retrying' }
    }

    // Track layers — count live entities
    if (layerKey === 'adsb' || layerKey === 'satellites' || layerKey === 'ais') {
      const kind = layerKey === 'adsb' ? 'aircraft' : layerKey === 'ais' ? 'vessel' : 'satellite'
      const count = (ctx.events || []).filter((e) => e.trackKind === kind).length
      if (count > 0) return { tone: 'ok', message: `${count} live` }
      if (statuses.some((s) => s.status === 'fetching')) return { tone: 'warn', message: 'Loading…' }
      return { tone: 'empty', message: 'No positions yet' }
    }

    if (layerKey === 'nhcStorms') {
      const count = (ctx.events || []).filter((e) => e.trackKind === 'storm').length
      if (count > 0) return { tone: 'ok', message: `${count} active` }
      if (statuses.some((s) => s.lastFetch > 0)) {
        return { tone: 'empty', message: 'No active cyclones (normal off-season)' }
      }
      return { tone: 'warn', message: 'Waiting for NOAA NHC…' }
    }

    if (layerKey === 'bluesky') {
      const count = (ctx.events || []).filter((e) => (e.source || '').toLowerCase().includes('bluesky')).length
      if (count > 0) return { tone: 'ok', message: `${count} posts` }
      if (statuses.some((s) => s.warning)) {
        return { tone: 'warn', message: statuses.find((s) => s.warning)?.warning || 'Jetstream warming up…' }
      }
      if (statuses.some((s) => s.lastFetch > 0)) {
        return { tone: 'empty', message: 'No geocoded crisis posts this cycle' }
      }
      return { tone: 'warn', message: 'Connecting to Bluesky Jetstream…' }
    }

    if (layerKey === 'factCheck') {
      const count = (ctx.events || []).filter((e) => (e.tags || []).includes('fact-check')).length
      if (count > 0) return { tone: 'ok', message: `${count} claims` }
      if (statuses.some((s) => s.warning)) {
        return { tone: 'warn', message: statuses.find((s) => s.warning)?.warning || 'Set GOOGLE_FACT_CHECK_API_KEY' }
      }
      if (statuses.some((s) => s.lastFetch > 0)) {
        return { tone: 'empty', message: 'No geocoded claims this cycle' }
      }
      return { tone: 'warn', message: 'Waiting for Fact Check API…' }
    }

    if (layerKey === 'firms' && !hasApiKeyConfigured('VITE_FIRMS_MAP_KEY')) {
      return { tone: 'warn', message: 'Add VITE_FIRMS_MAP_KEY to .env.local' }
    }

    if (totalEvents > 0) return { tone: 'ok', message: `${totalEvents} signals` }
    if (statuses.some((s) => s.status === 'fetching')) return { tone: 'warn', message: 'Loading…' }
    if (statuses.some((s) => s.lastFetch > 0)) return { tone: 'empty', message: 'Feed OK — no matching events in view' }
    return { tone: 'warn', message: 'Waiting for feed…' }
  }

  // Visual-only layers (GIBS, wind, terminator)
  if (layerKey.startsWith('gibs') || layerKey === 'windOverlay') {
    return { tone: 'ok', message: 'Overlay active' }
  }
  if (layerKey === 'terminator') {
    return { tone: 'ok', message: 'Line active' }
  }

  return { tone: 'ok', message: 'On' }
}
