# ATLAS Data Sources

> **Data source type:** OSINT (Open-Source Intelligence)
> **Purpose:** Authoritative audit of every external data source ATLAS ingests, organized by category and use case.
> **Last audited:** 2026-07-02

All sources below are open-source / publicly accessible feeds. ATLAS does not ingest any classified, proprietary-restricted, or private intelligence. Some sources require a free API key (registration only), noted with **🔑 key**.

**Where sources are defined in code**

| Concern | File |
|---------|------|
| Real-time source catalog (module, dimension, poll, key) | `src/core/sourceRegistry.js` → `SOURCE_CATALOG` |
| Fetch endpoints + poll config | `src/workers/fetchManager.worker.js` → `SOURCE_CONFIGS`, `buildKeyedConfigs()` |
| Ticker vs. layer-gated routing | `src/core/layerSources.js` |
| Commercial news providers | `src/config/newsProviders.js`, `src/services/newsAPI/adapters/*` |
| GDELT analytical APIs | `src/services/gdelt/*.js` |
| Place indicators | `src/services/indicators/*.js` |
| Geolocation / globe eligibility | `src/core/sourceGeolocation.js`, [`SOURCE_GEOLOCATION_REFERENCE.md`](./SOURCE_GEOLOCATION_REFERENCE.md) |

---

## Source count summary

| Group | Count |
|-------|-------|
| Real-time event feeds (`SOURCE_CATALOG` + keyed + stretch) | 39 |
| Commercial / on-demand news providers | 4 |
| GDELT analytical APIs (on-demand enrichment) | 6 |
| Place-indicator / reference sources | 3 |
| Basemap, imagery & geospatial services | 4 |

---

## 1. Real-time event feeds

These poll continuously in the fetch-manager web worker and stream normalized events onto the globe, ticker, and dock. Each is tagged with its **module** and **dimension** from `SOURCE_CATALOG`.

### 1a. Seismic & Natural Disaster

| Source ID | Display name | Endpoint | Poll | Key | Use case |
|-----------|--------------|----------|------|-----|----------|
| `usgs` | USGS Earthquakes | `earthquake.usgs.gov` FDSN GeoJSON | 2 min | — | Authoritative seismic events (M ≥ 4.5), pinned by epicenter |
| `gdacs` | GDACS Disasters | GDACS RSS (via proxy) | 5 min | — | Global disaster alerts (cyclone, flood, quake, volcano) |
| `eonet` | NASA EONET | `eonet.gsfc.nasa.gov` API v3 | 10 min | — | Open natural-event tracking (wildfire, storms, ice) |

### 1b. Weather & Environment

| Source ID | Display name | Endpoint | Poll | Key | Use case |
|-----------|--------------|----------|------|-----|----------|
| `open-meteo` | Open-Meteo | `api.open-meteo.com` forecast | 10 min | — | Extreme-wind trigger for 15 anchor cities; wind overlay |
| `firms` | NASA FIRMS | `firms.modaps.eosdis.nasa.gov` (VIIRS SNPP NRT) | 10 min | 🔑 `FIRMS_KEY` | Satellite active-fire detections, pinpoint pixels |
| `noaa-nhc` | NOAA NHC Hurricanes | NOAA NHC (direct) | 5 min | — | Active storm center + track + cone-of-error |

### 1c. Space & Space Weather

| Source ID | Display name | Endpoint | Poll | Key | Use case |
|-----------|--------------|----------|------|-----|----------|
| `noaa-kp` | NOAA Kp Index | NOAA SWPC (via proxy) | 5 min | — | Geomagnetic storm index |
| `noaa-xray` | NOAA X-Ray Flux | NOAA SWPC (via proxy) | 5 min | — | Solar flare X-ray flux |
| `noaa-solar-wind` | NOAA Solar Wind | NOAA SWPC (via proxy) | 5 min | — | Solar wind speed/density |
| `celestrak` | Celestrak SOCRATES | `celestrak.org/SOCRATES` | 60 min | — | Satellite conjunction / close-approach alerts |
| `celestrak-tle` | CelesTrak Satellites | CelesTrak TLE catalogs | 60 min | — | Orbital-element sets; positions propagated at render (active, stations, Starlink, GPS, military) |

### 1d. News & Narrative (GDELT firehose)

| Source ID | Display name | Endpoint | Poll | Key | Use case |
|-----------|--------------|----------|------|-----|----------|
| `gdelt` | GDELT DOC | `api.gdeltproject.org` DOC 2.0 | 5 min | — | Global news article firehose by dimension query (ticker) |
| `gdelt-cameo` | GDELT CAMEO | GDELT 15-min Events export | 15 min | — | CAMEO-coded events; high-confidence rows pin on globe |
| `gdelt-vgkg` | GDELT Visual GKG | GDELT Visual Global Knowledge Graph | 30 min | — | Image-derived narrative signals (ticker) |
| `gdelt-events` | GDELT Events (GEO API) | `api/v2/geo/geo` | — | — | **Disabled** — endpoint returns 404; re-enable when GDELT restores GEO |

### 1e. Conflict & Safety

| Source ID | Display name | Endpoint | Poll | Key | Use case |
|-----------|--------------|----------|------|-----|----------|
| `ucdp` | UCDP Conflict | UCDP (via proxy) | 10 min | — | Post-hoc armed-conflict events, geocoded |
| `acled` | ACLED Conflict Events | ACLED API | 5 min | 🔑 `ACLED_KEY` + `ACLED_EMAIL` | Armed conflict & protest events, geocoded |
| `cisa-kev` | CISA KEV | CISA Known Exploited Vulns (via proxy) | 5 min | — | Actively exploited CVE catalog |

### 1f. Financial & Economy

| Source ID | Display name | Endpoint | Poll | Key | Use case |
|-----------|--------------|----------|------|-----|----------|
| `coingecko` | CoinGecko | `api.coingecko.com` | 5 min | — | BTC/ETH/USDT spot + 24h change |
| `alt-fng` | Fear & Greed Index | `alternative.me` | 15 min | — | Crypto market sentiment index |
| `finnhub` | Finnhub | `finnhub.io` forex rates | 5 min | 🔑 `FINNHUB_KEY` | USD FX rates; place indicator |
| `fred` | FRED | `api.stlouisfed.org` (VIX) | 60 min | 🔑 `FRED_KEY` | VIX volatility as global risk proxy |
| `eia` | EIA | `api.eia.gov` petroleum spot | 60 min | 🔑 `EIA_KEY` | Daily oil/energy price |

### 1g. Humanitarian & Disease (People)

| Source ID | Display name | Endpoint | Poll | Key | Use case |
|-----------|--------------|----------|------|-----|----------|
| `reliefweb` | ReliefWeb | `api.reliefweb.int` | 30 min | — | OCHA situation reports |
| `who-don` | WHO News | `who.int` RSS | 15 min | — | WHO disease-outbreak news |
| `promed` | ProMED | ProMED (via proxy) | 15 min | — | Emerging-disease outbreak reports |

### 1h. Diplomatic & Governance

| Source ID | Display name | Endpoint | Poll | Key | Use case |
|-----------|--------------|----------|------|-----|----------|
| `ofac-sdn` | OFAC SDN | US Treasury OFAC | 24 h | — | Sanctions / Specially Designated Nationals list |
| `loc-legal` | Global Legal Monitor | `loc.gov` foreign-law RSS | 60 min | — | Legal / legislative developments |

### 1i. Flight & Maritime

| Source ID | Display name | Endpoint | Poll | Key | Use case |
|-----------|--------------|----------|------|-----|----------|
| `opensky` | OpenSky ADS-B | OpenSky states (via proxy) | 15 s | — | Live aircraft positions (tactical track) |
| `aisstream` | AISStream Vessels | AISStream WebSocket (via proxy) | 45 s | 🔑 `AISSTREAM_KEY` | Live vessel positions (tactical track) |
| `cameras` | Live Cameras | `/api/cameras` (Windy + TfL + Caltrans) | 5 min | 🔑 `WINDY_API_KEY` (optional; TfL/Caltrans free) | Public webcam / CCTV pins |

### 1j. Cyber

| Source ID | Display name | Endpoint | Poll | Key | Use case |
|-----------|--------------|----------|------|-----|----------|
| `cloudflare` | Cloudflare Radar | `api.cloudflare.com` radar attacks | 5 min | 🔑 `CLOUDFLARE_TOKEN` | Layer-7 attack summary |
| `abuseipdb` | AbuseIPDB | `api.abuseipdb.com` blacklist | 5 min | 🔑 `ABUSEIPDB_KEY` | Malicious IP blacklist |
| `shodan` | Shodan | `api.shodan.io` (port:502 ICS) | 10 min | 🔑 `SHODAN_KEY` | Exposed industrial-control-system hosts |

### 1k. Energy

| Source ID | Display name | Endpoint | Poll | Key | Use case |
|-----------|--------------|----------|------|-----|----------|
| `electricity-maps` | Electricity Maps | `api.electricitymap.org` (zone DE) | 15 min | 🔑 `ELECTRICITYMAP_KEY` | Grid power breakdown / carbon intensity |
| `entsoe` | ENTSO-E | `transparency.entsoe.eu` | 15 min | 🔑 `ENTSOE_KEY` | European electricity generation transparency |

### 1l. Nuclear / Radiation

| Source ID | Display name | Endpoint | Poll | Key | Use case |
|-----------|--------------|----------|------|-----|----------|
| `safecast` | Safecast | `safecast.org` | — | — | Crowd-sourced radiation sensor readings |

### 1m. Sentiment / Social & Verification

| Source ID | Display name | Endpoint | Poll | Key | Use case |
|-----------|--------------|----------|------|-----|----------|
| `bluesky` | Bluesky | Jetstream firehose (via proxy) | 60 s | — | Social-reach signal, geocoded from place names |
| `fact-check` | Google Fact Check | Google Fact Check Tools (via proxy) | 15 min | 🔑 `GOOGLE_FACT_CHECK_API_KEY` (server) | Claim verification / debunk lookup |

---

## 2. Commercial / on-demand news providers

Queried on demand (dock, search, embeds), not part of the continuous globe firehose. Each provider has an independent free quota; combining them maximizes coverage. Defined in `src/config/newsProviders.js`.

| Provider ID | Name | Endpoint | Free daily limit | Key | Use case |
|-------------|------|----------|------------------|-----|----------|
| `newsapi` | NewsAPI | `newsapi.org/v2` | 100 | 🔑 `VITE_NEWS_API_KEY(S)` | Article search by source + dimension |
| `gnews` | GNews | `gnews.io/api/v4` | 100 | 🔑 `VITE_GNEWS_KEY(S)` | Article search by country + category |
| `thenewsapi` | TheNewsAPI | `api.thenewsapi.com/v1` | 50 | 🔑 `VITE_THENEWS_API_KEY(S)` | Article search by country |
| `youtube` | YouTube Data API v3 | `googleapis.com/youtube/v3` | — | 🔑 YouTube key | Live/video search + in-app embed |

> Commercial news is **never geolocated** onto the globe — no geoparsing pipeline exists yet.

---

## 3. GDELT analytical APIs (on-demand enrichment)

Beyond the streaming GDELT feeds above, these GDELT 2.0 endpoints are queried on demand to enrich a selected event, entity, or investigation. Defined in `src/services/gdelt/*.js`.

| Service | Endpoint | Use case |
|---------|----------|----------|
| DOC / Analytics | `api/v2/doc/doc` | Article volume, tone timelines, top sources |
| Context | `api/v2/context/context` | Contextual sentence-level matches |
| Summary | `api/v2/summary/summary` | AI summary of coverage for a query |
| TV / TVAI | `api/v2/tv/tv`, `api/v2/tvai/tvai` | Television-news mention tracking |
| GEO | `api/v2/geo/geo` | Point-data geolocation (currently 404 upstream) |
| BigQuery | GDELT BigQuery | Deep historical / analytical queries |

---

## 4. Place-indicator & reference sources

Populate the place/country HUD strip when an area is selected. Defined in `src/services/indicators/*.js` (keyed sources routed through a server proxy).

| Source | Endpoint | Key | Use case |
|--------|----------|-----|----------|
| World Bank | `api.worldbank.org/v2` | — | GDP + GDP-growth country indicators |
| FRED | via `/api/indicators` proxy | 🔑 server | US macro indicators (VIX as global risk) |
| Finnhub | via `/api/indicators` proxy | 🔑 server | FX rates for selected place |

---

## 5. Basemap, imagery & geospatial services

Underlying map rendering, imagery overlays, and geocoding.

| Source | Endpoint | Key | Use case |
|--------|----------|-----|----------|
| NASA GIBS | GIBS WMTS (EPSG:3857) | — | Satellite basemap layers (True Color, fire bands, aerosol) |
| Google Maps / Street View / Places | `maps.googleapis.com` | 🔑 Google Maps key | Street View panoramas, place search, geocoding |
| Nominatim (OSM) | OpenStreetMap reverse geocode | — | Reverse-geocode click points to place names |
| Sentinel-2 L2A | `/api/sentinel2-scene` (stretch) | 🔑 server | On-demand recent satellite scene for an AOI |

---

## Key-requirement quick reference

**No key (free / open):** USGS, GDACS, EONET, Open-Meteo, NOAA NHC, NOAA Kp/X-Ray/Solar-Wind, Celestrak (SOCRATES + TLE), GDELT (all feeds + analytical APIs), UCDP, CISA KEV, CoinGecko, Fear & Greed, ReliefWeb, WHO, ProMED, OFAC SDN, LOC Legal, OpenSky, Safecast, Bluesky, World Bank, NASA GIBS, Nominatim.

**Requires free key (registration only):** FIRMS, ACLED, Finnhub, FRED, EIA, AISStream, Cloudflare Radar, AbuseIPDB, Shodan, Electricity Maps, ENTSO-E, Google Fact Check, NewsAPI, GNews, TheNewsAPI, YouTube, Google Maps, Sentinel-2.

---

## Related documentation

- [`SOURCE_GEOLOCATION_REFERENCE.md`](./SOURCE_GEOLOCATION_REFERENCE.md) — which sources are safe to plot as globe pins vs. ticker/dock-only, and geolocation precision tiers.
- [`MARKER_GRAMMAR.md`](./MARKER_GRAMMAR.md) — visual/interaction rules for markers.
- [`ATLAS_ANALYST_PLATFORM_PLAN.md`](./ATLAS_ANALYST_PLATFORM_PLAN.md) — overall platform plan.
