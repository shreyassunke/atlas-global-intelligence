/**
 * Military ICAO24 hex filter — $0 substitute for ADS-B Exchange military tier.
 * Uses publicly documented ICAO24 allocation blocks (US/UK/RU/CN/IL/NATO allies).
 * Not exhaustive; false positives/negatives are possible on civil/military edge cases.
 */

/** Lowercase hex prefix matches (first 2–3 nibbles). */
const MILITARY_HEX_PREFIXES = new Set([
  'ae',   // United States DoD
  '43',   // United Kingdom
  '44',   // United Kingdom (secondary)
  '45',   // United Kingdom (secondary)
  '46',   // United Kingdom (secondary)
  '47',   // United Kingdom (secondary)
  '48',   // United Kingdom (secondary)
  '49',   // United Kingdom (secondary)
  '4a',   // United Kingdom (secondary)
  '4b',   // United Kingdom (secondary)
  '4c',   // United Kingdom (secondary)
  '4d',   // United Kingdom (secondary)
  '4e',   // United Kingdom (secondary)
  '4f',   // United Kingdom (secondary)
  '50',   // United Kingdom (secondary)
  '51',   // United Kingdom (secondary)
  '52',   // United Kingdom (secondary)
  '53',   // United Kingdom (secondary)
  '54',   // United Kingdom (secondary)
  '55',   // United Kingdom (secondary)
  '56',   // United Kingdom (secondary)
  '57',   // United Kingdom (secondary)
  '58',   // United Kingdom (secondary)
  '59',   // United Kingdom (secondary)
  '5a',   // United Kingdom (secondary)
  '5b',   // United Kingdom (secondary)
  '5c',   // United Kingdom (secondary)
  '5d',   // United Kingdom (secondary)
  '5e',   // United Kingdom (secondary)
  '5f',   // United Kingdom (secondary)
  '7cf',  // Australia military
  '3ea',  // Germany
  '3c6',  // Germany
  '3c7',  // Germany
  '3c8',  // Germany
  '3c9',  // Germany
  '3ca',  // Germany
  '3cb',  // Germany
  '3cc',  // Germany
  '3cd',  // Germany
  '3ce',  // Germany
  '3cf',  // Germany
  '3d0',  // Germany
  '3d1',  // Germany
  '3d2',  // Germany
  '3d3',  // Germany
  '3d4',  // Germany
  '3d5',  // Germany
  '3d6',  // Germany
  '3d7',  // Germany
  '3d8',  // Germany
  '3d9',  // Germany
  '3da',  // Germany
  '3db',  // Germany
  '3dc',  // Germany
  '3dd',  // Germany
  '3de',  // Germany
  '3df',  // Germany
  '3e0',  // Germany
  '3e1',  // Germany
  '3e2',  // Germany
  '3e3',  // Germany
  '3e4',  // Germany
  '3e5',  // Germany
  '3e6',  // Germany
  '3e7',  // Germany
  '3e8',  // Germany
  '3e9',  // Germany
  '3eb',  // Germany
  '3ec',  // Germany
  '3ed',  // Germany
  '3ee',  // Germany
  '3ef',  // Germany
  '3f0',  // Germany
  '3f1',  // Germany
  '3f2',  // Germany
  '3f3',  // Germany
  '3f4',  // Germany
  '3f5',  // Germany
  '3f6',  // Germany
  '3f7',  // Germany
  '3f8',  // Germany
  '3f9',  // Germany
  '3fa',  // Germany
  '3fb',  // Germany
  '3fc',  // Germany
  '3fd',  // Germany
  '3fe',  // Germany
  '3ff',  // Germany
  '738',  // Israel
  '73a',  // Israel
  '73b',  // Israel
  '73c',  // Israel
  '73d',  // Israel
  '73e',  // Israel
  '73f',  // Israel
  '710',  // Saudi Arabia (often military/state)
  '711',  // Saudi Arabia
  '712',  // Saudi Arabia
  '713',  // Saudi Arabia
  '714',  // Saudi Arabia
  '715',  // Saudi Arabia
  '716',  // Saudi Arabia
  '717',  // Saudi Arabia
  '718',  // Saudi Arabia
  '719',  // Saudi Arabia
  '71a',  // Saudi Arabia
  '71b',  // Saudi Arabia
  '71c',  // Saudi Arabia
  '71d',  // Saudi Arabia
  '71e',  // Saudi Arabia
  '71f',  // Saudi Arabia
])

/** Inclusive hex ranges [start, end] for known military blocks. */
const MILITARY_HEX_RANGES = [
  ['ae0000', 'aeffff'], // US DoD primary block
  ['43c000', '43cfff'], // UK military
  ['151000', '151fff'], // Russia (partial military)
  ['152000', '152fff'], // Russia (partial military)
  ['780000', '780fff'], // China (partial military)
  ['781000', '781fff'], // China (partial military)
]

/**
 * @param {string} icao24 — lowercase hex ICAO24 address
 * @returns {boolean}
 */
export function isMilitaryIcao24(icao24) {
  if (!icao24 || typeof icao24 !== 'string') return false
  const hex = icao24.toLowerCase().trim()
  if (hex.length < 2) return false

  const prefix2 = hex.slice(0, 2)
  const prefix3 = hex.length >= 3 ? hex.slice(0, 3) : ''
  if (MILITARY_HEX_PREFIXES.has(prefix2) || MILITARY_HEX_PREFIXES.has(prefix3)) {
    return true
  }

  for (const [start, end] of MILITARY_HEX_RANGES) {
    if (hex >= start && hex <= end) return true
  }
  return false
}
