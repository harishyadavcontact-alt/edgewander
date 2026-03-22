# Dimentria Tech Spec

## Architecture Context
Current implementation is a single-page React + Vite app with client-side recommendation logic.

Core runtime pieces:
- UI shell: [src/App.tsx](E:/neoFlunare/src/App.tsx)
- map rendering: [src/components/MapExplorer.tsx](E:/neoFlunare/src/components/MapExplorer.tsx)
- recommendation engine: [src/lib/engine.ts](E:/neoFlunare/src/lib/engine.ts)
- spatial helpers: [src/lib/spatial.ts](E:/neoFlunare/src/lib/spatial.ts)
- editorial ingestion: [src/lib/ingestion.ts](E:/neoFlunare/src/lib/ingestion.ts)
- local persistence: [src/lib/storage.ts](E:/neoFlunare/src/lib/storage.ts)
- cloud sync: [src/lib/sync.ts](E:/neoFlunare/src/lib/sync.ts)
- seed content: [src/data/experiences.ts](E:/neoFlunare/src/data/experiences.ts)
- schema / edge function: [supabase/schema.sql](E:/neoFlunare/supabase/schema.sql), [supabase/functions/google-places-search/index.ts](E:/neoFlunare/supabase/functions/google-places-search/index.ts)

The app is mostly client-authoritative. Supabase acts as optional durability and external search transport, not as the primary runtime engine.

## Impacted Services / Modules / Files
### Frontend
- [src/App.tsx](E:/neoFlunare/src/App.tsx)
- [src/components/MapExplorer.tsx](E:/neoFlunare/src/components/MapExplorer.tsx)
- [src/styles.css](E:/neoFlunare/src/styles.css)

### Domain logic
- [src/lib/engine.ts](E:/neoFlunare/src/lib/engine.ts)
- [src/lib/spatial.ts](E:/neoFlunare/src/lib/spatial.ts)
- [src/lib/ingestion.ts](E:/neoFlunare/src/lib/ingestion.ts)
- [src/lib/catalog.ts](E:/neoFlunare/src/lib/catalog.ts)

### Persistence / sync
- [src/lib/storage.ts](E:/neoFlunare/src/lib/storage.ts)
- [src/lib/sync.ts](E:/neoFlunare/src/lib/sync.ts)

### Backend surface
- [supabase/schema.sql](E:/neoFlunare/supabase/schema.sql)
- [supabase/functions/google-places-search/index.ts](E:/neoFlunare/supabase/functions/google-places-search/index.ts)

### Tests
- [src/lib/engine.test.ts](E:/neoFlunare/src/lib/engine.test.ts)
- [src/lib/ingestion.test.ts](E:/neoFlunare/src/lib/ingestion.test.ts)
- [src/lib/sync.test.ts](E:/neoFlunare/src/lib/sync.test.ts)

## Data Model
Primary types are in [src/types.ts](E:/neoFlunare/src/types.ts).

### Core domain
- `TravelerProfile`
- `RiskEnvelope`
- `ExperienceNode`
- `QuestArc`
- `QuestBranch`
- `VisitReport`
- `TripSession`

### Trust / editorial
- `IngestionCandidate`
- `PublishedSourceRecord`
- `EditorialState`
- `RecommendationTrace`
- `PublishedNodeAudit`

### Persistence / sync
- `TravelerState`
- `SyncIdentity`
- `SyncMetadata`
- `RemoteTravelerProfileRecord`
- `RemoteTripSessionRecord`
- `RemoteEditorialStateRecord`

## API Contracts
### Google Places edge function
Endpoint:
- `POST {VITE_SUPABASE_URL}/functions/v1/google-places-search`

Request body:
```json
{
  "city": "Tokyo",
  "query": "occult bookstore"
}
```

Response shape:
```json
{
  "places": [...]
}
```

Behavior:
- Uses Google Places Text Search via `GOOGLE_PLACES_API_KEY`
- Returns `{ places: [] }` when query is empty
- Returns `{ places: [], error: ... }` if the key is missing
- Client falls back to mocked data when env vars or request path are unavailable

### Supabase records used by the client
Tables actively used by [src/lib/sync.ts](E:/neoFlunare/src/lib/sync.ts):
- `traveler_profiles`
- `trip_sessions`
- `editorial_states`

Tables scaffolded in SQL but not yet used as first-class client records:
- `ingestion_candidates`
- `candidate_reviews`
- `source_mappings`

## Scoring / Simulation Logic
Implemented in [src/lib/engine.ts](E:/neoFlunare/src/lib/engine.ts).

### Hard filters
`baseNodeFilter(...)` rejects nodes when any of the following fail:
- wrong city
- not `approved`
- slot mismatch
- currently closed
- blocked by no-go preferences
- legality or consent below threshold
- over budget in `lean` mode
- no viable exits
- `exitConfidence < 0.68`
- outside walk radius
- neighborhood confidence floor not met
- quarantined by confessional history

### Risk shaping
- `slotRisk(...)` degrades envelope values at blue-hour and night
- `expressiveAllowed(...)` disables expressive routing for offline, storms, or weak night envelope
- `expressiveCap(...)` lowers maximum acceptable edginess based on time, weather, connectivity, and appetite

### Ranking
Guardian and expressive branches use separate scoring functions:
- `guardianScore(...)`
- `expressiveScore(...)`

Inputs include:
- Red Thread match
- traveler interest match
- source trust
- provenance freshness
- solo safety and exit quality
- edginess
- distance penalty
- budget pressure
- confessional review penalty
- lane bias

### Progression
- `pickRedThread(...)` selects a destination theme from seeded themes
- `unlockAfter` gates threshold content
- `buildDriftCard(...)` creates an omen/drift detour when timing and appetite align
- `buildQuestLog(...)` persists current arc state plus historical visited/skipped entries

## Rendering Logic
### Traveler shell
`App.tsx` renders:
- hero / envelope summary
- optional traveler profile and risk controls
- map shell
- selected branch sheet
- quest arcs
- quest log
- emergency essentials
- confessional drawer

### Studio shell
Also in `App.tsx`:
- catalog tab
- Google Places candidate review tab
- published-source audit tab
- Tokyo quest log panel

Still rendered in the main shell:
- recommendation audit panel

### Map
`MapExplorer.tsx` renders:
- OpenStreetMap tile layer
- live user marker or fallback marker
- radius circle
- Guardian / Expressive / Fallback markers
- emergency anchor markers
- move-end region watcher

## State Management Implications
State is held in `App.tsx` using React state and effects.

Important state groups:
- traveler state: profile, completed nodes, report map
- trip state: visited/skipped/quarantined/confessionals/map region
- exploration state: live location, selected branch, current trail
- editorial state: catalog, candidates, published source mappings
- sync state: identity, metadata, status

Implication:
- `App.tsx` is currently the orchestration hub
- domain logic is mostly pure
- view/state concerns are not yet separated into smaller feature modules

## Caching / Persistence Implications
### Local persistence
`localStorage` keys are defined in [src/lib/storage.ts](E:/neoFlunare/src/lib/storage.ts).

Stored locally:
- traveler profile
- report map
- completed nodes
- trail cache
- full catalog
- trip session
- map region
- emergency anchors
- last location
- sync identity + metadata
- ingestion candidates
- published sources

### Offline behavior
- `buildTrailResult(...)` returns cached trail data when connectivity is offline and a matching cache exists
- emergency essentials and anchors remain available
- edits continue locally

### Cloud sync behavior
`syncEdgeWanderState(...)`:
- boots from local immediately
- fetches remote state in background
- merges by timestamp or set union depending on field
- pushes merged records back if needed

Merge rules:
- `completedNodeIds`, `visitedNodes`, `skippedNodes`, `quarantinedNodes`, `confessionals`: set union
- `reportMap`: deduped by `nodeId:createdAt`
- candidate merge winner: latest `lastReviewedAt` or `importedAt`
- published sources: keyed by `nodeId:sourceId`

Tradeoff:
- cloud sync is robust for traveler/editorial metadata
- full catalog is still local-only, so multi-device editorial parity is incomplete

## Testing Strategy
Current automated coverage:
- [src/lib/engine.test.ts](E:/neoFlunare/src/lib/engine.test.ts): 13 tests
- [src/lib/ingestion.test.ts](E:/neoFlunare/src/lib/ingestion.test.ts): 6 tests
- [src/lib/sync.test.ts](E:/neoFlunare/src/lib/sync.test.ts): 5 tests

What is covered:
- branch surfacing and suppression
- budget substitution
- legality / consent blocking
- offline cache behavior
- quarantine and confessional effects
- stale-source audit behavior
- quest-log persistence
- candidate dedupe and guarded publication
- re-verification behavior
- sync merge rules

What is not covered:
- React UI behavior
- geolocation browser edge cases in the DOM
- Leaflet interaction details
- Supabase network round-trips against a live project

## Open Questions
- Should Dimentria rename the module in code, or keep `EdgeWander` as the shipped module name?
- Should the catalog move into Supabase, or remain a local editorial artifact for now?
- Should `ingestion_candidates`, `candidate_reviews`, and `source_mappings` become first-class runtime tables instead of remaining scaffold-only?
- Does the studio need role-based access before broader rollout?
- Should route previews remain heuristic or integrate a routing provider?
