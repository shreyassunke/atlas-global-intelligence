# Marker Archetype Visual Grammar

Five archetypes encode **what kind of map object** the user is looking at. This is orthogonal to dimension color and hazard shape (which encode **what domain**).

See also: [SOURCE_GEOLOCATION_REFERENCE.md](./SOURCE_GEOLOCATION_REFERENCE.md)

## Archetypes

| Archetype | Globe representation | Size | Opacity | Animation | Click |
|-----------|---------------------|------|---------|-----------|-------|
| **pin** | Filled hazard/dimension icon | `SEVERITY_SIZES` | Corroboration + authoritative floor | Recency pulse (top-N) | Inspector; Street View if precise |
| **track** | Directional sprite | Fixed per subtype | 1.0 | Position refresh | Track HUD; no Street View |
| **field** | Surface overlay | N/A | 0.15–0.45 | Wind drift / static | Aggregate tooltip |
| **reference** | Hollow ring + glyph | 12px | 0.45 static | None | Reference card |
| **derived** | Amber diamond badge | 24px | Confidence tone | 2.4s breathe | Synthesis panel |

## Code modules

- `src/core/markerArchetype.js` — classify, behavior flags, truth labels
- `src/core/archetypeIcons.js` — canvas frames (reference / derived)
- `src/core/referenceCatalog.js` — nuclear + chokepoint VMs
- `src/globe-core/derivedMarkers.js` — anomaly → derived VMs
- `src/globe-core/viewModels.js` — unified VM pipeline

## Layer toggles

| Key | Default | Catalog kind |
|-----|---------|--------------|
| `referenceNuclear` | off | reference |
| `referenceChokepoints` | off | reference |
| `derivedSignals` | off | derived |

## Design sync

UI polish specs live in `.stitch/DESIGN.md` and HTML references under `.stitch/designs/`. Regenerate via Google Stitch MCP when gcloud is configured.

## Extension guide

1. Add catalog entry in `layerCatalog.js` with appropriate `kind`
2. Extend `classifyMarkerArchetype()` if new entity shape
3. Add icon frame in `archetypeIcons.js` if new visual frame needed
4. Wire VM builder + renderer filter (`isSpriteArchetype` / `isTrackArchetype`)
5. Bump `CACHE_VERSION` in `markerIconCache.js` when icon geometry changes
