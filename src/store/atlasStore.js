import { create } from 'zustand'
import { DEFAULT_SOURCES, NEWS_SOURCES } from '../utils/newsSources'
import { CATEGORY_KEYS } from '../utils/categoryColors'
import { loadQualitySettings, saveQualitySettings, loadGlobeMode, saveGlobeMode, QUALITY_TIERS } from '../config/qualityTiers'
import { initEventBus, startFetching, stopFetching, subscribeToBatchUpdates, subscribeToSourceStatus, destroyEventBus } from '../core/eventBus'
import { supabase } from '../services/supabase'
const STORAGE_KEY_SOURCES = 'atlas_selected_sources'
const STORAGE_KEY_ONBOARDED = 'atlas_onboarded'
const STORAGE_KEY_DATA_LAYERS = 'atlas_data_layers'
const STORAGE_KEY_TACTICAL_MODE = 'atlas_tactical_mode'
const STORAGE_KEY_DETECTION_MODE = 'atlas_detection_mode'
const STORAGE_KEY_DETECTION_LABELS = 'atlas_detection_labels'
/** Legacy key — cleared on reopen so returning users see the landing page first again */
const STORAGE_KEY_LANDING = 'atlas_landing_ack_v1'

const DEFAULT_DATA_LAYERS = {
  gdelt: true,           // Geopolitical events from GDELT 2.0
  firms: true,           // NASA FIRMS active fires
  usgs: true,            // USGS earthquakes
  gdacs: true,           // GDACS disasters
  eonet: true,           // NASA EONET natural events
  // GDELT GEO PointHeatmap — off by default. Rendered as wide radial red/yellow
  // gradient sprites (96px) whose combined footprint leaves faded "ghost dots"
  // on the globe wherever any article was filed in the last 24h, even when
  // there's no live event there. Users can re-enable from the data-layers HUD.
  gdeltHeatmap: false,
  gdeltChoropleth: false,// GDELT GEO per-country tone choropleth
  gibsTrueColor: false,  // NASA GIBS MODIS true-color WMTS (2D Map + Globe.GL)
  // Phase 2 — GIBS imagery overlays (mutually exclusive on Globe.GL; stackable on 2D Map)
  gibsFires: false,      // MODIS 7-2-1 fire-sensitive false color
  gibsAerosol: false,    // MODIS Terra aerosol
  gibsDust: false,       // AIRS L2 dust score (day)
  gibsClouds: false,     // MODIS Aqua cloud fraction (day)
  gibsBlackMarble: false,// Enhance night-side city lights (Globe.GL)
  terminator: true,      // Day/night terminator line
  // Phase 1 — live tactical layers ($0 sources)
  adsb: true,            // OpenSky ADS-B aircraft (default ON per build plan)
  adsbMilitary: true,    // Military ICAO hex sub-filter (distinct sprite)
  satellites: false,     // CelesTrak TLE-propagated satellites
  // Phase 3 — maritime & storms ($0 sources, default OFF per build plan)
  ais: false,            // AISStream.io vessels at chokepoints (requires AISSTREAM_API_KEY server-side)
  nhcStorms: false,      // NOAA NHC active cyclone tracks + cone-of-error
  windOverlay: false,    // Open-Meteo wind particles (Globe.GL only)
  // Phase 6 — stretch signals ($0 sources, default OFF per build plan)
  bluesky: false,        // Bluesky Jetstream social reach — $0, no key
  factCheck: false,      // Google Fact Check Tools — $0 with GOOGLE_FACT_CHECK_API_KEY server-side
}

/**
 * One-time migration key: bumped whenever a data-layer default flips from ON
 * to OFF so existing users stop seeing the old layer after pull/reload.
 */
const DATA_LAYERS_MIGRATION_KEY = 'atlas_data_layers_migration'
const DATA_LAYERS_MIGRATION_VERSION = 'v4'
const GIBS_IMAGERY_EXCLUSIVE_KEYS = ['gibsTrueColor', 'gibsFires', 'gibsAerosol', 'gibsDust', 'gibsClouds']

function loadDataLayers() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_DATA_LAYERS)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const { labels: _legacyLabels, ...rest } = parsed
        // v2: GDELT heatmap default flipped to off. Force any stale `true`
        // from a previous session back to the new default so faded heatmap
        // blobs don't keep rendering for returning users.
        if (localStorage.getItem(DATA_LAYERS_MIGRATION_KEY) !== DATA_LAYERS_MIGRATION_VERSION) {
          if (rest.gdeltHeatmap === true) rest.gdeltHeatmap = false
          if (rest.terminator === undefined) rest.terminator = true
          try {
            localStorage.setItem(DATA_LAYERS_MIGRATION_KEY, DATA_LAYERS_MIGRATION_VERSION)
            localStorage.setItem(
              STORAGE_KEY_DATA_LAYERS,
              JSON.stringify({ ...DEFAULT_DATA_LAYERS, ...rest }),
            )
          } catch { /* ignore */ }
        }
        return { ...DEFAULT_DATA_LAYERS, ...rest }
      }
    }
  } catch { /* ignore */ }
  try { localStorage.setItem(DATA_LAYERS_MIGRATION_KEY, DATA_LAYERS_MIGRATION_VERSION) } catch { /* ignore */ }
  return { ...DEFAULT_DATA_LAYERS }
}

function persistDataLayers(layers) {
  try {
    localStorage.setItem(STORAGE_KEY_DATA_LAYERS, JSON.stringify(layers))
  } catch { /* ignore */ }
}

function loadBoolPref(key, fallback = false) {
  try {
    const v = localStorage.getItem(key)
    if (v === 'true') return true
    if (v === 'false') return false
  } catch { /* ignore */ }
  return fallback
}

function persistBoolPref(key, value) {
  try {
    localStorage.setItem(key, String(value))
  } catch { /* ignore */ }
}

function migrateSources(raw) {
  if (!Array.isArray(raw)) return DEFAULT_SOURCES
  if (raw.length === 0) return DEFAULT_SOURCES

  if (typeof raw[0] === 'string') {
    const lookup = Object.fromEntries(NEWS_SOURCES.map((s) => [s.id, s.name]))
    return raw.map((id) => ({
      id,
      name: lookup[id] || id,
      type: 'source',
    }))
  }

  if (raw[0] && typeof raw[0] === 'object' && raw[0].id) return raw

  return DEFAULT_SOURCES
}

function loadSources() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY_SOURCES)
    if (!stored) return DEFAULT_SOURCES
    return migrateSources(JSON.parse(stored))
  } catch {
    return DEFAULT_SOURCES
  }
}

function loadOnboarded() {
  return localStorage.getItem(STORAGE_KEY_ONBOARDED) === 'true'
}

// Load persisted quality state
const savedQuality = loadQualitySettings()

const DEFAULT_DIMENSIONS = ['safety', 'governance', 'economy', 'people', 'environment', 'narrative']
function loadActiveDimensions() {
  try {
    const params = new URLSearchParams(window.location.search)
    if (params.has('dim')) {
      const parsed = params.get('dim').split(',').filter(d => DEFAULT_DIMENSIONS.includes(d))
      if (parsed.length > 0) return new Set(parsed)
    }
    const legacy = localStorage.getItem('atlas_active_dimensions')
    if (legacy) {
      localStorage.removeItem('atlas_active_dimensions')
      const legacyMap = {
        'conflict': 'safety', 'cyber': 'narrative', 'natural': 'environment',
        'humanitarian': 'people', 'economic': 'economy', 'signals': 'narrative', 'hazard': 'environment'
      }
      const parsed = JSON.parse(legacy)
      const migrated = Array.isArray(parsed) ? parsed.map(d => legacyMap[d] || d) : DEFAULT_DIMENSIONS
      localStorage.setItem('atlas_active_dimensions', JSON.stringify(migrated))
      return new Set(migrated)
    }
    const current = localStorage.getItem('atlas_active_dimensions')
    if (current) return new Set(JSON.parse(current))
  } catch { /* ignore */ }
  return new Set(DEFAULT_DIMENSIONS)
}

function loadFilters() {
  const params = new URLSearchParams(window.location.search)
  // Legacy `p1` default hid GDELT (p2/p3). Without a URL override, always
  // treat stored `p1` as `all` and persist so Supabase round-trips don't revive it.
  const urlPri = params.get('pri')
  let priority = urlPri || localStorage.getItem('atlas_priority_filter') || 'all'
  if (!urlPri && priority === 'p1') {
    priority = 'all'
    try {
      localStorage.setItem('atlas_priority_filter', 'all')
    } catch { /* ignore */ }
  }
  return {
    priority,
    time: params.get('time') || localStorage.getItem('atlas_time_filter') || 'live'
  }
}

const filters = loadFilters()

export const useAtlasStore = create((set, get) => ({
  newsItems: [],
  activeCategories: new Set(CATEGORY_KEYS),
  selectedMarker: null,
  hoveredMarker: null,
  activeRegion: 'global',
  isLoading: false,
  lastUpdated: null,
  zoomLevel: 1,
  selectedSources: loadSources(),
  hasCompletedOnboarding: loadOnboarded(),
  /** Marketing / explainer screen — not persisted; every fresh load starts here until dismissed */
  landingAcknowledged: false,
  sourceCatalog: [],
  streetViewLocation: null,
  isStreetViewOpen: false,
  /** { videoId, title, url, isLive } | null — when set, YouTube embed overlay is shown */
  youtubeEmbed: null,

  manualRefreshUsedToday: false,
  triggerManualRefresh: null,
  launchTransitionActive: false,
  /** Skip the next globe intro fly-in (used after transition / dev) */
  skipCesiumIntro: false,
  // ── EventBus / Intel Events ──
  events: [],
  eventMap: {},
  priorityCounts: { p1: 0, p2: 0, p3: 0 },
  selectedEvent: null,
  /** `{ query, label?, dimension? }` — GDELT DOC analytics HUD; null when closed */
  gdeltAnalytics: null,
  sourceStatuses: {},
  eventBusReady: false,
  /** GDELT GEO overlay bootstrap — heatmap / choropleth mesh readiness */
  gdeltGeoBootstrap: {
    loading: false,
    heatmapReady: false,
    choroplethReady: false,
    error: null,
  },
  priorityFilter: filters.priority,
  timeFilter: filters.time,
  activeDimensions: loadActiveDimensions(),
  focusedEventId: null,
  anomalies: [],
  colorblindMode: localStorage.getItem('atlas_colorblind') === 'true',
  mobileMode: false,
  lowBandwidthMode: false,

  // ── Data Layers (globe visualization toggles) ──
  dataLayers: loadDataLayers(),

  // ── Phase 1 — tactical visual modes ──
  /** Desaturate + grain + green tint on globe canvas */
  tacticalMode: loadBoolPref(STORAGE_KEY_TACTICAL_MODE, false),
  /** Reticle rings + target ID labels on markers */
  detectionMode: loadBoolPref(STORAGE_KEY_DETECTION_MODE, false),
  /** 'sparse' | 'dense' — detection label density */
  detectionLabelDensity: localStorage.getItem(STORAGE_KEY_DETECTION_LABELS) || 'sparse',

  // ── Auth / User ──
  user: null,
  /** 'auth' | 'sources' — tracks which sub-step of onboarding the user is on */
  onboardingStep: 'auth',

  // ── Phase 5 — shareable URL / watchlists / toasts ──
  /** Camera snapshot encoded in share URLs */
  shareCamera: null,
  /** Event id from ?evt= applied once eventMap has the row */
  pendingUrlEventId: null,
  /** Supabase watchlist rows for signed-in users */
  watchlists: [],
  /** In-app toast queue (watchlist hits, share copy, etc.) */
  toasts: [],

  // ── UI State ──
  settingsOpen: false,

  // ── Quality & Globe Renderer ──
  /** 'cesium' | 'globegl' | 'leaflet' */
  globeMode: loadGlobeMode(),
  /** 'auto' | 'high' | 'medium' | 'low' */
  qualityTier: savedQuality?.tier || savedQuality?.priority || 'auto',
  /** Resolved priority after auto-detection: 'high' | 'medium' | 'low' */
  resolvedTier: savedQuality?.resolved || 'high',
  /** Per-setting overrides (user toggled individual settings) */
  qualityOverrides: savedQuality?.overrides || {},

  setNewsItems: (items) => set({ newsItems: items, lastUpdated: new Date(), isLoading: false }),
  setManualRefreshUsedToday: (used) => set({ manualRefreshUsedToday: used }),
  setTriggerManualRefresh: (fn) => set({ triggerManualRefresh: fn }),

  toggleCategory: (cat) => set((state) => {
    const next = new Set(state.activeCategories)
    if (next.has(cat)) next.delete(cat)
    else next.add(cat)
    return { activeCategories: next }
  }),

  setAllCategories: (cats) => set({ activeCategories: new Set(cats) }),

  setSelectedMarker: (marker) => set({ selectedMarker: marker }),
  setHoveredMarker: (marker) => set({ hoveredMarker: marker }),
  setActiveRegion: (region) => set({ activeRegion: region }),
  setZoomLevel: (level) => set({ zoomLevel: level }),
  setIsLoading: (loading) => set({ isLoading: loading }),

  setSourceCatalog: (catalog) => set({ sourceCatalog: catalog }),

  setSelectedSources: (sources) => {
    localStorage.setItem(STORAGE_KEY_SOURCES, JSON.stringify(sources))
    set({ selectedSources: sources })
  },

  addSource: (source) => {
    const current = get().selectedSources
    if (current.some((s) => s.id === source.id)) return
    const next = [...current, source]
    localStorage.setItem(STORAGE_KEY_SOURCES, JSON.stringify(next))
    set({ selectedSources: next })
  },

  removeSource: (sourceId) => {
    const next = get().selectedSources.filter((s) => s.id !== sourceId)
    localStorage.setItem(STORAGE_KEY_SOURCES, JSON.stringify(next))
    set({ selectedSources: next })
  },

  completeOnboarding: () => {
    localStorage.setItem(STORAGE_KEY_ONBOARDED, 'true')
    set({ hasCompletedOnboarding: true })
  },

  acknowledgeLanding: () => set({ landingAcknowledged: true }),

  reopenLanding: () => {
    try {
      localStorage.removeItem(STORAGE_KEY_LANDING)
    } catch {
      /* ignore */
    }
    set({ landingAcknowledged: false })
  },

  startLaunchTransition: () => set({ launchTransitionActive: true }),
  endLaunchTransition: () => set({ launchTransitionActive: false }),
  setSkipCesiumIntro: (v) => set({ skipCesiumIntro: v }),

  reopenOnboarding: () => {
    set({ hasCompletedOnboarding: false })
    localStorage.removeItem(STORAGE_KEY_ONBOARDED)
  },

  onResetView: null,
  setOnResetView: (fn) => set({ onResetView: fn }),
  resetView: () => {
    const fn = get().onResetView
    if (fn) fn()
  },

  /**
   * Header place-search result. Rendered by the active globe as a
   * highlight ring around the viewport bbox (when provided) or around
   * a short auto-sized radius otherwise. `null` = nothing highlighted.
   * Shape: { lat, lng, label, viewport?: { north,east,south,west }, createdAt }
   */
  searchHighlight: null,
  setSearchHighlight: (highlight) => set({ searchHighlight: highlight }),
  clearSearchHighlight: () => set({ searchHighlight: null }),

  /**
   * Each globe renderer registers a fly-to handler on mount so the
   * header search bar can focus the camera on a selected place
   * without importing globe internals. Mirrors the `onResetView`
   * bridge pattern.
   */
  onFlyToLocation: null,
  setOnFlyToLocation: (fn) => set({ onFlyToLocation: fn }),
  flyToLocation: (target) => {
    const fn = get().onFlyToLocation
    if (fn && target) fn(target)
  },

  openStreetView: ({ lat, lng, source = 'globe', meta = null }) =>
    set(() => ({
      streetViewLocation: { lat, lng, source, meta },
      isStreetViewOpen: true,
      youtubeEmbed: null,
    })),
  closeStreetView: () => set(() => ({ isStreetViewOpen: false })),

  openYouTubeEmbed: ({ videoId, title = '', url = '', isLive = false }) =>
    set(() => ({
      youtubeEmbed: { videoId, title, url, isLive },
      isStreetViewOpen: false,
    })),
  closeYouTubeEmbed: () => set({ youtubeEmbed: null }),

  /** Phase 6 — on-demand Sentinel-2 scene overlay (Copernicus STAC, $0) */
  sentinel2Scene: null,
  setSentinel2Scene: (scene) => set({ sentinel2Scene: scene }),
  clearSentinel2Scene: () => set({ sentinel2Scene: null }),

  // ── Quality & Globe Mode Setters ──
  setGlobeMode: (mode) => {
    saveGlobeMode(mode)
    set({ globeMode: mode })
  },

  setQualityTier: (priority) => {
    const state = get()
    const resolved = priority === 'auto' ? state.resolvedTier : priority
    saveQualitySettings({ priority, resolved, overrides: state.qualityOverrides })
    set({ qualityTier: priority, resolvedTier: resolved })
  },

  setResolvedPriority: (resolved) => {
    const state = get()
    saveQualitySettings({ tier: state.qualityTier, resolved, overrides: state.qualityOverrides })
    set({ resolvedTier: resolved })
  },

  setQualityOverride: (key, value) => {
    const state = get()
    const overrides = { ...state.qualityOverrides, [key]: value }
    saveQualitySettings({ tier: state.qualityTier, resolved: state.resolvedTier, overrides })
    set({ qualityOverrides: overrides })
  },

  clearQualityOverrides: () => {
    const state = get()
    saveQualitySettings({ tier: state.qualityTier, resolved: state.resolvedTier, overrides: {} })
    set({ qualityOverrides: {} })
  },

  toggleSettings: () => set((s) => ({ settingsOpen: !s.settingsOpen })),
  setSettingsOpen: (v) => set({ settingsOpen: v }),

  setShareCamera: (camera) => set({ shareCamera: camera }),
  setPendingUrlEventId: (id) => set({ pendingUrlEventId: id }),
  setWatchlists: (items) => set({ watchlists: items || [] }),

  pushToast: ({ label, message, onClick, durationMs }) => set((s) => ({
    toasts: [
      ...s.toasts,
      {
        id: crypto.randomUUID(),
        label: label || 'ATLAS',
        message: message || '',
        onClick,
        durationMs,
      },
    ].slice(-5),
  })),
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

  getEffectiveSetting: (key) => {
    const state = get()
    if (key in state.qualityOverrides) return state.qualityOverrides[key]
    const priority = QUALITY_TIERS[state.resolvedTier] || QUALITY_TIERS.high
    return typeof priority[key] === 'function' ? priority[key]() : priority[key]
  },

  // ── EventBus Actions ──
  _eventBusUnsub: null,
  _sourceStatusUnsub: null,

  initEventBusSystem: () => {
    const state = get()
    if (state.eventBusReady) return

    initEventBus()

    const unsub = subscribeToBatchUpdates((diff) => {
      // #region agent log
      try { fetch('http://127.0.0.1:7897/ingest/4068bc9a-6323-4a56-a79a-75d6b868c769',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'894d50'},body:JSON.stringify({sessionId:'894d50',location:'atlasStore.js:batchUpdate',message:'L4 store batch update',data:{snapshot:diff.snapshot?diff.snapshot.length:null,added:diff.added?diff.added.length:0,updated:diff.updated?diff.updated.length:0,removed:diff.removed?diff.removed.length:0},hypothesisId:'H3',timestamp:Date.now()})}).catch(()=>{}) } catch(e){}
      // #endregion
      set((s) => {
        if (diff.snapshot) {
          const map = {}
          for (const e of diff.snapshot) map[e.id] = e
          return { events: diff.snapshot, eventMap: map }
        }

        const nextEvents = [...s.events]
        const nextMap = { ...s.eventMap }

        if (diff.added) {
          for (const e of diff.added) {
            if (!nextMap[e.id]) {
              nextEvents.push(e)
              nextMap[e.id] = e
            }
          }
        }

        if (diff.updated) {
          for (const e of diff.updated) {
            nextMap[e.id] = e
            const idx = nextEvents.findIndex(x => x.id === e.id)
            if (idx !== -1) nextEvents[idx] = e
          }
        }

        if (diff.removed) {
          for (const id of diff.removed) {
            delete nextMap[id]
          }
          const removeSet = new Set(diff.removed)
          const filtered = nextEvents.filter(e => !removeSet.has(e.id))

          const counts = { p3: 0, p2: 0, p1: 0 }
          for (const e of filtered) {
            const pri = e.priority || e.priority || 'p3'
            if (counts[pri] !== undefined) counts[pri]++
          }
          return { events: filtered, eventMap: nextMap, priorityCounts: counts }
        }

        const counts = { p3: 0, p2: 0, p1: 0 }
        for (const e of nextEvents) {
          const pri = e.priority || e.priority || 'p3'
          if (counts[pri] !== undefined) counts[pri]++
        }

        const anomalyUpdates = diff.anomalies?.length > 0
          ? { anomalies: [...s.anomalies, ...diff.anomalies].slice(-100) }
          : {}

        return { events: nextEvents, eventMap: nextMap, priorityCounts: counts, ...anomalyUpdates }
      })
    })

    const sourceUnsub = subscribeToSourceStatus((statuses) => {
      set({ sourceStatuses: statuses })
    })

    set({ eventBusReady: true, _eventBusUnsub: unsub, _sourceStatusUnsub: sourceUnsub })

    startFetching()
  },

  destroyEventBusSystem: () => {
    const state = get()
    if (state._eventBusUnsub) state._eventBusUnsub()
    if (state._sourceStatusUnsub) state._sourceStatusUnsub()
    stopFetching()
    destroyEventBus()
    set({
      eventBusReady: false,
      events: [],
      eventMap: {},
      priorityCounts: { p1: 0, p2: 0, p3: 0 },
      sourceStatuses: {},
    })
  },

  setSelectedEvent: (event) => set({ selectedEvent: event }),

  openGdeltAnalytics: (payload) => {
    if (!payload || typeof payload.query !== 'string' || !payload.query.trim()) return
    set({
      gdeltAnalytics: {
        query: payload.query.trim(),
        label: payload.label || '',
        dimension: payload.dimension || 'narrative',
      },
    })
  },
  closeGdeltAnalytics: () => set({ gdeltAnalytics: null }),
  setPriorityFilter: (v) => {
    localStorage.setItem('atlas_priority_filter', v)
    set({ priorityFilter: v })
  },
  setTimeFilter: (v) => {
    localStorage.setItem('atlas_time_filter', v)
    set({ timeFilter: v })
  },
  setFocusedEventId: (id) => set({ focusedEventId: id }),
  clearFocus: () => set({ focusedEventId: null }),

  toggleDimension: (dimension) => set((s) => {
    const next = new Set(s.activeDimensions)
    if (next.has(dimension)) next.delete(dimension)
    else next.add(dimension)
    return { activeDimensions: next }
  }),

  toggleColorblindMode: () => set((s) => {
    const next = !s.colorblindMode
    localStorage.setItem('atlas_colorblind', String(next))
    document.body.setAttribute('data-colorblind', String(next))
    return { colorblindMode: next }
  }),

  setMobileMode: (v) => set({ mobileMode: v }),
  setLowBandwidthMode: (v) => set({ lowBandwidthMode: v }),

  // ── Data Layer Toggles ──
  toggleDataLayer: (layerId) => {
    const current = get().dataLayers
    const next = { ...current, [layerId]: !current[layerId] }
    if (GIBS_IMAGERY_EXCLUSIVE_KEYS.includes(layerId) && next[layerId]) {
      for (const k of GIBS_IMAGERY_EXCLUSIVE_KEYS) {
        if (k !== layerId) next[k] = false
      }
    }
    persistDataLayers(next)
    set({ dataLayers: next })
  },
  setDataLayer: (layerId, enabled) => {
    const current = get().dataLayers
    const next = { ...current, [layerId]: enabled }
    persistDataLayers(next)
    set({ dataLayers: next })
  },

  setGdeltGeoBootstrap: (partial) =>
    set((s) => ({
      gdeltGeoBootstrap: { ...s.gdeltGeoBootstrap, ...partial },
    })),

  toggleTacticalMode: () => set((s) => {
    const next = !s.tacticalMode
    persistBoolPref(STORAGE_KEY_TACTICAL_MODE, next)
    return { tacticalMode: next }
  }),

  toggleDetectionMode: () => set((s) => {
    const next = !s.detectionMode
    persistBoolPref(STORAGE_KEY_DETECTION_MODE, next)
    return { detectionMode: next }
  }),

  setDetectionLabelDensity: (density) => {
    const mode = density === 'dense' ? 'dense' : 'sparse'
    try { localStorage.setItem(STORAGE_KEY_DETECTION_LABELS, mode) } catch { /* ignore */ }
    set({ detectionLabelDensity: mode })
  },

  // ── Auth Actions ──
  setUser: (user) => set({ user }),
  setOnboardingStep: (step) => set({ onboardingStep: step }),

  signOut: async () => {
    if (supabase) await supabase.auth.signOut()
    set({ user: null })
  },
}))
