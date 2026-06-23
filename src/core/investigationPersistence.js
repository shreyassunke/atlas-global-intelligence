/**
 * Local investigation document persistence per workspace (until Supabase investigations table ships).
 */
import { parseInvestigation, InvestigationSchema } from './investigationSchema.js'

const KEY_PREFIX = 'atlas_investigation_'

/**
 * @param {string} workspaceId
 * @returns {import('./investigationSchema.js').Investigation | null}
 */
export function loadInvestigationForWorkspace(workspaceId) {
  if (!workspaceId) return null
  try {
    const raw = localStorage.getItem(`${KEY_PREFIX}${workspaceId}`)
    if (!raw) return null
    const parsed = parseInvestigation(JSON.parse(raw))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

/**
 * @param {string} workspaceId
 * @param {import('./investigationSchema.js').Investigation} investigation
 */
export function saveInvestigationForWorkspace(workspaceId, investigation) {
  if (!workspaceId || !investigation) return
  try {
    localStorage.setItem(`${KEY_PREFIX}${workspaceId}`, JSON.stringify(investigation))
  } catch { /* quota */ }
}

/**
 * Build a fresh investigation from workspace scope.
 * @param {Object} workspace — Supabase row
 */
export function buildInvestigationFromWorkspace(workspace) {
  const now = new Date().toISOString()
  const regions = workspace.focus_regions || []
  const keywords = workspace.keywords || []
  const scopeLabel = [
    regions.length ? regions.join(', ') : null,
    keywords.length ? keywords.join(' · ') : null,
  ].filter(Boolean).join(' — ') || 'Global scope'

  return InvestigationSchema.parse({
    id: `inv-${workspace.id}`,
    title: workspace.name || 'Investigation',
    industry: 'general',
    scope: {
      dimensions: workspace.active_dimensions?.length
        ? workspace.active_dimensions
        : undefined,
      query: keywords.join(' '),
    },
    evidence: [],
    entities: regions.map((iso) => ({
      id: `place-${iso}`,
      label: iso,
      kind: 'place',
      iso,
    })),
    connections: [],
    blocks: [{
      id: 'block-scope',
      kind: 'narrative',
      title: 'Scope',
      content: workspace.description || `Monitoring ${scopeLabel}.`,
    }],
    audit: { createdAt: now, updatedAt: now, revision: 1 },
  })
}
