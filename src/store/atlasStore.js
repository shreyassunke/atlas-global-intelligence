import { create } from 'zustand'
import { DEFAULT_SOURCES, NEWS_SOURCES } from '../utils/newsSources'
import { CATEGORY_KEYS } from '../utils/categoryColors'
import { loadQualitySettings, saveQualitySettings, loadGlobeMode, saveGlobeMode, QUALITY_TIERS } from '../config/qualityTiers'
import {
  initEventBus,
  startFetching,
  stopFetching,
  reconcileLayerSources,
  subscribeToBatchUpdates,
  subscribeToSourceStatus,
  subscribeToGdeltAggregates,
  destroyEventBus,
} from '../core/eventBus'
import { isLayerToggleOn } from '../core/layerCatalog'
import { supabase } from '../services/supabase'
const STORAGE_KEY_SOURCES = 'atlas_selected_sources'
const STORAGE_KEY_ONBOARDED = 'atlas_onboarded'
const STORAGE_KEY_DATA_LAYERS = 'atlas_data_layers'
const STORAGE_KEY_TACTICAL_MODE = 'atlas_tactical_mode'
const STORAGE_KEY_DETECTION_MODE = 'atlas_detection_mode'
const STORAGE_KEY_DETECTION_LABELS = 'atlas_detection_labels'
/** Legacy key — cleared on reopen so returning users see the landing page first again */
const STORAGE_KEY_LANDING = 'atlas_landing_ack_v1'
/** Phase 4 — when the analyst last opened the Triage tab (ms epoch) */
const STORAGE_KEY_TRIAGE_SEEN = 'atlas_triage_seen_at'

const DEFAULT_DATA_LAYERS = {
  // ── event layers (pins) ──
  gdeltSignals: true,    // High-confidence GDELT CAMEO pins (numSources/severity gated)
  firms: true,           // NASA FIRMS active fires
  usgs: true,            // USGS earthquakes
  gdacs: true,           // GDACS disasters
  eonet: true,           // NASA EONET natural events
  nhcStorms: false,      // NOAA NHC active cyclone tracks + cone-of-error
  // ── field layers (aggregate surfaces) ──
  gdeltChoropleth: true, // GDELT per-country tone choropleth — the default monitor surface
  gdeltHeatmap: false,   // GDELT GEO PointHeatmap (noisy ghost dots; opt-in)
  windOverlay: false,    // Open-Meteo wind particles (Globe.GL only)
  // ── track layers (ambient live) ──
  adsb: false,           // OpenSky ADS-B aircraft — ambient eye candy, opt-in (Phase 6 audit)
  adsbMilitary: true,    // Military ICAO hex sub-filter (distinct sprite; applies when adsb is on)
  satellites: false,     // CelesTrak TLE-propagated satellites
  ais: false,            // AISStream.io vessels at chokepoints (requires AISSTREAM_API_KEY server-side)
  // ── basemap layers (imagery/context) ──
  gibsTrueColor: false,  // NASA GIBS MODIS true-color WMTS (2D Map + Globe.GL)
  gibsFires: false,      // MODIS 7-2-1 fire-sensitive false color
  gibsAerosol: false,    // MODIS Terra aerosol
  gibsDust: false,       // AIRS L2 dust score (day)
  gibsClouds: false,     // MODIS Aqua cloud fraction (day)
  gibsBlackMarble: false,// Enhance night-side city lights (Globe.GL)
  terminator: true,      // Day/night terminator line
}

/**
 * One-time migration key: bumped whenever a data-layer default flips
 * so existing users converge on the new defaults after pull/reload.
 */
const DATA_LAYERS_MIGRATION_KEY = 'atlas_data_layers_migration'
const DATA_LAYERS_MIGRATION_VERSION = 'v6'
const GIBS_IMAGERY_EXCLUSIVE_KEYS = ['gibsTrueColor', 'gibsFires', 'gibsAerosol', 'gibsDust', 'gibsClouds']

function loadDataLayers() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_DATA_LAYERS)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const { labels: _legacyLabels, ...rest } = parsed
        if (localStorage.getItem(DATA_LAYERS_MIGRATION_KEY) !== DATA_LAYERS_MIGRATION_VERSION) {
          // v5: gdelt split into gdeltSignals/gdeltChoropleth/gdeltHeatmap;
          // bluesky/factCheck demoted off the globe; choropleth promoted ON.
          if (rest.gdelt !== undefined) {
            rest.gdeltSignals = rest.gdelt
            delete rest.gdelt
          }
          rest.gdeltChoropleth = true
          if (rest.gdeltHeatmap === true) rest.gdeltHeatmap = false
          delete rest.bluesky
          delete rest.factCheck
          if (rest.terminator === undefined) rest.terminator = true
          // v6 (Phase 6 defaults audit): adsb demoted to opt-in — ambient
          // track noise off the default monitor surface.
          rest.adsb = false
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

function loadTriageSeenAt() {
  try {
    const v = Number(localStorage.getItem(STORAGE_KEY_TRIAGE_SEEN))
    if (Number.isFinite(v) && v > 0) return v
  } catch { /* ignore */ }
  return 0
}

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
  /**
   * Phase 1b — per-country CAMEO aggregates reduced in-worker from the full
   * 15-min export. `{ byFips: { [FIPS_10]: { events, avgTone, avgGoldstein, quad } }, exportTsMs, totalRows, updatedAt } | null`.
   * Drives the choropleth directly (no GEO API) and the Triage surge baseline.
   */
  gdeltCountryAggregates: null,
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
  /** Per-layer reveal timestamp for fade-in on enable (ms epoch). */
  layerRevealAt: {},

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

  // ── Phase 3 — UI shell: region model + panel coordinator ──
  /**
   * Single source of truth for the two work rails:
   *   inspector — left rail, one slot: { type: 'event'|'news'|'place', payload } | null
   *   workbench — right rail, tabbed: 'triage'|'dossier'|'analytics'|'layers'|'settings' | null
   * Opening one inspector content replaces the previous; Escape closes top-most
   * (modal → workbench → inspector) via closeTopPanel().
   */
  ui: { inspector: null, workbench: null },

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

  setSelectedMarker: (marker) => set((s) => marker
    ? {
        selectedMarker: marker,
        selectedEvent: null,
        ui: { ...s.ui, inspector: { type: 'news', payload: marker } },
      }
    : {
        selectedMarker: null,
        ui: s.ui.inspector?.type === 'news' ? { ...s.ui, inspector: null } : s.ui,
      }),
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
  setSearchHighlight: (highlight) => set((s) => highlight
    ? {
        searchHighlight: highlight,
        ui: { ...s.ui, inspector: { type: 'place', payload: highlight } },
      }
    : {
        searchHighlight: null,
        ui: s.ui.inspector?.type === 'place' ? { ...s.ui, inspector: null } : s.ui,
      }),
  clearSearchHighlight: () => set((s) => ({
    searchHighlight: null,
    ui: s.ui.inspector?.type === 'place' ? { ...s.ui, inspector: null } : s.ui,
  })),

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

  // ── Phase 5 — Dossier (place/topic investigation) ──
  /**
   * Country under investigation in the Workbench Dossier tab.
   * `{ fips, iso, name, lat, lng } | null` — fips is GDELT/Natural Earth
   * FIPS 10-4 (joins to gdeltCountryAggregates + BigQuery templates).
   */
  dossier: null,
  /** Open the Dossier tab focused on a country (any entry point). */
  openDossier: (target) => {
    if (!target || (!target.fips && !target.name)) return
    set((s) => ({
      dossier: {
        fips: target.fips || '',
        iso: target.iso || '',
        name: target.name || target.iso || target.fips,
        lat: Number.isFinite(target.lat) ? target.lat : null,
        lng: Number.isFinite(target.lng) ? target.lng : null,
      },
      ui: { ...s.ui, workbench: 'dossier' },
    }))
  },
  clearDossier: () => set({ dossier: null }),

  // ── Panel coordinator actions ──
  openWorkbench: (tab) => set((s) => ({ ui: { ...s.ui, workbench: tab } })),
  closeWorkbench: () => set((s) => ({ ui: { ...s.ui, workbench: null } })),
  toggleWorkbench: (tab) => set((s) => ({
    ui: { ...s.ui, workbench: s.ui.workbench === tab ? null : tab },
  })),

  closeInspector: () => set((s) => {
    const type = s.ui.inspector?.type
    return {
      ui: { ...s.ui, inspector: null },
      ...(type === 'event' ? { selectedEvent: null } : {}),
      ...(type === 'news' ? { selectedMarker: null } : {}),
      ...(type === 'place' ? { searchHighlight: null } : {}),
    }
  }),

  /**
   * Escape handler — closes the top-most open layer only.
   * Order: modal (YouTube / Street View) → workbench → inspector.
   * Returns true when something was closed.
   */
  closeTopPanel: () => {
    const s = get()
    if (s.youtubeEmbed) {
      set({ youtubeEmbed: null })
      return true
    }
    if (s.isStreetViewOpen) {
      set({ isStreetViewOpen: false })
      return true
    }
    if (s.ui.workbench) {
      s.closeWorkbench()
      return true
    }
    if (s.ui.inspector) {
      s.closeInspector()
      return true
    }
    return false
  },

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
  _gdeltAggregatesUnsub: null,

  initEventBusSystem: () => {
    const state = get()
    if (state.eventBusReady) return

    initEventBus()

    const unsub = subscribeToBatchUpdates((diff) => {
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

    const aggUnsub = subscribeToGdeltAggregates((agg) => {
      set({ gdeltCountryAggregates: { ...agg, updatedAt: Date.now() } })
    })

    set({
      eventBusReady: true,
      _eventBusUnsub: unsub,
      _sourceStatusUnsub: sourceUnsub,
      _gdeltAggregatesUnsub: aggUnsub,
    })

    startFetching(undefined, get().dataLayers)
  },

  destroyEventBusSystem: () => {
    const state = get()
    if (state._eventBusUnsub) state._eventBusUnsub()
    if (state._sourceStatusUnsub) state._sourceStatusUnsub()
    if (state._gdeltAggregatesUnsub) state._gdeltAggregatesUnsub()
    stopFetching()
    destroyEventBus()
    set({
      eventBusReady: false,
      events: [],
      eventMap: {},
      priorityCounts: { p1: 0, p2: 0, p3: 0 },
      sourceStatuses: {},
      gdeltCountryAggregates: null,
    })
  },

  setSelectedEvent: (event) => set((s) => event
    ? {
        selectedEvent: event,
        selectedMarker: null,
        ui: { ...s.ui, inspector: { type: 'event', payload: event } },
      }
    : {
        selectedEvent: null,
        ui: s.ui.inspector?.type === 'event' ? { ...s.ui, inspector: null } : s.ui,
      }),

  openGdeltAnalytics: (payload) => {
    if (!payload || typeof payload.query !== 'string' || !payload.query.trim()) return
    set((s) => ({
      gdeltAnalytics: {
        query: payload.query.trim(),
        label: payload.label || '',
        dimension: payload.dimension || 'narrative',
      },
      ui: { ...s.ui, workbench: 'analytics' },
    }))
  },
  closeGdeltAnalytics: () => set((s) => ({
    gdeltAnalytics: null,
    ui: s.ui.workbench === 'analytics' ? { ...s.ui, workbench: null } : s.ui,
  })),
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

  // ── Phase 4 — Triage feed ──
  /** Watchlist-country surge alerts from `useSurgeAlerts` (eventSurge z-scores) */
  surgeAlerts: [],
  setSurgeAlerts: (alerts) => set({ surgeAlerts: alerts || [] }),
  /** Last time the Triage tab was viewed — drives "new since you looked" */
  triageLastSeenAt: loadTriageSeenAt(),
  markTriageSeen: () => {
    const now = Date.now()
    try { localStorage.setItem(STORAGE_KEY_TRIAGE_SEEN, String(now)) } catch { /* ignore */ }
    set({ triageLastSeenAt: now })
  },

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
    const state = get()
    const current = state.dataLayers
    const enabling = !isLayerToggleOn(layerId, current)
    const next = { ...current, [layerId]: enabling }
    if (GIBS_IMAGERY_EXCLUSIVE_KEYS.includes(layerId) && next[layerId]) {
      for (const k of GIBS_IMAGERY_EXCLUSIVE_KEYS) {
        if (k !== layerId) next[k] = false
      }
    }
    const layerRevealAt = { ...state.layerRevealAt }
    if (enabling) layerRevealAt[layerId] = Date.now()
    persistDataLayers(next)
    set({ dataLayers: next, layerRevealAt })
    if (state.eventBusReady) reconcileLayerSources(next)
  },
  setDataLayer: (layerId, enabled) => {
    const state = get()
    const next = { ...state.dataLayers, [layerId]: enabled }
    const layerRevealAt = { ...state.layerRevealAt }
    if (enabled) layerRevealAt[layerId] = Date.now()
    persistDataLayers(next)
    set({ dataLayers: next, layerRevealAt })
    if (state.eventBusReady) reconcileLayerSources(next)
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
