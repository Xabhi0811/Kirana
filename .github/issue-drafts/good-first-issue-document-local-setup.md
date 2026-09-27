# Clarify local MongoDB setup and first-run verification

Labels: `good first issue`, `help wanted`, `enhancement`

The README has extensive architecture details, but a new contributor needs a short, reliable path from `npm ci` to a working local page. Improve the setup section with the minimum required environment variables, how to start MongoDB, and one simple browser or API check that confirms the app is running.

## Scope

- Update the README's setup section and link it from `CONTRIBUTING.md` if the heading changes.
- Keep examples free of real secrets and use MongoDB, the active backend.
- Verify the steps on a clean local checkout or explain any prerequisite that prevents that.

## Done when

- A first-time contributor can start the app from the documented steps.
- The verification step has an expected result and a brief troubleshooting hint.
- Documentation does not imply that historical Supabase SQL is required.
