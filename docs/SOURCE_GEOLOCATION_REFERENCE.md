# Source Geolocation Reference

> **Purpose:** Decide which ingested feeds are safe to plot as globe pins vs. ticker/dock-only.
> Use this when adding sources, toggling layers, or reviewing pin credibility.

**Related code**

| Concern | File |
|---------|------|
| `latApproximate` flag on events | `src/workers/fetchManager.worker.js` → `makeEvent()` |
| Globe pin eligibility | `src/core/sourceGeolocation.js` → `isGlobeStaticPinCandidate()`, `eventSourceToGlobeDataLayerKey()` |
| Ticker feed routing | `src/core/sourceGeolocation.js` → `isTickerFeedEvent()` |
| Globe marker filter | `src/globe-core/useGlobeLayerEvents.js` |
| Source catalog | `src/core/sourceRegistry.js` → `SOURCE_CATALOG` |
| UI: `≈` prefix + Street View gate | `src/components/Inspector/EventContent.jsx` |

---

## How geolocation is represented

Every normalized event carries:

- **`lat` / `lng`** — coordinates used for map placement
- **`latApproximate`** — `false` = treat as event-native geo; `true` = placeholder or centroid
- **`locationName`** — optional human label (CAMEO ActionGeo name, Bluesky place, etc.)

**UI behavior**

- `latApproximate: true` → coordinates shown with a `≈` prefix; Street View is hidden
- `latApproximate: false` → exact coords; Street View offered when lat/lng are valid

**Globe filter (additional rules)**

Pins are dropped when:

1. `latApproximate === true` (placeholder or country centroid)
2. `lat === 0 && lng === 0` with no tactical track
3. Source is not in `GLOBE_LAYER_BY_SOURCE_ID` (`sourceGeolocation.js`)
4. Matching data layer is disabled, dimension filtered out, or outside time/priority window

Tactical track events (`trackKind`: `aircraft`, `satellite`, `vessel`, `storm`) use dedicated motion layers instead of static pin logic.

---

## Precision tiers

| Tier | Meaning | Globe pin? |
|------|---------|------------|
| **A — Pinpoint** | Sub-km to low-km accuracy from instrument or telemetry (epicenter, fire pixel, ADS-B, AIS, storm center) | ✅ Yes |
| **B — Event geocoded** | Real lat/lng tied to the incident, but resolution varies (city, ADM1, or country depending on upstream) | ✅ Yes (with caveats) |
| **C — Anchor / centroid** | Correct coords for a *reference point* (city weather anchor, publisher HQ, country centroid) — not where the story happened | ❌ No (ticker/dock) |
| **D — No geo** | Missing, zeroed, or purely symbolic placement | ❌ No |

---

## Source inventory

### Tier A — Pinpoint (plot on globe)

| Source ID | Display name | Coordinate origin | `latApproximate` | Plots on globe? | Notes |
|-----------|--------------|-------------------|------------------|-----------------|-------|
| `usgs` | USGS Earthquakes | GeoJSON epicenter + depth | `false` | ✅ `usgs` layer | Authoritative seismic |
| `gdacs` | GDACS Disasters | RSS `<geo:lat>` / `<geo:long>` | `false` | ✅ `gdacs` layer | Authoritative disaster alerts |
| `eonet` | NASA EONET | Event geometry coordinates | `false` | ✅ `eonet` layer | Open natural events |
| `firms` | NASA FIRMS | Satellite fire detection lat/lng | `false` | ✅ `firms` layer | Requires `FIRMS_KEY` |
| `opensky` | OpenSky ADS-B | Live aircraft position | `false` | ✅ `adsb` layer | Tactical track, not static pin |
| `aisstream` | AISStream Vessels | Live vessel position | `false` | ✅ `ais` layer | Requires AISStream key; tactical track |
| `cameras` | Live Cameras | Public webcam / CCTV pin | `false` | ✅ `cameras` layer | Windy (keyed) + TfL + Caltrans via `/api/cameras` |
| `noaa-nhc` | NOAA NHC Hurricanes | Storm center + track/cone | `false` | ✅ `nhcStorms` layer | Tactical storm track |
| `safecast` | Safecast | Radiation sensor lat/lng | `false` | ❌ Not mapped | Precise but ticker-only today |

### Tier B — Event geocoded (plot on globe, verify resolution)

| Source ID | Display name | Coordinate origin | `latApproximate` | Plots on globe? | Notes |
|-----------|--------------|-------------------|------------------|-----------------|-------|
| `gdelt-cameo` | GDELT CAMEO | `ActionGeo_Lat` / `ActionGeo_Long` from 15-min Events export | `false` | ✅ `gdeltSignals` layer | Only high-confidence rows pin. GDELT `ActionGeo_Type` can be country-, state-, or city-level — Atlas does not yet downgrade country-level rows |
| `ucdp` | UCDP Conflict | API `latitude` / `longitude` | `false` | ✅ `conflictEvents` layer | Post-hoc conflict events |
| `acled` | ACLED Conflict Events | API `latitude` / `longitude` | `false` | ✅ `conflictEvents` layer | Requires `ACLED_KEY` + `ACLED_EMAIL` |
| `open-meteo` | Open-Meteo | Fixed city anchor when extreme wind triggers | `false` | ❌ Not mapped | Geo is accurate for the 15 polled cities, not for a free-form incident |
| `shodan` | Shodan | IP geolocation when present | `false` if geo exists | ❌ Not mapped | `latApproximate: true` when `location.latitude` missing |
| `celestrak-tle` | CelesTrak Satellites | TLE propagation (event stores `0,0`) | `false` | ✅ `satellites` layer | Position computed at render time from orbital elements |
| `gdelt-events` | GDELT Events (GEO API) | Pre-geolocated GeoJSON | `false` | ❌ **Disabled** | Endpoint returns 404; re-enable when GDELT restores GEO API |

### Tier C — Approximate / placeholder (do **not** plot on globe)

| Source ID | Display name | What coords represent | `latApproximate` | Plots on globe? |
|-----------|--------------|----------------------|------------------|-----------------|
| `gdelt` | GDELT DOC | Country centroid from `sourcecountry` | `true` | ❌ Ticker/feed only |
| `gdelt-vgkg` | GDELT Visual GKG | Country centroid | `true` | ❌ Ticker/feed only |
| `reliefweb` | ReliefWeb | Primary country centroid from API | `true` | ❌ |
| `bluesky` | Bluesky | Geocoded from location name (always approximate) | `true` | ❌ |
| `fact-check` | Google Fact Check | Publisher/claim geo (defaults approximate) | usually `true` | ❌ |
| `coingecko` | CoinGecko | NYC placeholder | `true` | ❌ |
| `alt-fng` | Fear & Greed Index | NYC placeholder | `true` | ❌ |
| `finnhub` | Finnhub | NYC placeholder | `true` | ❌ |
| `fred` | FRED | St. Louis placeholder | `true` | ❌ |
| `eia` | EIA | Houston placeholder | `true` | ❌ |
| `cisa-kev` | CISA KEV | Washington DC placeholder | `true` | ❌ |
| `who-don` | WHO News | Geneva HQ | `true` | ❌ |
| `promed` | ProMED | Boston HQ | `true` | ❌ |
| `ofac-sdn` | OFAC SDN | Washington DC placeholder | `true` | ❌ |
| `loc-legal` | Global Legal Monitor | Washington DC placeholder | `true` | ❌ |
| `cloudflare` | Cloudflare Radar | San Francisco placeholder | `true` | ❌ |
| `electricity-maps` | Electricity Maps | Germany zone centroid | `true` | ❌ |
| `noaa-kp` | NOAA Kp Index | Symbolic high-latitude point | `true` | ❌ |
| `noaa-xray` | NOAA X-Ray Flux | `0,0` symbolic | `true` | ❌ |
| `noaa-solar-wind` | NOAA Solar Wind | Symbolic point | `true` | ❌ |

### Tier D — No usable geo (do **not** plot on globe)

| Source ID | Display name | Issue | Plots on globe? |
|-----------|--------------|-------|-----------------|
| `abuseipdb` | AbuseIPDB | Often `0,0` with `latApproximate: true` | ❌ |
| `celestrak` | Celestrak SOCRATES | Conjunction alerts; no spatial position | ❌ |
| `entsoe` | ENTSO-E | Grid data; no normalizer/geo (keyed stub) | ❌ |
| NewsAPI / GNews / TheNewsAPI / YouTube | Commercial news | On-demand dock feeds; never geolocated | ❌ |

---

## Globe plotting decision checklist

When evaluating whether a source **should** appear on the globe:

1. **Is the coordinate tied to the phenomenon?**  
   Tier A/B → candidate. Tier C/D → ticker, alerts, or analytics only.

2. **Is `latApproximate` false (or should it be)?**  
   If the normalizer sets `latApproximate: true`, do not add a globe layer without fixing the geocoder first.

3. **Is the source registered in `eventSourceToGlobeDataLayerKey()`?**  
   Unmapped sources never pin regardless of geo quality.

4. **Would many pins stack on the same centroid?**  
   GDELT DOC/VGKG and ReliefWeb country centroids create misleading clusters — keep them off the globe.

5. **Is this a motion layer?**  
   OpenSky, AISStream, CelesTrak TLE, and NHC use `trackKind` and dedicated render paths — not the static pin pool.

---

## Currently globe-eligible sources

As of the mapping in `globeLayers.js`:

| Globe layer key | Sources |
|-----------------|---------|
| `usgs` | USGS Earthquakes |
| `gdacs` | GDACS Disasters |
| `eonet` | NASA EONET |
| `firms` | NASA FIRMS |
| `gdeltSignals` | GDELT CAMEO (high-confidence pins only) |
| `conflictEvents` | UCDP, ACLED |
| `adsb` / `adsbMilitary` | OpenSky ADS-B |
| `satellites` | CelesTrak TLE |
| `ais` | AISStream Vessels |
| `nhcStorms` | NOAA NHC Hurricanes |

**Explicitly excluded from globe pins:** GDELT DOC, GDELT VGKG, Bluesky, fact-check, and all Tier C/D sources above.

---

## Known gaps & follow-ups

1. **GDELT CAMEO resolution** — Country-level rows (`ActionGeo_Type === 1`) are marked `latApproximate: true` in `eventService.js` and route to the ticker; city/state-level rows pin on the globe.
2. **GDELT GEO API** — Re-enable `gdelt-events` when `api.gdeltproject.org/api/v2/geo/geo` is restored; it is the DOC-equivalent feed with native coordinates.
3. **Safecast** — Has pinpoint sensor geo but no globe layer mapping; add if radiation overlay is desired.
4. **Open-Meteo** — City anchors are precise for weather layers (wind overlay), not for incident pins.
5. **Commercial news** — No geolocation pipeline; would need NER/geoparsing before any globe consideration.

---

## Marker archetype grammar

For visual/interaction rules (pin vs track vs reference vs derived), see [MARKER_GRAMMAR.md](./MARKER_GRAMMAR.md).

---

## Quick reference: add a new source

```js
// In fetchManager normalizer — be explicit:
makeEvent({
  lat, lng,
  latApproximate: false,  // only when coords come from the upstream event
  locationName: '…',      // optional
  // …
})

// In globeLayers.js — only if Tier A or B:
if (s.includes('my-source')) return 'myLayerKey'
```

Default stance: **new sources start ticker-only** until geolocation quality is verified and `latApproximate` is set correctly.
