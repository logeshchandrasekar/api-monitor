# Performance notes (Phase 9)

## The scheduler keeps up with 200 monitors at 30 s

`npm run loadcheck -w server` inserts 200 monitors (30 s interval, 4 users, a mix of healthy-with-occasional-500, slow and always-failing) straight into the database, runs the **real scheduler and check runner** against the flaky API for 180 seconds with the production 15 s tick, samples every 2 seconds, and removes everything afterwards.

Before the change (`--batches 1`, the old limit of 50 checks per tick) it **fails**, because 200 monitors every 30 s need about 100 checks per tick and a tick took 50:

|                                          | old (50 per tick)            | new (drain, up to 10 batches) |
| ---------------------------------------- | ---------------------------- | ----------------------------- |
| Overdue monitors at any moment           | 100 of 200, never recovering | 0 between ticks               |
| Oldest overdue monitor (95th percentile) | 34.7 s                       | 12.1 s                        |
| Checks per minute (needed: 267)          | 193                          | 351                           |
| Memory (resident)                        | 195 MB                       | 202 MB                        |
| Heap, first third to last third          | 35 to 35 MB (flat)           | 35 to 34 MB (flat)            |
| Event loop delay (p99)                   | 40 ms                        | 47 ms                         |

The fix is `runTickDrain` in `server/src/jobs/scheduler.ts`: a tick keeps claiming batches of 50 while monitors are still due, up to `SCHEDULER_MAX_BATCHES` (default 10). Setting it to `1` restores the old behavior exactly. The outbound limit of 10 simultaneous checks still applies, so a backlog after downtime is worked off in order, never all at once.

**Good to know: a monitor is checked every interval plus up to one tick.** The next check is counted from when the monitor was claimed, so with a 15 s tick a 60 s monitor runs every 60 to 75 s. That is by design (ENG-1) and the load check's pass mark allows for it.

What this does not prove: it ran on one machine with the database beside it. Treat it as a regression check for the scheduler, not a capacity promise.

## Retention on a large table

The daily job deletes expired checks in batches of 5,000 so no single `DELETE` holds locks for long. Tested with 400,000 checks spread over 60 days on a Free account (353,205 of them older than 7 days):

- `npm run retention:run -w server -- --dry-run` counted them in 0.4 s.
- A real run deleted them in **71 batches in 3.6 s**; a second run right after found 1 row.
- The database used a sequential scan for the batch query in both cases measured: with most of the table expired, the first 5,000 rows were found in about 70 ms; with only about a day's worth expired (the steady state), in about 20 ms. That is fast enough, so **no new index was added**. If the `checks` table ever grows to many millions of rows and the daily batch gets slow, an index on `checkedAt` is the first thing to try.
- The daily job pauses 50 ms between batches, so it adds a few seconds on a clean-up this size and never competes with the checks being written.

## Tags and search

A user has at most 50 monitors, so the tag filter (`tags has 'x'`) is narrowed by the existing `userId` index to at most 50 rows first. A GIN index on `tags` was considered and **not added**: it would cost every write and speed up nothing a user can reach.