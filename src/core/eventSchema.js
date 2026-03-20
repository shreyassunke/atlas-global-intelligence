export const TIERS = { LATENT: 'latent', ACTIVE: 'active', CRITICAL: 'critical' }

export const SHAPES = { CIRCLE: 'circle', DIAMOND: 'diamond', BURST: 'burst' }

export const DOMAINS = {
  CONFLICT: 'conflict',
  CYBER: 'cyber',
  NATURAL: 'natural',
  HUMANITARIAN: 'humanitarian',
  ECONOMIC: 'economic',
  SIGNALS: 'signals',
  HAZARD: 'hazard',
}

export const TIER_COLORS = {
  [TIERS.LATENT]: '#1a90ff',
  [TIERS.ACTIVE]: '#ffaa00',
  [TIERS.CRITICAL]: '#ff2222',
}

export const TIER_SHAPES = {
  [TIERS.LATENT]: SHAPES.CIRCLE,
  [TIERS.ACTIVE]: SHAPES.DIAMOND,
  [TIERS.CRITICAL]: SHAPES.BURST,
}

export const SEVERITY_SIZES = { 1: 8, 2: 14, 3: 20, 4: 30, 5: 44 }

export const CORROBORATION_OPACITY = {
  1: 0.35,
  2: 0.55,
  3: 0.75,
  4: 0.88,
  5: 1.0,
}

export const DOMAIN_ICONS = {
  [DOMAINS.CONFLICT]: 'conflict',
  [DOMAINS.CYBER]: 'cyber',
  [DOMAINS.NATURAL]: 'natural',
  [DOMAINS.HUMANITARIAN]: 'humanitarian',
  [DOMAINS.ECONOMIC]: 'economic',
  [DOMAINS.SIGNALS]: 'signals',
  [DOMAINS.HAZARD]: 'hazard',
}

export function createEventId(lat, lng, timestamp, source, title) {
  const raw = `${lat}|${lng}|${timestamp}|${source}|${title}`
  let hash = 0x811c9dc5
  for (let i = 0; i < raw.length; i++) {
    hash ^= raw.charCodeAt(i)
    hash = (hash * 0x01000193) >>> 0
  }
  return hash.toString(36) + '_' + timestamp.toString(36)
}

export function createEvent(fields) {
  const tier = fields.tier || TIERS.LATENT
  const corrobCount = Math.min(Math.max(fields.corroborationCount || 1, 1), 5)
  const isAuthoritative = fields.authoritative || false
  const baseOpacity = CORROBORATION_OPACITY[corrobCount] || 0.35
  const opacity = isAuthoritative && corrobCount === 1
    ? Math.max(0.75, baseOpacity)
    : baseOpacity

  return {
    id: fields.id || createEventId(
      fields.lat || 0,
      fields.lng || 0,
      Date.parse(fields.timestamp || new Date().toISOString()),
      fields.source || '',
      fields.title || ''
    ),
    tier,
    shape: TIER_SHAPES[tier],
    domain: fields.domain || DOMAINS.SIGNALS,
    icon: DOMAIN_ICONS[fields.domain] || 'signals',
    color: TIER_COLORS[tier],
    timestamp: fields.timestamp || new Date().toISOString(),
    fetchedAt: new Date().toISOString(),
    lat: fields.lat || 0,
    lng: fields.lng || 0,
    latApproximate: fields.latApproximate || false,
    severity: Math.max(1, Math.min(5, fields.severity || 1)),
    corroborationCount: corrobCount,
    corroborationSources: fields.corroborationSources || [fields.source || 'unknown'],
    opacity,
    disputed: fields.disputed || false,
    authoritative: isAuthoritative,
    ttl: fields.ttl || 600,
    trajectory: fields.trajectory || null,
    correlatedEventIds: fields.correlatedEventIds || [],
    title: fields.title || '',
    detail: fields.detail || '',
    source: fields.source || '',
    sourceUrl: fields.sourceUrl || '',
    tags: fields.tags || [],
  }
}
