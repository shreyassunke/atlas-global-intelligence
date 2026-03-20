import { TIERS, DOMAINS, createEvent, createEventId } from '../core/eventSchema.js'

function magnitudeToTierAndSeverity(mag) {
  if (mag >= 7.0) return { tier: TIERS.CRITICAL, severity: 5 }
  if (mag >= 6.0) return { tier: TIERS.CRITICAL, severity: 4 }
  if (mag >= 5.5) return { tier: TIERS.ACTIVE, severity: 3 }
  if (mag >= 5.0) return { tier: TIERS.ACTIVE, severity: 2 }
  return { tier: TIERS.LATENT, severity: 1 }
}

export function normalizeUSGS(geojson) {
  if (!geojson?.features) return []

  return geojson.features
    .filter(f => f.geometry?.coordinates && f.properties?.mag)
    .map(f => {
      const props = f.properties
      const [lng, lat] = f.geometry.coordinates
      const mag = props.mag
      const { tier, severity } = magnitudeToTierAndSeverity(mag)
      const timestamp = new Date(props.time).toISOString()

      return createEvent({
        id: createEventId(lat, lng, props.time, 'usgs', props.title || ''),
        tier,
        domain: DOMAINS.NATURAL,
        lat,
        lng,
        latApproximate: false,
        severity,
        corroborationCount: 1,
        corroborationSources: ['usgs'],
        authoritative: true,
        ttl: 360,
        title: props.title || `M${mag} Earthquake`,
        detail: `Magnitude ${mag} earthquake at depth ${f.geometry.coordinates[2] || 0}km. ${props.place || ''}`.trim(),
        source: 'USGS',
        sourceUrl: props.url || 'https://earthquake.usgs.gov',
        tags: ['earthquake', `M${mag}`, props.type || 'earthquake'],
        timestamp,
      })
    })
}

export function normalizeGDACS(xmlText) {
  if (!xmlText) return []
  const events = []

  try {
    const itemRegex = /<item>([\s\S]*?)<\/item>/g
    let match
    while ((match = itemRegex.exec(xmlText)) !== null) {
      const item = match[1]
      const getTag = (tag) => {
        const m = item.match(new RegExp(`<${tag}><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>`)) ||
          item.match(new RegExp(`<${tag}>([^<]*)</${tag}>`))
        return m ? m[1].trim() : ''
      }

      const title = getTag('title')
      const description = getTag('description')
      const link = getTag('link')
      const pubDate = getTag('pubDate')

      const latMatch = item.match(/<geo:lat>([^<]+)/)
      const lngMatch = item.match(/<geo:long>([^<]+)/)
      if (!latMatch || !lngMatch) continue

      const lat = parseFloat(latMatch[1])
      const lng = parseFloat(lngMatch[1])
      if (isNaN(lat) || isNaN(lng)) continue

      const alertMatch = item.match(/<gdacs:alertlevel>([^<]+)/)
      const alertLevel = alertMatch ? alertMatch[1].trim().toLowerCase() : ''
      let tier = TIERS.LATENT
      let severity = 2
      if (alertLevel === 'red') { tier = TIERS.CRITICAL; severity = 5 }
      else if (alertLevel === 'orange') { tier = TIERS.ACTIVE; severity = 3 }
      else if (alertLevel === 'green') { tier = TIERS.LATENT; severity = 1 }

      const timestamp = pubDate ? new Date(pubDate).toISOString() : new Date().toISOString()

      events.push(createEvent({
        id: createEventId(lat, lng, Date.parse(timestamp), 'gdacs', title),
        tier,
        domain: DOMAINS.NATURAL,
        lat,
        lng,
        latApproximate: false,
        severity,
        corroborationCount: 1,
        corroborationSources: ['gdacs'],
        authoritative: true,
        ttl: 600,
        title,
        detail: description,
        source: 'GDACS',
        sourceUrl: link || 'https://www.gdacs.org',
        tags: ['disaster'],
        timestamp,
      }))
    }
  } catch (e) {
    console.warn('[ATLAS] GDACS parse error:', e)
  }

  return events
}
