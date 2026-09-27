# Contributing to Kirana

Thanks for helping improve Kirana. Bug reports, documentation fixes, tests, and focused code changes are welcome.

## Find a task

Look for issues labeled `good first issue`, `help wanted`, or `enhancement`. Before starting a larger change, comment on the issue with your approach so maintainers and other contributors can coordinate. For a bug, include reproduction steps, expected behavior, actual behavior, and relevant logs with secrets removed.

## Set up locally

1. Install a current Node.js release and MongoDB.
2. Run `npm ci`.
3. Copy `.env.example` to `.env.local` and configure a local MongoDB URI and the required secrets. Never commit `.env.local` or real credentials.
4. Run `npm run dev` and follow the setup and demo account instructions in [README.md](README.md).

MongoDB is the active backend. The Supabase SQL files are historical and are not required for normal development. Use a disposable local database for seeding and browser tests because they change data.

## Make a change

- Keep pull requests focused and describe the user-visible behavior they change.
- For Next.js code, read the relevant guide under `node_modules/next/dist/docs/` before editing; this project follows the rules in `AGENTS.md`.
- Trace a feature through the page, component, API route, validation schema, and Mongoose model when applicable.
- Add or adjust meaningful tests for behavior changes. Avoid committing generated files, uploads, or local environment files.
- Run `npm run typecheck`, `npm run lint`, and `npm test` for code changes. Run relevant Playwright tests when changing browser flows; see the README for build and browser setup. `npm run format` rewrites files, so review its diff before committing.

## Open a pull request

Explain what changed, why, how you verified it, and any remaining limitations. Link the related issue, include screenshots for visual changes, and note any configuration or migration steps. Maintainers may ask for revisions before merging.

Please follow the [Code of Conduct](CODE_OF_CONDUCT.md) in issues, reviews, and discussions. For a security vulnerability, avoid posting exploit details in a public issue; use the repository's private security reporting channel if enabled, or contact the maintainers privately.
