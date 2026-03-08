# Dimentria Product Doc

## Feature / Module Name
`EdgeWander` map-first solo exploration module

## One-Line Definition
A mobile-first exploration app that generates nearby solo travel quest arcs by balancing a safety envelope (`Guardian`) against novelty (`Expressive`).

## Problem Solved
Most travel tools answer "what is popular?" or "how do I get there?" They do not answer:

- what is worth doing right now from this exact location
- what is the safer branch versus the stranger branch
- whether the strange option is still legal, consent-clear, open, and easy to exit
- how prior visits and bad outcomes should change the next recommendation

This module solves that by combining a local quest engine, spatial filtering, route previews, editorial curation, and post-visit feedback.

## Why It Matters In Dimentria
If Dimentria is meant to support guided exploration instead of generic place search, this is the core loop. The codebase already implements:

- location-aware branching
- safety-gated recommendation logic
- editorial curation and external candidate review
- persistence of traveler state and trip progression

Without this module, Dimentria would be a static catalog. With it, the product becomes a situational guide.

## Core User Outcomes
- See nearby options anchored to the current city and current location context.
- Understand the difference between the safer path and the higher-voltage path.
- Avoid venues that fail legality, consent, exitability, open-hours, distance, or no-go rules.
- Log a confessional after visiting a place and have future routing change as a result.
- Keep exploring even when offline by falling back to cached trail state and emergency essentials.

## UI / UX Behavior
The main experience is in [src/App.tsx](E:/neoFlunare/src/App.tsx) and [src/components/MapExplorer.tsx](E:/neoFlunare/src/components/MapExplorer.tsx).

Traveler shell:
- map-first layout with Leaflet
- bottom-sheet-like detail card for the selected branch
- 3 active quest arcs during daytime, fewer at blue-hour/night depending on slot logic
- visible Guardian / Expressive / Fallback differentiation
- route summary, exit summary, and "Why safe enough now" reasoning
- first-run Tokyo briefing when the user has no completed nodes or confessionals
- confessional drawer for structured post-visit feedback

Studio shell:
- catalog editing
- Google Places candidate import and review
- published-source freshness and invariant-drift visibility
- Tokyo quest log

Cross-shell diagnostic surface:
- recommendation audit panel is still rendered outside the studio gate

## States And Flows
### Primary traveler flow
1. Load local profile, trip session, cache, map region, catalog, and reports.
2. Resolve location source as `live`, `cached`, or `city-fallback`.
3. Build a trail with nearby arcs.
4. Render map pins and branch cards.
5. User marks a branch complete, skips it, or opens the confessional.
6. Confessional updates reports, completed nodes, trip session, and quarantine state.
7. Next trail rebuild uses the updated state.

### Offline flow
1. If connectivity is `offline` and a trail cache exists, [buildTrailResult](E:/neoFlunare/src/lib/engine.ts) returns cached arcs.
2. Emergency essentials and emergency anchors still render.
3. Local storage remains writable.
4. Sync is deferred until connectivity returns.

### Editorial flow
1. Import candidate places through the Google Places review queue.
2. Match candidates against existing catalog nodes by source ID and geo/title similarity.
3. Fill Guardian-critical fields manually.
4. Approve/merge candidate into the live catalog only if invariant checks pass.
5. Re-verify published nodes to refresh freshness metadata.

## Design Principles Applied
- Map first, text second.
- Safety gates are hard filters, not ranking hints.
- Novelty is allowed only inside a viable exit path.
- Traveler UI stays calm even when the underlying logic is complex.
- Editorial review is explicit. Third-party data does not publish directly.
- Local state is immediate. Cloud sync is background durability.

## Acceptance Criteria
- The app can generate and render a live trail from the current destination and location context.
- Each surfaced expressive branch has a valid exit plan.
- Unsafe or uncertain nodes do not appear in live routing.
- Confessional feedback affects later recommendations.
- Cached trail state works offline.
- Editorial candidates cannot be published without required Guardian fields.
- Published Google-backed nodes can be re-verified.
- Build and test are green on the current codebase.

## Known Limitations
- The repo and package still identify the product as `EdgeWander`; "Dimentria" does not appear in runtime code.
- The catalog itself is stored locally in `localStorage`; it is not synced through Supabase.
- Google Places import falls back to mocked candidate data if Supabase env vars or the edge function are unavailable.
- Route previews are deterministic local estimates. There is no live directions API.
- City coverage is limited to `Tokyo`, `Berlin`, and `New Orleans`.
- Recommendation audit and editorial tooling live inside the same app shell instead of a separate admin surface.
- Recommendation audit is still visible in the main shell; only the Tokyo quest log is currently studio-gated.
- Supabase tables `ingestion_candidates`, `candidate_reviews`, and `source_mappings` exist in schema, but the current client primarily syncs editorial state through the `editorial_states` payload record.

## Next Extensions
- Separate editorial/admin UI from traveler UI.
- Sync the full experience catalog instead of only traveler/editorial metadata.
- Replace mocked Google fallback with deployed edge-function-only ingestion in production.
- Add real route providers if ETA precision becomes important.
- Add city-specific onboarding beyond Tokyo.
- Formalize editorial roles; right now anonymous sync is traveler-oriented, not staff-oriented.

## Reality Check
### What exists now
- Map-first trail generation
- spatial filtering and route previews
- Guardian / Expressive / Fallback branching
- Red Thread selection and drift cards
- confessional reviews and quarantine logic
- local persistence for profile, reports, cache, session, and catalog
- optional Supabase sync for traveler/trip/editorial state
- Google Places candidate review pipeline
- published-node freshness and invariant audits

### What is still placeholder
- Google Places can fall back to mocked data in the client
- route previews are heuristic, not provider-backed
- editorial collaboration is not multi-user
- catalog sync is not implemented

### What must come later
- production-grade editorial backend usage
- role-aware operations
- stronger destination breadth
- cleaner separation between traveler product and editorial tooling
