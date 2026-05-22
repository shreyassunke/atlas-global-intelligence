/**
 * NASA GIBS WMTS basemap layers (EPSG:3857) — free, no API key.
 * @see https://nasa-gibs.github.io/gibs-api-docs/map-library-usage/
 */

export const GIBS_TRUE_COLOR_LAYER_ID = 'MODIS_Terra_CorrectedReflectance_TrueColor'

/** Most recent day with likely tile coverage (GIBS often lags ~1 day). */
export function getGibsImageryDate(offsetDays = -1) {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() + offsetDays)
  return d.toISOString().slice(0, 10)
}

/** @deprecated use getGibsImageryDate */
export function getGibsTrueColorDate() {
  return getGibsImageryDate(-1)
}

/**
 * Verified $0 GIBS raster layers on epsg3857/best (GoogleMapsCompatible).
 * Fires: Bands 7-2-1 false color highlights active fire context (thermal WMTS is vector-only).
 */
export const GIBS_IMAGERY_LAYERS = {
  gibsTrueColor: {
    layerId: 'MODIS_Terra_CorrectedReflectance_TrueColor',
    matrix: 'GoogleMapsCompatible_Level9',
    ext: 'jpg',
    label: 'True Color',
    desc: 'MODIS Terra natural-color satellite imagery',
    attribution: 'Imagery © NASA GIBS / MODIS Terra True Color',
    opacity: 0.92,
  },
  gibsFires: {
    layerId: 'MODIS_Terra_CorrectedReflectance_Bands721',
    matrix: 'GoogleMapsCompatible_Level9',
    ext: 'jpg',
    label: 'Fire Context (7-2-1)',
    desc: 'MODIS false-color bands — active fire and burn scar context alongside FIRMS points',
    attribution: 'Imagery © NASA GIBS / MODIS Terra 7-2-1 (fire-sensitive)',
    opacity: 0.88,
  },
  gibsAerosol: {
    layerId: 'MODIS_Terra_Aerosol',
    matrix: 'GoogleMapsCompatible_Level6',
    ext: 'png',
    label: 'Aerosol',
    desc: 'MODIS Terra aerosol optical depth',
    attribution: 'Imagery © NASA GIBS / MODIS Terra Aerosol',
    opacity: 0.82,
  },
  gibsDust: {
    layerId: 'AIRS_L2_Dust_Score_Day',
    matrix: 'GoogleMapsCompatible_Level6',
    ext: 'png',
    label: 'Dust',
    desc: 'AIRS L2 daytime dust score',
    attribution: 'Imagery © NASA GIBS / AIRS Dust Score',
    opacity: 0.82,
  },
  gibsClouds: {
    layerId: 'MODIS_Aqua_Cloud_Fraction_Day',
    matrix: 'GoogleMapsCompatible_Level6',
    ext: 'png',
    label: 'Clouds',
    desc: 'MODIS Aqua daytime cloud fraction',
    attribution: 'Imagery © NASA GIBS / MODIS Aqua Cloud Fraction',
    opacity: 0.78,
  },
}

export const GIBS_IMAGERY_LAYER_KEYS = Object.keys(GIBS_IMAGERY_LAYERS)

/**
 * @param {keyof typeof GIBS_IMAGERY_LAYERS} storeKey
 * @param {number} z
 * @param {number} x
 * @param {number} y
 * @param {string} [date]
 */
export function gibsTileUrl(storeKey, z, x, y, date = getGibsImageryDate(-1)) {
  const cfg = GIBS_IMAGERY_LAYERS[storeKey]
  if (!cfg) return null
  return `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/${cfg.layerId}/default/${date}/${cfg.matrix}/${z}/${y}/${x}.${cfg.ext}`
}

/** globe.gl `globeTileEngineUrl` callback for a given store key. */
export function gibsTileEngineUrlForKey(storeKey) {
  return (x, y, l) => gibsTileUrl(storeKey, l, x, y) || ''
}

/** First enabled GIBS imagery key (priority order for single-tile engines like globe.gl). */
export function activeGibsImageryKey(dataLayers) {
  if (!dataLayers) return null
  for (const key of GIBS_IMAGERY_LAYER_KEYS) {
    if (dataLayers[key] === true) return key
  }
  return null
}

export function gibsTrueColorTileUrl(z, x, y, date = getGibsImageryDate(-1)) {
  return gibsTileUrl('gibsTrueColor', z, x, y, date)
}

export function gibsTrueColorTileEngineUrl(x, y, l) {
  return gibsTrueColorTileUrl(l, x, y)
}

export const GIBS_TRUE_COLOR_ATTRIBUTION = GIBS_IMAGERY_LAYERS.gibsTrueColor.attribution

/** MapLibre raster source `tiles` array (EPSG:3857). */
export function gibsMaplibreTiles(storeKey, date = getGibsImageryDate(-1)) {
  const cfg = GIBS_IMAGERY_LAYERS[storeKey]
  if (!cfg) return []
  return [
    `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/${cfg.layerId}/default/${date}/${cfg.matrix}/{z}/{y}/{x}.${cfg.ext}`,
  ]
}

export function gibsTrueColorMaplibreTiles(date = getGibsImageryDate(-1)) {
  return gibsMaplibreTiles('gibsTrueColor', date)
}
