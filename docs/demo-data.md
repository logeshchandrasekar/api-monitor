# Demo data: when and how to re-run `seed:demo`

`npm run seed:demo` builds the demo account (`demo@apimonitor.dev`, a Pro user with four monitors and 30 days of believable check history, plus the matching incidents). It is for screenshots, demos and development. It is never run for you.

## Why you will need to run it again (since Phase 9)

The retention job deletes checks older than the plan keeps: **30 days for Pro**. The demo monitors are frozen (their next check is due in 2099), so nothing adds new checks while the old ones age out. The history therefore **shrinks by about one day every day**: ten days after seeding, the 30-day charts have only 20 days of data, and the oldest incidents have no checks behind them.

Incidents are not deleted by retention, so they stay in the list even when their checks are gone.

## Run it again when

- you are about to give a demo, take screenshots or record the walkthrough, and the last seed was **more than two or three days ago**;
- a chart on the demo account looks emptier on the left than it should;
- you reset or recreate the database (`docker compose down -v`, a fresh clone, a new laptop);
- you changed the demo profiles in `server/src/seed/demoHistory.ts`.

You do **not** need to run it after a normal code change, a restart or a migration that keeps the data.

## How

With the database running (`npm run db:up`):

```bash
npm run seed:demo
```

It takes a few seconds and prints a summary ending with the login line. It is safe to run any number of times: it deletes the demo user's monitors (their checks and incidents go with them) and builds them again, so the result is always the same, and **it touches only the demo account**. Other accounts, including yours, are never changed.

It refuses to run with `NODE_ENV=production`. A demo on a hosted deployment is a Phase 10 decision (it will need its own, deliberate way to seed).

## To see what retention would remove

```bash
npm run retention:run -w server -- --dry-run
```

The dry run only counts. Without `--dry-run` the command deletes expired checks right now, exactly what the daily job does.
