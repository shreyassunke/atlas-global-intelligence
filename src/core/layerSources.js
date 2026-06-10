/**
 * Maps data-layer toggles to fetchManager source ids.
 */
import { LAYER_CATALOG, isLayerToggleOn } from './layerCatalog.js'

/** Worker sources tied to globe data layers (toggle-gated). */
export const LAYER_GATED_SOURCES = new Set(
  Object.values(LAYER_CATALOG)
    .flatMap((cfg) => cfg.sources || []),
)

/**
 * Sources that always poll regardless of layer toggles (ticker, panels, stretch).
 * Computed as: all configured worker sources minus layer-gated ones.
 * Populated at runtime by fetchManager via SET_LAYER_GATED message.
 */
export const TICKER_SOURCE_IDS = [
  'gdelt',
  'gdelt-vgkg',
  'ucdp',
  'coingecko',
  'alt-fng',
  'cisa-kev',
  'reliefweb',
  'who-don',
  'promed',
  'loc-legal',
  'open-meteo',
  'celestrak',
  'noaa-kp',
  'noaa-xray',
  'noaa-solar-wind',
  'bluesky',
  'fact-check',
  'acled',
  'finnhub',
  'fred',
  'eia',
  'cloudflare',
  'abuseipdb',
  'shodan',
  'electricity-maps',
  'entsoe',
]

/**
 * @param {Record<string, boolean>} dataLayers
 * @returns {Set<string>}
 */
export function sourcesForEnabledLayers(dataLayers) {
  const out = new Set()
  for (const [layerKey, cfg] of Object.entries(LAYER_CATALOG)) {
    if (!cfg.sources?.length) continue
    if (!isLayerToggleOn(layerKey, dataLayers || {})) continue
    if (cfg.subLayer && cfg.parentLayer && !isLayerToggleOn(cfg.parentLayer, dataLayers || {})) continue
    for (const src of cfg.sources) out.add(src)
  }
  return out
}

/**
 * @param {Record<string, boolean>} dataLayers
 * @param {string[]} [allConfiguredIds]
 */
export function getActivePollSourceIds(dataLayers, allConfiguredIds = []) {
  const enabled = sourcesForEnabledLayers(dataLayers)
  const ids = new Set(TICKER_SOURCE_IDS.filter((id) => allConfiguredIds.includes(id)))
  for (const src of enabled) {
    if (allConfiguredIds.includes(src)) ids.add(src)
  }
  return [...ids]
}

/**
 * @param {string} layerId
 * @returns {string[]}
 */
export function layerToSourceIds(layerId) {
  return LAYER_CATALOG[layerId]?.sources || []
}
