# Changelog

Current snapshot based on the working tree and recent shipped commits through `56b760e`.

## Added
- Map-first exploration loop with Leaflet
- Guardian / Expressive / Fallback branching
- route previews, emergency anchors, and offline trail cache
- Red Thread theme selection, drift cards, and threshold locks
- confessional reviews with quarantine and demotion behavior
- quest log entries for current and historical progression
- Google Places candidate import, matching, guarded approval, and re-verification
- published-source freshness and invariant-drift audits
- optional Supabase cloud sync for traveler, trip, and editorial metadata
- Vite manual chunk splitting for `react`, map libraries, Supabase, and other vendor code

## Changed
- traveler shell now includes Tokyo-specific first-run briefing
- branch presentation now surfaces "Why safe enough now"
- confessional CTA language is cleaner and more explicit
- trust presentation is calmer in traveler-facing surfaces

## Fixed
- stale Google-backed nodes now degrade through audit and freshness logic
- editorial publish path blocks candidates missing Guardian-critical fields
- published nodes can be re-verified without overwriting editorial framing
- production build no longer emits the previous large-chunk warning after vendor chunking

## Known Gaps
- codebase naming still says `EdgeWander`, not `Dimentria`
- full experience catalog is not synced through Supabase
- Google Places may fall back to mocked results if env/config is missing
- directions are estimated locally, not provider-backed
- editorial review remains embedded in the main app shell
- recommendation audit still renders in the main shell instead of being studio-only
