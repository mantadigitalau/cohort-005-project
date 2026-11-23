# How should timed jobs run in a one-process SQLite app?

Research for [#3](https://github.com/mantadigitalau/cohort-005-project/issues/3) (parent map: #2). Researched 2026-11-23.

## Answer

**Keep the schedule and the "did we already send this?" record in SQLite. Use the timer only to wake the app up.**

1. Write each job as an **idempotent reconciliation function**, `runDueJobs(now)`. It asks "which Students are due a nudge or digest that has no row in `notification_log` yet?", claims each one with a unique key, sends the email, and records the result. Running it twice, late, or after a crash is safe.
2. Trigger it with an **in-process timer** (`croner` with `protect: true`, every 5–15 min). This needs no new infrastructure, because Cadence already runs as one long-lived process.
3. Also expose the same function on a **secret-protected route** (e.g. `POST /internal/jobs/tick`). Then an external or hosted cron can drive it if the host can't keep a process alive, and tests and dev can trigger it without waiting for the clock.

The timer is replaceable. The table is what makes the jobs reliable. This answer holds on every host where Cadence's one-SQLite-file model can run at all (see "By host type").

## Context in the codebase

- The DB is one `better-sqlite3` connection opened in `app/db/index.ts` (`data.db`), and the app runs with `react-router-serve ./build/server/index.js` (`package.json`). There is no custom server and no scheduler.
- The data a nudge needs already exists: `lessonProgress` and `videoWatchEvents` in `app/db/schema.ts`. "Hasn't watched in N days" is a query, not an event stream.
- The issue refers to ADR-0006 and `app/lib/mailer.server.ts`, but neither is on `main` yet. This note assumes the Postmark mailer described in the issue.

## Primary-source facts that drive the decision

| Fact | Source |
|---|---|
| croner "Operates in-memory, with no need for a database or configuration files". `protect` "will block new triggers as long as an old trigger is in progress". It supports a `timezone` option. | [croner README](https://github.com/Hexagon/croner) |
| node-cron "coordinates but does not persist state to a database". `noOverlap` "skips a run instead of stacking them". DST fall-back can skip sub-hourly runs, so use UTC. | [node-cron README](https://github.com/node-cron/node-cron) |
| better-sqlite3 is synchronous. `.transaction()` has `.immediate` (`BEGIN IMMEDIATE`). "Transaction functions do not work with async functions", so a network call (Postmark) cannot sit inside a DB transaction. | [better-sqlite3 API](https://github.com/WiseLibs/better-sqlite3/blob/master/docs/api.md) |
| `RETURNING` has been supported since SQLite 3.35.0. It works on top-level INSERT/UPDATE/DELETE. | [SQLite RETURNING](https://www.sqlite.org/lang_returning.html) |
| WAL: "All processes using a database must be on the same host computer; WAL does not work over a network filesystem." There is one writer at a time. | [SQLite WAL](https://www.sqlite.org/wal.html) |
| The Postmark send API has no idempotency key or dedup header (request headers are only `Content-Type`, `Accept`, `X-Postmark-Server-Token`). It has a `Metadata` object, and the batch endpoint takes up to 500 messages per call. | [Postmark Email API](https://postmarkapp.com/developer/api/email-api) |
| Vercel cron: "delivery is best effort … can also occasionally invoke the same scheduled run more than once", so you should "be resilient to both missed runs and duplicate runs". There are no retries. It secures with `CRON_SECRET` sent as `Authorization: Bearer`. Hobby is once per day, ±1 hour. | [Vercel: Managing Cron Jobs](https://vercel.com/docs/cron-jobs/manage-cron-jobs) |
| Render cron jobs are a separate service. They "can't provision or access a persistent disk". They are UTC, at most one run at a time, and cost $1/month minimum. | [Render Cron Jobs](https://render.com/docs/cronjobs) |
| Railway cron is a separate service that must exit. A run is skipped if the previous one is still running. Runs are ≥5 min apart, UTC, and "can vary by a few minutes". | [Railway Cron Jobs](https://docs.railway.com/reference/cron-jobs) |
| Railway volumes: "small amount of downtime when re-deploying a service that has a volume attached". "Replicas cannot be used with volumes." | [Railway Volumes](https://docs.railway.com/reference/volumes) |
| Fly: a volume attaches to one Machine. A single Machine + volume has downtime on deploy. Scheduled Machines are "hourly, daily, weekly, or monthly" and "Not for precise timing". For Supercronic: "Only run one copy of the cron process." | [Fly volumes](https://docs.fly.io/volumes/overview), [Fly task scheduling](https://docs.fly.io/blueprints/task-scheduling) |
| React Router framework mode can swap `react-router-serve` for a custom Express server via `@react-router/express` `createRequestHandler`. | [React Router adapter docs](https://reactrouter.com/8.3.0/api/other-api/adapter.md) |

## The options

### A. In-process scheduler (croner / node-cron) that does the work directly

- **Restarts and deploys:** Not durable on its own. Both libraries keep schedules only in memory. A tick that falls inside a deploy or crash window is lost, and neither library catches up afterwards. A daily 08:00 digest missed during an 08:00 deploy simply never sends.
- **Double-send:** A single process can't race itself, and `protect`/`noOverlap` stop overlapping runs. There are still two ways to send twice. (a) A crash after Postmark accepts the email but before the app records it means the next run sends again. (b) If the platform ever runs two instances at once (blue/green, a replica, or `npm run dev` pointed at the prod DB), both fire.
- **Dev/test:** Easy to start. Testing clock-driven code needs fake timers. You also have to keep it from running inside Vitest and during `react-router dev` HMR reloads, where module re-evaluation can register duplicate jobs.
- **Ops cost:** Zero.

### B. External cron hitting a protected endpoint

- **Restarts and deploys:** The schedule lives outside the app, so it survives deploys. But a tick that arrives while the single SQLite instance is down (Railway and Fly both document downtime on redeploy with a volume) is lost unless the job catches up. Vercel documents best-effort delivery with no retries.
- **Double-send:** Hosted crons say outright that they can deliver twice (Vercel). The endpoint must be idempotent.
- **Dev/test:** Very good. The job is a plain HTTP handler you can `curl` or call from an integration test.
- **Ops cost:** Low, but it adds a secret and a second system to configure. Render and Railway cron services can't share the web service's disk, so they can't run the job themselves. They can only `curl` the web service's endpoint.

### C. SQLite-backed job/outbox table polled by the process

- **Restarts and deploys:** Durable. Due work is derived from (or written to) the DB, so the first poll after a restart sends whatever was missed. This is the only option that catches up by design.
- **Double-send:** Controlled by schema. A `UNIQUE(user_id, kind, period_key)` row claimed with `INSERT … ON CONFLICT DO NOTHING RETURNING` cannot be claimed twice, even by two pollers. better-sqlite3 is synchronous and SQLite allows one writer, so the claim is atomic. The one gap left is "sent but not yet marked sent" when a crash lands between the Postmark call and the update. Postmark has no idempotency key, so this cannot be closed completely. You pick a policy: leave stale `claimed` rows alone (at-most-once, which is right for nudges) or retry them (at-least-once). Put the claim key in Postmark `Metadata` so a duplicate can be traced.
- **Dev/test:** Very good. `runDueJobs(now)` is a pure function of DB state plus an injected clock and mailer, so tests seed rows, call it twice, and assert one send.
- **Ops cost:** One table and a migration. It still needs *something* to call the poll, which is A or B.

### D. Hosted schedulers / durable-job services (Vercel Schedules, Inngest, Temporal, Fly Cron Manager, GitHub Actions cron)

- These either (1) call an HTTP endpoint, which makes them a fancier B, or (2) run your code in a separate machine or function. Option (2) is incompatible with one SQLite file. Render cron "can't access a persistent disk", and SQLite WAL "does not work over a network filesystem".
- They add a vendor, an account and secrets for a problem whose state already lives in our DB. That isn't worth it at Cadence's scale. Revisit only if Cadence moves off single-file SQLite.

## Recommendation: C, driven by A, with B as the portable trigger

```
notification_log(id, user_id, kind, period_key, status, claimed_at, sent_at, error,
                 UNIQUE(user_id, kind, period_key))
```

- `kind` is e.g. `inactivity_nudge` or `weekly_digest`. `period_key` makes "once per X" explicit: e.g. `2026-W48` for a weekly digest, or the ISO date of the last watch event for "inactive since …". The second form means a Student who returns and goes inactive again gets a new nudge.
- `runDueJobs({ now, db, mailer })`:
  1. A query finds candidates (e.g. enrolled Students whose latest `videoWatchEvents` row is older than N days).
  2. For each candidate, a sync `INSERT … ON CONFLICT DO NOTHING RETURNING id` claims the row. Skip it if nothing is returned.
  3. Outside any transaction, `await mailer.send(...)` with `Metadata: { notificationId }`.
  4. A sync `UPDATE … SET status='sent'` (or `'failed'` plus the error).
- Triggers:
  - Start a `new Cron("*/10 * * * *", { protect: true, timezone: "UTC" }, tick)` once at server boot. Guard it so it is skipped under `NODE_ENV=test` and behind an env flag (`JOBS_ENABLED`). With `react-router-serve` there's no user-owned entry point, so either start it lazily from `app/entry.server.tsx` (module-level, guarded with `globalThis`) or move to the documented `@react-router/express` custom server and start it there. The custom server is cleaner.
  - `POST /internal/jobs/tick` checks `Authorization: Bearer ${CRON_SECRET}` and calls the same `runDueJobs`. A host cron or a developer can hit it.
- The tick can run every few minutes even though digests are weekly. The tick asks what is due, and the DB decides. Frequency only affects latency, never correctness.

## By host type

| Host | Fits ADR-0006 (one process, one local SQLite file)? | Trigger |
|---|---|---|
| Long-running VM / container with a disk (Fly Machine + volume, Railway + volume, Render web + disk, a VPS) | Yes | In-process croner. Optionally also a host cron or GitHub Action hitting `/internal/jobs/tick` as a backstop. Deploy downtime is covered by catch-up. |
| Platform with HTTP cron but sleeping instances (scale-to-zero) | Only if the instance keeps its disk. The timer won't fire while asleep. | External cron → `/internal/jobs/tick` (the request also wakes the instance). Turn the in-process timer off. |
| Serverless functions (Vercel/Netlify/Lambda) | **No.** There is no persistent local disk shared across invocations, so ADR-0006 itself would have to change first. | Not applicable until the DB moves (e.g. to Turso/libSQL). Then B with a hosted cron is the natural fit, and the `notification_log` design carries over unchanged. |

Whatever the host, run **exactly one** instance against the SQLite file. That is already implied by ADR-0006, and Railway forbids replicas with volumes anyway. The unique-claim table means a brief overlap during a deploy can't double-claim.

## Open questions for implementation

- Policy for stale `claimed` rows: at-most-once for nudges, at-least-once for digests?
- Student timezone for "08:00 digest". UTC is simplest. Per-user local time would need a `timezone` column on `users`.
- Retention: prune `notification_log` after N months, or keep it as the audit trail?
