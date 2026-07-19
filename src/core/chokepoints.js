/**
 * Maritime chokepoints — shared bbox definitions for AISStream subscriptions.
 * AISStream expects [[minLng, minLat], [maxLng, maxLat]] — NOT lat/lng order.
 */

/** @typedef {{ name: string, lat: number, lng: number, region?: string, description?: string }} Chokepoint */

export const CHOKEPOINTS = [
  // Original 8 chokepoints
  {
    name: 'Hormuz',
    lat: 26.6,
    lng: 56.3,
    region: 'middle-east',
    description:
      'The most critical energy chokepoint, carrying roughly 20% of global petroleum consumption. Sole sea exit for most Persian Gulf crude and LNG, with very limited bypass options.',
  },
  {
    name: 'Suez',
    lat: 30.0,
    lng: 32.3,
    region: 'middle-east',
    description:
      'Canal linking the Red Sea to the Mediterranean. Handles about 10% of global seaborne trade — including a large share of Asia–Europe containers — and cuts weeks off the Cape route.',
  },
  {
    name: 'Malacca',
    lat: 2.5,
    lng: 101.8,
    region: 'asia-pacific',
    description:
      'Busiest shipping lane on Earth and the main India–Pacific gateway. Carries roughly a quarter of seaborne trade and a major share of Asia-bound oil for China, Japan, and Korea.',
  },
  {
    name: 'Bab-el-Mandeb',
    lat: 12.6,
    lng: 43.3,
    region: 'middle-east',
    description:
      'Southern gate of the Red Sea between Yemen and the Horn of Africa. Critical approach to Suez for Gulf–Europe energy and container traffic; disruption forces Cape of Good Hope detours.',
  },
  {
    name: 'Panama',
    lat: 9.0,
    lng: -79.6,
    region: 'americas',
    description:
      'Locks linking the Atlantic and Pacific. Modest share of global tonnage, but strategic for U.S. containerized trade, grain, and energy cargoes between coasts and Asia.',
  },
  {
    name: 'Taiwan Strait',
    lat: 24.5,
    lng: 120.5,
    region: 'asia-pacific',
    description:
      'Indo-Pacific trade artery carrying roughly a fifth of global maritime cargo. Flashpoint for East Asian manufacturing, energy imports, and semiconductor supply chains.',
  },
  {
    name: 'Bosphorus',
    lat: 41.1,
    lng: 29.0,
    region: 'europe',
    description:
      'Only sea exit from the Black Sea to the Mediterranean. Strategic for Ukrainian, Russian, and Romanian grain and energy exports with no natural alternative route.',
  },
  {
    name: 'South China Sea',
    lat: 15.0,
    lng: 115.0,
    region: 'asia-pacific',
    description:
      'Major Indo-Pacific trade basin linking Malacca and Taiwan routes. Carries trillions in annual goods amid contested maritime claims and dense naval activity.',
  },
  // Phase 4 — expanded regional coverage
  {
    name: 'Gibraltar',
    lat: 36.0,
    lng: -5.5,
    region: 'europe',
    description:
      'Sole natural Atlantic–Mediterranean gateway. More than 10% of global maritime traffic depends on this narrow passage with no alternative sea route in or out.',
  },
  {
    name: 'English Channel',
    lat: 50.5,
    lng: -1.0,
    region: 'europe',
    description:
      'Densest shipping corridor in Europe. Critical North Sea–Atlantic link for UK–Continent trade, energy tankers, and ferry/short-sea logistics.',
  },
  {
    name: 'North Sea',
    lat: 56.0,
    lng: 3.0,
    region: 'europe',
    description:
      'Hub for European offshore oil and gas platforms, tanker traffic, and north–south shipping into Northwest European ports and energy terminals.',
  },
  {
    name: 'US East Coast',
    lat: 36.0,
    lng: -75.0,
    region: 'americas',
    description:
      'Major U.S. Atlantic shipping corridor for container, energy, and coastal trade into East Coast ports from New York–New Jersey through the Mid-Atlantic.',
  },
  {
    name: 'US Gulf',
    lat: 28.0,
    lng: -90.0,
    region: 'americas',
    description:
      'Heart of U.S. offshore oil and gas production and Gulf Coast refining. Primary export hub for American crude, petroleum products, and LNG.',
  },
  {
    name: 'Caribbean',
    lat: 18.0,
    lng: -66.0,
    region: 'americas',
    description:
      'Transit basin for U.S. Gulf–Atlantic shipping, Panama Canal approaches, and regional energy and cruise traffic across the Greater Antilles.',
  },
  {
    name: 'Cape of Good Hope',
    lat: -34.5,
    lng: 18.5,
    region: 'africa',
    description:
      'Southern Africa alternate route when Suez or the Red Sea is disrupted. Carries a large share of maritime oil on the longer Asia–Europe / Atlantic detour.',
  },
  {
    name: 'Mozambique Channel',
    lat: -18.0,
    lng: 40.0,
    region: 'africa',
    description:
      'Western Indian Ocean energy corridor between Madagascar and mainland Africa. Hosts heavy tanker traffic between the Middle East and Asia or Europe via the Cape.',
  },
  {
    name: 'Persian Gulf',
    lat: 26.0,
    lng: 51.0,
    region: 'middle-east',
    description:
      'Source basin for a large share of global seaborne oil and LNG. Exports concentrate here before exiting to world markets through the Strait of Hormuz.',
  },
  {
    name: 'Red Sea North',
    lat: 22.0,
    lng: 38.5,
    region: 'middle-east',
    description:
      'Northern Red Sea approaches to the Suez Canal. Critical final leg for Asia–Europe container and energy transit before entering the Mediterranean.',
  },
  {
    name: 'Korea Strait',
    lat: 34.5,
    lng: 129.0,
    region: 'asia-pacific',
    description:
      'Primary sea gateway between Japan, Korea, and the East China Sea. Key corridor for Northeast Asian trade, energy imports, and naval transit.',
  },
  {
    name: 'Lombok Strait',
    lat: -8.5,
    lng: 115.8,
    region: 'asia-pacific',
    description:
      'Deep-water Indonesian alternative to Malacca for very large tankers and bulk carriers. Important for Australia–Asia iron ore, coal, and energy trade.',
  },
  {
    name: 'Mediterranean Central',
    lat: 36.0,
    lng: 18.0,
    region: 'europe',
    description:
      'Central Mediterranean shipping crossroads linking Suez, Gibraltar, and European and North African ports for energy, containers, and naval traffic.',
  },
]

const DEFAULT_RADIUS_DEG = 1.5

/**
 * Build AISStream bounding boxes from chokepoint centers.
 * @param {number} [radiusDeg]
 * @returns {[number, number][][]}
 */
export function buildAisBoundingBoxes(radiusDeg = DEFAULT_RADIUS_DEG) {
  return CHOKEPOINTS.map((cp) => [
    [cp.lng - radiusDeg, cp.lat - radiusDeg],
    [cp.lng + radiusDeg, cp.lat + radiusDeg],
  ])
}

/** Pre-built bboxes for AISStream `BoundingBoxes` subscription. */
export const AIS_CHOKEPOINT_BBOXES = buildAisBoundingBoxes()

/**
 * @param {number} lat
 * @param {number} lng
 * @returns {boolean}
 */
export function isNearChokepoint(lat, lng) {
  for (const cp of CHOKEPOINTS) {
    const dlat = Math.abs(lat - cp.lat)
    const dlng = Math.abs(lng - cp.lng) * Math.cos((lat * Math.PI) / 180)
    if (Math.sqrt(dlat * dlat + dlng * dlng) < 2.0) return true
  }
  return false
}

/**
 * @param {string} region
 * @returns {Chokepoint[]}
 */
export function chokepointsInRegion(region) {
  return CHOKEPOINTS.filter((cp) => cp.region === region)
}
