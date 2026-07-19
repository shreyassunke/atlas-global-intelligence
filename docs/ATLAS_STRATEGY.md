# ATLAS Strategy

> **Document type:** Business & project plan
> **Foundations:** *Zero to One* (Peter Thiel) · Naval Ravikant (*How to Get Rich* / *Almanack*)
> **Related:** [`SOURCES.md`](./SOURCES.md) · [`ATLAS_ANALYST_PLATFORM_PLAN.md`](./ATLAS_ANALYST_PLATFORM_PLAN.md)

---

## Executive summary

ATLAS is a **real-time geospatial OSINT fusion platform** — not a link directory, not a general-purpose investigation tool. It ingests ~56 open-source feeds, normalizes them into a single event model, and renders a live, trust-scored picture of what is happening in the world and where.

**The strategic bet:** Raw OSINT data is free and commoditized ([OSINT Framework](https://osintframework.com/) proves this). The durable value is in **fusion, geolocation confidence, and analyst workflow** — turning scattered public signals into a credible, actionable picture faster than any manual workflow.

**The Thiel constraint:** We will not compete on breadth. We will monopolize a narrow beachhead, then expand in concentric circles.

**The Naval constraint:** We will build with **permissionless leverage** (code that scales without our time) and compound **specific knowledge + reputation** into a product that earns while we sleep.

**Proposed beachhead:** Conflict and crisis analysts who need live, geolocated, multi-source situational awareness — the vertical our current source mix and analyst tooling already serve best.

---

## Vision

**Become the system of record for real-time, trust-scored, geolocated OSINT — starting with conflict and crisis analysis.**

Not "intelligence on anything." Not "another OSINT directory." The last great product in live open-source situational awareness: the layer analysts open when something breaks and need to know *what, where, and how sure* — in seconds, not hours.

---

## Mission

Give analysts a single live picture of the world built from open sources — fused, geolocated, and scored for credibility — so they can triage faster, investigate deeper, and deliver cleaner reports.

---

## Strategic thesis

Two philosophies, one system:

| Principle | Thiel (*Zero to One*) | Naval | ATLAS application |
|-----------|------------------------|-------|-------------------|
| **Market** | Competition is for losers; aim for monopoly | Escape competition through authenticity — do what only you can do | Own one vertical deeply before expanding; don't clone the OSINT Framework |
| **Product** | Be 10× better on one axis | Productize your specific knowledge | 10× = real-time multi-source fusion + geolocation trust, not "more feeds" |
| **Secret** | Every monopoly rests on a truth few believe | Specific knowledge can't be trained; it compounds | The data is free; the fusion layer and trust scoring are the product |
| **Leverage** | Technology enables scale | Code and media are permissionless leverage | One codebase serves unlimited analysts; exports/briefs are media leverage |
| **Time horizon** | Definite optimism — plan, don't drift | Play long-term games; compound knowledge and reputation | Build the entity graph and investigation corpus over years, not sprints |
| **Focus** | Start small, monopolize, expand | If you can't decide, the answer is no | Say no to username lookups, breach crawlers, and every Framework branch that doesn't feed fusion |
| **Distribution** | Sales is as important as engineering | Build or sell — you need both | Briefs, shareable views, and vertical design partners are distribution, not afterthoughts |
| **Durability** | Last mover wins | Wealth = assets that earn while you sleep | Live feeds are commodity; accumulated graph + investigations are the moat |

---

## The problem

Analysts working from open sources today face three structural failures:

1. **Fragmentation** — USGS, GDELT, ACLED, ADS-B, AIS, ReliefWeb, and dozens of others live in separate tabs, schemas, and refresh cycles. Stitching a live picture by hand takes hours.
2. **False precision** — Most OSINT tools plot everything on a map. Country centroids, publisher HQ placeholders, and real epicenters look the same. Analysts can't trust what they see.
3. **No workflow** — Directories like the OSINT Framework answer "where do I look?" They don't answer "what matters right now, how do I connect it, and how do I ship a report?"

ATLAS exists to collapse these three failures into one product.

---

## Product wedge

### What ATLAS is

A **real-time geospatial fusion engine** with an analyst workstation on top:

| Layer | Capability | Code anchor |
|-------|------------|-------------|
| **Collection** | ~56 live OSINT feeds, normalized to one event schema | `fetchManager.worker.js`, `SOURCE_CATALOG` |
| **Intelligence** | Entity resolution, cross-source merge, watchlist matching, triage | `entityResolution.js`, `crossSourceMerge.js`, `triage.js` |
| **Analysis** | Investigation canvas, GDELT context, evidence stream | `ATLAS_ANALYST_PLATFORM_PLAN.md` |
| **Delivery** | STIX, report, and brief export | `stixExport.js`, `reportExport.js`, `briefExport.js` |
| **Trust** | Geolocation precision tiers; globe eligibility rules | `sourceGeolocation.js`, `SOURCE_GEOLOCATION_REFERENCE.md` |

### What ATLAS is not

| We are not building | Why |
|---------------------|-----|
| An OSINT link directory | Commoditized; [OSINT Framework](https://osintframework.com/) already owns "breadth of links" |
| A general-purpose "investigate anything" tool | Invites perfect competition with hundreds of specialist tools |
| A map that plots everything | Misleading centroids destroy analyst trust; our trust layer is the differentiator |
| A data-vendor reselling feeds | Feeds are free; fusion and workflow are the product |

### The 10× claim

**Manually building a live, multi-source, geolocated picture of a breaking event takes hours. ATLAS does it in seconds.**

That order-of-magnitude gap — not feed count — is the monopoly candidate.

---

## Competitive landscape

| Competitor type | Example | Their wedge | Our response |
|-----------------|---------|-------------|--------------|
| Link directories | OSINT Framework | Breadth of free tools | Ignore — different product category |
| Specialist tools | Shodan, ACLED portal, FlightRadar24 | Depth in one domain | Integrate as sources; don't rebuild |
| Enterprise intel platforms | Palantir, i2 | Closed data + enterprise sales | We compete on open-source fusion + price/access, not classified data |
| News aggregators | GDELT DOC, Google News | Narrative volume | We add geolocation, fusion, and analyst workflow |

**Do not compete where they are strong. Monopolize where none of them sit: live, trust-scored, multi-domain OSINT fusion on a single globe with an exportable analyst workflow.**

---

## Beachhead market

### Proposed primary vertical: conflict & crisis analysts

**Who:** OSINT analysts, NGO researchers, journalism desks, insurance/risk teams, and defense-adjacent users who monitor armed conflict, humanitarian crises, and breaking geopolitical events.

**Why this beachhead:**

- Source mix already aligned: ACLED, UCDP, GDELT CAMEO, ReliefWeb, GDACS, USGS, FIRMS, tactical tracks (ADS-B, AIS, NHC).
- Analyst workflow (investigation canvas, entity merge, brief export) maps directly to their job.
- Pain is acute and recurring — crises don't wait for manual tab-stitching.
- Willingness to pay exists in adjacent markets (risk intel, journalism tools, NGO SaaS).

### Secondary verticals (expand later, in concentric circles)

| Vertical | When | Source/workflow fit |
|----------|------|---------------------|
| OSINT journalists | Phase 2 | GDELT DOC, fact-check, Bluesky, news dock |
| Maritime / aviation awareness | Phase 3 | AIS, ADS-B, NHC — already built, different buyer |
| Environmental / disaster response | Phase 3 | USGS, GDACS, EONET, FIRMS |

**Rule:** No secondary vertical gets engineering priority until the beachhead has design partners and repeatable daily use.

---

## Moat: what compounds over time

Naval: *compound interest applies to knowledge, relationships, and capital.* Thiel: *the last mover captures durable cash flow.*

### Permissionless leverage (Naval)

- **Code:** One ingestion + fusion pipeline serves every user without linear headcount.
- **Media:** Shareable briefs, exported reports, and embeddable live views spread the product without a sales team.

### Compounding assets (Thiel + Naval)

| Asset | Year 1 | Year 3+ |
|-------|--------|---------|
| **Cross-source entity graph** | Basic entity resolution | Resolved entities across events, sources, and time — unreplicable by a feed aggregator |
| **Investigation corpus** | Saved canvases and briefs | Searchable history of analyst work; network effects within teams |
| **Trust scoring** | Geolocation precision tiers | Proprietary credibility model tuned on analyst feedback |
| **Reputation** | "The tool that tells you how much to trust each pin" | Category-defining brand in open-source situational awareness |

Live feeds alone are not a moat. Anyone can add a USGS poll. **History + resolved entities + trust scoring + analyst workflow** is the moat.

---

## Go-to-market

Thiel: *distribution is half the company.* Naval: *you need to build or sell — ideally both.*

### Phase 0 — Design partners (now)

- Recruit 3–5 conflict/crisis analysts (NGO, journalism, risk, or independent OSINT).
- Weekly feedback loop on fusion quality, trust UX, and export workflow.
- Success = they open ATLAS during a real breaking event without being asked.

### Phase 1 — Product-led distribution

- **Shareable artifacts:** Brief and report exports as the primary growth surface — "here's the live picture of X" links.
- **Trust as brand:** Market the geolocation precision system explicitly — competitors don't.
- **Vertical content:** Publish fused situational snapshots for active crises (media leverage, builds reputation).

### Phase 2 — Vertical sales

- Package for NGO desks, journalism orgs, and risk teams.
- Pricing tied to seats + investigation persistence + export volume — not feed access (feeds are free).

---

## Project roadmap

Aligned with [`ATLAS_ANALYST_PLATFORM_PLAN.md`](./ATLAS_ANALYST_PLATFORM_PLAN.md). Each phase has a Thiel gate (monopoly depth) and a Naval gate (leverage/compounding).

### Phase 1 — Monopolize the real-time layer (0–6 months)

**Goal:** Be the fastest credible live picture for conflict/crisis events.

| Workstream | Deliverable | Gate |
|------------|-------------|------|
| Data reliability | Tier A/B source catalog, session backfill, provenance on every event card | Analyst trusts pins without checking source tabs |
| Trust UX | Geolocation tiers visible in UI; no misleading centroids on globe | "How sure are we?" is answerable in one glance |
| Fusion | Cross-source corroboration for conflict events (ACLED + GDELT + ReliefWeb) | One event, multiple sources, one card |
| Design partners | 3–5 active users providing weekly feedback | Repeat use during live events |

### Phase 2 — Own the analyst workflow (6–12 months)

**Goal:** Become the default place analysts investigate, not just watch.

| Workstream | Deliverable | Gate |
|------------|-------------|------|
| Investigation canvas | Select events → connect → draft → export | Default flow replaces "browse + inspect one event" |
| Evidence stream | Feed scoped to active investigation with "Add to canvas" | Ticker becomes evidence, not noise |
| Persistence | Supabase-backed investigations and entity graph | Work compounds across sessions |
| Distribution | Shareable brief URLs and PDF export | Users share ATLAS output without prompting |

### Phase 3 — System of record (12–24 months)

**Goal:** The layer teams rely on for "what happened, where, and how sure are we?"

| Workstream | Deliverable | Gate |
|------------|-------------|------|
| Entity graph | Cross-event entity resolution over time | Competitors can't replicate from feeds alone |
| Report engine | Industry templates (NGO sitrep, journalism brief, risk memo) | Export replaces manual report assembly |
| Vertical expansion | Journalist or maritime vertical (one, not both) | Beachhead NPS > 50 before expanding |
| Revenue | Seat-based SaaS for teams | Assets earn while we sleep |

---

## Success metrics

| Horizon | Metric | Target |
|---------|--------|--------|
| **Phase 1** | Design partner weekly active use | ≥ 3 partners, ≥ 3 sessions/week each |
| **Phase 1** | Time-to-picture for a breaking event | < 60 seconds from open to actionable globe view |
| **Phase 2** | Investigation completion rate | ≥ 40% of sessions end in export or saved canvas |
| **Phase 2** | Shareable artifact creation | ≥ 1 brief/report shared externally per partner per week |
| **Phase 3** | Team retention (paid) | ≥ 80% annual retention |
| **Phase 3** | Entity graph depth | ≥ 10× entity resolution coverage vs. launch |

---

## Decision principles

When evaluating any feature, source, or partnership, apply these filters in order:

### 1. Thiel filters

1. **Does it deepen the monopoly or invite competition?** If it puts us head-to-head with a specialist tool on their turf, say no.
2. **Is it 10× or 1×?** Adding a feed that's 1× better than an existing tool dilutes focus.
3. **Does it compound?** One-off features that don't feed the graph, trust model, or workflow are deprioritized.
4. **Is the plan definite?** "We'll add sources and see" is not a plan.

### 2. Naval filters

1. **Does it use permissionless leverage?** Prefer code and media over labor and manual curation.
2. **Does it build specific knowledge?** Fusion quality, trust scoring, and analyst UX are ours to compound — generic UI work is not.
3. **Is this a long-term game?** Features that optimize for a demo but not daily use are traps.
4. **If we can't decide, the answer is no.** Focus is the strategy.

### 3. The one-sentence test

> *Does this make ATLAS the undisputed best tool for live, trust-scored, geolocated OSINT fusion for conflict and crisis analysts?*

If no, defer it.

---

## What we will not do

Explicit anti-roadmap — as important as the roadmap itself:

- Become an OSINT link directory
- Add username/email/breach lookup branches from the OSINT Framework
- Plot ticker-only sources on the globe to inflate pin counts
- Expand to a second vertical before beachhead design partners are retained
- Chase feed count as a marketing metric
- Build features that require our manual labor per user (violates permissionless leverage)
- Compete on classified or proprietary-restricted data — we are OSINT by definition

---

## Open decisions

| Decision | Options | Recommendation | Status |
|----------|---------|----------------|--------|
| Beachhead vertical | Conflict/crisis · Journalism · Maritime · Disaster | Conflict/crisis — best source/workflow fit today | **Proposed** — validate with design partners |
| Pricing model | Free + paid teams · Usage-based · Enterprise | Free live layer + paid persistence/export/teams | Open |
| First design partner profile | NGO · Journalism · Risk · Independent OSINT | 1 of each for diversity | Open |
| Revenue timing | Phase 2 vs Phase 3 | Phase 3 — nail product before charging | Proposed |

---

## Summary

| Question | Answer |
|----------|--------|
| **What are we building?** | Real-time, trust-scored, geolocated OSINT fusion for analysts |
| **Who is it for first?** | Conflict and crisis analysts |
| **What's the moat?** | Fusion + trust scoring + compounding entity graph and investigations |
| **What's the leverage?** | Code (one pipeline, infinite users) + media (shareable briefs/reports) |
| **What do we refuse?** | Breadth without depth, competition with specialists, manual-scale features |
| **What's the endgame?** | The system of record for open-source situational awareness — the last mover in live OSINT fusion |

**Competition is for losers. Compound specific knowledge into a product that scales. Start narrow, dominate, expand.**
