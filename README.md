# EdgeWander

Mobile-first prototype for a solo travel quest app that balances `Guardian` safety constraints with `Daredevil` novelty.

## What is implemented

- Living trail with 3 nearby quest arcs per session
- Map-first live exploration loop with Leaflet
- Dual-branch routing for `Guardian` and `Expressive` choices
- Nearby spatial filtering, route previews, and fallback branches
- `Red Thread` theme selection by destination and traveler interests
- `Omen` drift cards triggered by context
- `Threshold` locks for higher-voltage experiences
- `Confessional` reviews that can demote or quarantine nodes
- Offline cache fallback with pinned emergency essentials
- Safety filters for legality, consent clarity, exitability, budget, and hard no-go preferences
- Editorial console for JSON import/export and live catalog edits
- Google Places ingestion review queue for candidate import, matching, and guarded publication
- Trip session persistence for visited, skipped, and quarantined nodes
- Optional Supabase-backed cloud save using anonymous auth and local-first merge rules
- Basic GitHub Actions CI workflow for tests and build

## Run locally

```bash
npm install
npm run dev
```

## Verify

```bash
npm test
npm run build
```

## Cloud sync setup

1. Copy `.env.example` to `.env`.
2. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
3. Apply [supabase/schema.sql](./supabase/schema.sql) in your Supabase project SQL editor.
4. In Supabase Auth, enable anonymous sign-ins.
5. Deploy the Supabase Edge Function in [supabase/functions/google-places-search/index.ts](./supabase/functions/google-places-search/index.ts).
6. Add the `GOOGLE_PLACES_API_KEY` secret to Supabase Functions.

Cloud sync behavior:

- the app still boots from local storage immediately
- sync runs in the background and never blocks trail generation
- traveler state and trip session state merge deterministically
- offline edits mark a pending sync and retry on the next online session

## External data ingestion

EdgeWander does not let third-party places publish directly into recommendations.

Google Places flow:

1. import candidates into the editorial review queue
2. match them against the existing catalog by source ID and geo/title similarity
3. review and complete Guardian-critical fields manually
4. approve or merge into the live catalog

Guardrails:

- only approved `ExperienceNode` records enter the trail engine
- Google metadata can verify location and operating facts, but it does not define weirdness
- traveler UI only shows calm trust badges like `Vetted` or `Freshly verified`
- there is no Instagram/TikTok/Reddit ingestion in this phase

## Synced records

- `traveler_profiles`
  - traveler profile
  - completed node ids
  - confessional report history
- `trip_sessions`
  - city + trip start keyed session state
  - visited, skipped, quarantined nodes
  - confessionals
  - last known map region and effective location

## CI

The repo includes [.github/workflows/ci.yml](./.github/workflows/ci.yml), which runs:

- `npm ci`
- `npm test`
- `npm run build`

Note: pushing workflow changes to GitHub requires a token with `workflow` scope.
