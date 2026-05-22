/**
 * Phase 2 — OSM landmark camera presets (Q/W/E/R/T).
 * Static fallbacks; Overpass refines bbox when /api/overpass-landmarks succeeds.
 */

/** @typedef {{ id: string, key: string, label: string, city: string, lat: number, lng: number, bbox: { south: number, west: number, north: number, east: number }, overpassQuery?: string }} LandmarkPreset */

export const LANDMARK_SHORTCUT_KEYS = ['q', 'w', 'e', 'r', 't']

/** Top landmark per major city — bbox sized for Map3D framing (~2–8 km span). */
export const LANDMARK_PRESETS = [
  {
    id: 'kyiv-maidan',
    key: 'q',
    label: 'Kyiv — Independence Square',
    city: 'Kyiv',
    lat: 50.4501,
    lng: 30.5234,
    bbox: { south: 50.443, west: 30.512, north: 50.457, east: 30.535 },
    overpassQuery: `
[out:json][timeout:25];
(
  node["tourism"="attraction"]["wikidata"](around:2500,50.4501,30.5234);
  way["tourism"="attraction"]["wikidata"](around:2500,50.4501,30.5234);
);
out center 5;
`,
  },
  {
    id: 'dc-capitol',
    key: 'w',
    label: 'Washington — U.S. Capitol',
    city: 'Washington DC',
    lat: 38.8899,
    lng: -77.0091,
    bbox: { south: 38.882, west: -77.02, north: 38.898, east: -76.998 },
    overpassQuery: `
[out:json][timeout:25];
(
  way["historic"="yes"]["name"~"Capitol",i](around:2000,38.8899,-77.0091);
  relation["historic"="yes"]["name"~"Capitol",i](around:2000,38.8899,-77.0091);
);
out center 3;
`,
  },
  {
    id: 'tel-aviv-azrieli',
    key: 'e',
    label: 'Tel Aviv — Azrieli Center',
    city: 'Tel Aviv',
    lat: 32.074,
    lng: 34.792,
    bbox: { south: 32.068, west: 34.785, north: 32.08, east: 34.799 },
    overpassQuery: `
[out:json][timeout:25];
(
  way["building"="yes"]["name"~"Azrieli",i](around:1500,32.074,34.792);
);
out center 3;
`,
  },
  {
    id: 'taipei-101',
    key: 'r',
    label: 'Taipei — Taipei 101',
    city: 'Taipei',
    lat: 25.034,
    lng: 121.5645,
    bbox: { south: 25.028, west: 121.558, north: 25.04, east: 121.571 },
    overpassQuery: `
[out:json][timeout:25];
(
  way["name"~"Taipei 101",i](around:1200,25.034,121.5645);
  node["name"~"Taipei 101",i](around:1200,25.034,121.5645);
);
out center 3;
`,
  },
  {
    id: 'london-westminster',
    key: 't',
    label: 'London — Westminster',
    city: 'London',
    lat: 51.4995,
    lng: -0.1248,
    bbox: { south: 51.493, west: -0.135, north: 51.506, east: -0.115 },
    overpassQuery: `
[out:json][timeout:25];
(
  way["tourism"="attraction"]["name"~"Westminster|Big Ben",i](around:2000,51.4995,-0.1248);
  node["tourism"="attraction"]["name"~"Westminster|Big Ben",i](around:2000,51.4995,-0.1248);
);
out center 5;
`,
  },
]

export function presetByShortcutKey(key) {
  const k = (key || '').toLowerCase()
  return LANDMARK_PRESETS.find((p) => p.key === k) || null
}

/**
 * Merge Overpass-derived bbox/center into a preset clone.
 * @param {LandmarkPreset} preset
 * @param {{ lat?: number, lng?: number, bbox?: { south: number, west: number, north: number, east: number } } | null} refined
 */
export function mergeLandmarkRefinement(preset, refined) {
  if (!refined) return preset
  return {
    ...preset,
    lat: Number.isFinite(refined.lat) ? refined.lat : preset.lat,
    lng: Number.isFinite(refined.lng) ? refined.lng : preset.lng,
    bbox: refined.bbox || preset.bbox,
  }
}
