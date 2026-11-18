# Security review (Phase 9)

This is the written record of the Phase 9 security review. Every line says what was checked, **how to run the check again**, and what the result was. Nothing here is a promise that the app is unbreakable: the last section lists what is knowingly left out.

How to re-run everything in one go:

```bash
npm test -w server                    # the automated tests named below
npm run security:logscan -w server    # starts the API and searches its logs for planted secrets
npm audit                             # known vulnerabilities in dependencies
```

## Checklist

- [x] **SSRF tests re-run, and new bypasses added.** `server/src/tests/ssrf.hardening.test.ts` (new in Phase 9) plus the Phase 2/3 tests in `url-guard.test.ts` and `checkRunner.test.ts`. The review found nine IPv6 ranges that were not blocked (see [SSRF review](#ssrf-review-sec-1)) and fixed them.
- [x] **Logs contain no secrets.** `npm run security:logscan -w server` registers a user, logs in, creates a monitor with a bearer token, an API key and a request body, runs manual and scheduled checks, changes the password, fails and succeeds at deleting the account, then searches the whole log for every one of those values plus `JWT_SECRET` and `ENCRYPTION_KEY`. Result: none found. The unit test `logRedaction.test.ts` covers the same list of fields without a server.
- [x] **Every route has auth and ownership tests.** `security.routes.test.ts` reads the route files, fails if a route is not classified below, answers 401 to every protected route with no cookie, a garbage cookie, a token signed with another key and a token for a deleted user, and proves user B gets 404 on every `:id` route. See the [route table](#route-table-sec-3-sec-4).
- [x] **`npm audit` reviewed; versions pinned by lockfile.** Reviewed twice on the day of this review. Earlier that day it reported 0 vulnerabilities. Later the same day a new advisory (GHSA-fc5q-39xc-vjpf, a ReDoS in `picomatch`, flagged for **every** published version, so no fixed release exists) made it report 6 high-severity findings (7 once Chapter 9b adds the coverage tool). **All of them are build and test tooling**: `picomatch` is reached only through `vite`, `vitest`, `tinyglobby` and `fdir`. It is not in the server's runtime dependencies (`npm ls picomatch -w server --omit=dev` finds nothing) and not in the built browser bundle (searched). The flaw needs an attacker-chosen glob pattern, and these tools only read patterns from your own config files. **Decision: accepted and tracked.** Do not run `npm audit fix --force`: its "fix" installs an older, incompatible `vite`. Re-run `npm audit` before every deploy, and run `npm update picomatch` when a patched version is published. The root `package-lock.json` pins every version and CI installs with `npm ci`, which refuses to run if `package.json` and the lockfile disagree. One loose end is listed under [Known limits](#known-limits-and-decisions).
- [x] **Helmet, CORS, body limits and cookie flags checked with production values.** `productionConfig.test.ts` starts the real app in a child process with `NODE_ENV=production` and checks the headers, the CORS answer, the 100 KB body limit, the 415 for non-JSON bodies and the exact cookie flags. It also proves the server refuses to start with `ALLOW_PRIVATE_TARGETS=true`, a missing `SMTP_HOST`, a short `JWT_SECRET` or a wrong-sized `ENCRYPTION_KEY`.
- [x] **Brute-force login protection verified.** `bruteForce.login.test.ts` (11th failed login in 15 minutes is a 429, successful logins do not count, even the right password is refused while blocked) and `bruteForce.delete.test.ts` (account deletion shares the limit, so a stolen session cannot be used to guess the password).
- [ ] **Production-only items that belong to Phase 10:** HTTPS, the same-site `/api` rewrite, a fresh production `JWT_SECRET` and `ENCRYPTION_KEY`. They cannot be ticked until there is a production.

## PRD patch items

| Item  | What it asks                                                                                                                                                                        | Where it lives                                                                                         | Proved by                                                                                                                                               |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SEC-1 | Only http(s), no credentials in URLs, DNS checked at connection time, blocked ranges, manual redirects (max 5) with every hop re-checked, 1 MB body cap, boot refusal in production | `utils/url-guard.ts`, `utils/safeLookup.ts`, `services/checkRunner.ts`, `config/env.ts`                | `ssrf.hardening.test.ts`, `url-guard.test.ts`, `checkRunner.test.ts`, `productionConfig.test.ts`                                                        |
| SEC-2 | AES-256-GCM with a `v1:` prefix, sensitive header values never returned, log redaction, no secrets in stored error messages                                                         | `utils/crypto.ts`, `utils/headers.ts`, `lib/logger.ts`, `utils/errorMessages.ts`                       | `crypto.test.ts`, `headers.test.ts`, `logRedaction.test.ts`, `security:logscan`, `checkRunner.test.ts` ("never stores raw error codes or the hostname") |
| SEC-3 | JWT in an httpOnly SameSite=Lax cookie, Secure in production, 7 days, JSON-only mutating routes                                                                                     | `utils/cookies.ts`, `utils/jwt.ts`, `middleware/requireJson.ts`                                        | `auth.test.ts`, `productionConfig.test.ts`, `accountDeletion.api.test.ts` (415 on DELETE)                                                               |
| SEC-4 | Every query scoped by `userId`, 404 not 403, a test per resource                                                                                                                    | `services/*` (`findOwned` and friends)                                                                 | `security.routes.test.ts` plus the per-feature tests                                                                                                    |
| SEC-5 | Global and auth limiters, 6 manual checks per minute per user, 1 in flight per monitor, outbound cap of 10, fixed User-Agent, max 5 redirects, plan minimum interval                | `middleware/rateLimit.ts`, `middleware/manualCheckLimiter.ts`, `services/checks.ts`, `config/plans.ts` | `auth.test.ts`, `bruteForce.*.test.ts`, `checks.api.test.ts`, `limiter.test.ts`, `plans.test.ts`                                                        |
| SEC-6 | 8 characters minimum, 72 bytes maximum, one generic login error, dummy-hash timing, change password, **delete account**                                                             | `schemas/auth.ts`, `services/auth.ts`, `services/users.ts`                                             | `auth.test.ts`, `accountDeletion.api.test.ts`                                                                                                           |
| DAT-3 | Daily job deleting expired checks in batches of 5,000, incidents kept, plan-capped ranges, p95                                                                                      | `jobs/retention.ts`, `services/analytics.ts`                                                           | `retention.test.ts`, `analytics.api.test.ts`, `npm run checkpoint:9a -w server`                                                                         |

## Route table (SEC-3, SEC-4)

"Session only" routes return only the logged-in user's own data: the query is built from the session user's id, never from an id in the URL. "Owned" routes take an id in the URL, and a user who does not own it gets the **same 404 body** as for an id that does not exist.

| Route                                 | Group                                           | 401 without a session | Other user gets    |
| ------------------------------------- | ----------------------------------------------- | --------------------- | ------------------ |
| `GET /api/health`                     | public                                          | n/a                   | n/a                |
| `POST /api/auth/register`             | public (rate limited)                           | n/a                   | n/a                |
| `POST /api/auth/login`                | public (rate limited)                           | n/a                   | n/a                |
| `POST /api/auth/logout`               | public                                          | n/a                   | n/a                |
| `GET /api/auth/me`                    | session only                                    | yes                   | n/a                |
| `PATCH /api/users/me`                 | session only                                    | yes                   | n/a                |
| `GET /api/users/me/limits`            | session only                                    | yes                   | n/a                |
| `POST /api/users/me/password`         | session only                                    | yes                   | n/a                |
| `DELETE /api/users/me`                | session only (needs the password, rate limited) | yes                   | n/a                |
| `GET /api/monitors`                   | session only                                    | yes                   | only own monitors  |
| `POST /api/monitors`                  | session only                                    | yes                   | n/a                |
| `GET /api/dashboard/summary`          | session only                                    | yes                   | only own data      |
| `GET /api/incidents`                  | session only                                    | yes                   | only own incidents |
| `GET /api/incidents/:id`              | owned                                           | yes                   | 404                |
| `GET /api/monitors/:id`               | owned                                           | yes                   | 404                |
| `PATCH /api/monitors/:id`             | owned                                           | yes                   | 404                |
| `DELETE /api/monitors/:id`            | owned                                           | yes                   | 404                |
| `POST /api/monitors/:id/pause`        | owned                                           | yes                   | 404                |
| `POST /api/monitors/:id/resume`       | owned                                           | yes                   | 404                |
| `POST /api/monitors/:id/duplicate`    | owned                                           | yes                   | 404                |
| `POST /api/monitors/:id/check`        | owned (6 per minute per user)                   | yes                   | 404                |
| `GET /api/monitors/:id/checks`        | owned                                           | yes                   | 404                |
| `GET /api/monitors/:id/stats`         | owned                                           | yes                   | 404                |
| `GET /api/monitors/:id/analytics`     | owned                                           | yes                   | 404                |
| `GET /api/monitors/:id/incidents`     | owned                                           | yes                   | 404                |
| `GET /api/monitors/:id/alerts`        | owned                                           | yes                   | 404                |
| `PUT /api/monitors/:id/alerts`        | owned                                           | yes                   | 404                |
| `POST /api/monitors/:id/alerts/test`  | owned (rate limited)                            | yes                   | 404                |
| `GET /api/monitors/:id/notifications` | owned                                           | yes                   | 404                |

**Adding a route:** put it in the right list at the top of `server/src/tests/security.routes.test.ts`, then add it to this table. If you forget, the test `every route in the source is classified exactly once` fails.

## SSRF review (SEC-1)

Method: a list of 172 hostile and safe addresses and URLs (decimal, octal and hex IPv4, IPv4 inside IPv6, NAT64, 6to4, Teredo, unusual dots, Unicode digits, percent-encoding, userinfo tricks, a backslash URL, wildcard DNS names) was run through the guard, once to find gaps and then as permanent tests.

Found and fixed (all in `EXTRA_BLOCKED_V6` in `utils/url-guard.ts`): `::/8` (this alone catches `::2` and other IPv4-compatible leftovers), `100::/64`, `64:ff9b:1::/48`, `fec0::/10`, `2001:2::/48`, `2001:10::/28`, `2001:20::/28`, `3fff::/20`, `5f00::/16`. None of them is a range a public API lives in, so no real monitor is affected. The test file also keeps a list of public addresses that must stay allowed.

Checked and already safe: every IPv4 numeric form; `::ffff:` mapped forms in both notations; NAT64 and 6to4 wrappers around private addresses; a redirect to any of those, including in the middle of a chain; a name with one public and one private DNS answer; a name whose answer changes between two lookups; `file:`, `gopher:`, `javascript:` and `data:` URLs; credentials in the URL.

## Known limits and decisions

- **Ports are not restricted.** A user can point a monitor at any port of a public host, so the server can be used to poke at an open port on someone else's machine (it only reports "up or down", it never shows the response). Blocking well-known non-HTTP ports would also block legitimate services, so this was left as it is. If it ever matters, a deny-list of ports (22, 25, 3306, 5432, 6379 and similar) in `parseTargetUrl` is a small change.
- **No server-side session revocation.** A stolen cookie works until it expires (7 days) or the account is deleted. The PRD puts revocation outside the MVP.
- **No password reset by email.** Post-MVP in the PRD.
- **The first redirect hop is checked by name and literal address plus the connection-time lookup.** That is the design in SEC-1, and the rebinding tests prove the lookup is the real gate.
- **Two lockfiles are tracked.** `package-lock.json` at the root (the one that counts) and an old `client/package-lock.json` from before the workspace setup. `npm ci` at the root ignores the second one. Decide in Phase 10 how the client is built, then delete whichever is unused so the two cannot drift.
- **`jar.txt` once sat in the git history** (a curl cookie jar holding a development session token). The token expired on 2 November 2026 and the file is now git-ignored. The history was not rewritten. Production must use its own `JWT_SECRET`, never the development one.
- **`npm audit` is a snapshot.** New advisories appear all the time: this review saw a clean report turn into six findings within a day. Re-run it before every deploy.
