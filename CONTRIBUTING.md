# Contributing

## Local setup

```bash
npm install
npm test
npm run build
```

## Development rules

- Keep the app local-first.
- Preserve the Guardian vs Expressive safety model.
- Do not introduce unsafe recommendation paths.
- Keep engine logic deterministic and covered by tests.
- Prefer small, reviewable commits.

## Before opening a PR

- Run `npm test`
- Run `npm run build`
- Update docs when behavior changes
- Add or update tests for engine behavior changes
