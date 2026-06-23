/**
 * GDELT 2.0 Event Database — 15-minute CSV Ingestion Service
 *
 * Fetches the latest GDELT Event CSV export (tab-delimited), parses it,
 * and produces unified ATLAS globe events classified by the 6-dimension
 * civilian taxonomy.
 *
 * CAMEO Event Codes & QuadClass Mapping:
 *   QuadClass 1 → Verbal Cooperation  (diplomacy)
 *   QuadClass 2 → Material Cooperation (aid, trade)
 *   QuadClass 3 → Verbal Conflict     (threats, posturing)
 *   QuadClass 4 → Material Conflict   (military action, violence)
 *
 * Data source: GDELT 2.0 — free for commercial use with attribution.
 * Attribution: "Data provided by the GDELT Project (https://www.gdeltproject.org)"
 */

import { unzipSync, strFromU8 } from 'fflate'
import { cameoToDimension } from '../../core/eventSchema.js'
import { gdeltDataProxyFile, gdeltDataProxyUrl } from '../../utils/gdeltProxyUrl.js'

// ── CAMEO root codes we care about ──
// 14 = Protest, 17 = Coerce, 18 = Assault, 19 = Fight, 20 = Use Unconventional Mass Violence
// 13 = Threaten, 12 = Reject, 10 = Demand
// 04 = Consult, 05 = Engage in Diplomacy, 06 = Cooperate, 036 = Express intent to meet or negotiate
// 07 = Aid, 08 = Yield — material cooperation / economy-adjacent
const CONFLICT_CODES = new Set(['14', '17', '18', '19', '20'])
const THREAT_CODES = new Set(['13', '12', '10'])
const DIPLOMACY_CODES = new Set(['04', '05', '06'])
const MATERIAL_COOP_CODES = new Set(['07', '08'])

/**
 * Map GDELT QuadClass (1-4) to an ATLAS dimension + severity
 * Uses the civilian taxonomy: SAFETY, GOVERNANCE, ECONOMY, PEOPLE, ENVIRONMENT, NARRATIVE
 */
function classifyEvent(quadClass, cameoRoot, goldstein) {
  const qc = parseInt(quadClass)
  const gs = parseFloat(goldstein) || 0

  return cameoToDimension(cameoRoot, qc, gs)
}

/**
 * GDELT 2.0 Event CSV Column indices (0-indexed)
 * Full spec: http://data.gdeltproject.org/documentation/GDELT-Event_Codebook-V2.0.pdf
 */
const COL = {
  GLOBALEVENTID: 0,
  SQLDATE: 1,
  Actor1Name: 5,
  Actor1CountryCode: 7,
  Actor2Name: 15,
  Actor2CountryCode: 17,
  EventCode: 26,
  EventBaseCode: 27,
  EventRootCode: 28,
  QuadClass: 29,
  GoldsteinScale: 30,
  NumMentions: 31,
  NumSources: 32,
  NumArticles: 33,
  AvgTone: 34,
  ActionGeo_Type: 51,
  ActionGeo_FullName: 52,
  ActionGeo_CountryCode: 53,
  ActionGeo_Lat: 56,
  ActionGeo_Long: 57,
  SOURCEURL: 60,
}

/** Valid CAMEO root codes are two-digit strings `01`–`20` per the v2 codebook. */
const CAMEO_ROOT_RE = /^(0[1-9]|1[0-9]|20)$/

/**
 * Parse a single GDELT 2.0 event CSV row (tab-delimited).
 *
 * Throttle notes
 * --------------
 * Every valid CAMEO root is parsed — the full row set feeds the in-worker
 * per-country aggregates (choropleth + surge baselines). Pin-worthiness
 * (`numSources` / `severity` gating) is decided downstream in
 * `fetchManager.worker.js`, not here.
 */
function parseGdeltRow(columns) {
  const lat = parseFloat(columns[COL.ActionGeo_Lat])
  const lng = parseFloat(columns[COL.ActionGeo_Long])

  // Skip events without valid geo
  if (isNaN(lat) || isNaN(lng) || (lat === 0 && lng === 0)) return null

  const cameoRoot = columns[COL.EventRootCode] || ''
  const quadClass = columns[COL.QuadClass] || ''
  const goldstein = columns[COL.GoldsteinScale] || '0'
  const avgTone = parseFloat(columns[COL.AvgTone]) || 0
  const numMentions = parseInt(columns[COL.NumMentions]) || 0
  const numSources = parseInt(columns[COL.NumSources]) || 0

  // Accept every valid CAMEO root; `cameoToDimension` already handles all 20.
  if (!CAMEO_ROOT_RE.test(cameoRoot)) return null

  // Require at least one mention (the CSV has rows with 0 mentions for
  // "theoretical" events constructed from context — those rarely have a
  // real geocode anyway).
  if (numMentions < 1) return null

  const classification = classifyEvent(quadClass, cameoRoot, goldstein)

  const actor1 = columns[COL.Actor1Name] || ''
  const actor2 = columns[COL.Actor2Name] || ''
  const location = columns[COL.ActionGeo_FullName] || ''
  const actionGeoType = parseInt(columns[COL.ActionGeo_Type], 10)
  // GDELT type 1 = country-level centroid — not pinpoint enough for globe pins.
  const latApproximate = actionGeoType === 1
  // FIPS 10-4 code (GDELT's ActionGeo country standard) — joins directly to
  // Natural Earth `FIPS_10` for the in-worker country aggregates.
  const countryCode = (columns[COL.ActionGeo_CountryCode] || '').trim().toUpperCase()
  const cameoCode = columns[COL.EventCode] || ''
  const sqlDate = columns[COL.SQLDATE] || ''
  const sourceUrl = columns[COL.SOURCEURL] || ''

  // Build a readable title
  const actors = [actor1, actor2].filter(Boolean).join(' → ')
  const eventDesc = CAMEO_LABELS[cameoRoot] || `Event ${cameoCode}`
  const title = actors
    ? `${eventDesc}: ${actors}`
    : `${eventDesc} — ${location || 'Unknown Location'}`

  // Corroboration based on source count
  const corrobCount = Math.min(5, Math.max(1, Math.ceil(numSources / 3)))

  return {
    lat,
    lng,
    title: title.substring(0, 120),
    detail: `Location: ${location}. Goldstein: ${goldstein}. Sources: ${numSources}. CAMEO: ${cameoCode}.`,
    sourceUrl,
    dimension: classification.dimension,
    severity: classification.severity,
    corroborationCount: corrobCount,
    numMentions,
    numSources,
    cameoRoot,
    quadClass: parseInt(quadClass),
    goldstein: parseFloat(goldstein),
    toneScore: avgTone,
    actor1,
    actor2,
    sqlDate,
    locationName: location,
    countryCode,
    latApproximate,
    actionGeoType: Number.isFinite(actionGeoType) ? actionGeoType : null,
    layer: 'gdelt',
  }
}

/**
 * Human-readable labels for CAMEO root codes
 */
const CAMEO_LABELS = {
  '01': 'Public Statement',
  '02': 'Appeal',
  '03': 'Intent to Cooperate',
  '04': 'Consultation',
  '05': 'Diplomatic Action',
  '06': 'Cooperation',
  '07': 'Aid',
  '08': 'Yield',
  '09': 'Investigate',
  '10': 'Demand',
  '11': 'Disapprove',
  '12': 'Reject',
  '13': 'Threaten',
  '14': 'Protest',
  '15': 'Exhibit Force',
  '16': 'Reduce Relations',
  '17': 'Coerce',
  '18': 'Assault',
  '19': 'Fight',
  '20': 'Mass Violence',
}

/**
 * Parse a GDELT 2.0 Events export body (tab-separated, header row optional).
 * Used after safe unzip of a bounded export file.
 */
export function parseGdeltCsvText(text, maxRows = 400) {
  if (!text || typeof text !== 'string') return []
  const lines = text.split(/\n/)
  const out = []
  let start = 0
  // Skip header if first cell looks like a column name
  if (lines[0] && /GLOBALEVENTID/i.test(lines[0].split('\t')[0] || '')) {
    start = 1
  }
  for (let i = start; i < lines.length && out.length < maxRows; i++) {
    const line = lines[i]
    if (!line || !line.trim()) continue
    const parsed = parseGdeltRow(line.split('\t'))
    if (parsed) out.push(parsed)
  }
  return out
}

/** Strict allowlist: only official GDELT v2 15-minute event exports (SSRF-safe). */
const GDELT_EXPORT_ZIP_RE = /^https:\/\/data\.gdeltproject\.org\/gdeltv2\/\d{14}\.export\.CSV\.zip$/

/**
 * Browser-safe upper bound for zip download. Typical exports range 50-120 MB
 * once compressed, so the previous 32 MB cap effectively disabled this path.
 * 128 MB fits the largest observed exports while still bounding memory usage
 * on mobile.
 */
const MAX_ZIP_BYTES = 128 * 1024 * 1024

/**
 * Maximum CAMEO rows we parse per invocation.
 *
 * The raw 15-minute export typically holds 5k-30k rows globally. We parse
 * a large slice because ALL rows feed the in-worker per-country aggregates
 * (choropleth tone + Triage surge baselines); only the high-confidence
 * subset (`numSources >= 3` OR `severity >= 4`, gated in
 * `fetchManager.worker.js`) becomes globe pins.
 */
const MAX_CAMEO_ROWS = 5000

/**
 * Resolve the latest 15-minute `.export.CSV.zip` URL. Prefers
 * `lastupdate.txt`; if that 404s (GDELT maintenance windows), falls back to
 * the tail of `masterfilelist.txt`.
 */
async function resolveLatestExportZipUrl() {
  try {
    const upd = await fetch(gdeltDataProxyFile('gdeltv2/lastupdate.txt'), {
      signal: AbortSignal.timeout(25_000),
      redirect: 'manual',
    })
    if (upd.ok && upd.status < 300) {
      const text = await upd.text()
      const line = text.trim().split('\n').find((l) => l.includes('.export.CSV.zip'))
      if (line) {
        const parts = line.trim().split(/\s+/)
        const url = parts[parts.length - 1]
        if (url && GDELT_EXPORT_ZIP_RE.test(url)) return gdeltDataProxyUrl(url)
      }
    }
  } catch {
    /* fall through to masterfilelist */
  }

  try {
    const master = await fetch(gdeltDataProxyFile('gdeltv2/masterfilelist.txt'), {
      signal: AbortSignal.timeout(30_000),
      redirect: 'manual',
    })
    if (!master.ok || master.status >= 300) return null
    const text = await master.text()
    const lines = text.trim().split('\n')
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i]
      if (!line || !line.includes('.export.CSV.zip')) continue
      const parts = line.trim().split(/\s+/)
      const url = parts[parts.length - 1]
      if (url && GDELT_EXPORT_ZIP_RE.test(url)) return gdeltDataProxyUrl(url)
    }
  } catch {
    /* give up */
  }
  return null
}

/**
 * Parse `YYYYMMDDHHMMSS` from an official GDELT v2 `.export.CSV.zip` URL → UTC ms.
 * @param {string} zipUrl
 * @returns {number|null}
 */
export function parseGdeltExportZipTimestampMs(zipUrl) {
  const m = String(zipUrl || '').match(/\/(\d{14})\.export\.CSV\.zip$/i)
  if (!m) return null
  const s = m[1]
  const y = +s.slice(0, 4)
  const mo = +s.slice(4, 6) - 1
  const d = +s.slice(6, 8)
  const hh = +s.slice(8, 10)
  const mm = +s.slice(10, 12)
  const ss = +s.slice(12, 14)
  return Date.UTC(y, mo, d, hh, mm, ss)
}

/**
 * Fetch recent CAMEO-coded events. Streams the ZIP body, decompresses into
 * tab-separated CSV, and stops parsing after `MAX_CAMEO_ROWS` valid rows.
 *
 * Previously this bailed out when `content-length > 32 MB`. In practice GDELT
 * 15-minute exports are 50-120 MB so that check short-circuited every time.
 * With the raised cap and bounded row parse we consistently emit 100-500
 * geocoded, CAMEO-classified events per tick — the richest real-time feed
 * GDELT offers for free.
 */
export async function fetchGdeltCameoEvents() {
  try {
    const zipUrl = await resolveLatestExportZipUrl()
    if (!zipUrl) return []

    // HEAD check — skip only when the file is definitely too large. Missing
    // content-length should not skip (some proxies omit the header).
    try {
      const head = await fetch(zipUrl, {
        method: 'HEAD',
        signal: AbortSignal.timeout(20_000),
        redirect: 'manual',
      })
      if (head.ok) {
        const len = parseInt(head.headers.get('content-length') || '0', 10)
        if (len && len > MAX_ZIP_BYTES) return []
      }
    } catch {
      /* HEAD is advisory; continue to GET */
    }

    const body = await fetch(zipUrl, {
      signal: AbortSignal.timeout(120_000),
      redirect: 'manual',
    })
    if (!body.ok || body.status >= 300) return []

    const buf = new Uint8Array(await body.arrayBuffer())
    if (buf.byteLength > MAX_ZIP_BYTES) return []

    const files = unzipSync(buf)
    const entryName = Object.keys(files).find((k) => /\.export\.csv$/i.test(k))
    if (!entryName) return []

    const text = strFromU8(files[entryName])
    const exportTsMs = parseGdeltExportZipTimestampMs(zipUrl) ?? Date.now()
    return parseGdeltCsvText(text, MAX_CAMEO_ROWS).map((row) => ({
      ...row,
      _exportTsMs: exportTsMs,
    }))
  } catch (err) {
    console.warn('[GDELT eventService] CAMEO export fetch skipped:', err?.message || err)
    return []
  }
}

export { classifyEvent, parseGdeltRow, CAMEO_LABELS, CONFLICT_CODES, THREAT_CODES, DIPLOMACY_CODES, MATERIAL_COOP_CODES }
