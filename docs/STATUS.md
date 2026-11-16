# Sparrow: current status (2026-11-16, second local run, backend live)

Repo: github.com/user23052036/Sparrow. `main` has everything through T4.1 ("What Sparrow stores" page):
D1 to D46 and migrations to `0032` plus `0036` (T2.5 had no number; see D44). Live site:
https://user23052036.github.io/Sparrow/, backed since 2026-11-16 by the owner's Supabase project (Tokyo, free plan;
the ref is in the repo secrets).

## Start here
1. `docs/AUTONOMY.md`: how to run without the owner (preflight, modes A/B/C, agents, credentials).
2. `docs/ROADMAP.md`: audit, position, tasks T0.1 to T5.4 with pre-assigned migration numbers.
3. Repo `CLAUDE.md` and `docs/DECISIONS.md` (D1 to D47).

**Next task: T4.2 (proof retention, `0033`).** Then T4.3 (`0034`), T4.4, WS5 (`0035`). Every migration now also
needs `bash supabase/tests/snapshot.sh` (in the Docker container) and a description of each new column in
`packages/shared/src/stored.ts` (D47). `0036` is already applied before them (D44): `0032` to `0035` must not touch `claim_push`,
`save_push_subscription`, `save_extension_push`, `convert_guest_key` or the `silent` column (a test checks); such a change goes in a
migration after `0036`.

## Done in this run (Mode C: Claude Code on the owner's Mac, `gh` signed in, PR loop)
Each task: own branch from `origin/main`, full local check list, PR, CI green, squash merge. T0.3, T1.2,
T2.1 and T2.2 also had an independent reviewer agent; every defect it found was fixed before merging.

| Task | PR | What |
| --- | --- | --- |
| T0.1 | #10 | Roadmap, autonomy guide and status committed; D38 to D41 written. |
| T0.2 | #12 | `deploy-db.yml`: PRs push every migration with the Supabase CLI into a throwaway PostgreSQL 16; `main` links, pushes, deploys functions, or skips green without secrets (seen green). #11 was closed: GitGuardian flagged a throwaway CI password in its first commit (false positive on their dashboard). |
| T0.3 | #13 | Static export on GitHub Pages (D41): `STATIC_EXPORT=1`, base path `/Sparrow`, `lib/site.ts`. Pages enabled through the API; the deploy fetches the landing page (live). |
| T1.1 | #14 | `today/page.tsx` split into seven files, none over 210 lines. |
| T0.4 | #15 | Live smoke test (`e2e-live/`, `smoke-live.yml`): sign up, commit a day, focus start/stop, delete account. Skips green without the Supabase variables; the same flow runs against the fake in every PR. |
| T0.5 | #16 | Emulator test (`android-emulator.yml`, `emulator-test.sh`). **First run of the Android engine ever: green.** On API 34, opening Clock during a session put `BlockedActivity` on top within a second; after the session, Clock opened normally. |
| T1.3 | #18 | Landing page states the position and three steps; explains Sparrow even with no backend. |
| T1.2 | #17 | Extension: `SPARROW_SITE` store build (folder paths allowed), base-path-aware `OPEN_APP`, `<all_urls>` replaced by per-site optional access from the popup (D42). |
| T1.4 | #19 | Guided first day `/start`: one task, a five-minute step, run it, invite a key holder (skippable). |
| T1.5 | #20 | CSP, no framing, referrer policy: real headers under `next start`, `<meta>` plus frame guard in the export. |
| T2.1 | #21 | Web Push (D38, `0028`): `push_subscriptions`, `claim_push`, `notify` function, service worker handlers, Settings switch, push-service allow-list. |
| T2.2 | #22 | Reminders (`0029`): morning/evening times, `claim_due_reminders`, `remind` function, pg_cron + pg_net job scheduled by the deploy workflow. |
| T2.4 | #26 | Partner fatigue guard (D43, `0031`): 3 asks per session, 5 per local day; quiet hours for account partners (profile) and guests (key page); requests wait and the reminder job delivers them when quiet hours end; `key_request_status` for kind notes on Focus. |
| T2.3 | #24 | Guest partner (D39, `0030`): key link `/key#spg_…`, anonymous guest functions, one key holder at a time, `claim_push` answers `{to, id}`, guest push, `convert_guest_key`. Run 2026-11-16; two review rounds (a race between invites and guests, push state, key memory on the page), all fixed before merging. |
| T2.5 | #27 | Instant start on the laptop (D44, `0036`): Chrome allows silent push in extensions since 121, so the extension subscribes (`userVisibleOnly: false`), saves a silent address, and syncs on each push; `session_started`/`session_ended` from the web and phone apps and `key_answer` wake it; 30 s polling stays. Deploy pushes with `--include-all` (remove it once `0035` lands). Two review rounds (a sign-out race, per-kind address limits, migration-order pin), all fixed before merging. |
| T3.1 | #29 | Evening review and proofs on Android (D45): photo through the system camera (`expo-image-picker`), re-encoded on the phone (`expo-image-manipulator`, which drops its hidden details), its own date read for the D32 note; written notes; share with the partner; the evening review with `review_day`. Review helpers moved to shared. Also: `notify` answers 403 instead of 500 for a guest key that is no longer valid. |
| T3.2 | see git log | Partner requests on Android (D46, `0032`): `device_sync` lists waiting key requests (ids only, quiet hours respected); the engine posts a notification with "Keep going" and a two-step "Let them out"; `device_decide_end_request` and `notify`'s device path (`claim_device_push`) answer with the phone's own credential; Protect asks for the notification permission. `0032` also requires every proof file to be in its author's folder. |
| T3.3 | see git log | "Check my setup" (Protect): the BETA.md phone checklist as lines that are done, not yet, check by hand or optional (`setupcheck.ts` in shared, tested); a live test starts a 5-minute session and confirms it reached the phone and that a listed app was covered (the engine now records when it last covered one). |
| T4.1 | see git log | "What Sparrow stores" (D47): `/stored`, built from `schema.json`, which `supabase/tests/snapshot.sh` writes from the migrations (CI checks it); every table and column described in `stored.ts` (a test fails otherwise); linked from Privacy. |

## Checks run in this run
- Locally, per task, with Node 24 (`fnm exec --using=24`; the Mac's default Node 20 is below the repo's
  engines): lint, format, typecheck, shared (163), extension (35), function (28) tests, Playwright
  (86 at the end).
- SQL suite: in a `postgres:16` Docker container (colima, already installed on the Mac, was started for
  this): `docker run -d --name sparrow-pg -e POSTGRES_PASSWORD=postgres -v ~/Sparrow:/repo postgres:16`, then
  `docker exec -u postgres sparrow-pg bash /repo/supabase/tests/run.sh`. Passed for every migration.
- Not run locally (no Java or kotlinc on the Mac): Android JVM tests and the API check. They ran green in
  every PR's `android-rules` job; the Gradle build and the emulator job ran green in CI.
- CI read with `gh pr checks` for every PR; all green before each merge.

After the T2.3 merge, every workflow on `main` was green (CI, Android build, Deploy database skipped without
secrets, Deploy web, Live smoke test).

## The live backend (connected 2026-11-16)
- The project already held an early hand-made schema (14 empty tables, no migration history), so the first
  `db push` stopped at `0001`. With the owner's go-ahead the old `public` schema, its storage policies and the old
  sign-up trigger were removed in the SQL editor (the auth user and the empty `proofs` bucket kept), Supabase's
  default grants on `public` restored, and the deploy rerun: 32 migrations, VAPID keys created, `notify`,
  `remind` and `delete-account` deployed, reminders and heartbeat checks scheduled (2 cron jobs). The one
  existing user got the profile and blocklist rows the sign-up trigger makes.
- Deploy web rebuilt the site with the project's URL and publishable key; the live smoke test passed against it
  (sign up, commit a day, focus start and stop, delete account).
- The publishable key (`sb_publishable_…`) works as the functions' bearer for anonymous calls (checked: `GET
  notify` answers the VAPID key).

## Not verified yet
- Web Push delivery through a real push service to a real browser or phone, and the reminder job sending one.
- The extension in a real Chrome (optional site access prompt and redirect after granting).
- The Android engine on a real phone (the emulator run covers app blocking only, not the VPN filter).
- The reminder job delivering key requests that waited through quiet hours (T2.4) on a real project.
- Instant start (T2.5): a real silent push through FCM reaching the installed extension, and the
  extension asking for nothing visible (needs the project and the extension loaded in Chrome 121+).
- Guest partner (T2.3) against a real project: a guest's browser getting a push, and two real accounts
  converting (the e2e fake has one user; the SQL suite covers it).

## Parked for the owner (nothing here blocks the next tasks)
- Done 2026-11-16: Supabase project, secrets and variables, URL configuration.
- One phone test: install the APK, follow Protect, then **Check my setup** (T3.3) shows what is left; by hand,
  also a photo proof and the evening review (T3.1) and a key request from a friend's phone (T3.2). Then store
  developer accounts, testers.
- The free plan pauses a project after about a week without use; the five-minute reminder job should keep it awake.

## Working notes
- SQL test user prefixes used so far: 2-9, a-f repeated, a1a1a1a1, c1c1c1c1, d1d1d1d1, e1e1e1e1,
  f1f1f1f1, 24242424, 25252525, 26262626, 28282828 (push), 29292929 (reminders), 30303030 (guest partner),
  31313131 (fatigue guard), 32323232 (extension push), 34343434 (phone key requests). `33333333` is taken by the
  early "3 repeated" tests. Next: 35353535.
- Extension push (D44): `push_subscriptions.silent` rows are extensions; `notify` and `remind` read only
  `silent = false` rows for notifications. The extension's push logic is in `apps/extension/lib/push.js`
  and `ensurePush`/`dropPush` in `background.js`; its tests fake `self.registration.pushManager`.
- For T4.4 (found building T4.1): `log_kind_act`, `partner_support_nudge`, `penalty_status`, `pledge_limit`,
  `set_penalty_optin` and `set_pledge` are executable by `anon` (never revoked from it). Each starts with
  `require_user()`, so nothing is exposed, but they should be revoked from `anon` in a later migration.
- The test stub now has Supabase's `service_role` role (bypass RLS); grant server-only functions to it.
- The e2e fake answers `use_focus_link` and the four guest RPCs (`guest_overview`, `guest_decide`,
  `save_guest_push`, `remove_guest_push`) before its signed-in check; they are the anonymous RPCs.
- `partner_overview()` now wraps the 0005 function, renamed `_partner_overview_accounts()`, and adds the
  `guest` state. `keyHolderName()` in shared turns any overview into the key holder's name (Focus, Today).
- The `remind` function imports `buildPayload` from `../notify/logic.ts` (one source for key-request
  notifications); it now answers `{ reminders, key_requests }`.
- The e2e push stand-in lives in `apps/web/e2e/push-mock.ts`; it forgets its subscription on reload. It now also
  models focus sessions, key requests, push subscriptions and the notify function.
- Edge Functions share code through `supabase/functions/_shared/` (push delivery and allow-list).
  Notification words live in `copy.push` and are pinned by the functions' tests.
- `remind` is deployed with `--no-verify-jwt`; its permission is the database-made secret in `reminder_job`.
- Branch from a freshly fetched `origin/main`: `gh pr merge` does not update the local remote-tracking ref.
- The Supabase CLI writes `supabase/.temp/` (ignored).
- Cloud workspace notes are in the repo's `CLAUDE.md`.
