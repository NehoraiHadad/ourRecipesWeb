# Recipe timer Web Push

Timers retain a wall-clock deadline in IndexedDB. With background notifications
enabled, the browser registers a push subscription and the server stores the
deadline in PostgreSQL. A Vercel Workflow sleeps until that deadline, checks the
current version/state, and sends an encrypted Web Push message. Closing the page
does not stop that server workflow. No APK or native wrapper is needed.

This requires connectivity when scheduling, updating and receiving the notification.
The network, notification permission, Focus mode and OS power policies can delay
or suppress delivery. It is not an exact offline alarm. Pushes more than two minutes
late are discarded. Timers longer than seven days are rejected by the push API.

## Enable in production

The code must be deployed to the existing Vercel project with its PostgreSQL database.
No new third-party scheduler account is needed. Vercel Workflow usage is billable
under the project's plan; check [current pricing](https://vercel.com/docs/workflows/pricing).

1. Generate a VAPID key pair with `npm run push:keys`. This writes only to ignored
   `.env.local` and does not print the keys. Existing keys are preserved. Keep the
   same pair across deployments; changing it requires browsers to resubscribe.
2. Set these four variables in the Vercel project's production environment:
   `TIMER_PUSH_ENABLED=true`, `TIMER_PUSH_PUBLIC_KEY`,
   `TIMER_PUSH_PRIVATE_KEY`, `TIMER_PUSH_SUBJECT`.
   The subject must be a valid HTTPS contact URL or `mailto:` address. The public
   key is served by `/api/push/config`; the private key stays on the server.
3. Production Vercel deploys automatically apply `prisma/sql/timer-push.sql` as part
   of `npm run build`, before compiling Next.js. A failed schema update fails the
   build. Preview/local builds skip this step; `npm run push:schema` can apply it
   explicitly to a local/preview database. It uses `DATABASE_URL` from the
   environment, falling back to `.env.local`. It creates
   only `timer_push_subscriptions`, `recipe_timer_push` and their indexes/constraint
   in a transaction with an advisory lock for overlapping deploys. It is additive
   and safe to rerun. Back up the target database
   under the project's normal deployment procedure. Do not reset the database.
4. Deploy the code. `withWorkflow` generates the workflow routes at build time;
   the Vercel runtime handles durable execution. There is no timer cron to configure.
5. Check `/api/push/config`: it must return `enabled: true` and a public key.
   This endpoint never returns the private key. Then verify a timer on both devices
   using the checklist below before calling locked-screen delivery verified.

The production database has not been accessed from this workspace: it has no Vercel
project credentials or production database connection. Local build/tests do not
prove delivery from a deployed Vercel Workflow to a physical phone.

## User flow

- Android: open the HTTPS site/PWA in a browser with Web Push support. In the recipe's
  timer panel, enable background notifications and accept the browser permission.
- iPhone/iPad: iOS/iPadOS 16.4 or newer, add the site to the Home Screen, open that
  installed app, then enable background notifications from the timer panel.
- Start a timer. Only a successful server response shows its notification as scheduled.
  A network failure shows a warning instead of claiming that a background alert exists.
- Pause, resume, rename, mute and delete synchronize a new timer version. Failed
  cancellation stays visible and is retried on reconnect/reopen. Until acknowledged,
  an earlier server alert may still be sent. Cancellation cannot retract a message
  already accepted by the push service.
- Disable background notifications to unsubscribe this browser. Other devices are
  unaffected. Browser notification sound follows OS settings; a custom PWA sound
  is not guaranteed.

Ownership uses the existing authenticated session, including an authenticated guest
session. An expired session must be renewed before push registration or timer edits.
Subscriptions cannot be moved between owners; a new session owner resubscribes.

## Delivery and concurrency

Each browser subscription owns its timer rows. Requests enforce authentication,
same-origin cookie requests, provider allowlists and input limits. Subscription
endpoints and encryption keys are secrets and must not be logged.

Monotonic versions make stale jobs harmless. PostgreSQL row locks order delivery
against pause/delete; cancelling a workflow is an optimization, not the correctness
mechanism. Transport retries recheck the state. Expired subscriptions are removed.
The worker also checks local paused/deleted/newer timer records, and stores durable
receipts so a foreground notification and a retried push share the same deduplication
key. Storage failure can weaken deduplication; it does not guarantee exactly-once
delivery across browser data deletion or reinstallation.

Limits: ten subscriptions per owner, twenty future running timers per subscription,
one thousand retained timer records per subscription. To reclaim a subscription's
history, disable and re-enable background notifications. Removing/expiring a
subscription cascades to its timer records. These caps bound storage rather than
providing global account/IP rate limiting.

## Local checks

```sh
npm ci
npm run push:keys
npm run push:schema
npm run test:run
npx tsc --noEmit
npm run build
```

`next dev` runs workflows locally; its process/storage must remain available.
Production durability is provided by Vercel, not by leaving `next dev` running.

Real PostgreSQL transaction tests opt in with a separate disposable local database:

```sh
TIMER_PUSH_TEST_DATABASE_URL=postgresql://USER:PASS@127.0.0.1:PORT/recipes_push_test npm run test:run -- tests/integration/push/store-live.test.ts
```

Create that database and apply the Prisma schema first. The test requires localhost
and the exact database name `recipes_push_test`; it only cleans up its own `push-test-` owners.
The transport is mocked in these tests. Other checks cover API ownership/origin,
validation, permission opt-in, persisted cancellation and worker deduplication.

Workspace verification: the production build and TypeScript checks passed. 627
tests passed, including ten tests against real isolated
PostgreSQL transactions. Chromium exercised the actual UI/API/workflow scheduler
with PushManager simulated, including pause/resume and offline deletion/reconnect.
The actual installed worker displayed a CDP-injected push after the recipe page
closed and suppressed its duplicate. A real PushManager registration attempt was
denied in this execution environment; external push transport and physical-device
receipt remain unverified. These browser checks do not substitute for the deployed
Android/iOS acceptance checks below.

## Physical-device acceptance

For each Android and iPhone, record OS/browser version, expected/actual alert time,
notification permissions and whether it sounded:

1. Start a one-minute timer; lock the screen. Confirm one notification.
2. Repeat after closing the app page. Reopen; no duplicate or resurrected timer.
3. Pause before expiry, resume with a new deadline, then delete a different timer.
   Confirm only the current running timer alerts.
4. Start two timers; rename/mute one. Check content, timing and sound settings.
5. Disconnect before a pause/delete. Confirm the warning persists, reconnect and
   confirm cancellation acknowledgement. An already sent message cannot be recalled.
6. Deny/revoke notification permission and expire the login session. Confirm the UI
   does not claim background scheduling succeeded.
7. Test low-power and Focus modes. Record limitations rather than promising bypasses.

References: [iOS Home Screen Web Push](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/),
[Push API](https://developer.mozilla.org/en-US/docs/Web/API/Push_API),
[Workflow sleep](https://workflow-sdk.dev/docs/api-reference/workflow/sleep).
