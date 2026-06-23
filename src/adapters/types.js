/**
 * Source adapter contract — Collection plane (Phase 4).
 * Each adapter owns transport config, normalization, and health metadata.
 */

/** @typedef {'A' | 'B' | 'C'} SourceTier */

/**
 * @typedef {object} SourceHealth
 * @property {'ok' | 'degraded' | 'unavailable'} status
 * @property {string} [message]
 * @property {number} [lastFetchMs]
 */

/**
 * @typedef {object} SourceMetadata
 * @property {string} label
 * @property {string} module
 * @property {string} dimension
 * @property {SourceTier} tier
 * @property {'global' | 'regional' | 'approximate'} coverage
 * @property {boolean} authoritative
 * @property {boolean} requiresKey
 * @property {number} pollIntervalMs
 * @property {string} [sourceUrl]
 * @property {string} [apiKeyHelpUrl]
 */

/**
 * @typedef {object} PollConfig
 * @property {string} url
 * @property {'json' | 'text'} format
 * @property {number} pollInterval
 */

/**
 * @typedef {object} SourceAdapter
 * @property {string} id
 * @property {SourceTier} tier
 * @property {number} pollIntervalMs
 * @property {string[]} [requiredEnv]
 * @property {() => SourceMetadata} metadata
 * @property {(envKeys: Record<string, string>) => PollConfig | null} buildPollConfig
 * @property {(raw: unknown, deps: NormalizeDeps) => object[]} normalize
 * @property {(ctx?: { lastError?: string | null }) => SourceHealth} health
 */

/**
 * @typedef {object} NormalizeDeps
 * @property {(lat: number, lng: number, timestamp: number, source: string, title: string) => string} createEventId
 * @property {(fields: Record<string, unknown>) => object} makeEvent
 */

export const SOURCE_TIERS = /** @type {const} */ ({
  A: 'A',
  B: 'B',
  C: 'C',
})
