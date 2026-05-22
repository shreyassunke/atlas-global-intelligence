/**
 * Heuristic satellite purpose classifier from CelesTrak catalog group + object name.
 * Public TLE names are noisy; treat labels as best-effort, not authoritative order-of-battle.
 */

export const SATELLITE_PURPOSES = {
  NAVIGATION: 'navigation',
  INTERNET: 'internet',
  SURVEILLANCE: 'surveillance',
  WEATHER: 'weather',
  COMMUNICATIONS: 'communications',
  EARTH_OBS: 'earth-observation',
  SCIENCE: 'science',
  CREWED: 'crewed',
  MILITARY: 'military',
  DEBRIS: 'debris',
  UNKNOWN: 'unknown',
}

/** @type {Record<string, { label: string, icon: string }>} */
export const SATELLITE_PURPOSE_META = {
  [SATELLITE_PURPOSES.NAVIGATION]: { label: 'Navigation', icon: '🧭' },
  [SATELLITE_PURPOSES.INTERNET]: { label: 'Internet / Broadband', icon: '🌐' },
  [SATELLITE_PURPOSES.SURVEILLANCE]: { label: 'Surveillance / Recon', icon: '👁' },
  [SATELLITE_PURPOSES.WEATHER]: { label: 'Weather / Climate', icon: '🌦' },
  [SATELLITE_PURPOSES.COMMUNICATIONS]: { label: 'Communications / Relay', icon: '📡' },
  [SATELLITE_PURPOSES.EARTH_OBS]: { label: 'Earth Observation', icon: '🛰' },
  [SATELLITE_PURPOSES.SCIENCE]: { label: 'Science / Research', icon: '🔬' },
  [SATELLITE_PURPOSES.CREWED]: { label: 'Crewed / Space Station', icon: '🚀' },
  [SATELLITE_PURPOSES.MILITARY]: { label: 'Military', icon: '⚑' },
  [SATELLITE_PURPOSES.DEBRIS]: { label: 'Debris / Rocket Body', icon: '⚠' },
  [SATELLITE_PURPOSES.UNKNOWN]: { label: 'Unknown', icon: '?' },
}

/** Ordered rules: first match wins. Pattern is tested against uppercased name. */
const NAME_RULES = [
  { test: /\bSTARLINK\b|\bONEWEB\b|\bKUIPER\b|\bTELESAT\b|\bO3B\b|\bGLOBALSTAR\b|\bIRIDIUM NEXT\b/, purpose: SATELLITE_PURPOSES.INTERNET,
    detail: 'Low-Earth broadband or data-relay constellation providing internet/backhaul connectivity.' },
  { test: /\bGPS\b|\bNAVSTAR\b|\bGLONASS\b|\bGALILEO\b|\bBEIDOU\b|\bCOMPASS\b|\bQZSS\b|\bIRNSS\b|\bNAVIC\b/, purpose: SATELLITE_PURPOSES.NAVIGATION,
    detail: 'Global or regional navigation satellite (GNSS) — timing/position for civil and military users.' },
  { test: /\bNOAA\b|\bGOES\b|\bMETOP\b|\bMETEOSAT\b|\bHIMARWARI\b|\bINSAT-3D\b|\bFY-\d|\bGPM\b|\bJPSS\b/, purpose: SATELLITE_PURPOSES.WEATHER,
    detail: 'Meteorological or environmental monitoring — weather forecasting and climate sensing.' },
  { test: /\bISS\b|\bZARYA\b|\bNAUKA\b|\bTIANGONG\b|\bCSS\b|\bSOYUZ\b|\bPROGRESS\b|\bCYGNUS\b|\bDRAGON\b|\bCREW\b|\bSHENZHOU\b|\bSPACE STATION\b/, purpose: SATELLITE_PURPOSES.CREWED,
    detail: 'Human spaceflight asset — crew transport, station module, or visiting vehicle.' },
  { test: /\bYAOGAN\b|\bCOSMOS \d+ (?:1|2|3|4)\d{3}\b|\bKH-|\bLACROSSE\b|\bMENTOR\b|\bORION\b|\bSIGINT\b|\bNOSS\b|\bINTRUDER\b/, purpose: SATELLITE_PURPOSES.SURVEILLANCE,
    detail: 'Likely intelligence, surveillance, or reconnaissance payload (inferred from public naming).' },
  { test: /\bMILSTAR\b|\bWGS\b|\bDSCS\b|\bAEHF\b|\bSBIRS\b|\bDSP\b|\bSYCOM\b|\bFLTSAT\b|\bUFO\b|\bSDS\b/, purpose: SATELLITE_PURPOSES.MILITARY,
    detail: 'Military satellite communications, early warning, or strategic relay.' },
  { test: /\bLANDSAT\b|\bSENTINEL-\d\b|\bWORLDVIEW\b|\bPLEIADES\b|\bSPOT-\d\b|\bSKYSAT\b|\bPLANET\b|\bCOSMO-SKYMED\b|\bRADARSAT\b|\bTERRASAR\b|\bSAOCOM\b/, purpose: SATELLITE_PURPOSES.EARTH_OBS,
    detail: 'Earth imaging — optical/radar remote sensing for mapping, agriculture, or disaster response.' },
  { test: /\bTERRA\b|\bAQUA\b|\bAURA\b|\bSUOMI\b|\bNPP\b|\bOCO\b|\bGRACE\b|\bICESAT\b|\bHUBBLE\b|\bWEBB\b|\bCHANDRA\b|\bFERMI\b|\bTESS\b|\bKEPLER\b/, purpose: SATELLITE_PURPOSES.SCIENCE,
    detail: 'Scientific research — Earth system science or space/astronomy observatory.' },
  { test: /\bINTELSAT\b|\bSES-\d\b|\bEUTELSAT\b|\bHOTBIRD\b|\bASTRA\b|\bDIRECTV\b|\bSKY\b|\bHISPASAT\b|\bTHAICOM\b|\bABS-\d\b|\bTURKSAT\b|\bARABSAT\b/, purpose: SATELLITE_PURPOSES.COMMUNICATIONS,
    detail: 'Commercial communications satellite — TV broadcast, telecom backhaul, or regional relay.' },
  { test: /\bR\/B\b|\bROCKET BODY\b|\bDEB\b|\bDEBRIS\b|\bOBJECT [A-Z]\b/, purpose: SATELLITE_PURPOSES.DEBRIS,
    detail: 'Tracked debris or spent rocket stage — not an active mission payload.' },
]

const GROUP_DEFAULTS = {
  starlink: {
    purpose: SATELLITE_PURPOSES.INTERNET,
    detail: 'Starlink constellation — SpaceX LEO broadband internet service.',
  },
  'gps-ops': {
    purpose: SATELLITE_PURPOSES.NAVIGATION,
    detail: 'GPS operational constellation — U.S. global navigation and timing.',
  },
  stations: {
    purpose: SATELLITE_PURPOSES.CREWED,
    detail: 'Space station or crewed platform catalog entry.',
  },
  military: {
    purpose: SATELLITE_PURPOSES.MILITARY,
    detail: 'CelesTrak military catalog — likely defense-related mission (public TLE only).',
  },
}

/**
 * @param {{ name?: string, satelliteGroup?: string, isMilitary?: boolean }} params
 * @returns {{ purpose: string, label: string, icon: string, detail: string, operator?: string }}
 */
export function classifySatellitePurpose({ name = '', satelliteGroup = '', isMilitary = false } = {}) {
  const upper = (name || '').toUpperCase()
  const group = (satelliteGroup || '').toLowerCase()

  for (const rule of NAME_RULES) {
    if (rule.test.test(upper)) {
      const meta = SATELLITE_PURPOSE_META[rule.purpose] || SATELLITE_PURPOSE_META[SATELLITE_PURPOSES.UNKNOWN]
      return {
        purpose: rule.purpose,
        label: meta.label,
        icon: meta.icon,
        detail: rule.detail,
        operator: inferOperator(upper),
      }
    }
  }

  if (GROUP_DEFAULTS[group]) {
    const g = GROUP_DEFAULTS[group]
    const meta = SATELLITE_PURPOSE_META[g.purpose]
    return {
      purpose: g.purpose,
      label: meta.label,
      icon: meta.icon,
      detail: g.detail,
      operator: inferOperator(upper),
    }
  }

  if (isMilitary || group === 'military') {
    const meta = SATELLITE_PURPOSE_META[SATELLITE_PURPOSES.MILITARY]
    return {
      purpose: SATELLITE_PURPOSES.MILITARY,
      label: meta.label,
      icon: meta.icon,
      detail: 'Military-associated object in public TLE catalogs (mission specifics not published).',
      operator: inferOperator(upper),
    }
  }

  // GEO altitude hint from name patterns for comms sats not caught above
  if (/\bSAT\b|\bCOM\b|\b- \d$/.test(upper)) {
    const meta = SATELLITE_PURPOSE_META[SATELLITE_PURPOSES.COMMUNICATIONS]
    return {
      purpose: SATELLITE_PURPOSES.COMMUNICATIONS,
      label: meta.label,
      icon: meta.icon,
      detail: 'Likely commercial or government communications relay (inferred from naming).',
      operator: inferOperator(upper),
    }
  }

  const meta = SATELLITE_PURPOSE_META[SATELLITE_PURPOSES.UNKNOWN]
  return {
    purpose: SATELLITE_PURPOSES.UNKNOWN,
    label: meta.label,
    icon: meta.icon,
    detail: 'Purpose not inferred from public TLE name — may be research, commercial, or classified.',
    operator: inferOperator(upper),
  }
}

function inferOperator(upperName) {
  if (/\bSTARLINK\b/.test(upperName)) return 'SpaceX'
  if (/\bONEWEB\b/.test(upperName)) return 'Eutelsat OneWeb'
  if (/\bGPS\b|\bNAVSTAR\b/.test(upperName)) return 'U.S. Space Force'
  if (/\bGLONASS\b/.test(upperName)) return 'Roscosmos'
  if (/\bGALILEO\b/.test(upperName)) return 'ESA / EU'
  if (/\bBEIDOU\b|\bCOMPASS\b/.test(upperName)) return 'China (CNSA)'
  if (/\bNOAA\b|\bGOES\b|\bJPSS\b/.test(upperName)) return 'NOAA / NASA'
  if (/\bISS\b|\bZARYA\b/.test(upperName)) return 'NASA / Roscosmos / partners'
  if (/\bTIANGONG\b|\bCSS\b/.test(upperName)) return 'CMSA (China)'
  if (/\bYAOGAN\b/.test(upperName)) return 'China (likely reconnaissance)'
  if (/\bINTELSAT\b/.test(upperName)) return 'Intelsat'
  if (/\bSENTINEL\b/.test(upperName)) return 'ESA / Copernicus'
  if (/\bLANDSAT\b/.test(upperName)) return 'USGS / NASA'
  return undefined
}
