import { fetchGdeltCameoEvents } from '../services/gdelt/eventService.js'
import { fetchGdeltJson, fetchGdeltText } from '../services/gdelt/gdeltHttp.js'
import { fetchVgkgImagerySample } from '../services/gdelt/vgkgService.js'
import { isMilitaryIcao24 } from '../core/militaryIcao.js'
import { parseTleCatalog } from '../core/satellitePropagation.js'
import { classifySatellitePurpose } from '../core/satellitePurpose.js'
import { PRIORITY_FETCH_SOURCES } from '../core/atlasBootstrap.js'
import { fetchNhcStormsBundle } from '../core/fetchNhcStorms.js'
import {
  saveSnapshot,
  loadSnapshots,
  isSnapshotFresh,
  LIVE_TRACK_SOURCES,
} from '../core/snapshotCache.js'
import { getActivePollSourceIds } from '../core/layerSources.js'

const INITIAL_BACKOFF = 5000
const MAX_BACKOFF = 300_000
const LIVE_TRACK_MAX_AGE_MS = 10 * 60 * 1000

/** L2 Supabase-eligible sources (slow/medium feeds). */
const L2_SOURCES = new Set([
  'usgs', 'gdacs', 'eonet', 'firms', 'noaa-nhc', 'celestrak-tle', 'gdelt-cameo',
])

const L2_TTL_MS = {
  usgs: 86_400_000,
  gdacs: 86_400_000,
  eonet: 86_400_000,
  firms: 86_400_000,
  'noaa-nhc': 86_400_000,
  'celestrak-tle': 172_800_000,
  'gdelt-cameo': 1_800_000,
}

const moduleState = {}
/** @type {Record<string, { events: object[], aggregates?: object, fetchedAt: number }>} */
const lastGoodPayload = {}
/** @type {Set<string>} */
let activePollSources = new Set()
let envKeys = {}

function getState(moduleId) {
  if (!moduleState[moduleId]) {
    moduleState[moduleId] = {
      backoff: INITIAL_BACKOFF,
      lastFetch: 0,
      timer: null,
      active: false,
      errorCount: 0,
      lastError: null,
      lastWarning: null,
    }
  }
  return moduleState[moduleId]
}

async function fetchJSON(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`)
  return res.json()
}

async function fetchText(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`)
  return res.text()
}

// ── Shared helpers ──

const DIMENSION_COLORS = { safety: '#E24B4A', governance: '#7F77DD', economy: '#EF9F27', people: '#1D9E75', environment: '#888780', narrative: '#378ADD' }
const CORROBORATION_OPACITY = { 1: 0.35, 2: 0.55, 3: 0.75, 4: 0.88, 5: 1.0 }

function createEventId(lat, lng, timestamp, source, title) {
  const raw = `${lat}|${lng}|${timestamp}|${source}|${title}`
  let hash = 0x811c9dc5
  for (let i = 0; i < raw.length; i++) {
    hash ^= raw.charCodeAt(i)
    hash = (hash * 0x01000193) >>> 0
  }
  return hash.toString(36) + '_' + timestamp.toString(36)
}

function makeEvent(fields) {
  const priority = fields.priority || fields.priority || 'p3'

  
  const corrobCount = Math.min(Math.max(fields.corroborationCount || 1, 1), 5)
  const isAuth = fields.authoritative || false
  const baseOpacity = CORROBORATION_OPACITY[corrobCount] || 0.35

  return {
    id: fields.id || '',
    priority,
    priority: priority, // legacy compat

    
    dimension: fields.dimension || 'narrative',
    icon: fields.dimension || 'narrative',
    color: DIMENSION_COLORS[fields.dimension || 'narrative'],
    timestamp: fields.timestamp || new Date().toISOString(),
    fetchedAt: new Date().toISOString(),
    lat: fields.lat || 0,
    lng: fields.lng || 0,
    latApproximate: fields.latApproximate || false,
    severity: Math.max(1, Math.min(5, fields.severity || 1)),
    corroborationCount: corrobCount,
    corroborationSources: fields.corroborationSources || [fields.source || 'unknown'],
    opacity: isAuth && corrobCount === 1 ? Math.max(0.75, baseOpacity) : baseOpacity,
    disputed: false,
    authoritative: isAuth,
    ttl: fields.ttl || 600,
    trajectory: null,
    correlatedEventIds: [],
    title: fields.title || '',
    detail: fields.detail || '',
    source: fields.source || '',
    sourceUrl: fields.sourceUrl || '',
    tags: fields.tags || [],
    ...(fields.toneScore != null ? { toneScore: fields.toneScore } : {}),
    ...(fields.actor1 ? { actor1: fields.actor1 } : {}),
    ...(fields.actor2 ? { actor2: fields.actor2 } : {}),
    ...(fields.locationName ? { locationName: fields.locationName } : {}),
    // Phase 1 — tactical track fields (ADS-B / TLE)
    ...(fields.trackKind ? { trackKind: fields.trackKind } : {}),
    ...(fields.icao24 ? { icao24: fields.icao24 } : {}),
    ...(fields.callsign ? { callsign: fields.callsign } : {}),
    ...(fields.altitudeM != null ? { altitudeM: fields.altitudeM } : {}),
    ...(fields.velocityMs != null ? { velocityMs: fields.velocityMs } : {}),
    ...(fields.trackDeg != null ? { trackDeg: fields.trackDeg } : {}),
    ...(fields.originCountry ? { originCountry: fields.originCountry } : {}),
    ...(fields.isMilitary != null ? { isMilitary: fields.isMilitary } : {}),
    ...(fields.noradId != null ? { noradId: fields.noradId } : {}),
    ...(fields.satelliteGroup ? { satelliteGroup: fields.satelliteGroup } : {}),
    ...(fields.tleLine1 ? { tleLine1: fields.tleLine1 } : {}),
    ...(fields.tleLine2 ? { tleLine2: fields.tleLine2 } : {}),
    ...(fields.satellitePurpose ? { satellitePurpose: fields.satellitePurpose } : {}),
    ...(fields.satellitePurposeLabel ? { satellitePurposeLabel: fields.satellitePurposeLabel } : {}),
    ...(fields.satellitePurposeDetail ? { satellitePurposeDetail: fields.satellitePurposeDetail } : {}),
    ...(fields.satelliteOperator ? { satelliteOperator: fields.satelliteOperator } : {}),
    // Phase 3 — maritime / storm fields
    ...(fields.mmsi ? { mmsi: fields.mmsi } : {}),
    ...(fields.sog != null ? { sog: fields.sog } : {}),
    ...(fields.cog != null ? { cog: fields.cog } : {}),
    ...(fields.shipName ? { shipName: fields.shipName } : {}),
    ...(fields.stormId ? { stormId: fields.stormId } : {}),
    ...(fields.stormCategory ? { stormCategory: fields.stormCategory } : {}),
    ...(fields.trackCoords ? { trackCoords: fields.trackCoords } : {}),
    ...(fields.coneCoords ? { coneCoords: fields.coneCoords } : {}),
    // Phase 6 — stretch signals
    ...(fields.imageUrl ? { imageUrl: fields.imageUrl } : {}),
    ...(fields.visualLabels ? { visualLabels: fields.visualLabels } : {}),
    ...(fields.socialReach ? { socialReach: fields.socialReach } : {}),
    ...(fields.blueskyUri ? { blueskyUri: fields.blueskyUri } : {}),
    ...(fields.factCheckRating ? { factCheckRating: fields.factCheckRating } : {}),
    ...(fields.factCheckPublisher ? { factCheckPublisher: fields.factCheckPublisher } : {}),
    ...(fields.factCheckUrl ? { factCheckUrl: fields.factCheckUrl } : {}),
  }
}

function getXmlTag(xml, tag) {
  const m = xml.match(new RegExp(`<${tag}><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>`)) ||
    xml.match(new RegExp(`<${tag}>([^<]*)</${tag}>`))
  return m ? m[1].trim() : ''
}

const COUNTRY_CENTROIDS = {
  AF:[33,65],AL:[41,20],DZ:[28,3],AO:[-12.5,18.5],AR:[-34,-64],AM:[40,45],AU:[-27,133],AT:[47.5,13.5],
  AZ:[40.5,47.5],BD:[24,90],BY:[53,28],BE:[50.8,4],BJ:[9.5,2.3],BO:[-17,-65],BA:[44,18],BR:[-10,-55],
  BG:[43,25],BF:[13,-1.5],BI:[-3.5,30],KH:[12.5,105],CM:[6,12.5],CA:[60,-95],CF:[7,21],TD:[15,19],
  CL:[-30,-71],CN:[35,105],CO:[4,-72],CD:[-4,22],CG:[-1,15],CR:[10,-84],CI:[8,-5.5],HR:[45.2,15.5],
  CU:[22,-80],CZ:[49.8,15.5],DK:[56,10],DJ:[11.5,43],DO:[19,-70.7],EC:[-2,-77.5],EG:[27,30],
  SV:[13.8,-88.9],ER:[15,39],ET:[8,38],FI:[64,26],FR:[46,2],GA:[-1,11.8],DE:[51,9],GH:[8,-1.2],
  GR:[39,22],GT:[15.5,-90.3],GN:[11,-10],HT:[19,-72.3],HN:[15,-86.5],HU:[47,20],IN:[20,77],
  ID:[-5,120],IR:[32,53],IQ:[33,44],IE:[53,-8],IL:[31.5,34.8],IT:[42.8,12.8],JM:[18.1,-77.3],
  JP:[36,138],JO:[31,36],KZ:[48,68],KE:[-1,38],KP:[40,127],KR:[37,127.5],KW:[29.5,47.8],
  KG:[41,75],LA:[18,105],LV:[57,25],LB:[33.8,35.8],LR:[6.5,-9.5],LY:[25,17],LT:[56,24],
  MG:[-20,47],MW:[-13.5,34],MY:[2.5,112.5],ML:[17,-4],MR:[20,-12],MX:[23,-102],MD:[47,29],
  MN:[46,105],MA:[32,-5],MZ:[-18.3,35],MM:[22,98],NA:[-22,17],NP:[28,84],NL:[52.5,5.8],
  NZ:[-42,174],NI:[13,-85],NE:[16,8],NG:[10,8],NO:[62,10],OM:[21,57],PK:[30,70],PA:[9,-80],
  PY:[-23,-58],PE:[-10,-76],PH:[13,122],PL:[52,20],PT:[39.5,-8],QA:[25.5,51.3],RO:[46,25],
  RU:[60,100],RW:[-2,30],SA:[25,45],SN:[14,-14],RS:[44,21],SL:[8.5,-11.8],SG:[1.4,103.8],
  SK:[48.7,19.5],SI:[46.1,15],SO:[5.2,46],ZA:[-29,24],ES:[40,-4],LK:[7,81],SD:[15,30],
  SE:[62,15],CH:[47,8],SY:[35,38],TW:[23.5,121],TJ:[39,71],TZ:[-6,35],TH:[15,100],
  TG:[8,1.2],TN:[34,9],TR:[39,35],TM:[40,60],UG:[1,32],UA:[49,32],AE:[24,54],
  GB:[54,-2],US:[38,-97],UY:[-33,-56],UZ:[41,64],VE:[8,-66],VN:[16,106],YE:[15,48],
  ZM:[-15,30],ZW:[-20,30],
}

/** Map GDELT ArtList `sourcecountry` (English labels) → ISO2 for centroid lookup. Keys: lowercase, no spaces. */
const GDELT_COUNTRY_NAME_TO_ISO = {
  afghanistan: 'AF', albania: 'AL', algeria: 'DZ', angola: 'AO', argentina: 'AR', armenia: 'AM',
  australia: 'AU', austria: 'AT', azerbaijan: 'AZ', bangladesh: 'BD', belarus: 'BY', belgium: 'BE',
  benin: 'BJ', bolivia: 'BO', 'bosniaandherzegovina': 'BA', brazil: 'BR', bulgaria: 'BG', 'burkinafaso': 'BF',
  burundi: 'BI', cambodia: 'KH', cameroon: 'CM', canada: 'CA', 'centralafricanrepublic': 'CF', chad: 'TD',
  chile: 'CL', china: 'CN', colombia: 'CO', 'democraticrepublicofthecongo': 'CD', congo: 'CG', 'costarica': 'CR',
  croatia: 'HR', cuba: 'CU', czechia: 'CZ', czechrepublic: 'CZ', denmark: 'DK', djibouti: 'DJ', 'dominicanrepublic': 'DO',
  ecuador: 'EC', egypt: 'EG', 'elsalvador': 'SV', eritrea: 'ER', ethiopia: 'ET', finland: 'FI', france: 'FR',
  gabon: 'GA', germany: 'DE', ghana: 'GH', greece: 'GR', guatemala: 'GT', guinea: 'GN', haiti: 'HT', honduras: 'HN',
  hungary: 'HU', india: 'IN', indonesia: 'ID', iran: 'IR', iraq: 'IQ', ireland: 'IE', israel: 'IL', italy: 'IT',
  jamaica: 'JM', japan: 'JP', jordan: 'JO', kazakhstan: 'KZ', kenya: 'KE', 'northkorea': 'KP', 'southkorea': 'KR',
  kuwait: 'KW', kyrgyzstan: 'KG', laos: 'LA', latvia: 'LV', lebanon: 'LB', liberia: 'LR', libya: 'LY', lithuania: 'LT',
  luxembourg: 'LU', madagascar: 'MG', malawi: 'MW', malaysia: 'MY', mali: 'ML', malta: 'MT', mauritania: 'MR',
  mexico: 'MX', moldova: 'MD', mongolia: 'MN', montenegro: 'ME', morocco: 'MA', mozambique: 'MZ', myanmar: 'MM',
  namibia: 'NA', nepal: 'NP', netherlands: 'NL', 'newzealand': 'NZ', nicaragua: 'NI', niger: 'NE', nigeria: 'NG',
  norway: 'NO', oman: 'OM', pakistan: 'PK', panama: 'PA', paraguay: 'PY', peru: 'PE', philippines: 'PH', poland: 'PL',
  portugal: 'PT', qatar: 'QA', romania: 'RO', russia: 'RU', rwanda: 'RW', 'saudiarabia': 'SA', senegal: 'SN', serbia: 'RS',
  'sierraleone': 'SL', singapore: 'SG', slovakia: 'SK', slovenia: 'SI', somalia: 'SO', 'southafrica': 'ZA', spain: 'ES',
  'srilanka': 'LK', sudan: 'SD', sweden: 'SE', switzerland: 'CH', syria: 'SY', taiwan: 'TW', tajikistan: 'TJ',
  tanzania: 'TZ', thailand: 'TH', togo: 'TG', tunisia: 'TN', turkey: 'TR', turkmenistan: 'TM', uganda: 'UG', ukraine: 'UA',
  'unitedarabemirates': 'AE', 'unitedkingdom': 'GB', uk: 'GB', 'greatbritain': 'GB', 'unitedstates': 'US', usa: 'US',
  uruguay: 'UY', uzbekistan: 'UZ', venezuela: 'VE',   vietnam: 'VN', yemen: 'YE', zambia: 'ZM', zimbabwe: 'ZW',
}

function normalizeGdeltCountryLabel(label) {
  return String(label || '').toLowerCase().replace(/[\s._-]+/g, '').trim()
}

function lookupCentroidFromSourceCountry(sourcecountry) {
  const key = normalizeGdeltCountryLabel(sourcecountry)
  if (!key) return null
  const iso = GDELT_COUNTRY_NAME_TO_ISO[key] || (key.length === 2 ? key.toUpperCase() : null)
  if (!iso || !COUNTRY_CENTROIDS[iso]) return null
  const [lat, lng] = COUNTRY_CENTROIDS[iso]
  return { lat, lng, iso }
}

/** GDELT DOC `seendate`: YYYYMMDDTHHmmssZ */
function gdeltSeendateToTimestampMs(seendate) {
  if (!seendate || typeof seendate !== 'string') return Date.now()
  const m = seendate.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/)
  if (!m) return Date.parse(seendate) || Date.now()
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6])
}

/** GDELT GEO `tone` field: comma-separated metrics (avg, pos, neg, polarity, activity, self/group ref, …). */
function parseGdeltToneField(raw) {
  if (raw == null || raw === '') return null
  const parts = String(raw).split(',').map((p) => parseFloat(String(p).trim()))
  const num = (i) => (Number.isFinite(parts[i]) ? parts[i] : null)
  return {
    avgTone: num(0),
    posTone: num(1),
    negTone: num(2),
    polarity: num(3),
    activityDensity: num(4),
    selfGroupRefDensity: num(5),
  }
}

function inferDocArticleDimension(article) {
  const blob = `${article?.title || ''} ${article?.url || ''} ${article?.domain || ''}`.toLowerCase()
  const tests = [
    { dimension: 'safety', re: /\b(war|conflict|attack|military|missile|bomb|terror|casualties|sanctions violation)\b/i },
    { dimension: 'governance', re: /\b(election|parliament|congress|senate|court|law|bill|treaty|diplomat|ministry|corruption|impeach)\b/i },
    { dimension: 'economy', re: /\b(stock|market|trade|tariff|gdp|inflation|recession|bank|currency|oil price|fed|ecb)\b/i },
    { dimension: 'people', re: /\b(protest|refugee|migration|strike|health|hospital|disease|hunger|human rights|unemployment)\b/i },
    { dimension: 'environment', re: /\b(climate|flood|earthquake|storm|wildfire|pollution|emission|drought|hurricane|tsunami)\b/i },
    { dimension: 'narrative', re: /\b(media|press|journalist|censorship|disinformation|social media|broadcast|narrative)\b/i },
  ]
  for (const { dimension, re } of tests) {
    if (re.test(blob)) return dimension
  }
  return 'narrative'
}

/** One GEO request per dimension (query breadth), merged in the worker with rate limiting. */
const GDELT_GEO_DIM_QUERIES = [
  { query: '(conflict OR war OR military OR terror OR attack OR violence)', dimension: 'safety' },
  { query: '(election OR parliament OR law OR court OR sanctions OR diplomacy OR treaty OR government OR corruption)', dimension: 'governance' },
  { query: '(economy OR trade OR market OR inflation OR GDP OR tariff OR recession OR bank)', dimension: 'economy' },
  { query: '(humanitarian OR migration OR refugee OR health OR disease OR hospital OR hunger OR strike OR labor)', dimension: 'people' },
  { query: '(climate OR environment OR pollution OR wildfire OR flood OR storm OR earthquake OR disaster OR renewable)', dimension: 'environment' },
  { query: '(media OR censorship OR journalist OR press OR disinformation OR narrative OR broadcast)', dimension: 'narrative' },
]

/**
 * DOC ArtList chain — one leg per ATLAS dimension (not one giant query: GDELT
 * returns an error page for URLs that are too long).
 *
 * Phase 1b: trimmed from 8 legs to the 6 dimension-scoped legs. DOC articles
 * are country-centroid geocodes and never pin on the globe — they feed the
 * ticker/feed and Dossier evidence, so the "wider net" legs only burned the
 * shared GDELT rate-limit budget. Ingest today = DOC legs below +
 * `gdelt-cameo` (15-min Events export) + `gdelt-vgkg` (sparse visual GKG
 * samples, panel-only).
 */
const GDELT_DOC_DIM_QUERIES = [
  { query: '(conflict OR war OR military OR terror OR attack OR violence OR protest)', dimension: 'safety' },
  { query: '(election OR parliament OR law OR court OR sanctions OR diplomacy OR treaty OR government OR corruption)', dimension: 'governance' },
  { query: '(economy OR trade OR market OR inflation OR GDP OR tariff OR recession OR bank)', dimension: 'economy' },
  { query: '(humanitarian OR migration OR refugee OR health OR disease OR hospital OR hunger OR strike OR labor)', dimension: 'people' },
  { query: '(climate OR environment OR pollution OR wildfire OR flood OR storm OR earthquake OR disaster OR renewable)', dimension: 'environment' },
  { query: '(media OR censorship OR journalist OR press OR disinformation OR narrative OR broadcast)', dimension: 'narrative' },
]

const GDELT_DOC_BASE = 'https://api.gdeltproject.org/api/v2/doc/doc'
/** Per-leg AbortController timeout for GDELT DOC/GEO chain legs. */
const GDELT_LEG_TIMEOUT_MS = 20_000

// ── Phase 1b: CAMEO → two products (pins + country aggregates) ──

/** Pin gate: a CAMEO row pins only when multiple independent sources OR high severity. */
const GDELT_PIN_MIN_SOURCES = 3
const GDELT_PIN_MIN_SEVERITY = 4

function cameoRowIsPinWorthy(row) {
  return (row.numSources || 0) >= GDELT_PIN_MIN_SOURCES
    || (row.severity || 1) >= GDELT_PIN_MIN_SEVERITY
}

/**
 * Reduce ALL parsed CAMEO rows (not just pin-worthy ones) to per-country
 * aggregates keyed by FIPS 10-4 (`ActionGeo_CountryCode`, which joins
 * directly to Natural Earth `FIPS_10`). Feeds the choropleth without extra
 * GEO API calls, and the Triage surge baseline (Phase 4).
 * @returns {Record<string, { events: number, avgTone: number, avgGoldstein: number, quad: Record<1|2|3|4, number> }>}
 */
function buildCameoCountryAggregates(rows) {
  const sums = {}
  for (const row of rows) {
    const fips = row.countryCode
    if (!fips || fips === '-99') continue
    let s = sums[fips]
    if (!s) {
      s = { events: 0, toneSum: 0, goldsteinSum: 0, quad: { 1: 0, 2: 0, 3: 0, 4: 0 } }
      sums[fips] = s
    }
    s.events++
    if (Number.isFinite(row.toneScore)) s.toneSum += row.toneScore
    if (Number.isFinite(row.goldstein)) s.goldsteinSum += row.goldstein
    if (s.quad[row.quadClass] != null) s.quad[row.quadClass]++
  }
  const out = {}
  for (const [fips, s] of Object.entries(sums)) {
    out[fips] = {
      events: s.events,
      avgTone: s.toneSum / s.events,
      avgGoldstein: s.goldsteinSum / s.events,
      quad: s.quad,
    }
  }
  return out
}

// ══════════════════════════════════════════════════════════════
//  NORMALIZERS — one per source ID
// ══════════════════════════════════════════════════════════════

const NORMALIZERS = {

  // ── MODULE 6: Seismic ──

  usgs: (data) => {
    if (!data?.features) return []
    return data.features
      .filter(f => f.geometry?.coordinates && f.properties?.mag)
      .map(f => {
        const p = f.properties
        const [lng, lat] = f.geometry.coordinates
        const mag = p.mag
        let priority = 'p3', severity = 1
        if (mag >= 7.0) { priority = 'p1'; severity = 5 }
        else if (mag >= 6.0) { priority = 'p1'; severity = 4 }
        else if (mag >= 5.5) { priority = 'p2'; severity = 3 }
        else if (mag >= 5.0) { priority = 'p2'; severity = 2 }
        return makeEvent({
          id: createEventId(lat, lng, p.time, 'usgs', p.title || ''),
          priority,
    priority: priority, // legacy compat
 dimension: 'environment', lat, lng, severity,
          corroborationSources: ['usgs'], authoritative: true, ttl: 360,
          title: p.title || `M${mag} Earthquake`,
          detail: `Magnitude ${mag} at depth ${f.geometry.coordinates[2] || 0}km. ${p.place || ''}`.trim(),
          source: 'USGS', sourceUrl: p.url || 'https://earthquake.usgs.gov',
          tags: ['earthquake', `M${mag.toFixed(1)}`], timestamp: new Date(p.time).toISOString(),
        })
      })
  },

  gdacs: (xmlText) => {
    if (!xmlText) return []
    const events = []
    const itemRegex = /<item>([\s\S]*?)<\/item>/g
    let match
    while ((match = itemRegex.exec(xmlText)) !== null) {
      const item = match[1]
      const title = getXmlTag(item, 'title')
      const description = getXmlTag(item, 'description')
      const link = getXmlTag(item, 'link')
      const pubDate = getXmlTag(item, 'pubDate')

      const latM = item.match(/<geo:lat>([^<]+)/)
      const lngM = item.match(/<geo:long>([^<]+)/)
      if (!latM || !lngM) continue
      const lat = parseFloat(latM[1]), lng = parseFloat(lngM[1])
      if (isNaN(lat) || isNaN(lng)) continue

      const alertM = item.match(/<gdacs:alertlevel>([^<]+)/)
      const alertLevel = alertM ? alertM[1].trim().toLowerCase() : ''
      let priority = 'p3', severity = 2
      if (alertLevel === 'red') { priority = 'p1'; severity = 5 }
      else if (alertLevel === 'orange') { priority = 'p2'; severity = 3 }

      events.push(makeEvent({
        id: createEventId(lat, lng, Date.parse(pubDate || Date.now()), 'gdacs', title),
        priority,
    priority: priority, // legacy compat
 dimension: 'environment', lat, lng, severity,
        corroborationSources: ['gdacs'], authoritative: true, ttl: 600,
        title, detail: description, source: 'GDACS',
        sourceUrl: link || 'https://www.gdacs.org', tags: ['disaster'],
        timestamp: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
      }))
    }
    return events
  },

  // ── MODULE 5: Weather & Environment ──

  eonet: (data) => {
    if (!data?.events) return []
    return data.events
      .filter(e => e.geometry?.length > 0)
      .map(e => {
        const geo = e.geometry[e.geometry.length - 1]
        if (!geo.coordinates) return null
        const [lng, lat] = geo.coordinates
        const catId = e.categories?.[0]?.id || ''
        const isSevere = ['volcanoes', 'severeStorms', 'floods', 'landslides'].includes(catId)
        return makeEvent({
          id: createEventId(lat, lng, Date.parse(geo.date || Date.now()), 'eonet', e.title),
          priority: isSevere ? 'p2' : 'p3',
          dimension: 'environment', lat, lng, severity: isSevere ? 3 : 1,
          corroborationSources: ['eonet'], authoritative: true, ttl: 1800,
          title: e.title || 'Natural Event',
          detail: `Category: ${catId}. Source: NASA EONET.`,
          source: 'NASA EONET', sourceUrl: e.link || 'https://eonet.gsfc.nasa.gov',
          tags: [catId, 'natural-event'], timestamp: geo.date || new Date().toISOString(),
        })
      }).filter(Boolean)
  },

  // ── MODULE 10: Space & Electromagnetic ──

  'noaa-kp': (data) => {
    if (!Array.isArray(data) || data.length === 0) return []
    const latest = data[data.length - 1]
    const kp = parseFloat(latest.kp_index ?? latest.Kp ?? 0)
    if (kp < 4) return []
    let priority = 'p3', severity = 1
    if (kp >= 7) { priority = 'p1'; severity = 5 }
    else if (kp >= 5) { priority = 'p2'; severity = 3 }
    return [makeEvent({
      id: createEventId(65, 0, Date.now(), 'noaa-kp', `Kp ${kp}`),
      priority,
    priority: priority, // legacy compat
 dimension: 'narrative', lat: 65, lng: 0, latApproximate: true,
      severity, corroborationSources: ['noaa-kp'], authoritative: true, ttl: 600,
      title: `Geomagnetic Storm — Kp ${kp.toFixed(1)}`,
      detail: kp >= 7 ? 'Severe storm conditions.' : kp >= 5 ? 'Geomagnetic storm warning.' : 'Elevated geomagnetic activity.',
      source: 'NOAA SWPC', sourceUrl: 'https://www.swpc.noaa.gov',
      tags: ['space-weather', `kp-${Math.floor(kp)}`],
    })]
  },

  'noaa-xray': (data) => {
    if (!Array.isArray(data) || data.length === 0) return []
    const latest = data[data.length - 1]
    const flux = parseFloat(latest.flux ?? 0)
    if (flux < 1e-5) return []
    const isXClass = flux >= 1e-4
    const isMClass = flux >= 1e-5
    return [makeEvent({
      id: createEventId(0, 0, Date.now(), 'noaa-xray', `X-ray ${flux.toExponential(1)}`),
      priority: isXClass ? 'p1' : 'p2',
      dimension: isXClass ? 'environment' : 'narrative',
      lat: 0, lng: 0, latApproximate: true,
      severity: isXClass ? 5 : isMClass ? 3 : 1,
      corroborationSources: ['noaa-xray'], authoritative: true, ttl: 600,
      title: `Solar Flare — ${isXClass ? 'X-class' : 'M-class'} (${flux.toExponential(1)} W/m²)`,
      detail: `GOES X-ray flux at ${flux.toExponential(2)} W/m². ${isXClass ? 'CRITICAL: X-class flare detected.' : 'Elevated solar activity.'}`,
      source: 'NOAA SWPC', sourceUrl: 'https://www.swpc.noaa.gov',
      tags: ['solar-flare', isXClass ? 'x-class' : 'm-class'],
    })]
  },

  'noaa-solar-wind': (data) => {
    if (!Array.isArray(data) || data.length < 2) return []
    const latest = data[data.length - 1]
    const speed = parseFloat(latest.speed ?? 0)
    if (speed < 500) return []
    const isExtreme = speed >= 800
    return [makeEvent({
      id: createEventId(70, -30, Date.now(), 'noaa-sw', `SW ${Math.round(speed)} km/s`),
      priority: isExtreme ? 'p2' : 'p3',
      dimension: 'narrative', lat: 70, lng: -30, latApproximate: true,
      severity: isExtreme ? 3 : 1,
      corroborationSources: ['noaa-sw'], authoritative: true, ttl: 600,
      title: `Solar Wind — ${Math.round(speed)} km/s`,
      detail: `Solar wind speed at ${Math.round(speed)} km/s. ${isExtreme ? 'High-speed stream detected.' : 'Elevated solar wind.'}`,
      source: 'NOAA SWPC', sourceUrl: 'https://www.swpc.noaa.gov',
      tags: ['solar-wind', 'space-weather'],
    })]
  },

  // ── MODULE 7: Financial ──

  coingecko: (data) => {
    if (!data) return []
    const events = []
    for (const [coin, info] of Object.entries(data)) {
      const change = info?.usd_24h_change
      if (change === undefined || Math.abs(change) < 5) continue
      const priority = Math.abs(change) >= 15 ? 'p2' : 'p3'
      const severity = Math.abs(change) >= 15 ? 3 : Math.abs(change) >= 10 ? 2 : 1
      events.push(makeEvent({
        id: createEventId(40.7, -74.0, Date.now(), 'coingecko', `${coin} ${change.toFixed(1)}%`),
        priority,
    priority: priority, // legacy compat
 dimension: 'economy', lat: 40.7128, lng: -74.006, latApproximate: true,
        severity, corroborationSources: ['coingecko'], ttl: 900,
        title: `${coin.toUpperCase()} ${change > 0 ? '▲' : '▼'} ${Math.abs(change).toFixed(1)}% (24h)`,
        detail: `Price: $${info.usd?.toLocaleString() || 'N/A'}`,
        source: 'CoinGecko', sourceUrl: 'https://www.coingecko.com',
        tags: ['crypto', coin],
      }))
    }
    return events
  },

  'alt-fng': (data) => {
    if (!data?.data?.[0]) return []
    const fng = data.data[0]
    const value = parseInt(fng.value)
    if (value >= 25 && value <= 75) return []
    const isExtremeFear = value < 25
    return [makeEvent({
      id: createEventId(40.7, -74.0, Date.now(), 'alt-fng', `F&G ${value}`),
      priority: value < 10 || value > 90 ? 'p2' : 'p3',
      dimension: 'economy', lat: 40.7128, lng: -74.006, latApproximate: true,
      severity: value < 10 || value > 90 ? 3 : 1,
      corroborationSources: ['alt-fng'], ttl: 3600,
      title: `Crypto Fear & Greed: ${value} — ${fng.value_classification}`,
      detail: `Market sentiment index at ${value}/100 (${fng.value_classification}).`,
      source: 'Alternative.me', sourceUrl: 'https://alternative.me/crypto/fear-and-greed-index/',
      tags: ['fear-greed', 'sentiment', fng.value_classification.toLowerCase()],
    })]
  },

  // ── MODULE 8: Cyber ──

  'cisa-kev': (data) => {
    if (!data?.vulnerabilities) return []
    const now = Date.now()
    const threeDays = 3 * 86400_000
    return data.vulnerabilities
      .filter(v => v.dateAdded && (now - Date.parse(v.dateAdded)) < threeDays)
      .slice(-15)
      .map(v => makeEvent({
        id: createEventId(38.9, -77.0, Date.parse(v.dateAdded), 'cisa-kev', v.cveID || ''),
        priority: 'p2', dimension: 'safety', lat: 38.8951, lng: -77.0364, latApproximate: true,
        severity: 3, corroborationSources: ['cisa-kev'], authoritative: true, ttl: 3600,
        title: `CVE: ${v.cveID} — ${v.vendorProject || 'Unknown'}`,
        detail: `${v.vulnerabilityName || ''}. ${v.shortDescription || ''}`.trim(),
        source: 'CISA KEV', sourceUrl: 'https://www.cisa.gov/known-exploited-vulnerabilities-catalog',
        tags: ['cve', v.cveID, v.vendorProject].filter(Boolean),
        timestamp: new Date(v.dateAdded).toISOString(),
      }))
  },

  // ── MODULE 2: GDELT 2.0 Geopolitical Events ──
  //
  // The GDELT GKG/Event API now returns pre-geolocated articles. We use a
  // two-stage fetch: first the GKG GeoJSON feed for coordinates, then the
  // Doc API for article metadata. Events that lack geo are dropped.
  // QuadClass mapping: 1=Verbal Coop, 2=Material Coop, 3=Verbal Conflict, 4=Material Conflict

  'gdelt-events': (data) => {
    if (!data?.features) return []
    const seen = new Set()
    const out = []
    for (const f of data.features) {
      const props = f.properties || {}
      const coords = f.geometry?.coordinates
      if (!coords || coords.length < 2) continue
      const [lng, lat] = coords
      if (isNaN(lat) || isNaN(lng) || (lat === 0 && lng === 0)) continue

      const name = props.name || props.html || 'Geopolitical Event'
      const dedupeKey = `${lat.toFixed(3)}|${lng.toFixed(3)}|${String(name).slice(0, 48)}`
      if (seen.has(dedupeKey)) continue
      seen.add(dedupeKey)

      const url = props.url || props.shareimage || ''
      const urlDimension = props.dimension || props.sourcecountry || ''
      const toneParts = parseGdeltToneField(props.tone)
      const tone = Number.isFinite(toneParts?.avgTone)
        ? toneParts.avgTone
        : (parseFloat(String(props.tone).split(',')[0]) || 0)
      const hinted = props._atlasDimensionHint
      let priority = 'p3'
      let severity = 1
      let dimension = typeof hinted === 'string' && hinted ? hinted : 'narrative'

      if (!hinted) {
        if (tone <= -5) { priority = 'p2'; severity = 3; dimension = 'safety' }
        else if (tone <= -2) { priority = 'p2'; severity = 2; dimension = 'safety' }
        else if (tone >= 5) { priority = 'p3'; severity = 1; dimension = 'narrative' }
      } else {
        if (tone <= -5) { priority = 'p2'; severity = Math.max(severity, 3) }
        else if (tone <= -2) { priority = 'p2'; severity = Math.max(severity, 2) }
      }

      const count = parseInt(props.numarts || props.numsources || 1, 10)
      const corrobCount = Math.min(5, Math.max(1, Math.ceil(count / 3)))

      const toneDetail = toneParts
        ? `Avg ${toneParts.avgTone?.toFixed(2) ?? '—'} · Pos ${toneParts.posTone?.toFixed(2) ?? '—'} · Neg ${toneParts.negTone?.toFixed(2) ?? '—'} · Polarity ${toneParts.polarity?.toFixed(2) ?? '—'} · Activity ${toneParts.activityDensity?.toFixed(2) ?? '—'} · Self/group ${toneParts.selfGroupRefDensity?.toFixed(2) ?? '—'}`
        : `Tone: ${tone.toFixed(1)}`

      const tsMs = gdeltSeendateToTimestampMs(props.seendate || props.datetime || '')
      out.push(makeEvent({
        id: createEventId(lat, lng, tsMs, 'gdelt-events', name.substring(0, 60)),
        priority,
        priority: priority, // legacy compat
        dimension, lat, lng, severity,
        corroborationCount: corrobCount,
        corroborationSources: ['gdelt-events'], ttl: 900,
        title: name.length > 120 ? name.substring(0, 117) + '…' : name,
        detail: `Where: ${urlDimension || 'unknown'}. ${toneDetail}. Articles: ${count}.`,
        source: 'GDELT', sourceUrl: url || 'https://gdeltproject.org',
        tags: ['geopolitical', 'gdelt', dimension],
        timestamp: new Date(tsMs).toISOString(),
      }))
    }
    return out
  },

  gdelt: (data) => {
    if (!data?.articles) return []
    const seen = new Set()
    const out = []
    for (const a of data.articles) {
      const url = a.url || ''
      const centroid = lookupCentroidFromSourceCountry(a.sourcecountry)
      if (!centroid) continue
      const lat = centroid.lat
      const lng = centroid.lng

      const hinted = typeof a._atlasDimensionHint === 'string' && a._atlasDimensionHint
      const dimension = hinted || inferDocArticleDimension(a)
      const tsMs = gdeltSeendateToTimestampMs(a.seendate)
      const title = a.title || 'Global Event'

      const dedupeKey = `${lat.toFixed(2)}|${lng.toFixed(2)}|${String(title).slice(0, 60)}`
      if (seen.has(dedupeKey)) continue
      seen.add(dedupeKey)

      let priority = 'p3'
      let severity = 1
      if (dimension === 'safety') { severity = 2; priority = 'p2' }
      out.push(makeEvent({
        id: createEventId(lat, lng, tsMs, 'gdelt', title || url),
        priority,
        priority: priority, // legacy compat
        dimension,
        lat,
        lng,
        latApproximate: true,
        severity,
        corroborationSources: ['gdelt'],
        ttl: 600,
        title,
        detail: `Outlet country: ${a.sourcecountry || 'unknown'}. Language: ${a.language || 'unknown'}.`,
        source: 'GDELT',
        sourceUrl: url || 'https://gdeltproject.org',
        tags: ['news', 'gdelt', dimension, centroid.iso || ''].filter(Boolean),
        timestamp: new Date(tsMs).toISOString(),
      }))
    }
    return out
  },

  // ── MODULE 1: Conflict (UCDP) ──

  ucdp: (data) => {
    if (!data?.Result) return []
    return data.Result.slice(0, 30).map(e => {
      const lat = parseFloat(e.latitude)
      const lng = parseFloat(e.longitude)
      if (isNaN(lat) || isNaN(lng)) return null
      const fatalities = parseInt(e.best) || 0
      let priority = 'p2', severity = 2
      if (fatalities >= 100) { priority = 'p1'; severity = 5 }
      else if (fatalities >= 21) { priority = 'p1'; severity = 4 }
      else if (fatalities >= 6) { priority = 'p2'; severity = 3 }
      else if (fatalities >= 1) { priority = 'p2'; severity = 2 }
      else { priority = 'p3'; severity = 1 }
      return makeEvent({
        id: createEventId(lat, lng, Date.parse(e.date_start || Date.now()), 'ucdp', e.dyad_name || ''),
        priority,
    priority: priority, // legacy compat
 dimension: 'safety', lat, lng, severity,
        corroborationSources: ['ucdp'], ttl: 1800,
        title: `Conflict: ${e.dyad_name || 'Unknown'} — ${e.country || ''}`,
        detail: `${e.type_of_violence === '1' ? 'State-based' : e.type_of_violence === '2' ? 'Non-state' : 'One-sided'} violence. ${fatalities > 0 ? `Fatalities: ${fatalities}.` : ''}`,
        source: 'UCDP', sourceUrl: 'https://ucdp.uu.se',
        tags: ['conflict', e.country, e.region].filter(Boolean),
        timestamp: e.date_start ? new Date(e.date_start).toISOString() : new Date().toISOString(),
      })
    }).filter(Boolean)
  },

  // ── MODULE 11: Humanitarian ──

  reliefweb: (data) => {
    if (!data?.data) return []
    return data.data.filter(r => r.fields).map(r => {
      const f = r.fields
      const country = f.primary_country || f.country?.[0]
      const lat = country?.location?.lat || 0
      const lng = country?.location?.lon || 0
      if (!lat && !lng) return null
      return makeEvent({
        id: createEventId(lat, lng, Date.parse(f.date?.created || Date.now()), 'reliefweb', f.title || ''),
        priority: 'p3', dimension: 'people', lat, lng, latApproximate: true,
        severity: 2, corroborationSources: ['reliefweb'], ttl: 5400,
        title: f.title || 'Humanitarian Report',
        detail: f.body ? f.body.substring(0, 300) : '',
        source: 'ReliefWeb', sourceUrl: f.url_alias || 'https://reliefweb.int',
        tags: ['humanitarian', country?.name].filter(Boolean),
        timestamp: f.date?.created ? new Date(f.date.created).toISOString() : new Date().toISOString(),
      })
    }).filter(Boolean)
  },

  // ── MODULE 12: Disease (WHO RSS) ──

  'who-don': (xmlText) => {
    if (!xmlText) return []
    const events = []
    const itemRegex = /<item>([\s\S]*?)<\/item>/g
    let match
    while ((match = itemRegex.exec(xmlText)) !== null) {
      const item = match[1]
      const title = getXmlTag(item, 'title')
      const description = getXmlTag(item, 'description')
      const link = getXmlTag(item, 'link')
      const pubDate = getXmlTag(item, 'pubDate')
      events.push(makeEvent({
        id: createEventId(46.2, 6.1, Date.parse(pubDate || Date.now()), 'who-don', title),
        priority: title.toLowerCase().includes('emergency') ? 'p1' : 'p3',
        dimension: 'people', lat: 46.2044, lng: 6.1432, latApproximate: true,
        severity: title.toLowerCase().includes('emergency') ? 4 : 1,
        corroborationSources: ['who-don'], authoritative: true, ttl: 3600,
        title: title || 'WHO Report',
        detail: description ? description.replace(/<[^>]*>/g, '').substring(0, 300) : '',
        source: 'WHO', sourceUrl: link || 'https://www.who.int',
        tags: ['disease', 'who'],
        timestamp: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
      }))
    }
    return events.slice(0, 15)
  },

  // ── MODULE 12: Disease (ProMED) ──

  promed: (xmlText) => {
    if (!xmlText) return []
    const events = []
    const itemRegex = /<item>([\s\S]*?)<\/item>/g
    let match
    while ((match = itemRegex.exec(xmlText)) !== null) {
      const item = match[1]
      const title = getXmlTag(item, 'title')
      const link = getXmlTag(item, 'link')
      const pubDate = getXmlTag(item, 'pubDate')
      events.push(makeEvent({
        id: createEventId(42.4, -71.1, Date.parse(pubDate || Date.now()), 'promed', title),
        priority: 'p3', dimension: 'people', lat: 42.3601, lng: -71.0589, latApproximate: true,
        severity: 1, corroborationSources: ['promed'], ttl: 3600,
        title: title || 'Disease Alert',
        detail: '',
        source: 'ProMED', sourceUrl: link || 'https://promedmail.org',
        tags: ['disease', 'promed'],
        timestamp: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
      }))
    }
    return events.slice(0, 10)
  },

  // ── MODULE 13: Diplomatic (OFAC SDN — check for recent additions) ──

  'ofac-sdn': (xmlText) => {
    if (!xmlText) return []
    const events = []
    const entryRegex = /<sdnEntry>([\s\S]*?)<\/sdnEntry>/g
    let match, count = 0
    while ((match = entryRegex.exec(xmlText)) !== null && count < 10) {
      const entry = match[1]
      const name = getXmlTag(entry, 'lastName') || getXmlTag(entry, 'sdnName') || 'Unknown'
      const program = getXmlTag(entry, 'programList')
      const entryId = getXmlTag(entry, 'uid')
      events.push(makeEvent({
        id: createEventId(38.9, -77.0, Date.now(), 'ofac', entryId + name),
        priority: 'p3', dimension: 'narrative', lat: 38.8951, lng: -77.0364, latApproximate: true,
        severity: 1, corroborationSources: ['ofac-sdn'], authoritative: true, ttl: 86400,
        title: `OFAC Sanction: ${name}`,
        detail: `Sanctions program: ${program || 'Multiple'}`,
        source: 'OFAC SDN', sourceUrl: 'https://www.treasury.gov/ofac',
        tags: ['sanctions', 'ofac'],
      }))
      count++
    }
    return events
  },

  // ── MODULE 13: Legal (Global Legal Monitor RSS) ──

  'loc-legal': (xmlText) => {
    if (!xmlText) return []
    const events = []
    const itemRegex = /<item>([\s\S]*?)<\/item>/g
    let match
    while ((match = itemRegex.exec(xmlText)) !== null) {
      const item = match[1]
      const title = getXmlTag(item, 'title')
      const link = getXmlTag(item, 'link')
      const pubDate = getXmlTag(item, 'pubDate')
      const desc = getXmlTag(item, 'description')
      events.push(makeEvent({
        id: createEventId(38.9, -77.0, Date.parse(pubDate || Date.now()), 'loc-legal', title),
        priority: 'p3', dimension: 'narrative', lat: 38.8897, lng: -77.0090, latApproximate: true,
        severity: 1, corroborationSources: ['loc-legal'], ttl: 7200,
        title: title || 'Legal Monitor Update',
        detail: desc ? desc.replace(/<[^>]*>/g, '').substring(0, 300) : '',
        source: 'LOC Legal Monitor', sourceUrl: link || 'https://www.loc.gov/law/foreign-news/',
        tags: ['legal', 'diplomatic'],
        timestamp: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
      }))
    }
    return events.slice(0, 10)
  },

  // ── MODULE 10: Celestrak (close approaches) ──

  celestrak: (data) => {
    if (!Array.isArray(data) || data.length === 0) return []
    return data.slice(0, 5).map(entry => {
      const name1 = entry.SAT_NAME_1 || entry.sat_name_1 || 'Object 1'
      const name2 = entry.SAT_NAME_2 || entry.sat_name_2 || 'Object 2'
      const minRange = parseFloat(entry.MIN_RNG || entry.min_rng || 0)
      return makeEvent({
        id: createEventId(0, 0, Date.now(), 'celestrak', `${name1}-${name2}`),
        priority: minRange < 1 ? 'p2' : 'p3',
        dimension: 'narrative', lat: 0, lng: 0, latApproximate: true,
        severity: minRange < 0.5 ? 3 : 1,
        corroborationSources: ['celestrak'], ttl: 3600,
        title: `Close Approach: ${name1} ↔ ${name2}`,
        detail: `Minimum range: ${minRange.toFixed(2)} km. Conjunction assessment from Celestrak SOCRATES.`,
        source: 'Celestrak', sourceUrl: 'https://celestrak.org/SOCRATES/',
        tags: ['space', 'conjunction', 'debris'],
      })
    })
  },

  // ── Phase 1: OpenSky Network ADS-B ($0 — anon 10s poll, registered 5s) ──

  opensky: (data) => {
    const states = data?.states
    if (!Array.isArray(states) || states.length === 0) return []
    const events = []
    for (const st of states) {
      if (!Array.isArray(st) || st.length < 11) continue
      const icao24 = (st[0] || '').toLowerCase()
      const callsign = (st[1] || '').trim()
      const originCountry = st[2] || ''
      const lng = st[5]
      const lat = st[6]
      const baroAlt = st[7]
      const onGround = st[8]
      const velocity = st[9]
      const track = st[10]
      if (onGround || lat == null || lng == null) continue
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue
      const mil = isMilitaryIcao24(icao24)
      const altM = baroAlt != null ? Math.round(baroAlt) : null
      const velMs = velocity != null ? Math.round(velocity) : null
      const trackDeg = track != null ? Math.round(track) : 0
      const csLabel = callsign || icao24.toUpperCase()
      events.push(makeEvent({
        id: createEventId(0, 0, 0, 'opensky', icao24),
        priority: mil ? 'p2' : 'p3',
        dimension: 'narrative',
        lat, lng,
        severity: mil ? 2 : 1,
        corroborationSources: ['opensky'],
        ttl: 30,
        title: mil ? `MIL ${csLabel}` : csLabel,
        detail: [
          altM != null ? `Alt ${(altM * 3.281).toFixed(0)} ft` : null,
          velMs != null ? `${Math.round(velMs * 1.944)} kts` : null,
          trackDeg != null ? `Hdg ${trackDeg}°` : null,
          originCountry ? `Origin ${originCountry}` : null,
        ].filter(Boolean).join(' · '),
        source: 'OpenSky Network',
        sourceUrl: 'https://opensky-network.org',
        tags: ['adsb', 'aircraft', mil ? 'military' : 'civil'],
        trackKind: 'aircraft',
        icao24,
        callsign,
        altitudeM: altM,
        velocityMs: velMs,
        trackDeg,
        originCountry,
        isMilitary: mil,
      }))
    }
    return events.slice(0, 800)
  },

  // ── Phase 1: CelesTrak TLE catalogs ($0 — no key, reasonable-use polling) ──

  'celestrak-tle': (entries) => {
    if (!Array.isArray(entries) || entries.length === 0) return []
    const now = Date.now()
    return entries.slice(0, 600).map((entry) => {
      const name = entry.name || 'Satellite'
      const noradId = entry.noradId ?? 0
      const group = entry._atlasGroup || 'active'
      const mil = group === 'military'
      const purposeInfo = classifySatellitePurpose({ name, satelliteGroup: group, isMilitary: mil })
      const opSuffix = purposeInfo.operator ? ` · ${purposeInfo.operator}` : ''
      return makeEvent({
        id: createEventId(0, 0, 0, 'celestrak-tle', String(noradId)),
        priority: group === 'stations' ? 'p2' : 'p3',
        dimension: 'environment',
        lat: 0,
        lng: 0,
        latApproximate: false,
        severity: group === 'stations' ? 2 : 1,
        corroborationSources: ['celestrak-tle'],
        ttl: 7200,
        title: name,
        detail: `${purposeInfo.label}${opSuffix} · NORAD ${noradId} · ${group} catalog`,
        source: 'CelesTrak TLE',
        sourceUrl: 'https://celestrak.org',
        tags: ['space', 'satellite', group, purposeInfo.purpose].filter(Boolean),
        trackKind: 'satellite',
        noradId,
        satelliteGroup: group,
        isMilitary: mil,
        satellitePurpose: purposeInfo.purpose,
        satellitePurposeLabel: purposeInfo.label,
        satellitePurposeDetail: purposeInfo.detail,
        satelliteOperator: purposeInfo.operator,
        tleLine1: entry.line1,
        tleLine2: entry.line2,
      })
    })
  },

  // ── Phase 3: AISStream vessel positions ($0 free tier — server WebSocket proxy) ──

  aisstream: (data) => {
    const vessels = data?.vessels
    if (!Array.isArray(vessels) || vessels.length === 0) return []
    return vessels.slice(0, 400).map((v) => {
      const mmsi = String(v.mmsi || '')
      const cog = v.cog != null ? Math.round(v.cog) : 0
      const sogKn = v.sog != null ? (v.sog / 10).toFixed(1) : null
      const name = (v.shipName || '').trim() || `MMSI ${mmsi}`
      return makeEvent({
        id: createEventId(v.lat, v.lng, Date.now(), 'aisstream', mmsi),
        priority: 'p3',
        dimension: 'economy',
        lat: v.lat,
        lng: v.lng,
        severity: 1,
        corroborationSources: ['aisstream'],
        ttl: 120,
        title: name,
        detail: [
          sogKn != null ? `${sogKn} kn` : null,
          cog != null ? `COG ${cog}°` : null,
          `MMSI ${mmsi}`,
        ].filter(Boolean).join(' · '),
        source: 'AISStream',
        sourceUrl: 'https://aisstream.io',
        tags: ['maritime', 'ais', 'vessel'],
        trackKind: 'vessel',
        mmsi,
        cog,
        sog: v.sog != null ? v.sog / 10 : null,
        shipName: v.shipName || '',
      })
    })
  },

  // ── Phase 3: NOAA NHC active tropical cyclones ($0 RSS/KML, no key) ──

  'noaa-nhc': (data) => {
    const storms = data?.storms
    if (!Array.isArray(storms) || storms.length === 0) return []
    return storms.map((s) => {
      const track = s.trackCoords || []
      const cone = s.coneCoords || []
      const centerLat = s.centerLat ?? track[track.length - 1]?.lat ?? 0
      const centerLng = s.centerLng ?? track[track.length - 1]?.lng ?? 0
      const cat = s.category || 'TC'
      const sev = /hurricane|typhoon/i.test(cat) ? 4 : /storm/i.test(cat) ? 3 : 2
      return makeEvent({
        id: createEventId(centerLat, centerLng, Date.now(), 'noaa-nhc', s.stormId || s.name),
        priority: sev >= 4 ? 'p1' : 'p2',
        dimension: 'environment',
        lat: centerLat,
        lng: centerLng,
        severity: sev,
        corroborationSources: ['noaa-nhc'],
        ttl: 3600,
        title: `${s.name || s.stormId} (${cat})`,
        detail: `NOAA/NHC active cyclone · ${track.length} track points · ${cone.length ? 'cone available' : 'track only'}`,
        source: 'NOAA NHC',
        sourceUrl: 'https://www.nhc.noaa.gov',
        tags: ['weather', 'hurricane', 'nhc', cat.toLowerCase()],
        trackKind: 'storm',
        stormId: s.stormId,
        stormCategory: cat,
        trackCoords: track,
        coneCoords: cone,
      })
    })
  },

  // ── Open-Meteo (extreme weather for key cities) ──

  'open-meteo': (data) => {
    if (!data) return []
    const events = []
    if (data.current_weather || data.current) {
      const cw = data.current_weather || data.current
      const windSpeed = cw.windspeed ?? cw.wind_speed_10m ?? 0
      if (windSpeed > 80) {
        events.push(makeEvent({
          id: createEventId(data.latitude, data.longitude, Date.now(), 'open-meteo', `Wind ${windSpeed}`),
          priority: windSpeed > 120 ? 'p1' : 'p2',
          dimension: 'environment', lat: data.latitude, lng: data.longitude,
          severity: windSpeed > 120 ? 4 : 2,
          corroborationSources: ['open-meteo'], ttl: 1200,
          title: `Extreme Wind — ${Math.round(windSpeed)} km/h`,
          detail: `Wind speed at ${Math.round(windSpeed)} km/h detected.`,
          source: 'Open-Meteo', sourceUrl: 'https://open-meteo.com',
          tags: ['weather', 'wind'],
        }))
      }
    }
    return events
  },

  // ══════════════════════════════════
  //  PHASE 3: KEYED API NORMALIZERS
  // ══════════════════════════════════

  acled: (data) => {
    if (!data?.data) return []
    return data.data.slice(0, 50).map(e => {
      const lat = parseFloat(e.latitude), lng = parseFloat(e.longitude)
      if (isNaN(lat) || isNaN(lng)) return null
      const fatalities = parseInt(e.fatalities) || 0
      let priority = 'p2', severity = 2
      if (fatalities >= 100) { priority = 'p1'; severity = 5 }
      else if (fatalities >= 21) { priority = 'p1'; severity = 4 }
      else if (fatalities >= 6) { priority = 'p2'; severity = 3 }
      else if (fatalities === 0) { priority = 'p3'; severity = 1 }
      return makeEvent({
        id: createEventId(lat, lng, Date.parse(e.event_date || Date.now()), 'acled', e.notes?.substring(0, 50) || ''),
        priority,
    priority: priority, // legacy compat
 dimension: 'safety', lat, lng, severity,
        corroborationSources: ['acled'], authoritative: true, ttl: 300,
        title: `${e.event_type || 'Conflict'}: ${e.country || 'Unknown'} — ${e.actor1 || ''}`,
        detail: `${e.notes || ''}${fatalities > 0 ? ` Fatalities: ${fatalities}.` : ''}`,
        source: 'ACLED', sourceUrl: 'https://acleddata.com',
        tags: ['conflict', e.event_type, e.country].filter(Boolean),
        timestamp: e.event_date ? new Date(e.event_date).toISOString() : new Date().toISOString(),
      })
    }).filter(Boolean)
  },

  firms: (csvText) => {
    if (!csvText) return []
    const lines = csvText.trim().split('\n')
    if (lines.length < 2) return []
    const headers = lines[0].split(',')
    const latIdx = headers.indexOf('latitude')
    const lngIdx = headers.indexOf('longitude')
    const confIdx = headers.indexOf('confidence')
    const frpIdx = headers.indexOf('frp')
    const dateIdx = headers.indexOf('acq_date')
    if (latIdx < 0 || lngIdx < 0) return []

    return lines.slice(1, 30).map(line => {
      const cols = line.split(',')
      const lat = parseFloat(cols[latIdx]), lng = parseFloat(cols[lngIdx])
      if (isNaN(lat) || isNaN(lng)) return null
      const conf = cols[confIdx] || 'nominal'
      const frp = parseFloat(cols[frpIdx]) || 0
      let priority = 'p3', severity = 1
      if (frp > 100) { priority = 'p2'; severity = 3 }
      if (conf === 'high' || frp > 500) { priority = 'p2'; severity = 4 }
      return makeEvent({
        id: createEventId(lat, lng, Date.now(), 'firms', `fire-${lat.toFixed(2)}-${lng.toFixed(2)}`),
        priority,
    priority: priority, // legacy compat
 dimension: 'environment', lat, lng, severity,
        corroborationSources: ['firms'], authoritative: true, ttl: 600,
        title: `Active Fire — FRP ${Math.round(frp)} MW`,
        detail: `Confidence: ${conf}. Fire radiative power: ${frp.toFixed(1)} MW.`,
        source: 'NASA FIRMS', sourceUrl: 'https://firms.modaps.eosdis.nasa.gov',
        tags: ['fire', 'wildfire'],
        timestamp: cols[dateIdx] ? new Date(cols[dateIdx]).toISOString() : new Date().toISOString(),
      })
    }).filter(Boolean)
  },

  finnhub: (data) => {
    if (!data) return []
    const events = []
    const base = data.base || 'USD'
    const quote = data.quote || {}
    for (const [currency, rate] of Object.entries(quote)) {
      if (['EUR', 'GBP', 'JPY', 'CNY'].includes(currency)) {
        events.push(makeEvent({
          id: createEventId(40.7, -74.0, Date.now(), 'finnhub', `${base}/${currency}`),
          priority: 'p3', dimension: 'economy', lat: 40.7128, lng: -74.006, latApproximate: true,
          severity: 1, corroborationSources: ['finnhub'], ttl: 900,
          title: `FX: ${base}/${currency} = ${rate.toFixed(4)}`,
          detail: `Exchange rate snapshot.`,
          source: 'Finnhub', sourceUrl: 'https://finnhub.io',
          tags: ['forex', base, currency],
        }))
      }
    }
    return events
  },

  fred: (data) => {
    if (!data?.observations) return []
    const obs = data.observations
    if (obs.length < 1) return []
    const latest = obs[obs.length - 1]
    const val = parseFloat(latest.value)
    if (isNaN(val)) return []
    return [makeEvent({
      id: createEventId(38.6, -90.2, Date.now(), 'fred', `${data.id || 'FRED'} ${val}`),
      priority: 'p3', dimension: 'economy', lat: 38.627, lng: -90.1994, latApproximate: true,
      severity: 1, corroborationSources: ['fred'], ttl: 3600,
      title: `FRED: ${data.id || 'Economic Indicator'} = ${val}`,
      detail: `Latest observation: ${latest.date} = ${val}`,
      source: 'FRED', sourceUrl: 'https://fred.stlouisfed.org',
      tags: ['economic', data.id || 'indicator'],
      timestamp: latest.date ? new Date(latest.date).toISOString() : new Date().toISOString(),
    })]
  },

  eia: (data) => {
    if (!data?.response?.data) return []
    const rows = data.response.data
    if (rows.length < 1) return []
    const latest = rows[0]
    const price = parseFloat(latest.value)
    if (isNaN(price)) return []
    return [makeEvent({
      id: createEventId(29.8, -95.4, Date.now(), 'eia', `Oil $${price}`),
      priority: price > 100 ? 'p2' : 'p3',
      dimension: 'economy', lat: 29.7604, lng: -95.3698, latApproximate: true,
      severity: price > 100 ? 2 : 1,
      corroborationSources: ['eia'], ttl: 3600,
      title: `WTI Crude: $${price.toFixed(2)}/bbl`,
      detail: `EIA spot price as of ${latest.period || 'latest'}.`,
      source: 'EIA', sourceUrl: 'https://www.eia.gov',
      tags: ['oil', 'energy', 'crude'],
    })]
  },

  cloudflare: (data) => {
    if (!data?.result) return []
    const events = []
    const summary = data.result
    if (summary.top) {
      for (const entry of (summary.top || []).slice(0, 5)) {
        events.push(makeEvent({
          id: createEventId(37.8, -122.4, Date.now(), 'cloudflare', entry.name || ''),
          priority: 'p2', dimension: 'safety', lat: 37.7749, lng: -122.4194, latApproximate: true,
          severity: 2, corroborationSources: ['cloudflare'], ttl: 600,
          title: `L7 Attack: ${entry.name || 'DDoS Activity'}`,
          detail: `Cloudflare Radar DDoS activity detected.`,
          source: 'Cloudflare Radar', sourceUrl: 'https://radar.cloudflare.com',
          tags: ['ddos', 'cyber', 'cloudflare'],
        }))
      }
    }
    return events
  },

  abuseipdb: (data) => {
    if (!data?.data) return []
    return data.data.slice(0, 10).map(entry => {
      return makeEvent({
        id: createEventId(0, 0, Date.now(), 'abuseipdb', entry.ipAddress || ''),
        priority: entry.abuseConfidenceScore > 90 ? 'p2' : 'p3',
        dimension: 'safety', lat: 0, lng: 0, latApproximate: true,
        severity: entry.abuseConfidenceScore > 90 ? 3 : 1,
        corroborationSources: ['abuseipdb'], ttl: 600,
        title: `Malicious IP: ${entry.ipAddress} (${entry.abuseConfidenceScore}% confidence)`,
        detail: `Country: ${entry.countryCode || 'Unknown'}. Reports: ${entry.totalReports || 0}.`,
        source: 'AbuseIPDB', sourceUrl: 'https://www.abuseipdb.com',
        tags: ['malicious-ip', entry.countryCode].filter(Boolean),
      })
    })
  },

  // ══════════════════════════════════
  //  PHASE 6: ADVANCED SIGNALS
  // ══════════════════════════════════

  shodan: (data) => {
    if (!data?.matches) return []
    return data.matches.slice(0, 10).map(m => {
      const lat = m.location?.latitude || 0
      const lng = m.location?.longitude || 0
      const isICS = m.port === 502 || m.port === 102 || m.port === 44818
      return makeEvent({
        id: createEventId(lat, lng, Date.now(), 'shodan', `${m.ip_str}:${m.port}`),
        priority: isICS ? 'p2' : 'p3',
        dimension: 'safety', lat, lng, latApproximate: !m.location?.latitude,
        severity: isICS ? 3 : 1,
        corroborationSources: ['shodan'], ttl: 1800,
        title: `Exposed ${isICS ? 'ICS/SCADA' : 'Service'}: ${m.ip_str}:${m.port}`,
        detail: `Organization: ${m.org || 'Unknown'}. Country: ${m.location?.country_name || 'Unknown'}.${m.product ? ` Product: ${m.product}.` : ''}`,
        source: 'Shodan', sourceUrl: `https://www.shodan.io/host/${m.ip_str}`,
        tags: ['exposure', isICS ? 'ics' : 'service', m.location?.country_code].filter(Boolean),
      })
    })
  },

  safecast: (data) => {
    if (!Array.isArray(data)) return []
    return data.filter(m => m.value > 100).slice(0, 10).map(m => {
      const val = m.value || 0
      const isHigh = val > 300
      return makeEvent({
        id: createEventId(m.latitude, m.longitude, Date.now(), 'safecast', `rad-${val}`),
        priority: isHigh ? 'p1' : val > 100 ? 'p2' : 'p3',
        dimension: 'environment', lat: m.latitude || 0, lng: m.longitude || 0,
        severity: isHigh ? 4 : val > 100 ? 3 : 1,
        corroborationSources: ['safecast'], ttl: 1800,
        title: `Radiation: ${val} CPM at ${m.location_name || 'Unknown'}`,
        detail: `Measurement: ${val} counts per minute. ${isHigh ? 'ELEVATED radiation levels detected.' : ''}`,
        source: 'Safecast', sourceUrl: 'https://safecast.org',
        tags: ['radiation', 'nuclear'],
      })
    })
  },

  'electricity-maps': (data) => {
    if (!data) return []
    const fossilPct = data.fossilFuelPercentage ?? 0
    if (fossilPct < 80) return []
    return [makeEvent({
      id: createEventId(51.2, 10.4, Date.now(), 'elecmaps', `fossil-${fossilPct}`),
      priority: 'p3', dimension: 'narrative', lat: 51.1657, lng: 10.4515, latApproximate: true,
      severity: 1, corroborationSources: ['electricity-maps'], ttl: 1800,
      title: `Grid Stress: ${fossilPct.toFixed(0)}% fossil fuel`,
      detail: `Power grid running ${fossilPct.toFixed(1)}% on fossil fuels.`,
      source: 'Electricity Maps', sourceUrl: 'https://app.electricitymaps.com',
      tags: ['energy', 'grid'],
    })]
  },

  // ── Phase 6 stretch: Bluesky Jetstream social signals ($0, no key) ──

  bluesky: (data) => {
    const posts = data?.posts
    if (!Array.isArray(posts) || posts.length === 0) return []
    return posts.slice(0, 60).map((p) => {
      const ts = p.createdAt || new Date().toISOString()
      const engagement = (p.likes || 0) + (p.reposts || 0) * 2 + (p.replies || 0)
      const sev = engagement > 50 ? 3 : engagement > 10 ? 2 : 1
      return makeEvent({
        id: createEventId(p.lat, p.lng, new Date(ts).getTime(), 'bluesky', p.uri || p.text?.slice(0, 40)),
        priority: sev >= 3 ? 'p2' : 'p3',
        dimension: 'narrative',
        lat: p.lat,
        lng: p.lng,
        latApproximate: true,
        severity: sev,
        corroborationSources: ['bluesky'],
        ttl: 1800,
        title: p.text?.slice(0, 120) || 'Bluesky post',
        detail: p.text?.slice(0, 280) || '',
        source: 'Bluesky',
        sourceUrl: p.uri ? `https://bsky.app/profile/${encodeURIComponent(p.author || '')}/post/${p.uri.split('/').pop()}` : 'https://bsky.app',
        tags: ['bluesky', 'social', p.locationName?.toLowerCase()].filter(Boolean),
        locationName: p.locationName || null,
        timestamp: ts,
        socialReach: {
          likes: p.likes || 0,
          reposts: p.reposts || 0,
          replies: p.replies || 0,
          mentionCount: 1,
        },
        blueskyUri: p.uri || '',
      })
    })
  },

  // ── Phase 6 stretch: Google Fact Check Tools ($0 with server API key) ──

  'fact-check': (data) => {
    const claims = data?.claims
    if (!Array.isArray(claims) || claims.length === 0) return []
    return claims.filter((c) => c.lat != null && c.lng != null).slice(0, 20).map((c) => {
      const ts = c.reviewDate || new Date().toISOString()
      const isHighPriority = /false|misleading|pants|incorrect|debunked/i.test(c.rating || '')
      return makeEvent({
        id: createEventId(c.lat, c.lng, new Date(ts).getTime(), 'fact-check', c.claim?.slice(0, 40)),
        priority: isHighPriority ? 'p2' : 'p3',
        dimension: 'narrative',
        lat: c.lat,
        lng: c.lng,
        latApproximate: c.latApproximate !== false,
        severity: isHighPriority ? 3 : 2,
        authoritative: true,
        corroborationSources: ['fact-check'],
        ttl: 86400,
        title: c.claim?.slice(0, 120) || 'Fact-checked claim',
        detail: `${c.publisher}: ${c.rating}`,
        source: 'Google Fact Check',
        sourceUrl: c.publisherUrl || 'https://toolbox.google.com/factcheck/apis',
        tags: ['fact-check', 'claimreview'],
        locationName: c.locationName || null,
        timestamp: ts,
        factCheckRating: c.rating || 'Reviewed',
        factCheckPublisher: c.publisher || 'Unknown',
        factCheckUrl: c.publisherUrl || '',
      })
    })
  },
}

// ══════════════════════════════════════════════════════════════
//  SOURCE CONFIGS — URL + poll interval + format
// ══════════════════════════════════════════════════════════════

const SOURCE_CONFIGS = {
  usgs: {
    url: 'https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&minmagnitude=4.5&orderby=time&limit=50',
    format: 'json', pollInterval: 120_000,
  },
  // GDACS serves no CORS headers — fetched via same-origin proxy
  gdacs: {
    url: '/api/gdacs-rss',
    format: 'text', pollInterval: 300_000,
  },
  eonet: {
    url: 'https://eonet.gsfc.nasa.gov/api/v3/events?status=open&days=3',
    format: 'json', pollInterval: 600_000,
  },
  'noaa-kp': {
    url: 'https://services.swpc.noaa.gov/json/planetary_k_index_1m.json',
    format: 'json', pollInterval: 300_000,
  },
  'noaa-xray': {
    url: 'https://services.swpc.noaa.gov/json/goes/primary/xrays-6-hour.json',
    format: 'json', pollInterval: 300_000,
  },
  'noaa-solar-wind': {
    url: 'https://services.swpc.noaa.gov/json/solar_wind/plasma-7-day.json',
    format: 'json', pollInterval: 300_000,
  },
  gdelt: {
    format: 'json',
    pollInterval: 300_000,
    gdeltDocChain: GDELT_DOC_DIM_QUERIES,
  },
  // `gdelt-events` (GDELT GEO 2.0 API — PointData/GeoJSON) is disabled: the
  // `https://api.gdeltproject.org/api/v2/geo/geo` endpoint still returns HTTP
  // 404 as of 2026-05-21 (re-tested in Phase 0). Leaving the source active
  // burns the shared rate-limit budget with failing legs. Re-enable once GDELT
  // restores the GEO endpoint.
  'gdelt-cameo': {
    // GDELT publishes a new 15-minute `.export.CSV.zip` every quarter hour;
    // poll on that cadence so the globe always mirrors the latest firehose.
    format: 'json',
    pollInterval: 900_000,
  },
  'gdelt-vgkg': {
    format: 'json',
    pollInterval: 1_800_000,
  },
  ucdp: {
    url: 'https://ucdpapi.pcr.uu.se/api/gedevents/24.1?pagesize=50',
    format: 'json', pollInterval: 600_000,
  },
  coingecko: {
    url: 'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,tether&vs_currencies=usd&include_24hr_change=true',
    format: 'json', pollInterval: 300_000,
  },
  'alt-fng': {
    url: 'https://api.alternative.me/fng/?limit=1',
    format: 'json', pollInterval: 900_000,
  },
  'cisa-kev': {
    url: 'https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json',
    format: 'json', pollInterval: 300_000,
  },
  reliefweb: {
    url: 'https://api.reliefweb.int/v1/reports?appname=atlas&filter[field]=type&filter[value]=Situation+Report&limit=20&sort[]=date:desc',
    format: 'json', pollInterval: 1_800_000,
  },
  'who-don': {
    url: 'https://www.who.int/rss-feeds/news-english.xml',
    format: 'text', pollInterval: 900_000,
  },
  promed: {
    url: 'https://promedmail.org/feed/',
    format: 'text', pollInterval: 900_000,
  },
  'loc-legal': {
    url: 'https://www.loc.gov/law/foreign-news/rss.xml',
    format: 'text', pollInterval: 3_600_000,
  },
  'open-meteo': {
    url: 'https://api.open-meteo.com/v1/forecast?latitude=35.68,51.51,40.71,48.86,55.75,28.61,31.23,23.13,-33.87,19.43,30.04,33.69,37.57,34.05,41.01&longitude=139.69,-0.13,-74.01,2.35,37.62,77.21,121.47,113.26,151.21,-99.13,31.24,73.06,126.98,-118.24,28.98&current_weather=true',
    format: 'json', pollInterval: 600_000,
  },
  // Phase 1 — OpenSky ADS-B: $0 anon ~15s poll (same-origin proxy + server cache)
  opensky: {
    url: '/api/opensky-states',
    format: 'json',
    pollInterval: 15_000,
  },
  // Phase 1 — CelesTrak SOCRATES close approaches
  celestrak: {
    url: 'https://celestrak.org/SOCRATES/data/search.php?MAX=10&FORMAT=json',
    format: 'json',
    pollInterval: 3_600_000,
  },
  // Phase 1 — CelesTrak TLE catalogs (multi-group fetch in fetchSource)
  'celestrak-tle': {
    format: 'text',
    pollInterval: 3_600_000,
    tleGroups: ['active', 'stations', 'starlink', 'gps-ops', 'military'],
  },
  // Phase 3 — AISStream.io ships via server WebSocket proxy ($0, registration only)
  aisstream: {
    url: '/api/aisstream-ships',
    format: 'json',
    pollInterval: 45_000,
  },
  // Phase 3 — NOAA NHC active storm tracks + cone-of-error ($0, no key — worker fetches direct)
  'noaa-nhc': {
    format: 'json',
    pollInterval: 300_000,
    directFetch: true,
  },
  // Phase 6 — Bluesky Jetstream social reach ($0, no key — server WS proxy ~8s collect)
  bluesky: {
    url: '/api/bluesky-posts',
    format: 'json',
    pollInterval: 60_000,
  },
  // Phase 6 — Google Fact Check Tools ($0 with GOOGLE_FACT_CHECK_API_KEY server-side)
  'fact-check': {
    url: '/api/fact-check-claims?proactive=1',
    format: 'json',
    pollInterval: 900_000,
  },
}

function buildKeyedConfigs() {
  const keyed = {}

  if (envKeys.ACLED_KEY && envKeys.ACLED_EMAIL) {
    keyed.acled = {
      url: `https://api.acleddata.com/acled/read?key=${envKeys.ACLED_KEY}&email=${envKeys.ACLED_EMAIL}&limit=50&fields=event_date|event_type|actor1|fatalities|latitude|longitude|notes|country`,
      format: 'json', pollInterval: 300_000,
    }
  }

  const firmsKey = envKeys.FIRMS_MAP_KEY || envKeys.FIRMS_KEY
  if (firmsKey) {
    keyed.firms = {
      url: `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${firmsKey}/VIIRS_SNPP_NRT/world/1`,
      format: 'text', pollInterval: 600_000,
    }
  }

  if (envKeys.FINNHUB_KEY) {
    keyed.finnhub = {
      url: `https://finnhub.io/api/v1/forex/rates?base=USD&token=${envKeys.FINNHUB_KEY}`,
      format: 'json', pollInterval: 300_000,
    }
  }

  if (envKeys.FRED_KEY) {
    keyed.fred = {
      url: `https://api.stlouisfed.org/fred/series/observations?series_id=VIXCLS&api_key=${envKeys.FRED_KEY}&sort_order=desc&limit=2&file_type=json`,
      format: 'json', pollInterval: 3_600_000,
    }
  }

  if (envKeys.EIA_KEY) {
    keyed.eia = {
      url: `https://api.eia.gov/v2/petroleum/pri/spt/data/?api_key=${envKeys.EIA_KEY}&frequency=daily&length=2`,
      format: 'json', pollInterval: 3_600_000,
    }
  }

  if (envKeys.CLOUDFLARE_TOKEN) {
    keyed.cloudflare = {
      url: 'https://api.cloudflare.com/client/v4/radar/attacks/layer7/summary',
      format: 'json', pollInterval: 300_000,
      headers: { Authorization: `Bearer ${envKeys.CLOUDFLARE_TOKEN}` },
    }
  }

  if (envKeys.ABUSEIPDB_KEY) {
    keyed.abuseipdb = {
      url: 'https://api.abuseipdb.com/api/v2/blacklist?limit=20',
      format: 'json', pollInterval: 300_000,
      headers: { Key: envKeys.ABUSEIPDB_KEY, Accept: 'application/json' },
    }
  }

  // Phase 6 — Advanced signals (keyed)
  if (envKeys.SHODAN_KEY) {
    keyed.shodan = {
      url: `https://api.shodan.io/shodan/host/search?query=port:502&key=${envKeys.SHODAN_KEY}&minify=true`,
      format: 'json', pollInterval: 600_000,
    }
  }

  if (envKeys.ELECTRICITYMAP_KEY) {
    keyed['electricity-maps'] = {
      url: `https://api.electricitymap.org/v3/power-breakdown/latest?zone=DE`,
      format: 'json', pollInterval: 900_000,
      headers: { 'auth-token': envKeys.ELECTRICITYMAP_KEY },
    }
  }

  if (envKeys.ENTSOE_KEY) {
    keyed.entsoe = {
      url: `https://transparency.entsoe.eu/api?securityToken=${envKeys.ENTSOE_KEY}&documentType=A65&processType=A16&outBiddingZone_Dimension=10Y1001A1001A83F&periodStart=202403180000&periodEnd=202403190000`,
      format: 'text', pollInterval: 900_000,
    }
  }

  return keyed
}

// ══════════════════════════════════════════════════════════════
//  FETCH LOOP
// ══════════════════════════════════════════════════════════════

function getAllConfigs() {
  const keyed = buildKeyedConfigs()
  return { ...SOURCE_CONFIGS, ...keyed }
}

function ttlForSource(sourceId) {
  return L2_TTL_MS[sourceId] || 3_600_000
}

function tagStaleEvents(events, stale) {
  if (!stale) return events
  return events.map((e) => ({ ...e, cacheStale: true }))
}

function emitCachedSnapshot(sourceId, row, stale = true) {
  const events = tagStaleEvents(row.events || [], stale)
  if (!events.length && !row.aggregates) return

  lastGoodPayload[sourceId] = {
    events: row.events || [],
    aggregates: row.aggregates,
    fetchedAt: row.fetchedAt || Date.now(),
  }

  if (events.length) {
    self.postMessage({ type: 'EVENTS', sourceId, events, fromCache: true })
  }

  if (sourceId === 'gdelt-cameo' && row.aggregates) {
    self.postMessage({
      type: 'GDELT_COUNTRY_AGGREGATES',
      aggregates: row.aggregates,
      exportTsMs: row.fetchedAt || Date.now(),
      totalRows: row.totalRows || 0,
      fromCache: true,
    })
  }

  const state = getState(sourceId)
  state.lastFetch = row.fetchedAt || Date.now()
  self.postMessage({
    type: 'SOURCE_STATUS',
    sourceId,
    status: stale ? 'stale' : 'connected',
    lastFetch: state.lastFetch,
    eventCount: events.length,
    warning: stale ? 'Showing cached data — refreshing' : undefined,
  })
}

async function persistSnapshot(sourceId, events, extras = {}) {
  const fetchedAt = Date.now()
  const entry = {
    events,
    aggregates: extras.aggregates || null,
    totalRows: extras.totalRows || 0,
    fetchedAt,
    expiresAt: fetchedAt + ttlForSource(sourceId),
    stale: false,
  }
  await saveSnapshot(sourceId, entry)
  lastGoodPayload[sourceId] = {
    events,
    aggregates: extras.aggregates,
    fetchedAt,
  }
}

function postSnapshotToL2(sourceId, events, extras = {}) {
  if (!L2_SOURCES.has(sourceId) || !events?.length) return
  void fetch('/api/feed-snapshots', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sourceId,
      payload: { events, aggregates: extras.aggregates || null },
      eventCount: events.length,
      status: 'fresh',
    }),
  }).catch(() => {})
}

async function hydrateFromCache(sourceIds) {
  const local = await loadSnapshots(sourceIds)
  const now = Date.now()
  const needL2 = []

  for (const id of sourceIds) {
    const row = local[id]
    if (!row?.events?.length && !row?.aggregates) {
      if (L2_SOURCES.has(id)) needL2.push(id)
      continue
    }
    const fresh = isSnapshotFresh(row, now)
    const liveOk = !LIVE_TRACK_SOURCES.has(id) || (now - (row.fetchedAt || 0) < LIVE_TRACK_MAX_AGE_MS)
    if (fresh || liveOk) {
      emitCachedSnapshot(id, row, !fresh)
    } else if (L2_SOURCES.has(id)) {
      needL2.push(id)
    }
  }

  for (const id of sourceIds) {
    if (!local[id] && L2_SOURCES.has(id) && !needL2.includes(id)) needL2.push(id)
  }

  if (!needL2.length) return

  try {
    const res = await fetch(`/api/feed-snapshots?sources=${needL2.join(',')}`)
    if (!res.ok) return
    const { snapshots } = await res.json()
    for (const id of needL2) {
      const snap = snapshots?.[id]
      if (!snap?.payload) continue
      const events = snap.payload.events || []
      const row = {
        events,
        aggregates: snap.payload.aggregates,
        fetchedAt: snap.fetchedAt || Date.now(),
        totalRows: snap.payload.totalRows || 0,
      }
      await saveSnapshot(id, {
        ...row,
        expiresAt: snap.expiresAt || row.fetchedAt + ttlForSource(id),
        stale: snap.status === 'stale',
      })
      if (events.length || row.aggregates) {
        emitCachedSnapshot(id, row, true)
      }
    }
  } catch {
    /* L2 hydrate is best-effort */
  }
}

function startPollingSources(sourceIds) {
  const allConfigs = getAllConfigs()
  const prioritySet = new Set(PRIORITY_FETCH_SOURCES)
  const priority = PRIORITY_FETCH_SOURCES.filter((id) => sourceIds.includes(id))
  const rest = sourceIds.filter((id) => !prioritySet.has(id))

  for (const id of priority) {
    if (allConfigs[id]) pollSource(id)
  }

  let delay = 1500
  for (const id of rest) {
    if (!allConfigs[id]) continue
    setTimeout(() => pollSource(id), delay)
    delay += 350
  }
}

async function fetchSource(sourceId) {
  const allConfigs = getAllConfigs()
  const config = allConfigs[sourceId]
  if (!config) return []

  const state = getState(sourceId)

  if (sourceId === 'gdelt-vgkg') {
    try {
      const rows = await fetchVgkgImagerySample({ limit: 60 })
      const events = []
      const seen = new Set()
      for (const row of rows) {
        const centroid = lookupCentroidFromSourceCountry(row.countryIso || '')
        if (!centroid) continue
        const key = row.id || row.pageUrl || row.imageUrl
        if (!key || seen.has(key)) continue
        seen.add(key)

        const topLabels = (row.labels || [])
          .slice(0, 5)
          .map((l) => l.label)
          .filter(Boolean)
        const title = topLabels.length
          ? `Visual GKG — ${topLabels.slice(0, 3).join(', ')}`
          : 'Visual GKG frame'
        const ts = Date.now()
        events.push(makeEvent({
          id: createEventId(centroid.lat, centroid.lng, ts, 'gdelt-vgkg', key),
          priority: 'p3',
          dimension: 'narrative',
          lat: centroid.lat,
          lng: centroid.lng,
          latApproximate: true,
          severity: 1,
          corroborationSources: ['gdelt-vgkg'],
          ttl: 1800,
          title,
          detail: topLabels.length
            ? `Cloud Vision labels: ${topLabels.join(', ')}.`
            : `Source: ${row.sourceName || 'unknown'}.`,
          source: 'GDELT VGKG',
          sourceUrl: row.pageUrl || row.imageUrl || 'https://www.gdeltproject.org',
          tags: ['vgkg', 'gdelt', ...topLabels.slice(0, 3).map((l) => l.toLowerCase())],
          timestamp: new Date(ts).toISOString(),
          // Extras consumed by the event card UI:
          imageUrl: row.imageUrl || '',
          visualLabels: row.labels || [],
        }))
      }
      state.backoff = INITIAL_BACKOFF
      state.errorCount = 0
      state.lastFetch = Date.now()
      return events
    } catch (err) {
      state.errorCount++
      state.backoff = Math.min(state.backoff * 2, MAX_BACKOFF)
      self.postMessage({
        type: 'SOURCE_ERROR',
        sourceId,
        error: err.message,
        nextRetry: state.backoff,
      })
      return []
    }
  }

  if (sourceId === 'gdelt-cameo') {
    try {
      const rows = await fetchGdeltCameoEvents()

      // Product 1 — country aggregates from the FULL row set (choropleth +
      // surge baselines). Posted as a dedicated message, not globe events.
      const aggregates = buildCameoCountryAggregates(rows)
      state.lastAggregates = aggregates
      state.lastTotalRows = rows.length
      if (Object.keys(aggregates).length > 0) {
        self.postMessage({
          type: 'GDELT_COUNTRY_AGGREGATES',
          aggregates,
          exportTsMs: rows[0]?._exportTsMs ?? Date.now(),
          totalRows: rows.length,
        })
      }

      // Product 2 — pins: only high-confidence rows (multi-source OR severe).
      const events = rows.filter(cameoRowIsPinWorthy).map((row) => {
        const ts = typeof row._exportTsMs === 'number' && Number.isFinite(row._exportTsMs)
          ? row._exportTsMs
          : Date.now()
        const sev = Math.min(5, Math.max(1, row.severity || 1))
        const priority = sev >= 4 ? 'p1' : sev >= 2 ? 'p2' : 'p3'
        return makeEvent({
          id: createEventId(row.lat, row.lng, ts, 'gdelt-cameo', row.title),
          priority,
          priority: priority, // legacy compat
          dimension: row.dimension,
          lat: row.lat,
          lng: row.lng,
          severity: sev,
          corroborationCount: row.corroborationCount || 1,
          corroborationSources: ['gdelt-cameo'],
          title: row.title,
          detail: `${row.detail} SQLDATE: ${row.sqlDate || '—'}. Mentions: ${row.numMentions}. Actors: ${[row.actor1, row.actor2].filter(Boolean).join(' → ') || 'n/a'}.`,
          source: 'GDELT',
          sourceUrl: row.sourceUrl || 'https://www.gdeltproject.org',
          tags: ['gdelt', 'cameo', `cameo${row.cameoRoot || ''}`, typeof row.quadClass === 'number' ? `qc${row.quadClass}` : ''].filter(Boolean),
          toneScore: row.toneScore,
          actor1: row.actor1,
          actor2: row.actor2,
          locationName: row.locationName,
          timestamp: new Date(ts).toISOString(),
          // Keep CAMEO pins alive for 2 hours — matches the "Live" HUD window
          // (`TIME_FILTER_MAX_AGE_MS.live`). Applies to the reduced
          // high-confidence pin set (≈100-300/tick) across 8 consecutive
          // 15-minute polls; older rows are culled by TTL here or by the
          // globe's own age filter.
          ttl: 7200,
        })
      })
      state.backoff = INITIAL_BACKOFF
      state.errorCount = 0
      state.lastFetch = Date.now()
      return events
    } catch (err) {
      state.errorCount++
      state.backoff = Math.min(state.backoff * 2, MAX_BACKOFF)
      self.postMessage({
        type: 'SOURCE_ERROR',
        sourceId,
        error: err.message,
        nextRetry: state.backoff,
      })
      return []
    }
  }

  if (sourceId === 'noaa-nhc') {
    try {
      const storms = await fetchNhcStormsBundle()
      const events = NORMALIZERS['noaa-nhc']({ storms })
      state.backoff = INITIAL_BACKOFF
      state.errorCount = 0
      state.lastError = null
      state.lastFetch = Date.now()
      return events
    } catch (err) {
      state.errorCount++
      state.lastError = err.message
      state.backoff = Math.min(state.backoff * 2, MAX_BACKOFF)
      self.postMessage({
        type: 'SOURCE_ERROR',
        sourceId,
        error: err.message,
        nextRetry: state.backoff,
      })
      return []
    }
  }

  if (sourceId === 'celestrak-tle') {
    try {
      const groups = config.tleGroups || ['active']
      const merged = []
      const seen = new Set()
      const groupErrors = []
      for (const group of groups) {
        try {
          const url = `/api/celestrak-tle?group=${encodeURIComponent(group)}`
          const text = await fetchText(url)
          const parsed = parseTleCatalog(text)
          for (const entry of parsed) {
            const id = entry.noradId
            if (!id || seen.has(id)) continue
            seen.add(id)
            merged.push({ ...entry, _atlasGroup: group })
          }
        } catch (err) {
          groupErrors.push(`${group}: ${err.message || err}`)
        }
        await new Promise((r) => setTimeout(r, 600))
      }
      if (!merged.length) {
        throw new Error(groupErrors.join(' · ') || 'All CelesTrak TLE groups failed')
      }
      if (groupErrors.length) {
        state.lastWarning = groupErrors.join(' · ')
      } else {
        state.lastWarning = null
      }
      const events = NORMALIZERS['celestrak-tle'](merged)
      state.backoff = INITIAL_BACKOFF
      state.errorCount = 0
      state.lastError = null
      state.lastFetch = Date.now()
      return events
    } catch (err) {
      state.errorCount++
      state.lastError = err.message
      state.backoff = Math.min(state.backoff * 2, MAX_BACKOFF)
      self.postMessage({
        type: 'SOURCE_ERROR',
        sourceId,
        error: err.message,
        nextRetry: state.backoff,
      })
      return []
    }
  }

  const normalizer = NORMALIZERS[sourceId]
  if (!normalizer) return []

  try {
    const fetchOpts = config.headers ? { headers: config.headers } : {}
    let data

    if (Array.isArray(config.gdeltDocChain) && config.gdeltDocChain.length > 0) {
      // A1/A2: per-dimension ArtList requests, each with its own AbortController
      // timeout; a single leg failure never nukes the rest.
      //
      // Request pacing is handled by the shared gate inside `fetchGdeltJson`
      // (gdeltHttp.js). That gate is cross-source, so DOC legs stay spaced
      // even while analytics-panel queries or summary/context calls from the
      // UI hit GDELT concurrently.
      const merged = { articles: [] }
      const legErrors = []
      for (let i = 0; i < config.gdeltDocChain.length; i++) {
        const { query, dimension } = config.gdeltDocChain[i]
        // `maxrecords=250` is the DOC API ceiling. Fan-out per leg; union across
        // all legs is up to ~(250 × leg count) articles before dedupe in the
        // normalizer (country-centroid geocode for DOC).
        const docUrl = `${GDELT_DOC_BASE}?query=${encodeURIComponent(query)}&mode=ArtList&maxrecords=250&format=json&sort=DateDesc`
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), GDELT_LEG_TIMEOUT_MS)
        try {
          const chunk = await fetchGdeltJson(docUrl, { signal: controller.signal })
          for (const a of chunk?.articles || []) {
            merged.articles.push({ ...a, _atlasDimensionHint: dimension })
          }
        } catch (legErr) {
          legErrors.push(`${dimension}: ${legErr.message || legErr}`)
        } finally {
          clearTimeout(timer)
        }
      }
      if (!merged.articles.length && legErrors.length) {
        throw new Error(legErrors.join(' · '))
      }
      if (legErrors.length) {
        self.postMessage({
          type: 'SOURCE_STATUS',
          sourceId,
          status: 'partial',
          lastFetch: Date.now(),
          eventCount: merged.articles.length,
          warning: legErrors.join(' · '),
        })
      }
      data = merged
    } else if (Array.isArray(config.gdeltGeoChain) && config.gdeltGeoChain.length > 0) {
      // A2: per-leg try/catch + AbortController; partial failures no longer nuke
      // the whole chain. Pacing handled by the shared `fetchGdeltText` gate.
      const merged = { type: 'FeatureCollection', features: [] }
      const legErrors = []
      for (let i = 0; i < config.gdeltGeoChain.length; i++) {
        const { query, dimension } = config.gdeltGeoChain[i]
        const geoUrl = `https://api.gdeltproject.org/api/v2/geo/geo?query=${encodeURIComponent(query)}&mode=PointData&format=GeoJSON&timespan=60min&maxpoints=250`
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), GDELT_LEG_TIMEOUT_MS)
        try {
          const text = await fetchGdeltText(geoUrl, { signal: controller.signal })
          const chunk = JSON.parse(text)
          for (const f of chunk.features || []) {
            const props = f.properties || {}
            f.properties = { ...props, _atlasDimensionHint: dimension }
            merged.features.push(f)
          }
        } catch (legErr) {
          legErrors.push(`${dimension}: ${legErr.message || legErr}`)
        } finally {
          clearTimeout(timer)
        }
      }
      if (!merged.features.length && legErrors.length) {
        throw new Error(legErrors.join(' · '))
      }
      if (legErrors.length) {
        self.postMessage({
          type: 'SOURCE_STATUS',
          sourceId,
          status: 'partial',
          lastFetch: Date.now(),
          eventCount: merged.features.length,
          warning: legErrors.join(' · '),
        })
      }
      data = merged
    } else if (config.format === 'json') {
      const res = await fetch(config.url, fetchOpts)
      if (!res.ok) {
        if (sourceId === 'opensky' && res.status === 429) {
          state.lastWarning = 'OpenSky rate limited — backing off'
          throw new Error(`HTTP 429: ${config.url}`)
        }
        throw new Error(`HTTP ${res.status}: ${config.url}`)
      }
      data = await res.json()
      if (sourceId === 'opensky' && res.headers.get('X-Atlas-Stale')) {
        state.lastWarning = 'OpenSky rate limited — showing cached positions'
      }
      if (sourceId === 'aisstream') {
        if (data?.warning) state.lastWarning = data.warning
        else if (data?.error) state.lastWarning = data.error
        else if (data?.vessels?.length) state.lastWarning = null
      }
      if (sourceId === 'bluesky') {
        if (data?.warning) state.lastWarning = data.warning
        else if (data?.posts?.length) state.lastWarning = null
      }
      if (sourceId === 'fact-check') {
        if (data?.warning) state.lastWarning = data.warning
        else if (data?.error) state.lastWarning = data.error
        else if (data?.claims?.length) state.lastWarning = null
      }
    } else {
      const res = await fetch(config.url, fetchOpts)
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${config.url}`)
      data = await res.text()
    }

    const events = normalizer(data)

    if (sourceId === 'aisstream' && (data?.warning || data?.error)) {
      self.postMessage({
        type: 'SOURCE_STATUS',
        sourceId,
        status: 'partial',
        lastFetch: Date.now(),
        eventCount: events.length,
        warning: data.warning || data.error,
      })
    }

    if (sourceId === 'bluesky' && data?.warning) {
      self.postMessage({
        type: 'SOURCE_STATUS',
        sourceId,
        status: 'partial',
        lastFetch: Date.now(),
        eventCount: events.length,
        warning: data.warning,
      })
    }

    if (sourceId === 'fact-check' && (data?.warning || data?.error)) {
      self.postMessage({
        type: 'SOURCE_STATUS',
        sourceId,
        status: 'partial',
        lastFetch: Date.now(),
        eventCount: events.length,
        warning: data.warning || data.error,
      })
    }

    state.backoff = INITIAL_BACKOFF
    state.errorCount = 0
    state.lastError = null
    state.lastFetch = Date.now()
    return events
  } catch (err) {
    state.errorCount++
    state.lastError = err.message
    state.backoff = Math.min(state.backoff * 2, MAX_BACKOFF)
    self.postMessage({
      type: 'SOURCE_ERROR',
      sourceId,
      error: err.message,
      nextRetry: state.backoff,
    })
    return []
  }
}

async function pollSource(sourceId) {
  const allConfigs = getAllConfigs()
  const config = allConfigs[sourceId]
  if (!config) return
  if (activePollSources.size && !activePollSources.has(sourceId)) return

  const state = getState(sourceId)
  if (state.active) return
  state.active = true

  self.postMessage({
    type: 'SOURCE_STATUS',
    sourceId,
    status: 'fetching',
    lastFetch: state.lastFetch || 0,
    eventCount: lastGoodPayload[sourceId]?.events?.length || 0,
  })

  let events = await fetchSource(sourceId)
  let servedStale = false

  if (events.length > 0) {
    const extras = state.lastAggregates
      ? { aggregates: state.lastAggregates, totalRows: state.lastTotalRows || 0 }
      : {}
    await persistSnapshot(sourceId, events, extras)
    postSnapshotToL2(sourceId, events, extras)
    if (sourceId === 'gdelt-cameo' && extras.aggregates) {
      state.lastAggregates = null
      state.lastTotalRows = 0
    }
    self.postMessage({ type: 'EVENTS', sourceId, events })
  } else if (lastGoodPayload[sourceId]?.events?.length) {
    const age = Date.now() - (lastGoodPayload[sourceId].fetchedAt || 0)
    const canStale = !LIVE_TRACK_SOURCES.has(sourceId) || age < LIVE_TRACK_MAX_AGE_MS
    if (canStale) {
      events = tagStaleEvents(lastGoodPayload[sourceId].events, true)
      servedStale = true
      self.postMessage({ type: 'EVENTS', sourceId, events, fromCache: true })
    }
  }

  const transientRateLimit =
    state.lastError?.includes('429') ||
    state.lastError?.includes('502') ||
    state.lastError?.includes('503')

  let status = 'connected'
  if (servedStale) {
    status = 'stale'
  } else if (state.errorCount > 0) {
    status = transientRateLimit ? 'partial' : 'error'
  } else if (state.lastWarning) {
    status = 'partial'
  }

  self.postMessage({
    type: 'SOURCE_STATUS',
    sourceId,
    status,
    lastFetch: state.lastFetch || lastGoodPayload[sourceId]?.fetchedAt || 0,
    eventCount: events.length,
    warning: servedStale
      ? 'Showing cached data — retrying'
      : state.lastWarning || (transientRateLimit ? state.lastError : undefined) || undefined,
    error: state.errorCount > 0 && !transientRateLimit && !servedStale
      ? state.lastError || 'fetch failed'
      : undefined,
  })

  state.active = false

  if (!activePollSources.has(sourceId) && activePollSources.size) return

  const interval =
    sourceId === 'opensky' && state.errorCount > 0
      ? Math.min(60_000, Math.max(20_000, state.backoff))
      : sourceId === 'aisstream' && state.errorCount > 0
        ? Math.min(90_000, state.backoff)
        : state.errorCount > 0
          ? state.backoff
          : config.pollInterval
  state.timer = setTimeout(() => pollSource(sourceId), interval)
}

self.onmessage = function (msg) {
  const { type, payload } = msg.data

  switch (type) {
    case 'SET_ENV':
      envKeys = payload?.envKeys || {}
      break
    case 'START_ALL': {
      const allConfigs = getAllConfigs()
      const allConfiguredIds = Object.keys(allConfigs)
      const targetIds = payload?.sourceIds
        || getActivePollSourceIds(payload?.dataLayers || {}, allConfiguredIds)
      activePollSources = new Set(targetIds)
      void (async () => {
        await hydrateFromCache(targetIds)
        startPollingSources(targetIds)
      })()
      break
    }
    case 'RECONCILE_SOURCES': {
      const allConfigs = getAllConfigs()
      const allConfiguredIds = Object.keys(allConfigs)
      const nextIds = payload?.sourceIds
        || getActivePollSourceIds(payload?.dataLayers || {}, allConfiguredIds)
      const nextSet = new Set(nextIds)
      for (const id of [...activePollSources]) {
        if (!nextSet.has(id)) {
          const st = getState(id)
          if (st.timer) clearTimeout(st.timer)
          st.timer = null
          st.active = false
        }
      }
      activePollSources = nextSet
      for (const id of nextIds) {
        if (!allConfigs[id]) continue
        const st = getState(id)
        if (!st.timer && !st.active) pollSource(id)
      }
      break
    }
    case 'START_SOURCE': {
      const sourceId = payload.sourceId
      activePollSources.add(sourceId)
      void (async () => {
        await hydrateFromCache([sourceId])
        pollSource(sourceId)
      })()
      break
    }
    case 'STOP_SOURCE': {
      activePollSources.delete(payload.sourceId)
      const state = getState(payload.sourceId)
      if (state.timer) clearTimeout(state.timer)
      state.timer = null
      state.active = false
      break
    }
    case 'STOP_ALL':
      for (const [, state] of Object.entries(moduleState)) {
        if (state.timer) clearTimeout(state.timer)
        state.active = false
      }
      break
  }
}
