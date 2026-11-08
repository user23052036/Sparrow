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
