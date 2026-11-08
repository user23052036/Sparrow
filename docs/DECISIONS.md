# Sparrow — Decision Log

Each entry: decision, reason, status. Do not reverse a decision without adding a new entry explaining why.

## D1 — No real money in the MVP
**Decision:** Stakes are `none` or `points` only. No deposits, escrow, payouts, or charity transfers.
**Reason:** Holding deposits and forwarding penalties to charity can trigger escrow/payment, fundraising, KYC, and tax rules that vary by country. Requires legal review first.
**Status:** Deferred to Phase 3 (charge-on-failure pledges, low caps, legal review).

## D2 — Completion bonus is points, never money
**Reason:** A money bonus must be funded either by the company (unsustainable, encourages fake completions) or by other users' losses (a betting pool, and contradicts "penalties go to charity").
**Status:** Final.

## D3 — No penalty on accountability partners
**Decision:** The brief's "secondary motivator penalty" (User2 pays when User1 misses) is cut.
**Reason:** It gives the verifier a financial incentive to approve fake proofs, which breaks verification. It also puts blame and pressure on partners, which is harmful for users dealing with depression.
**Status:** Final.

## D4 — Crypto, paid motivator marketplace, public star ratings, leaderboards: cut from MVP
**Reason:** Each is a separate product with legal, moderation, and mental-health risk. Public ratings of people are risky for the target audience.
**Status:** Cut; revisit only with beta evidence.

## D5 — Verification = friction + social trust, not proof
**Decision:** In-app capture, server timestamps, duplicate-image detection, buddy confirmation. AI scoring later and assistive only.
**Reason:** Photos can be staged or reused and EXIF is often stripped; no automated check can prove a task was done.
**Status:** Final for MVP.

## D6 — Blocking = friction + visibility, not a lock
**Decision:** Bypass is possible on personal devices; make it slow, deliberate, and logged (`tamper_events`), optionally visible to a buddy.
**Status:** Final.

## D7 — Platforms: Web PWA + Chromium extension + Android first; iOS later
**Reason:** Founder uses desktop and Android. A web app cannot block anything; the extension covers desktop browsers; Android allows app blocking via Accessibility Service. iOS needs Apple's Family Controls entitlement and Swift work.
**Status:** Final for MVP.

## D8 — Gentle Mode is the default
**Status:** Final.

## D9 — The extension signs in with its own session
**Decision:** The extension gets its own Supabase session instead of borrowing the web app's. (Originally via email code; now via password, see D14.)
**Reason:** Supabase rotates refresh tokens. If two clients share one, the first refresh invalidates the other and can trigger reuse detection that ends both sessions.
**Status:** Final.

## D10 — Extension polls every 30 s instead of using Realtime
**Reason:** MV3 service workers are suspended when idle, so a Realtime websocket isn't reliable. The extension polls via `chrome.alarms` (30 s is Chrome's minimum period) and syncs instantly when the Sparrow website in the same browser tells it to. Worst case: a session started on another device takes up to ~30 s to reach this browser.
**Status:** Prototype. Revisit if 30 s proves too slow.

## D11 — Extension is plain JavaScript with no build step
**Reason:** "Load unpacked" works directly from `apps/extension`, which keeps setup simple. Pure logic lives in `lib/` and is unit-tested with `node --test`. `lib/domains.js` duplicates `packages/shared/src/domains.ts`; tests in both places pin the same behaviour.
**Status:** Prototype. Move to TypeScript + a bundler when the extension grows.

## D12 — Plain CSS design tokens instead of Tailwind
**Reason:** One small token file (`apps/web/app/globals.css`) is easier to keep consistent between the web app and extension pages than a Tailwind setup.
**Status:** Final for the prototype.

## D13 — Points and timestamps are computed in the database
**Decision:** Committing a day, reviewing it, points, focus sessions, and device heartbeats all go through Postgres functions. The browser cannot write these tables directly (enforced by RLS and tested in `supabase/tests/rls_test.sql`). `packages/shared/src/scoring.ts` mirrors the points rules for display and must be kept in sync with `review_day()`.
**Status:** Final.

## D14 — Email + password sign-in (link kept as a secondary option)
**Decision:** Primary sign-in is email + password, with "Confirm email" off in Supabase. The extension connects by sending the password once to Supabase and keeping only its own tokens.
**Reason:** Supabase's built-in email sender allows only a few emails per hour, and its templates can't be edited without custom SMTP, so the default email contains a link but no code. The code-based extension connect step could not work, and a prototype shouldn't require an email provider.
**Trade-off:** Anyone can create an account with an unverified address. Fine for a local prototype; before real users, connect SMTP and turn "Confirm email" back on.
**Status:** Prototype.

## D15 — Accountability partner and the partner key
**Decision:** One partner per person, with mutual visibility. Either side can end the partnership at any time. Activity sharing (today's tasks, focus moments, streak) is a per-person switch; proofs are shared one at a time. A focus session can be *locked* (up to 120 minutes): the owner can't end it early on their own, they ask their partner, who approves or encourages them to keep going. Ending the partnership releases any lock immediately, so nobody is trapped.
**Reason:** The original brief's core idea is that someone else is on the hook with you. For internet addiction in particular, an impulse to quit a session is exactly when a second person helps most. Everything is enforced in Postgres (partner functions plus RLS), covered by the privacy tests.
**Not built, on purpose:** the "partner pays a penalty" rule (D3), public star ratings and leaderboards (D4), and real-money stakes (D1). Partner pings are in-app only for now.
**Status:** Prototype. Needs two real accounts to try end to end.

## D16 — A lighter day is the user's choice, and the database enforces it
**Decision:** A low morning mood (Heavy/Low) or three consecutive heavy days (each under 34% completion) *offers* a smaller day; it never forces one. If the user says yes, `profiles.light_day` is set to that date and `commit_day()` allows at most two tasks and no stake for it. Three heavy days are counted only when the reviewed days are consecutive calendar days, so a long break never reads as a bad streak. The offer after the third heavy day is shown right after the evening review ("Want to make tomorrow lighter?") and applies to tomorrow.
**Reason:** Shrinking the day is help, not a penalty, so it must be opt-in; but once chosen it should hold even if the UI is bypassed, like the other rules in D13. The owner can clear it at any time (their own profile row), so it can't trap anyone.
**Also:** The support page is linked from Settings, the evening review and the footer. Copy audit tests now scan all web and extension sources for shaming words.
**Status:** Final for MVP.

## D17 — The Android shell does not register as a blocking device yet
**Decision:** The M5b-1 app shell (sign-in, today's plan, focus start/stop, app blocklist) does not call `heartbeat` or store its FCM token until the native blocker exists. The code is written and sits behind `ENGINE_READY` in `apps/mobile/src/device.ts`; flip it when M5b-2 and the background heartbeat (M5b-4) ship. Migration `0007` already adds `devices.push_token` and `set_push_token()`.
**Reason:** The database treats every `android` row in `devices` as a device that is blocking. Registering a phone that cannot block yet would log false "blocking went quiet" events during sessions, and a partner who opted in to see tamper events would see them.
**Also:** Android uses the same email + password sign-in as the web (D14), a raw FCM token (not an Expo push token), and lists apps through `queryIntentActivities` instead of the Play-restricted `QUERY_ALL_PACKAGES`.
**Status:** Prototype. Untested on a real device (see README).

## D18 — Beta metrics come from existing tables, and there is no tracking
**Decision:** The beta is measured by `beta_metrics()` (migration `0008`), a SQL function over data the app already stores (plans, reviews, focus sessions, proofs, partnerships, feedback). It is callable only by the project owner. There are no analytics scripts, no event stream and no third-party services. The only new table is `feedback`, which the user writes on purpose.
**Reason:** The audience may be struggling, and the plan promises privacy-respecting analytics. Everything the plan lists as a metric can be derived from product data, so extra tracking would add risk and no information.
**Trade-offs:** No funnel or click data, and no per-person views. Retention is computed from plan dates, so it measures use of the planning loop, not page visits. With 20 to 50 users the rates are noisy; read trends, not decimals.
**Also:** The scheduled heartbeat check (`check_all_heartbeats()`) is guarded: if `pg_cron` is not enabled, the migration prints a notice and everything else still works.
**Not built here:** account deletion from inside the app. Storage objects (proof photos) cannot be removed with SQL, so a correct delete needs a server-side function with the service key. Built later in D20.
**Status:** Final for the beta.

## D19 — Browser tests run against a fake backend; the SQL tests own the rules
**Decision:** Playwright tests (`apps/web/e2e`) drive the real web app in a real browser and answer every Supabase request from an in-memory fake (`fake-supabase.ts`). Business rules (RLS, points, light-day caps) are verified against real PostgreSQL by `supabase/tests/rls_test.sql`; the fake reuses the shared scoring and light-day constants so the two cannot drift silently.
**Reason:** A full local Supabase stack needs Docker and is slow and flaky in CI. The browser tests are meant to catch UI wiring, copy and flow regressions, not database behavior.
**Trade-off:** The fake can accept something the real database would reject. When a rule changes, change the SQL test first.
**Status:** Final.

## D20 — Account deletion is self-serve, photos first, through an Edge Function
**Decision:** Settings has a "Delete my account" panel (type `delete` to confirm). It calls the `delete-account` Edge Function (`supabase/functions/delete-account`), which takes the user id from the verified access token (never the request body), removes every photo under `proofs/<user_id>/`, checks none are left, and only then deletes the user. Every table already cascades from `auth.users`, so the database rows go with it.
**Reason:** D18 named this as the first thing to add before public users. Storage objects can't be removed with SQL, so the service key has to be used server-side.
**Order matters:** photos first. If the second step fails the person can simply try again; the reverse order could leave photos that nobody owns and nobody can delete.
**Found while building it:** deleting one partner also deletes the partnership row, which used to leave the other person's *locked* focus session with nobody able to release it (up to 120 minutes). Migration `0009` adds a trigger that releases such locks whenever a partnership row is deleted. The SQL suite fails without it.
**Tested:** the function's logic (paging, sub-folders, similar-prefix folders, invalid ids, storage failure keeps the account) with `node --test`; cascade and lock release in `supabase/tests/rls_test.sql`; the Settings flow in Playwright against the fake. **Not tested:** the real Edge Function runtime against a real Supabase project (needs a deployed project; see docs/BETA.md).
**Trade-off:** the confirmation is a typed word, not a password re-entry; a stolen unlocked session could delete the account. Acceptable for the beta.
**Status:** Final for the beta; deploy step is manual.

## D21 — Deferred on purpose: partner email/push, and narrowing the extension's `<all_urls>`
**Partner notifications beyond in-app (D15):** they need a mail or push provider, secrets and a sending domain. Code written without those can't be verified, so it was not built. Add it together with the SMTP step in docs/BETA.md.
**`<all_urls>` host permission:** redirecting a blocked site needs host access to that site. Moving it to optional permissions requested at runtime changes the install and first-run flow and has to be tried in a real Chrome. Left as the known Web Store review risk in docs/STORE_LISTING.md.
**Status:** Open; revisit with beta feedback.

## D22 — Kind act instead of a charity donation
**Decision:** After a reviewed day with something that didn't happen, a person can log one small kind thing they did for someone (`log_kind_act()`, migration `0011`). It earns 5 points, once per day, only when the day had a miss. Nothing is shared and no money moves.
**Reason:** The brief's "turn a miss into a prosocial action" is worth keeping, but money to charity is cut for now (D1). Points are kept below finishing a task (10), so missing on purpose never pays; the unit tests pin `KIND_ACT_POINTS` below `POINTS.done`.
**Not built:** charity choice and donations (D1), volunteer vouchers, and an extra-micro-task stake. Those need either money, partners or a design pass.
**Status:** Final for the beta.

## D23 — Progress is computed, private and unranked; helping is counted in days, not points
**Decision:** `my_progress()` (migration `0012`) returns badges, a mood trend and "days you supported your partner" for the signed-in person, computed on request from existing tables. Nothing is stored and nothing is shown to anyone else. Badges are digital only. A run of days counts any day with some credit (partly done counts), so one miss never resets it.
**Reason:** The brief's motivation points and social ratings would give partners a reason to approve fake proofs (D3) and turn support into a popularity contest (D4). Counting days of support, privately, recognises help without paying for it.
**Not built:** star ratings, public reputation, leaderboards (D4), physical badges, badge crafting.
**Also:** `export_my_data()` returns only the caller's own rows (never a partner's shared proofs), without device push tokens, photo storage paths or invite codes. Photos themselves are not in the file.
**Status:** Final for the beta.

## D24 — If-then plans and calendar import are small and local
**Decision:** A task can carry an "If X, then I will Y" plan (both parts or neither, enforced by a check constraint, migration `0010`). Calendar events come in through an `.ics` file chosen by the user and read in the browser by `packages/shared/src/ics.ts`; each chosen event becomes an ordinary task with the date in its notes. Repeating events are added once.
**Reason:** Both are in the brief and need no outside service. Google Calendar sign-in would need OAuth credentials and a verified app, and a to-do app import needs per-app APIs.
**Status:** Final for the beta; Google Calendar sync is open.
