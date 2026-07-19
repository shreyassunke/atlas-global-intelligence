# ATLAS Engineering

> **Document type:** Engineering process & system design
> **Foundations:** Elon Musk (first principles · the 5-step algorithm) · Peter Thiel (*Zero to One* — monopoly, 10×, definite planning) · Naval Ravikant (permissionless leverage · compounding · long-term games)
> **Related:** [`ATLAS_STRATEGY.md`](./ATLAS_STRATEGY.md) · [`ATLAS_ANALYST_PLATFORM_PLAN.md`](./ATLAS_ANALYST_PLATFORM_PLAN.md) · [`SOURCES.md`](./SOURCES.md) · [`SOURCE_GEOLOCATION_REFERENCE.md`](./SOURCE_GEOLOCATION_REFERENCE.md)

---

## Purpose

This document defines *how ATLAS is built* — the engineering process, phase gates, MVP constraints, system design, and cost structure. The strategy doc answers *what* and *why*; this answers *how*, under three operating ideologies:

| Thinker | Core idea | How it governs engineering |
|---------|-----------|----------------------------|
| **Musk** | First principles + the 5-step algorithm | Reduce to physics/truth; delete before you add; ship fast; automate last |
| **Thiel** | Monopoly through 10× depth; definite optimism | Build depth in one vertical; plan concretely; refuse breadth |
| **Naval** | Permissionless leverage; compounding | Code + media scale without labor; build durable, swappable assets |

---

## The engineering operating system

### Musk's 5-step algorithm (the master loop)

Applied to every feature, in order. Steps 1–2 matter most and are the most skipped.

1. **Make the requirements less dumb.** Every requirement has an owner (a person, never "the system"). Question it. Most engineering waste is optimizing something that should not exist. *ATLAS example: "plot every source on the globe" is a dumb requirement — it destroys the trust layer. Deleted.*
2. **Delete the part or process.** If you're not adding back ≥10% of what you delete, you didn't delete enough. Prefer removing a feed, a panel, or a renderer over adding one. *The best part is no part.*
3. **Simplify or optimize.** Only *after* deleting. Do not optimize a thing that shouldn't exist.
4. **Accelerate cycle time.** Speed up the loop — but never before steps 1–3.
5. **Automate.** Last. Automating a dumb, un-deleted process just scales the waste.

> **Anti-pattern warning (Musk's own mistake):** he automated first at Tesla and had to reverse it. In ATLAS terms: do not build a config-driven source-plugin framework before you've manually proven which sources matter.

### First-principles reductions for ATLAS

| Assumed truth | First-principles reality | Consequence |
|---------------|--------------------------|-------------|
| "We need many data sources" | Sources are free and commoditized; **fusion + trust** is the value | Add sources only when they feed fusion |
| "We need a photorealistic 3D globe" | The globe is a *presentation leaf*; fusion logic is renderer-agnostic | Ship on a free renderer; Google 3D is optional |
| "We need a database from day one" | An MVP needs *one working workflow*, not infrastructure | Persistence arrives in Phase 2, not Phase 0 |
| "We need to serve everyone" | A monopoly starts in a tiny market (Thiel) | Beachhead = conflict/crisis analysts only |

---

## System architecture

ATLAS is a **renderer-agnostic, four-plane pipeline**. This is the single most important engineering fact: the fusion/trust logic (the moat) never depends on the renderer or the storage (the commodities).

```
Sources (~56 OSINT feeds)
  │
  ▼
[COLLECTION]   fetchManager.worker.js · SOURCE_CATALOG · /api/* proxies
  │            poll → normalize to one event schema → set latApproximate honestly
  ▼
[INTELLIGENCE] globe-core/viewModels · entityResolution · crossSourceMerge · triage
  │            resolve, corroborate, rank, score trust
  ▼
[PRESENTATION] renderer leaf (SWAPPABLE)
  │            ├─ globe.gl / MapLibre   ← default, $0
  │            └─ GoogleGlobe (Map3D)   ← optional hi-fi / street verification
  ▼
[DELIVERY]     investigation canvas · stixExport · reportExport · briefExport
               select → connect → draft → export → shareable URL
```

**Design rules that protect the architecture:**

1. **Never leak fusion/trust logic into a renderer.** `GoogleGlobe.jsx` and any future `GlobeGLView` consume view models; they do not compute them.
2. **All CORS-blocked or keyed feeds go through `/api/*`.** Keys stay server-side (as `feed-proxy`, `gdacs-rss`, `indicators` already do).
3. **`latApproximate` is sacred.** A centroid must never render like a real coordinate. This is the trust differentiator in code form (see [`SOURCE_GEOLOCATION_REFERENCE.md`](./SOURCE_GEOLOCATION_REFERENCE.md)).
4. **The renderer is a leaf, not a foundation.** Swapping globes is a low-risk, reversible change.

---

## Engineering phases

Each phase has a **Musk gate** (what to delete/prove), a **Thiel gate** (monopoly depth), and a **Naval gate** (leverage/compounding). A phase is not "done" until all three pass.

### Phase 0 — Reduce & prove the spine (weeks, not months)

**Goal:** One vertical slice works end-to-end for a single conflict event.

| Workstream | Deliverable |
|------------|-------------|
| Requirement reduction | Cut the source list to the conflict beachhead (ACLED, UCDP, GDELT CAMEO, ReliefWeb, GDACS, USGS, FIRMS, tactical tracks) |
| Free renderer | Default globe on `globe.gl`/MapLibre; Google Map3D behind an env flag |
| One workflow | Event → fused card → brief export, on a free stack |

- **Musk gate:** Have you deleted every source/panel not needed to render one conflict event well?
- **Thiel gate:** Is this slice 10× faster than doing it by hand?
- **Naval gate:** Does it run at $0 with no per-user labor?

### Phase 1 — Monopolize the real-time layer (0–6 months)

**Goal:** Fastest credible live picture for conflict/crisis events.

| Workstream | Deliverable |
|------------|-------------|
| Data reliability | Tiered source catalog, session backfill, provenance on every card |
| Trust UX | Precision tiers visible; no misleading centroids on the globe |
| Fusion | Cross-source corroboration (ACLED + GDELT + ReliefWeb → one card) |
| Design partners | 3–5 analysts using it weekly |

- **Musk gate:** Cycle time — can a user reach an actionable picture in < 60s?
- **Thiel gate:** Do partners trust the pins without checking source tabs?
- **Naval gate:** Are shareable briefs spreading without a sales touch?

### Phase 2 — Own the analyst workflow (6–12 months)

**Goal:** The default place analysts *investigate*, not just watch.

| Workstream | Deliverable |
|------------|-------------|
| Investigation canvas | Select → connect → draft → export as the default flow |
| Evidence stream | Feed scoped to the active investigation with "Add to canvas" |
| Persistence | Supabase-backed investigations + entity graph (compounding begins) |
| Distribution | Shareable brief URLs + PDF export |

- **Musk gate:** Automate only the workflows now proven manually in Phase 1.
- **Thiel gate:** Does saved work compound into a moat competitors can't clone?
- **Naval gate:** Is the entity graph an asset that grows while you sleep?

### Phase 3 — System of record (12–24 months)

**Goal:** The layer teams rely on for "what happened, where, how sure?"

| Workstream | Deliverable |
|------------|-------------|
| Entity graph | Cross-event resolution over time |
| Report engine | Industry templates (NGO sitrep, journalism brief, risk memo) |
| Vertical expansion | One adjacent vertical (not two) |
| Revenue | Seat-based SaaS; optional Google Map3D as paid hi-fi mode |

- **Musk gate:** Is anything still manual that should now be automated?
- **Thiel gate:** Beachhead NPS > 50 before expanding.
- **Naval gate:** Do assets (graph, corpus, reputation) earn independent of your time?

---

## MVP constraints

The MVP is scoped by physics and by focus — not by ambition.

### Definition of the MVP

> Live conflict feed fused onto a globe with visible trust tiers → select events → one-click brief export → shareable URL.

Everything else is post-MVP. If a feature isn't on this path, it's deleted from the MVP (Musk step 2).

### Hard technical constraints

| Constraint | Reality | Mitigation |
|-----------|---------|------------|
| **CORS** | Feeds like GDACS, NOAA, UCDP, ProMED block browser fetches | Proxy via `/api/feed-proxy` + same-origin rewrites (`vercel.json`) |
| **API keys** | ~18 feeds need keys; most are free-registration | Use free keys; server-side only |
| **Billing-required APIs** | Google Map3D + BigQuery need a card on file | Excluded from MVP (see cost structure) |
| **Vercel Hobby limits** | Function duration + monthly execution caps | Keep heavy PDF export lean; watch cold starts |
| **Browser marker budget** | The globe degrades if overloaded | Keep LOD caps (`choroPolygons.slice(0,220)`, satellite slicing) — also enforces the trust thesis |
| **Rate limits** | GDELT shares a budget; `gdelt-events` GEO API is 404 | Respect `SOURCE_CATALOG` poll intervals; keep dead sources disabled |

### Strategic constraints (self-imposed, from strategy doc)

- Scope to the **conflict/crisis beachhead** — not all 56 sources equally.
- The **trust layer must be visible** — it's the differentiator; shipping false precision ships the competitor's flaw.
- **One complete workflow beats ten half-features.**
- Success bar: a design partner opens ATLAS *during a real event* and exports a brief unprompted.

---

## Design principles

Engineering and product design under the three ideologies.

### Product design

- **Definite, not adaptive (Thiel).** Have a concrete plan for the beachhead. "We'll add sources and see" is not a plan.
- **Trust as the visual identity.** Precision tiers, provenance chips, and the `≈` prefix are the brand. Competitors don't do this — lean in.
- **The globe is the interface, not the product.** The product is fused, trust-scored intelligence. The globe presents it.

### Code design

- **Delete before abstract (Musk).** Don't build a plugin framework for sources until manual sources prove the pattern.
- **Renderer-agnostic core (Naval leverage).** One `globe-core` serves any renderer and unlimited users — code as permissionless leverage.
- **Swappable commodities, protected moat.** Renderer and storage are replaceable; fusion, trust scoring, and the entity graph are not.
- **Honest normalization.** Every new source sets `lat`, `lng`, and `latApproximate` explicitly in the worker — no silent defaults.

### Anti-design (what we refuse to build)

- A config-driven "any source" framework before sources are proven
- A photorealistic globe as mandatory infrastructure
- Any feature requiring per-user manual labor (violates leverage)
- Plotting ticker-only sources to inflate pin counts (violates trust)

---

## Cost structure

The goal is a **$0, no-credit-card MVP**, expanding cost only when revenue justifies it (Naval: assets before liabilities).

### $0 tier — MVP (no billing account, no card)

| Layer | Service | Free allowance |
|-------|---------|----------------|
| Hosting + serverless | **Vercel Hobby** | Free; sufficient for MVP |
| Database + auth | **Supabase free** | 500MB DB, 50k MAU |
| Globe renderer | **globe.gl / MapLibre** | Open-source, no key, no billing |
| No-key feeds | USGS, GDACS, EONET, GDELT, UCDP, OpenSky, NOAA, ReliefWeb, WHO, LOC, CoinGecko | $0 |
| Free-registration feeds | FIRMS, ACLED, AISStream, Finnhub, FRED, EIA, Cloudflare, Shodan | $0 (key only) |

### Deferred-cost tier — requires a billing account (excluded from MVP)

| Dependency | Cost trigger | Decision |
|-----------|--------------|----------|
| **Google Map3D / Photorealistic 3D Tiles** | Card required even for free allowance; usage bills automatically | Behind env flag; enable as paid hi-fi / street-verification mode only |
| **GDELT BigQuery** | Free 1TB/mo but needs GCP billing; runaway queries bill | Disable for MVP; enable when analytics demand it |
| **Google Street View / Places** | Same billing account | Defer to Phase 2 verification feature |

### Cost-scaling philosophy

- **Introduce a cost only when it unlocks the 10× or is demanded by a paying partner (Thiel).**
- **Prefer permissionless-leverage spend** (code, automation, hosting) over labor spend (Naval).
- **The renderer swap is the linchpin:** it's what keeps the MVP at $0 and avoids Google vendor lock-in, while leaving Map3D available as a premium mode later.

---

## Decision filters (apply in order to any engineering choice)

1. **Musk — Is the requirement dumb?** Can it be deleted entirely? (Steps 1–2)
2. **Thiel — Is it 10× and does it compound?** If it's 1× parity with a specialist tool, defer.
3. **Naval — Does it use leverage and stay durable?** Prefer swappable commodities and code that scales without labor.
4. **The one-sentence test:** *Does this make ATLAS the fastest, most trustworthy live picture for conflict/crisis analysts — at $0 to run?* If no, defer it.

---

## Summary

| Question | Answer |
|----------|--------|
| **How do we build?** | Renderer-agnostic four-plane pipeline; delete before adding |
| **What's the master loop?** | Musk's 5 steps: de-dumb → delete → simplify → accelerate → automate |
| **What's the MVP?** | One conflict workflow: feed → fused globe → brief export → share, at $0 |
| **What protects the moat?** | Fusion, trust scoring, and the entity graph stay independent of swappable renderer/storage |
| **What's the cost target?** | $0 MVP on Vercel + Supabase + free renderer + free feeds; costs only with revenue |
| **What do we refuse?** | Premature abstraction, mandatory 3D globe, breadth over depth, false precision |

**Reduce to first principles. Delete relentlessly. Compound the moat. Ship the smallest thing that dominates one vertical — at zero cost.**
