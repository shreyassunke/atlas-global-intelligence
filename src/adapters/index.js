/**
 * Source adapter registry — Collection plane entry point.
 */
import { acledAdapter } from './acled.js'

/** @type {import('./types.js').SourceAdapter[]} */
export const ADAPTER_REGISTRY = [
  acledAdapter,
]

/** @type {Record<string, import('./types.js').SourceAdapter>} */
export const ADAPTERS_BY_ID = Object.fromEntries(
  ADAPTER_REGISTRY.map((a) => [a.id, a]),
)

/**
 * @param {string} id
 * @returns {import('./types.js').SourceAdapter | null}
 */
export function getAdapter(id) {
  return ADAPTERS_BY_ID[id] || null
}

/**
 * Build keyed poll configs from registered adapters.
 * @param {Record<string, string>} envKeys
 * @returns {Record<string, import('./types.js').PollConfig>}
 */
export function buildAdapterPollConfigs(envKeys) {
  /** @type {Record<string, import('./types.js').PollConfig>} */
  const out = {}
  for (const adapter of ADAPTER_REGISTRY) {
    const cfg = adapter.buildPollConfig(envKeys)
    if (cfg) out[adapter.id] = cfg
  }
  return out
}

export { acledAdapter } from './acled.js'
export * from './types.js'
