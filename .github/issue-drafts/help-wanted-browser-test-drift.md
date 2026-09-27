# Bring one browser smoke test in line with current routes

Labels: `help wanted`, `good first issue`

The README notes that some Playwright expectations refer to unsupported routes or historical behavior. Pick one failing or stale scenario in `tests/browser/smoke.spec.ts`, confirm the current route and UI behavior, and update the test to assert an implemented user flow.

## Scope

- Record which scenario was stale and why.
- Change only the selected scenario and any small fixture/setup code it requires.
- Run that scenario against a disposable development database; browser tests can mutate data.

## Done when

- The scenario tests observable behavior supported by the current application.
- The test passes locally, or the pull request explains a reproducible environment blocker.
- No unsupported route is introduced solely to satisfy the old expectation.
