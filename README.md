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
- Trip session persistence for visited, skipped, and quarantined nodes

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
