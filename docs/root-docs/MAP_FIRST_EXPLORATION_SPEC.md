# Map-First Exploration Spec

## Scope
This document explains the current end-to-end implementation of the map-first exploration engine that powers the repo today.

The runtime name in code is `EdgeWander`. If Dimentria is the umbrella product, this is the current exploration module inside it.

## End-To-End Product Flow
### 1. Startup
`App.tsx` loads:
- profile
- report map
- completed nodes
- trail cache
- catalog
- trip session
- map region
- sync identity and metadata
- editorial state

Source of truth at startup:
- local storage first
- optional Supabase merge second

### 2. Location resolution
`resolveLocationContext(...)` in [src/lib/spatial.ts](E:/neoFlunare/src/lib/spatial.ts) chooses:
- `live` when browser geolocation exists and is near the current city
- `cached` when there is a stored last location
- `city-fallback` otherwise

This matters because distance filtering and route previews are based on `effectiveLocation`.

### 3. Trail generation
`buildTrailResult(...)` in [src/lib/engine.ts](E:/neoFlunare/src/lib/engine.ts) produces:
- `redThread`
- `arcs`
- `traces`
- `audits`
- `questLog`
- `emergencyEssentials`
- `emergencyAnchors`

Active arc count:
- daytime uses the first 3 blueprints
- blue-hour / night use later blueprints only

Each arc contains:
- primary node
- guardian branch
- expressive branch
- fallback branch
- optional drift card

### 4. Safety gating
Before ranking, a node must pass `baseNodeFilter(...)`.

This enforces:
- editorial approval
- open-window fit
- open-now fit
- legality / consent floor
- no-go preferences
- budget fit for lean travelers
- exit viability
- distance ceiling
- neighborhood floor
- confessional quarantine

This is a hard gate. Nodes that fail do not enter branch scoring.

### 5. Branch ranking
Guardian and expressive branches score differently.

Guardian favors:
- trust
- safety
- exit quality
- fit to theme and traveler interests

Expressive favors:
- novelty
- appetite alignment
- theme fit
- still-valid exits

Expressive can still be suppressed or downgraded when:
- weather is bad
- connectivity is offline or patchy
- time-of-day risk is too high
- edginess exceeds the current cap

### 6. Map rendering
`MapExplorer.tsx` renders:
- current position marker
- branch markers
- radius circle
- emergency markers

The selected branch is then described below the map in `App.tsx` with:
- title
- neighborhood
- category
- trust badge
- distance
- ETA
- mode
- exit summary
- "Why safe enough now"
- "Why now"

### 7. Visit completion and confessional
Traveler actions:
- mark complete
- skip for now
- open confessional

The confessional records:
- reward
- stress
- consent clarity
- exitability
- crowd vibe
- would-solo-again
- freeform note

That feedback updates:
- `reportMap`
- completed node IDs
- trip session visited nodes
- trip session confessionals
- quarantine state when outcomes are bad enough

### 8. Editorial ingestion flow
The studio panel in `App.tsx` supports:
- Google Places candidate import
- candidate review
- guarded publish / merge
- published-source audits
- re-verification

Import path:
1. client calls `importGooglePlacesCandidates(...)`
2. if Supabase env is configured, it hits the edge function
3. otherwise it falls back to mocked places
4. candidates are normalized, matched, and queued

Publish path:
1. editorial draft must pass invariant checks
2. candidate is merged into an existing node or becomes a new node
3. published source mapping is recorded locally
4. approved node can enter live routing

### 9. Sync path
`syncEdgeWanderState(...)` handles:
- anonymous Supabase identity
- fetch of traveler / trip / editorial records
- merge
- push back if necessary

The app never waits on sync before rendering the local experience.

## Implementation Tradeoffs
### Real today
- local-first trail generation
- real map rendering
- real branch selection logic
- real local persistence
- real optional Supabase sync
- real Google Places edge-function path

### Placeholder today
- mock Google candidate fallback
- heuristic route times
- local-only catalog editing
- same-shell editorial UI

### Why those tradeoffs exist
- the engine is already rich enough that product truth comes more from filtering and curation than from additional infrastructure
- local-first behavior keeps the app usable without blocking on network
- external data is treated as verification input, not recommendation truth

## Concrete Acceptance Criteria For The Current Module
- A traveler can open the app, get a live trail, and choose a branch.
- Unsafe nodes do not surface.
- A confessional can change future routing.
- A candidate cannot be published without required Guardian fields.
- A stale published node can be re-verified.
- The app works offline with cached trail state.
- Tests pass.
- Build passes.

## What Would Change This Spec
- moving catalog editing into a dedicated backend
- adding a real directions provider
- splitting editorial UI into a separate app
- renaming the runtime module from `EdgeWander` to `Dimentria`
