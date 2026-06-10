/**
 * GlobeGLView — Lightweight 3D globe renderer using globe.gl.
 *
 * Renders news markers as coloured points with pulsing rings on a
 * day/night–shaded globe with real-time sun position (solar-calculator).
 * Includes a visible Three.js sun (sprite + directional light) that
 * tracks the real solar position, matching CesiumJS's sun appearance.
 *
 * Map context (closer to Cesium): Natural Earth country + state/province
 * outlines (paths layer, black strokes with alpha like Cesium), and Carto
 * `light_only_labels` raster tiles (SlippyMap) with higher max zoom on
 * high prioritys so smaller places appear when zoomed in. District-level
 * vector boundaries stay omitted (very heavy GeoJSON).
 *
 * Day/night cycle reference: https://globe.gl/example/day-night-cycle/
 */
import { useEffect, useRef, startTransition, useState } from 'react'
import useShareCameraBridge from '../../hooks/useShareCameraBridge'
import Globe from 'globe.gl'
import {
    TextureLoader, ShaderMaterial, Vector2, Vector3,
    DirectionalLight, AmbientLight, HemisphereLight,
    Sprite, SpriteMaterial, CanvasTexture,
    AdditiveBlending, Color,
    MeshBasicMaterial,
} from 'three'
import * as solar from 'solar-calculator'
import { useAtlasStore } from '../../store/atlasStore'
import { isMobileDevice } from '../../config/qualityTiers'
import { getTimezoneViewCenter } from '../../utils/geo'
import {
    useGlobeViewModels,
    applyMarkerClick,
    applyBackgroundClick,
    applyMarkerHover,
    applyCountryClick,
    resolveFlyToTarget,
    markerRingMaxRadius,
} from '../../globe-core'
import { activeGibsImageryKey, gibsTileEngineUrlForKey } from '../../config/gibsBasemap'
import { buildTerminatorRing } from '../../core/solarTerminator'
import { showDetectionLabel as getDetectionLabel } from '../../core/detectionLabels'
import WindParticleOverlay from './WindParticleOverlay'

// Textures (CDN)
const EARTH_DAY = 'https://cdn.jsdelivr.net/npm/three-globe/example/img/earth-day.jpg'
const EARTH_NIGHT = 'https://cdn.jsdelivr.net/npm/three-globe/example/img/earth-night.jpg'
const EARTH_BUMP = 'https://unpkg.com/three-globe/example/img/earth-topology.png'
const BG_IMG = 'https://cdn.jsdelivr.net/npm/three-globe/example/img/night-sky.png'

const POINT_ALTITUDE = 0.01
const RING_PROPAGATION_SPEED = 2

// ─────────────────────────────────────────────────────────────────────────────
//  Astronomically-referenced sun placement
//
//  Source: NASA Sun Fact Sheet (nssdc.gsfc.nasa.gov/planetary/factsheet/sunfact.html)
//    • Earth equatorial radius:   6,371 km
//    • Sun radius:              696,000 km  → 109.2 × Earth radius
//    • Mean Earth–Sun distance: 149,600,000 km → 23,455 × Earth radius
//    • Apparent angular diameter from Earth: 0.5332 ° (mean)
//
//  three-globe uses GLOBE_RADIUS = 100 for Earth, so we scale proportionally:
//    • SUN_DISTANCE  = 100 × 235  = 23,500  (≈ real 23,455× ratio)
//    • SUN_DISC_SIZE = 2 × SUN_DISTANCE × tan(0.5332° / 2) ≈ 219 units
//      This makes the sun disc subtend the correct 0.533° from the origin.
//    • SUN_GLOW_SIZE = SUN_DISC_SIZE × 3.2 ≈ 700 units  (simulated corona)
// ─────────────────────────────────────────────────────────────────────────────
const GLOBE_RADIUS = 100
const SUN_DISTANCE = GLOBE_RADIUS * 235     // 23,500 — proportional to Earth–Sun distance
const SUN_ANGULAR_DEG = 0.5332                 // apparent angular diameter in degrees (NASA)
const SUN_DISC_SIZE = 2 * SUN_DISTANCE * Math.tan((SUN_ANGULAR_DEG / 2) * Math.PI / 180)
// ≈ 219 units — correct apparent disc size
const SUN_GLOW_SIZE = SUN_DISC_SIZE * 3.2     // ≈ 700 units — corona / bloom envelope

// ── Procedural sun texture (radial gradient on canvas) ──
function createSunTexture(size = 512, type = 'core') {
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')
    const cx = size / 2
    const grad = ctx.createRadialGradient(cx, cx, 0, cx, cx, cx)

    if (type === 'core') {
        // Tight bright disc — photospheric white/yellow
        grad.addColorStop(0, 'rgba(255, 255, 252, 1.0)')
        grad.addColorStop(0.25, 'rgba(255, 250, 235, 0.98)')
        grad.addColorStop(0.5, 'rgba(255, 230, 180, 0.6)')
        grad.addColorStop(0.75, 'rgba(255, 200, 120, 0.15)')
        grad.addColorStop(1, 'rgba(255, 180, 80,  0.0)')
    } else {
        // Broad soft glow — solar corona
        grad.addColorStop(0, 'rgba(255, 255, 240, 0.7)')
        grad.addColorStop(0.08, 'rgba(255, 245, 210, 0.5)')
        grad.addColorStop(0.2, 'rgba(255, 220, 160, 0.22)')
        grad.addColorStop(0.45, 'rgba(255, 180, 80,  0.06)')
        grad.addColorStop(0.7, 'rgba(255, 140, 40,  0.015)')
        grad.addColorStop(1, 'rgba(255, 100, 0,   0.0)')
    }

    ctx.fillStyle = grad
    ctx.fillRect(0, 0, size, size)
    return new CanvasTexture(canvas)
}

/**
 * Convert sun geographic (lng, lat) → Three.js world position.
 * Uses the same convention as three-globe's internal Polar2Cartesian:
 *   phi   = (90 − lat) in radians
 *   theta = (90 − lng) in radians
 */
function sunToWorldPos(sunLng, sunLat, distance = SUN_DISTANCE) {
    const phi = (90 - sunLat) * Math.PI / 180
    const theta = (90 - sunLng) * Math.PI / 180
    return new Vector3(
        Math.sin(phi) * Math.cos(theta) * distance,
        Math.cos(phi) * distance,
        Math.sin(phi) * Math.sin(theta) * distance,
    )
}

// ── Day / Night shader (from globe.gl official example) ──
const dayNightShader = {
    vertexShader: `
    varying vec3 vNormal;
    varying vec2 vUv;
    void main() {
      vNormal = normalize(normalMatrix * normal);
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
    fragmentShader: `
    #define PI 3.141592653589793
    uniform sampler2D dayTexture;
    uniform sampler2D nightTexture;
    uniform vec2 sunPosition;
    uniform vec2 globeRotation;
    uniform float nightBoost;
    varying vec3 vNormal;
    varying vec2 vUv;

    float toRad(in float a) {
      return a * PI / 180.0;
    }

    vec3 Polar2Cartesian(in vec2 c) {
      float theta = toRad(90.0 - c.x);
      float phi = toRad(90.0 - c.y);
      return vec3(
        sin(phi) * cos(theta),
        cos(phi),
        sin(phi) * sin(theta)
      );
    }

    void main() {
      float invLon = toRad(globeRotation.x);
      float invLat = -toRad(globeRotation.y);
      mat3 rotX = mat3(
        1, 0, 0,
        0, cos(invLat), -sin(invLat),
        0, sin(invLat), cos(invLat)
      );
      mat3 rotY = mat3(
        cos(invLon), 0, sin(invLon),
        0, 1, 0,
        -sin(invLon), 0, cos(invLon)
      );
      vec3 rotatedSunDirection = rotX * rotY * Polar2Cartesian(sunPosition);
      float intensity = dot(normalize(vNormal), normalize(rotatedSunDirection));
      vec4 dayColor = texture2D(dayTexture, vUv);
      vec4 nightColor = texture2D(nightTexture, vUv) * (1.0 + nightBoost);
      float blendFactor = smoothstep(-0.1, 0.1, intensity);
      gl_FragColor = mix(nightColor, dayColor, blendFactor);
    }
  `,
}

/** Compute sun [lng, lat] for a given timestamp */
function sunPosAt(dt) {
    const day = new Date(+dt).setUTCHours(0, 0, 0, 0)
    const t = solar.century(dt)
    const longitude = ((day - dt) / 864e5) * 360 - 180
    return [longitude - solar.equationOfTime(t) / 4, solar.declination(t)]
}

/**
 * Lat/lng pairs as [lat, lng] — unit vectors on the globe (y-up, same as three-globe).
 */
function latLngToUnitVec(lat, lng) {
    const phi = (90 - lat) * (Math.PI / 180)
    const theta = (90 - lng) * (Math.PI / 180)
    const x = Math.sin(phi) * Math.cos(theta)
    const y = Math.cos(phi)
    const z = Math.sin(phi) * Math.sin(theta)
    const len = Math.hypot(x, y, z) || 1
    return { x: x / len, y: y / len, z: z / len }
}

function unitVecToLatLng(v) {
    const { x, y, z } = v
    const r = Math.hypot(x, y, z) || 1
    const yn = y / r
    const phi = Math.acos(Math.max(-1, Math.min(1, yn)))
    const lat = 90 - (phi * 180) / Math.PI
    const theta = Math.atan2(z, x)
    let lng = 90 - (theta * 180) / Math.PI
    while (lng > 180) lng -= 360
    while (lng < -180) lng += 360
    return [lat, lng]
}

export default function GlobeGLView({ onGlobeReady }) {
    const containerRef = useRef(null)
    const globeRef = useRef(null)
    const [globeReady, setGlobeReady] = useState(false)
    const onGlobeReadyRef = useRef(onGlobeReady)
    onGlobeReadyRef.current = onGlobeReady
    const idleTimerRef = useRef(null)
    const animFrameRef = useRef(null)
    const lastZoomStoreEmitRef = useRef(0)

    const dataLayers = useAtlasStore((s) => s.dataLayers)
    const tacticalMode = useAtlasStore((s) => s.tacticalMode)
    const detectionMode = useAtlasStore((s) => s.detectionMode)
    const detectionLabelDensity = useAtlasStore((s) => s.detectionLabelDensity)
    const selectedEvent = useAtlasStore((s) => s.selectedEvent)
    const resolvedTier = useAtlasStore((s) => s.resolvedTier)
    const qualityOverrides = useAtlasStore((s) => s.qualityOverrides)
    const isMobile = isMobileDevice()

    const { allMarkers, choropleth, heatmapPoints, stormOverlays } = useGlobeViewModels()

    const setZoomLevel = useAtlasStore((s) => s.setZoomLevel)

    const gibsImageryKey = activeGibsImageryKey(dataLayers)
    const terminatorOn = dataLayers?.terminator !== false
    const windOn = dataLayers?.windOverlay === true

    useShareCameraBridge({
        ready: globeReady,
        apply: (cam) => {
            const g = globeRef.current
            if (!g || cam?.lat == null) return
            const alt = cam.rangeM
                ? Math.max(0.05, Math.min(4, cam.rangeM / 6_371_000))
                : 2.5
            g.pointOfView({ lat: cam.lat, lng: cam.lng, altitude: alt }, 0)
        },
        report: () => {
            const g = globeRef.current
            if (!g) return null
            const pov = g.pointOfView()
            if (!pov || pov.lat == null) return null
            return {
                lat: pov.lat,
                lng: pov.lng,
                rangeM: (pov.altitude ?? 2.5) * 6_371_000,
            }
        },
    })

    // ── Initialise globe once ──
    useEffect(() => {
        const container = containerRef.current
        if (!container) return
        let destroyed = false

        const globe = new Globe(container)

        // Compute timezone-based spawn point
        const homeView = getTimezoneViewCenter()

        // Size immediately
        const initW = container.clientWidth
        const initH = container.clientHeight
        globe
            .width(initW)
            .height(initH)
            .backgroundImageUrl(BG_IMG)
            .bumpImageUrl(isMobile ? null : EARTH_BUMP)
            .showGlobe(true)
            .showAtmosphere(!isMobile)
            .atmosphereColor('rgba(0, 180, 255, 0.25)')
            .atmosphereAltitude(0.18)
            .pointOfView({ lat: homeView.lat, lng: homeView.lng, altitude: 2.5 })

        if (typeof globe.rendererSize === 'function') {
            globe.rendererSize(new Vector2(initW, initH))
        }
        
        // Force pixel ratio down for better fill rate on mobile GPUs
        if (globe.renderer && typeof globe.renderer === 'function') {
            const renderer = globe.renderer()
            if (renderer) renderer.setPixelRatio(isMobile ? 1 : Math.min(window.devicePixelRatio, 2))
        }

        // Extend camera far plane so the sun (at ~23,500 units) isn't clipped
        // Default Three.js far = 2,000 which is far too short
        const camera = globe.camera()
        camera.far = 50000
        camera.updateProjectionMatrix()

        // Auto-rotate — respects Settings → Features → Auto-Rotate (same as Cesium)
        const controls = globe.controls()
        const initialAuto = useAtlasStore.getState().getEffectiveSetting('autoRotate')
        controls.autoRotate = initialAuto
        controls.autoRotateSpeed = 0.4
        controls.enableDamping = true
        controls.dampingFactor = 0.14
        controls.rotateSpeed = 1.12

        const stopRotate = () => {
            if (!useAtlasStore.getState().getEffectiveSetting('autoRotate')) return
            controls.autoRotate = false
            clearTimeout(idleTimerRef.current)
            idleTimerRef.current = setTimeout(() => {
                if (!globeRef.current) return
                if (!useAtlasStore.getState().getEffectiveSetting('autoRotate')) return
                globeRef.current.controls().autoRotate = true
            }, 6000)
        }
        container.addEventListener('pointerdown', stopRotate)
        container.addEventListener('wheel', stopRotate)

        // ── Three.js scene — add sun + lighting ──
        const scene = globe.scene()

        // Soft ambient fill so the night-side markers aren't invisible
        const ambient = new AmbientLight(0x223355, 0.6)
        scene.add(ambient)

        // Hemisphere light — warm sky / cool ground for subtle colour variation
        const hemi = new HemisphereLight(0xffeedd, 0x112244, 0.3)
        scene.add(hemi)

        // Directional light from the sun for 3D marker/ring illumination
        const sunLight = new DirectionalLight(0xfff8f0, 1.8)
        scene.add(sunLight)

        // Visible sun — two additive-blended sprites: photospheric disc + corona glow
        // Disabled on mobile to reduce overdraw
        let sunCore, sunGlow
        if (!isMobile) {
            sunCore = new Sprite(new SpriteMaterial({
                map: createSunTexture(512, 'core'),
                color: new Color(0xffffff),
                transparent: true,
                blending: AdditiveBlending,
                depthWrite: false,
            }))
            sunCore.scale.set(SUN_DISC_SIZE, SUN_DISC_SIZE, 1)
            scene.add(sunCore)

            sunGlow = new Sprite(new SpriteMaterial({
                map: createSunTexture(512, 'glow'),
                color: new Color(0xffeedd),
                transparent: true,
                blending: AdditiveBlending,
                depthWrite: false,
            }))
            sunGlow.scale.set(SUN_GLOW_SIZE, SUN_GLOW_SIZE, 1)
            scene.add(sunGlow)
        }

        // ── Day/night shader material ──
        if (isMobile) {
            // Extreme optimization for mobile: skip per-pixel day/night shader math
            globe.globeImageUrl(EARTH_NIGHT)
            
            function animateMobile() {
                if (destroyed) return
                animFrameRef.current = requestAnimationFrame(animateMobile)
                const [sunLng, sunLat] = sunPosAt(Date.now())
                const sunWorldPos = sunToWorldPos(sunLng, sunLat)
                sunLight.position.copy(sunWorldPos)
            }
            animFrameRef.current = requestAnimationFrame(animateMobile)
        } else {
            const loader = new TextureLoader()
            Promise.all([
                loader.loadAsync(EARTH_DAY),
                loader.loadAsync(EARTH_NIGHT),
            ]).then(([dayTex, nightTex]) => {
                if (destroyed) return

                const material = new ShaderMaterial({
                    uniforms: {
                        dayTexture: { value: dayTex },
                        nightTexture: { value: nightTex },
                        sunPosition: { value: new Vector2() },
                        globeRotation: { value: new Vector2() },
                        nightBoost: { value: 0 },
                    },
                    vertexShader: dayNightShader.vertexShader,
                    fragmentShader: dayNightShader.fragmentShader,
                })

                globe.globeMaterial(material)

                // Sync day/night + sun objects with real-world time
                function animate() {
                    if (destroyed) return

                    const [sunLng, sunLat] = sunPosAt(Date.now())
                    material.uniforms.sunPosition.value.set(sunLng, sunLat)
                    material.uniforms.nightBoost.value =
                        useAtlasStore.getState().dataLayers?.gibsBlackMarble === true ? 0.35 : 0

                    // Keep globeRotation uniform in sync with camera
                    const pov = globe.pointOfView()
                    if (pov) {
                        material.uniforms.globeRotation.value.set(pov.lng ?? 0, pov.lat ?? 0)
                    }

                    // Move the visible sun + directional light to match
                    const sunWorldPos = sunToWorldPos(sunLng, sunLat)
                    if (sunCore) sunCore.position.copy(sunWorldPos)
                    if (sunGlow) sunGlow.position.copy(sunWorldPos)
                    sunLight.position.copy(sunWorldPos)

                    // Subtle corona pulse (±5 % over ~6 s)
                    if (sunGlow) {
                        const pulse = 1 + 0.05 * Math.sin(Date.now() * 0.001)
                        sunGlow.scale.setScalar(SUN_GLOW_SIZE * pulse)
                    }

                    animFrameRef.current = requestAnimationFrame(animate)
                }
                animFrameRef.current = requestAnimationFrame(animate)
            })
        }

        // ── Points layer (marker view-models from globe-core) ──
        // pointsMerge MUST be false for per-point click/hover events to fire
        globe
            .pointsData([])
            .pointLat('lat')
            .pointLng('lng')
            .pointColor((d) => d.color || '#1a90ff')
            .pointAltitude(POINT_ALTITUDE)
            .pointRadius((d) => d.radiusGl || 0.35)
            .pointsMerge(false)
            .onPointClick((d) => {
                applyMarkerClick(d.raw || d)
                // Fly closer to the clicked marker
                const currentAlt = globe.pointOfView().altitude ?? 2.5
                const targetAlt = Math.max(0.15, Math.min(0.8, currentAlt * 0.4))
                globe.pointOfView(
                    { lat: d.lat, lng: d.lng, altitude: targetAlt },
                    1400,
                )
            })
            .onPointHover((d) => {
                // Hover tooltip (HoverLabel) — needs _screenX/_screenY.
                // Globe.GL doesn't pass screen coords directly, so read the
                // current mouse position from the last pointermove.
                if (d) {
                    const { _lastPointerX: sx, _lastPointerY: sy } = container
                    applyMarkerHover(d.raw || d, sx, sy)
                    container.style.cursor = 'pointer'
                } else {
                    applyMarkerHover(null)
                    container.style.cursor = 'grab'
                }
            })

        // Track mouse position on the container for hover tooltip coords
        const onPointerMove = (e) => {
            container._lastPointerX = e.clientX
            container._lastPointerY = e.clientY
        }
        container.addEventListener('pointermove', onPointerMove)

        // ── Globe background click — dismiss both news card and event panel ──
        globe.onGlobeClick(() => {
            applyBackgroundClick()
        })

        // ── Rings layer ──
        globe
            .ringsData([])
            .ringLat('lat')
            .ringLng('lng')
            .ringColor((d) => {
                const c = d.color || '#1a90ff'
                return (t) => {
                    const alpha = 1 - t
                    const r = parseInt(c.slice(1, 3), 16)
                    const g = parseInt(c.slice(3, 5), 16)
                    const b = parseInt(c.slice(5, 7), 16)
                    return `rgba(${r},${g},${b},${alpha * 0.45})`
                }
            })
            .ringMaxRadius((d) => markerRingMaxRadius(d))
            .ringPropagationSpeed(RING_PROPAGATION_SPEED)
            .ringRepeatPeriod(() => 2000 + Math.random() * 2000)
            .ringAltitude(POINT_ALTITUDE)

        // ── Labels layer (per-marker titles for news — separate from map typography) ──
        globe
            .labelsData([])
            .labelLat('lat')
            .labelLng('lng')
            .labelText('title')
            .labelSize(0.6)
            .labelDotRadius(0.2)
            .labelColor(() => 'rgba(255, 255, 255, 0.85)')
            .labelResolution(2)
            .labelAltitude(POINT_ALTITUDE + 0.005)

        // ── GDELT heatmap + choropleth layers ──
        globe
            .heatmapsData([])
            .heatmapPoints((d) => d.points || [])
            .heatmapPointLat('lat')
            .heatmapPointLng('lng')
            .heatmapPointWeight('weight')
            .heatmapBandwidth(1.8)
            .heatmapColorSaturation(1.8)
            .heatmapBaseAltitude(0.005)
            .heatmapTopAltitude(0.09)
            .heatmapsTransitionDuration(800)

        globe
            .polygonsData([])
            .polygonGeoJsonGeometry('geometry')
            .polygonAltitude(0.006)
            .polygonCapColor((d) => d.__capColor || 'rgba(40,120,200,0.4)')
            .polygonSideColor(() => 'rgba(0, 0, 0, 0.08)')
            .polygonStrokeColor(() => 'rgba(255,255,255,0.22)')
            .polygonsTransitionDuration(600)
            // Choropleth country → Dossier (storm cones carry no __fips/name)
            .onPolygonClick((d) => {
                if (d?.__fips || (d?.name && !d?.__id?.startsWith('storm-cone-'))) {
                    applyCountryClick({ fips: d.__fips, iso: d.iso, name: d.name })
                }
            })

        globe
            .pathsData([])
            .pathPoints('coords')
            .pathPointLat((p) => p[1])
            .pathPointLng((p) => p[0])
            .pathColor(() => 'rgba(90, 210, 255, 0.82)')
            .pathStroke(0.12)
            .pathPointAlt(0.008)

        globeRef.current = globe

        // ── Register reset-view callback (Header button) ──
        useAtlasStore.getState().setOnResetView(() => {
            const center = getTimezoneViewCenter()
            globe.pointOfView({ lat: center.lat, lng: center.lng, altitude: 2.5 }, 1200)
            const c = globe.controls()
            if (c) c.autoRotate = useAtlasStore.getState().getEffectiveSetting('autoRotate')
            useAtlasStore.getState().setSelectedMarker(null)
            useAtlasStore.getState().clearSearchHighlight()
        })

        // ── Register place-search fly-to callback (Header search bar) ──
        // globe.gl uses altitude in Earth radii; we pick a city-level default
        // and tighten it when the Places viewport bbox is narrow so the
        // framing roughly matches Google Earth's behaviour.
        useAtlasStore.getState().setOnFlyToLocation((target) => {
            const t = resolveFlyToTarget(target)
            if (!t) return
            const altitude = t.spanDeg != null
                ? Math.max(0.06, Math.min(1.4, t.spanDeg / 45))
                : 0.6
            globe.pointOfView({ lat: t.lat, lng: t.lng, altitude }, 1400)
        })

        // Resize
        const onResize = () => {
            if (globeRef.current && containerRef.current) {
                const w = containerRef.current.clientWidth
                const h = containerRef.current.clientHeight
                globeRef.current.width(w).height(h)
                // Keeps FatLine (political boundaries) linewidth correct after resize
                if (typeof globeRef.current.rendererSize === 'function') {
                    globeRef.current.rendererSize(new Vector2(w, h))
                }
            }
        }
        window.addEventListener('resize', onResize)

        // Signal ready — the marker-sync effect below pushes pointsData
        const readyTimer = setTimeout(() => {
            setGlobeReady(true)
            if (onGlobeReadyRef.current) onGlobeReadyRef.current()
        }, 500)

        return () => {
            destroyed = true
            window.removeEventListener('resize', onResize)
            container.removeEventListener('pointerdown', stopRotate)
            container.removeEventListener('wheel', stopRotate)
            container.removeEventListener('pointermove', onPointerMove)
            applyMarkerHover(null)
            clearTimeout(idleTimerRef.current)
            clearTimeout(readyTimer)
            if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
            useAtlasStore.getState().setOnResetView(null)
            useAtlasStore.getState().setOnFlyToLocation(null)
            if (globeRef.current) {
                globeRef.current._destructor?.()
                globeRef.current = null
            }
        }
    }, []) // eslint-disable-line react-hooks/exhaustive-deps

    // Sync Auto-Rotate setting when user changes quality priority or toggles the feature
    useEffect(() => {
        const globe = globeRef.current
        if (!globe) return
        const ar = useAtlasStore.getState().getEffectiveSetting('autoRotate')
        const controls = globe.controls()
        if (!controls) return
        controls.autoRotate = ar
        if (!ar) {
            clearTimeout(idleTimerRef.current)
        }
    }, [resolvedTier, qualityOverrides])

    // NASA GIBS WMTS slippy tiles (free, no key) — one active overlay at a time
    useEffect(() => {
        const globe = globeRef.current
        if (!globe) return
        if (gibsImageryKey) {
            globe.globeTileEngineUrl(gibsTileEngineUrlForKey(gibsImageryKey))
            globe.globeTileEngineClearCache?.()
        } else {
            globe.globeTileEngineUrl(null)
            globe.globeTileEngineClearCache?.()
        }
    }, [gibsImageryKey])

    // Solar terminator + NHC storm track paths
    useEffect(() => {
        const globe = globeRef.current
        if (!globe) return
        const syncPaths = () => {
            /** @type {{ coords: number[][] }[]} */
            const paths = []
            if (terminatorOn) {
                const ring = buildTerminatorRing(new Date())
                paths.push({ coords: ring.map((p) => [p.lng, p.lat]) })
            }
            for (const s of stormOverlays) {
                if (s.trackCoords?.length >= 2) {
                    paths.push({ coords: s.trackCoords.map((p) => [p.lng, p.lat]) })
                }
            }
            globe.pathsData(paths)
        }
        syncPaths()
        const id = setInterval(syncPaths, 60_000)
        return () => clearInterval(id)
    }, [terminatorOn, stormOverlays])

    // ── Marker view-model sync ──
    useEffect(() => {
        const globe = globeRef.current
        if (!globe) return
        globe.pointsData(allMarkers)
        const ringItems = [...allMarkers]
            .sort((a, b) => (b.severity || 0) - (a.severity || 0))
            .slice(0, isMobile ? 15 : 80)
        globe.ringsData(ringItems)

        const detOpts = {
            detectionMode,
            detectionLabelDensity,
            selectedEventId: selectedEvent?.id,
        }
        const labelItems = detectionMode
            ? allMarkers
                .map((d, idx) => {
                    const label = getDetectionLabel(d.raw, idx, detOpts)
                    if (!label) return null
                    return { lat: d.lat, lng: d.lng, title: label }
                })
                .filter(Boolean)
            : []
        globe.labelsData(labelItems)
        globe.labelColor(() => (detectionMode ? 'rgba(136, 255, 170, 0.95)' : 'rgba(255, 255, 255, 0.85)'))
        globe.ringMaxRadius((d) => markerRingMaxRadius(d, detectionMode))
    }, [allMarkers, isMobile, detectionMode, detectionLabelDensity, selectedEvent?.id])

    // ── GDELT heatmap data sync ──
    useEffect(() => {
        const globe = globeRef.current
        if (!globe) return
        globe.heatmapsData(heatmapPoints.length > 0 ? [{ points: heatmapPoints }] : [])
    }, [heatmapPoints])

    // ── GDELT choropleth + storm-cone polygon sync ──
    useEffect(() => {
        const globe = globeRef.current
        if (!globe) return
        const stormPolys = stormOverlays
            .filter((s) => s.coneCoords?.length >= 3)
            .map((s, i) => ({
                __id: `storm-cone-${s.stormId || i}`,
                geometry: {
                    type: 'Polygon',
                    coordinates: [s.coneCoords.map((p) => [p.lng, p.lat])],
                },
                __capColor: 'rgba(255, 120, 60, 0.18)',
            }))
        const polys = choropleth.map((c) => ({
            __id: c.key,
            geometry: c.geometry,
            __capColor: c.fill,
            __fips: c.props?.fips || '',
            iso: c.iso,
            name: c.name,
            tone: c.tone,
            count: c.count,
        }))
        globe.polygonsData([...stormPolys, ...polys])
    }, [choropleth, stormOverlays])

    // ── Zoom sync ──
    useEffect(() => {
        const globe = globeRef.current
        if (!globe) return
        const controls = globe.controls()
        const onZoom = () => {
            const now = performance.now()
            if (now - lastZoomStoreEmitRef.current < 100) return
            lastZoomStoreEmitRef.current = now
            const dist = controls.getDistance?.() ?? 300
            const minD = 120
            const maxD = 600
            const clamped = Math.max(minD, Math.min(maxD, dist))
            const zoom = (clamped - minD) / (maxD - minD)
            startTransition(() => setZoomLevel(zoom))
        }
        controls.addEventListener('change', onZoom)
        return () => controls.removeEventListener('change', onZoom)
    }, [setZoomLevel])

    return (
        <div className="fixed inset-0 z-0">
            <div
                ref={containerRef}
                className={`absolute inset-0${tacticalMode ? ' atlas-tactical-mode' : ''}`}
                style={{ cursor: 'grab', background: '#030712' }}
            />
            <WindParticleOverlay enabled={windOn} />
        </div>
    )
}
