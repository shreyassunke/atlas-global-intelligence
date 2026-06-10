/**
 * Workbench — Dossier tab (Phase 5, place investigation).
 *
 * "Everything about X" — composes existing services around one country:
 * stability (BigQuery countryStability), trend (DOC timelinevol/tone +
 * eventSurge z-score), live signals (store events scoped to the country,
 * sorted by corroboration), narrative (Context sentences, source-country
 * breakdown, actor pairs), and evidence (DOC articles + TV clips).
 *
 * Entry points: choropleth country click, Inspector "Open dossier",
 * place-search results, watchlist rows, and the `?dossier=` URL param.
 * No new backend — every section is an existing API/template.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  BarChart,
  Bar,
} from 'recharts'
import { useAtlasStore } from '../../store/atlasStore'
import {
  fetchTimelineVol,
  fetchTimelineTone,
  fetchSourceCountries,
  fetchDocArticles,
  formatGdeltDateTick,
  timespanFromTimeFilter,
} from '../../services/gdelt/analyticsService'
import { fetchContextSentences } from '../../services/gdelt/contextService'
import { fetchTvClips } from '../../services/gdelt/tvService'
import { fetchCountryStability, fetchEventSurge, fetchActorNetwork } from '../../services/gdelt/bigqueryService'
import { loadCountryIndex } from '../../services/countryIndex'
import ClipGallery from '../UI/ClipGallery'
import GdeltAttribution from '../UI/GdeltAttribution'
import { DIMENSION_COLORS, DIMENSION_ICONS, DIMENSION_LABELS, formatToneScore } from '../../core/eventSchema'
import { buildDossierBriefMarkdown, downloadMarkdownBrief } from '../../core/briefExport'
import { buildShareUrl } from '../../core/urlState'

// ── Shared chart styling (mirrors GDELTAnalyticsPanel) ──
const AXIS_TICK = { fill: 'rgba(255,255,255,0.35)', fontSize: 9 }
const GRID_STROKE = 'rgba(255,255,255,0.06)'
const TOOLTIP_STYLE = {
  background: '#0c1018',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 8,
  fontSize: 11,
}

function Section({ title, provenance, children }) {
  return (
    <section>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h3 className="text-[9px] font-bold uppercase tracking-[0.2em] text-white/35">{title}</h3>
        {provenance && (
          <span className="text-[8px] font-mono uppercase tracking-widest text-white/20">{provenance}</span>
        )}
      </div>
      {children}
    </section>
  )
}

function Empty({ children }) {
  return <p className="text-[11px] text-white/35">{children}</p>
}

function MiniTimeline({ rows, color, height = 132, label = 'Value', emptyText = 'No data.' }) {
  if (!rows?.length) return <Empty>{emptyText}</Empty>
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
          <XAxis dataKey="x" tick={AXIS_TICK} interval="preserveStartEnd" />
          <YAxis tick={AXIS_TICK} width={32} />
          <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={{ color: 'rgba(255,255,255,0.5)' }} />
          <Line type="monotone" dataKey="v" stroke={color} strokeWidth={1.5} dot={false} name={label} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

function MiniBars({ data, color, height = 160, label = 'Value', emptyText = 'No data.' }) {
  if (!data?.length) return <Empty>{emptyText}</Empty>
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 8, left: 4, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} horizontal={false} />
          <XAxis type="number" tick={AXIS_TICK} />
          <YAxis type="category" dataKey="name" width={72} tick={{ fill: 'rgba(255,255,255,0.45)', fontSize: 9 }} />
          <Tooltip contentStyle={TOOLTIP_STYLE} />
          <Bar dataKey="value" fill={color} radius={[0, 4, 4, 0]} name={label} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

function seriesToRows(parsed) {
  const dates = parsed?.dates
  const s = parsed?.series?.[0]
  if (!dates?.length || !s?.values?.length) return []
  const n = Math.min(dates.length, s.values.length)
  const rows = new Array(n)
  for (let i = 0; i < n; i++) {
    rows[i] = { x: formatGdeltDateTick(dates[i]), v: s.values[i] }
  }
  return rows
}

function timeAgo(dateStr) {
  if (!dateStr) return ''
  const diff = Date.now() - new Date(dateStr).getTime()
  if (!Number.isFinite(diff)) return ''
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'now'
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  return `${Math.floor(hours / 24)}d`
}

/** GDELT DOC phrase query for a country — quoted so multi-word names match. */
function countryDocQuery(target) {
  const name = String(target?.name || '').trim()
  if (!name) return ''
  return name.includes(' ') ? `"${name}"` : name
}

function eventMatchesCountry(evt, target) {
  if (!evt || evt.trackKind) return false
  if (target.fips && evt.countryCode && evt.countryCode === target.fips) return true
  const name = String(target.name || '').toLowerCase()
  if (name.length < 4) return false
  const loc = `${evt.location || ''} ${evt.locationName || ''} ${evt.country || ''}`.toLowerCase()
  return loc.includes(name)
}

const EMPTY_DATA = {
  stability: null,
  surge: null,
  surgeRows: [],
  volumeRows: [],
  toneRows: [],
  sentences: [],
  sourceCountries: [],
  actors: [],
  articles: [],
  clips: [],
  errors: [],
}

/** Most active countries right now (in-worker CAMEO aggregates) — empty-state quick picks. */
function useQuickPicks(enabled) {
  const aggregates = useAtlasStore((s) => s.gdeltCountryAggregates)
  const [index, setIndex] = useState(null)

  useEffect(() => {
    if (!enabled || index) return
    let cancelled = false
    loadCountryIndex()
      .then((idx) => { if (!cancelled) setIndex(idx) })
      .catch(() => { /* quick picks are optional */ })
    return () => { cancelled = true }
  }, [enabled, index])

  return useMemo(() => {
    if (!enabled || !index || !aggregates?.byFips) return []
    const byFips = new Map(index.map((c) => [c.fips, c]))
    return Object.entries(aggregates.byFips)
      .map(([fips, agg]) => {
        const country = byFips.get(fips)
        if (!country || !agg?.events) return null
        return { ...country, events: agg.events, avgTone: agg.avgTone }
      })
      .filter(Boolean)
      .sort((a, b) => b.events - a.events)
      .slice(0, 8)
  }, [enabled, index, aggregates])
}

export default function DossierTab() {
  const target = useAtlasStore((s) => s.dossier)
  const timeFilter = useAtlasStore((s) => s.timeFilter)
  const events = useAtlasStore((s) => s.events)
  const aggregates = useAtlasStore((s) => s.gdeltCountryAggregates)
  const openDossier = useAtlasStore((s) => s.openDossier)
  const setSelectedEvent = useAtlasStore((s) => s.setSelectedEvent)
  const flyToLocation = useAtlasStore((s) => s.flyToLocation)
  const pushToast = useAtlasStore((s) => s.pushToast)

  const [data, setData] = useState(EMPTY_DATA)
  const [loading, setLoading] = useState(false)
  const [refreshTick, setRefreshTick] = useState(0)

  const quickPicks = useQuickPicks(!target)
  const timespan = useMemo(() => timespanFromTimeFilter(timeFilter), [timeFilter])
  const docQuery = useMemo(() => countryDocQuery(target), [target])

  const countryEvents = useMemo(() => {
    if (!target) return []
    const list = events.filter((evt) => eventMatchesCountry(evt, target))
    list.sort((a, b) =>
      (b.corroborationScore || 0) - (a.corroborationScore || 0) ||
      (b.severity || 0) - (a.severity || 0) ||
      new Date(b.timestamp || 0) - new Date(a.timestamp || 0))
    return list
  }, [events, target])

  const dimensionMix = useMemo(() => {
    const counts = {}
    for (const evt of countryEvents) {
      if (!evt.dimension) continue
      counts[evt.dimension] = (counts[evt.dimension] || 0) + 1
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1])
  }, [countryEvents])

  const liveAggregate = target?.fips ? aggregates?.byFips?.[target.fips] : null

  // ── Composed fetch: every section is best-effort, partial failures render ──
  useEffect(() => {
    if (!target) {
      setData(EMPTY_DATA)
      return undefined
    }

    let cancelled = false
    const controller = new AbortController()
    const signal = controller.signal
    const upperName = String(target.name || '').toUpperCase()

    async function run() {
      setLoading(true)
      const tasks = {
        stability: target.fips
          ? fetchCountryStability(target.fips, { years: 5, limit: 5, signal })
          : Promise.resolve([]),
        surge: target.fips
          ? fetchEventSurge(target.fips, { limit: 30, signal })
          : Promise.resolve([]),
        volume: fetchTimelineVol(docQuery, timespan, { signal }),
        tone: fetchTimelineTone(docQuery, timespan, { signal }),
        sentences: fetchContextSentences(docQuery, { timespan, maxrecords: 8, signal }),
        sourceCountries: fetchSourceCountries(docQuery, timespan, { signal }),
        actors: fetchActorNetwork({ months: 6, minMentions: 10, limit: 200, signal }),
        articles: fetchDocArticles(docQuery, timespan, { maxrecords: 10, signal }),
        clips: fetchTvClips(docQuery, { timespan, maxrecords: 6, signal }),
      }

      const keys = Object.keys(tasks)
      const settled = await Promise.allSettled(Object.values(tasks))
      if (cancelled) return

      const out = { ...EMPTY_DATA, errors: [] }
      settled.forEach((res, i) => {
        const key = keys[i]
        if (res.status === 'rejected') {
          out.errors.push({ key, message: res.reason?.message || String(res.reason) })
          return
        }
        const value = res.value
        switch (key) {
          case 'stability': {
            out.stability = Array.isArray(value)
              ? value.find((r) => String(r.country || '').toUpperCase() === target.fips) || value[0] || null
              : null
            break
          }
          case 'surge': {
            const rows = Array.isArray(value) ? value : []
            const candidates = rows.slice(0, 2).filter((r) => Number.isFinite(Number(r.zScore)))
            const best = candidates.sort((a, b) => Number(b.zScore) - Number(a.zScore))[0]
            out.surge = best
              ? { zScore: Number(best.zScore), date: String(best.date?.value || best.date || '') }
              : null
            out.surgeRows = rows
              .slice(0, 14)
              .reverse()
              .map((r) => ({ x: String(r.date?.value || r.date || ''), v: Number(r.events) || 0 }))
            break
          }
          case 'volume': out.volumeRows = seriesToRows(value); break
          case 'tone': out.toneRows = seriesToRows(value); break
          case 'sentences': out.sentences = value || []; break
          case 'sourceCountries': out.sourceCountries = value || []; break
          case 'actors': {
            out.actors = (value || [])
              .filter((r) =>
                String(r.actor1 || '').toUpperCase().includes(upperName) ||
                String(r.actor2 || '').toUpperCase().includes(upperName))
              .slice(0, 8)
            break
          }
          case 'articles': out.articles = value || []; break
          case 'clips': out.clips = value || []; break
          default: break
        }
      })

      if (!cancelled) {
        setData(out)
        setLoading(false)
      }
    }

    run()
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [target, docQuery, timespan, refreshTick])

  const handleSignalClick = (evt) => {
    setSelectedEvent(evt)
    if (evt.lat != null && evt.lng != null) flyToLocation({ lat: evt.lat, lng: evt.lng })
  }

  const handleExport = useCallback(() => {
    if (!target) return
    const state = useAtlasStore.getState()
    const shareUrl = buildShareUrl({
      activeDimensions: state.activeDimensions,
      priorityFilter: state.priorityFilter,
      timeFilter: state.timeFilter,
      dataLayers: state.dataLayers,
      globeMode: state.globeMode,
      tacticalMode: state.tacticalMode,
      detectionMode: state.detectionMode,
      detectionLabelDensity: state.detectionLabelDensity,
      shareCamera: state.shareCamera,
      zoomLevel: state.zoomLevel,
      selectedEventId: null,
      dossierCode: target.iso || target.fips || target.name,
    })
    const md = buildDossierBriefMarkdown({
      target,
      stability: data.stability,
      surge: data.surge,
      volumeRows: data.volumeRows,
      toneRows: data.toneRows,
      signals: countryEvents,
      sentences: data.sentences,
      sourceCountries: data.sourceCountries,
      articles: data.articles,
      clips: data.clips,
      timeFilter,
      shareUrl,
    })
    const slug = (target.iso || target.fips || target.name).toLowerCase().replace(/[^a-z0-9]+/g, '-')
    downloadMarkdownBrief(md, `atlas-dossier-${slug}-${new Date().toISOString().slice(0, 10)}.md`)
    pushToast({ label: 'Dossier', message: `${target.name} dossier exported` })
  }, [target, data, countryEvents, timeFilter, pushToast])

  // ── Empty state — no target yet ──
  if (!target) {
    return (
      <div className="flex flex-col gap-4" style={{ fontFamily: 'var(--font-data)' }}>
        <p className="text-[11px] leading-relaxed text-white/45">
          Open a dossier from a choropleth country, a place search result,
          a watchlist row, or an event&apos;s “Open dossier” action — or pick a
          currently active country below.
        </p>
        {quickPicks.length > 0 && (
          <Section title="Most active right now" provenance="GDELT 15-min export">
            <ul className="flex flex-col gap-1">
              {quickPicks.map((c) => (
                <li key={c.fips}>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-2 rounded-md border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-left text-[11px] text-white/75 transition hover:bg-white/[0.06]"
                    onClick={() => openDossier(c)}
                  >
                    <span>{c.name}</span>
                    <span className="font-mono text-[9px] text-white/35">
                      {c.events.toLocaleString()} events
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </Section>
        )}
      </div>
    )
  }

  const stabilityGoldstein = Number(data.stability?.avgGoldstein)
  const tone = liveAggregate && Number.isFinite(liveAggregate.avgTone)
    ? formatToneScore(liveAggregate.avgTone)
    : null

  return (
    <div className="flex flex-col gap-5" style={{ fontFamily: 'var(--font-data)' }}>
      {/* ── Header: name, dimension mix, live count, stability ── */}
      <header className="flex flex-col gap-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="text-[15px] font-semibold tracking-wide text-white">
              {target.name}
              {target.iso && (
                <span className="ml-2 font-mono text-[10px] uppercase tracking-widest text-white/30">
                  {target.iso}
                </span>
              )}
            </h2>
            <p className="mt-0.5 text-[10px] text-white/40">
              {countryEvents.length} live signal{countryEvents.length === 1 ? '' : 's'} in view
              {liveAggregate?.events ? ` · ${liveAggregate.events.toLocaleString()} GDELT events last tick` : ''}
            </p>
          </div>
          <div className="flex shrink-0 gap-1">
            {target.lat != null && (
              <button
                type="button"
                className="rounded-md border border-white/[0.08] bg-white/[0.03] px-2 py-1 text-[9px] uppercase tracking-widest text-white/55 transition hover:bg-white/[0.08]"
                onClick={() => flyToLocation({ lat: target.lat, lng: target.lng })}
              >
                Fly to
              </button>
            )}
            <button
              type="button"
              className="rounded-md border border-white/[0.08] bg-white/[0.03] px-2 py-1 text-[9px] uppercase tracking-widest text-white/55 transition hover:bg-white/[0.08]"
              onClick={() => setRefreshTick((t) => t + 1)}
              disabled={loading}
            >
              {loading ? '…' : 'Refresh'}
            </button>
            <button
              type="button"
              className="rounded-md border border-sky-400/20 bg-sky-400/10 px-2 py-1 text-[9px] uppercase tracking-widest text-sky-200/80 transition hover:bg-sky-400/20"
              onClick={handleExport}
            >
              Export brief
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {dimensionMix.map(([dim, count]) => (
            <span
              key={dim}
              className="inline-flex items-center gap-1 rounded-full border border-white/[0.07] px-2 py-0.5 text-[9px] text-white/60"
              title={DIMENSION_LABELS[dim] || dim}
            >
              <span style={{ color: DIMENSION_COLORS[dim] }}>{DIMENSION_ICONS[dim]}</span>
              {count}
            </span>
          ))}
          {tone && (
            <span className={`text-[9px] tone-indicator tone-${tone.sentiment}`}>
              tone {tone.label} ({tone.score})
            </span>
          )}
          {Number.isFinite(stabilityGoldstein) && (
            <span
              className="font-mono text-[9px] text-white/45"
              title="Average Goldstein scale over 5 years: −10 (conflict) … +10 (cooperation)"
            >
              stability {stabilityGoldstein.toFixed(2)}
            </span>
          )}
          {data.surge && (
            <span
              className={`font-mono text-[9px] ${data.surge.zScore >= 2 ? 'text-rose-300' : 'text-white/45'}`}
              title={`Daily event count vs 30-day baseline (${data.surge.date})`}
            >
              surge z {data.surge.zScore.toFixed(1)}
            </span>
          )}
        </div>
      </header>

      {/* ── Trend ── */}
      <Section title="Coverage volume" provenance="GDELT DOC 2.0">
        <MiniTimeline
          rows={data.volumeRows}
          color="#38bdf8"
          label="Volume"
          emptyText={loading ? 'Loading…' : 'No coverage data.'}
        />
      </Section>

      <Section title="Coverage tone" provenance="GDELT DOC 2.0">
        <MiniTimeline
          rows={data.toneRows}
          color="#f0b429"
          label="Tone"
          emptyText={loading ? 'Loading…' : 'No tone data.'}
        />
      </Section>

      {data.surgeRows.length > 0 && (
        <Section title="Daily events (30d baseline)" provenance="BigQuery eventSurge">
          <MiniTimeline rows={data.surgeRows} color="#ff8a4d" label="Events/day" height={108} />
        </Section>
      )}

      {/* ── Live signals ── */}
      <Section title={`Live signals (${countryEvents.length})`} provenance="ATLAS event bus">
        {countryEvents.length === 0 ? (
          <Empty>No live events scoped to {target.name} under the current filters.</Empty>
        ) : (
          <ul className="flex flex-col gap-1">
            {countryEvents.slice(0, 12).map((evt) => (
              <li key={evt.id}>
                <button
                  type="button"
                  className="flex w-full items-start gap-2 rounded-md border border-white/[0.05] bg-white/[0.02] px-2.5 py-2 text-left transition hover:bg-white/[0.06]"
                  onClick={() => handleSignalClick(evt)}
                >
                  <span className="mt-0.5 shrink-0" style={{ color: DIMENSION_COLORS[evt.dimension] }}>
                    {DIMENSION_ICONS[evt.dimension] || '•'}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[11px] text-white/80">{evt.title}</span>
                    <span className="mt-0.5 block font-mono text-[9px] text-white/35">
                      {evt.source} · {timeAgo(evt.timestamp)}
                      {evt.corroborationScore != null && ` · corr ${Math.round(evt.corroborationScore * 100)}%`}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* ── Narrative ── */}
      <Section title="What's being said" provenance="GDELT Context 2.0">
        {data.sentences.length === 0 ? (
          <Empty>{loading ? 'Loading…' : 'No context sentences.'}</Empty>
        ) : (
          <ul className="flex flex-col gap-2">
            {data.sentences.slice(0, 6).map((s, i) => (
              <li key={`${s.url}-${i}`} className="rounded-md border border-white/[0.05] bg-black/20 px-2.5 py-2">
                <p className="text-[11px] leading-snug text-white/75">{s.text}</p>
                <a
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 block truncate font-mono text-[9px] text-sky-300/70 hover:text-sky-200"
                >
                  {s.domain || s.url} {s.sourcecountry ? `· ${s.sourcecountry}` : ''}
                </a>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Who is covering this" provenance="GDELT DOC 2.0">
        <MiniBars
          data={data.sourceCountries.slice(0, 10)}
          color="#3dd68c"
          label="Coverage"
          emptyText={loading ? 'Loading…' : 'No source-country data.'}
        />
      </Section>

      {data.actors.length > 0 && (
        <Section title="Actor pairs (6 months)" provenance="BigQuery actorNetwork">
          <ul className="flex flex-col gap-1">
            {data.actors.map((a, i) => (
              <li
                key={`${a.actor1}-${a.actor2}-${i}`}
                className="flex items-center justify-between gap-2 rounded-md border border-white/[0.05] px-2.5 py-1.5 text-[10px] text-white/65"
              >
                <span className="truncate">{a.actor1} ↔ {a.actor2}</span>
                <span className="shrink-0 font-mono text-[9px] text-white/35">
                  {Number(a.mentions || 0).toLocaleString()} mentions
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* ── Evidence ── */}
      <Section title="Evidence — articles" provenance="GDELT DOC 2.0 artlist">
        {data.articles.length === 0 ? (
          <Empty>{loading ? 'Loading…' : 'No matching articles.'}</Empty>
        ) : (
          <ul className="flex flex-col gap-1">
            {data.articles.map((a, i) => (
              <li key={`${a.url}-${i}`}>
                <a
                  href={a.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block rounded-md border border-white/[0.05] bg-white/[0.02] px-2.5 py-2 transition hover:bg-white/[0.06]"
                >
                  <span className="block truncate text-[11px] text-white/80">{a.title}</span>
                  <span className="mt-0.5 block font-mono text-[9px] text-white/35">
                    {a.domain} {a.sourcecountry ? `· ${a.sourcecountry}` : ''}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Evidence — TV clips" provenance="GDELT TV 2.0 / Internet Archive">
        <ClipGallery
          clips={data.clips}
          emptyText={loading ? 'Loading…' : 'No TV clips returned.'}
        />
      </Section>

      {data.errors.length > 0 && (
        <p className="text-[9px] font-mono leading-relaxed text-amber-100/50">
          Unavailable: {data.errors.map((e) => e.key).join(', ')}
          {data.errors.some((e) => /HTTP|fetch|network/i.test(e.message || '')) ? ' (proxy/API unreachable)' : ''}
        </p>
      )}

      <GdeltAttribution />
    </div>
  )
}
