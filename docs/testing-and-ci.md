# Testing and CI

Everything that checks the project, how to run it, and what GitHub does with it.

## What runs where

| Command                              | What it does                                                                               | Needs                                            |
| ------------------------------------ | ------------------------------------------------------------------------------------------ | ------------------------------------------------ |
| `npm test`                           | Server tests (the fast everyday check)                                                     | `npm run db:up`                                  |
| `npm run test:client`                | Client logic and component tests                                                           | nothing                                          |
| `npm run coverage`                   | Both suites again with a coverage report, and **fails if coverage drops below the floors** | database                                         |
| `npm run e2e`                        | One browser test that walks the whole product                                              | database, `npx playwright install chromium` once |
| `npm run e2e:a11y`                   | Accessibility and responsive pass (see `accessibility.md`)                                 | same as `e2e`                                    |
| `npm run loadcheck -w server`        | 200 monitors at 30 s against the flaky API (see `performance.md`)                          | database, `npm run flaky`                        |
| `npm run security:logscan -w server` | Searches the logs for planted secrets (see `security.md`)                                  | database                                         |
| `npm run ci:local`                   | The CI steps on a **fresh clone of your committed code**                                   | database, committed work                         |
| `npm run checkpoint:9b`              | `ci:local` + load check + browser journey in one go                                        | everything above                                 |

## Coverage floors

Server: 90 % statements, 80 % branches, 88 % functions, 90 % lines, **and** per-file floors that are much higher for the code that must not be wrong: the state machine, analytics, stats, crypto, headers, cookies, uptime and ticks at 100 %; the SSRF guard and resolver at 95 to 100 %. Client: 40 % statements, 43 % branches, 28 % functions, 39 % lines (a real drop trips it; the client is also covered by the end-to-end tests).

The floors sit a few points under today's numbers on purpose, so ordinary work does not trip them. They only apply to `npm run coverage` and to CI: plain `npm test` never fails because of coverage. To raise a floor, edit `server/vitest.config.ts` or `client/vite.config.ts` after your numbers have risen.

The report is in `server/coverage/index.html` and `client/coverage/index.html` (open in a browser; git-ignored).

## The GitHub workflow

`.github/workflows/ci.yml` has three jobs. They run on every push to `main` and on every pull request.

1. **Server** starts a Postgres container, installs with `npm ci`, generates the Prisma client, writes a test environment with fresh random secrets (`tools/ci-env.mjs`), then runs Prettier, the type check and the tests with coverage. The tests apply the database migrations first, exactly like on your machine.
2. **Client** runs lint, the type check, the tests with coverage and the production build.
3. **End-to-end** runs the browser journey. It reports but **does not block**: it is slower and more sensitive to timing. To make it blocking, delete the `continue-on-error: true` line.

No secrets are needed. Nothing is deployed.

## What you need to do on GitHub (once)

1. Push the branch. Open the **Actions** tab. If GitHub asks, click **Enable workflows**.
2. Open the first run and check that **Server** and **Client** are green. If **End-to-end** is red, open it: the report is attached as an artifact called `playwright-report`.
3. Optional: add a badge to the README: `![CI](https://github.com/logeshchandrasekar/api-monitor/actions/workflows/ci.yml/badge.svg)`.
4. Optional: **Settings, Branches, Add rule** for `main`: require a pull request and the status checks "Server (format, types, tests, coverage)" and "Client (lint, types, tests, build)". Do this only after both have been green once.

## If a CI step fails

- **Prettier**: run `npx prettier --write .` and commit.
- **Typecheck or tests**: run the same command locally (`npm run typecheck -w server`, `npm test`).
- **Coverage floor**: the message names the file and the number. Add a test, or (for a real, reviewed reason) lower that one floor.
- **`npm ci` says the lockfile is out of date**: you changed a `package.json` without running `npm install`. Run it, commit `package-lock.json`.
- **A test passes locally and fails on GitHub**: run `npm run ci:local`. It uses a fresh clone, which finds missing files and forgotten environment variables.
- **Actions or Node versions**: the workflow uses `actions/checkout@v4`, `actions/setup-node@v4`, `actions/upload-artifact@v4` and Node 22. GitHub will announce newer versions; bump them one at a time.

## Adding a test

Server tests live in `server/src/tests/*.test.ts` and share one database that is emptied before each test (`helpers.ts` has `registerAgent`). Client tests sit next to the code (`*.test.ts` for logic; `*.test.tsx` for components, with `// @vitest-environment jsdom` on the first line and `renderApp` from `src/test/render.tsx` for the providers).