# Sparrow: audit and roadmap (written 2026-11-15)

Read with `docs/AUTONOMY.md` (how to run this without the owner) and the repo's `docs/DECISIONS.md`.
Labels used below: **[verified]** checked in this session, **[inferred]** reasoned from what was checked,
**[assumed]** not checked.

## 1. Audit of the build (main at 66cc94d, PR #9 merged)

What is solid **[verified]**
- Lint, typecheck, 163 shared tests, 25 extension tests, 7 function tests pass on `main` (run 2026-11-15).
- Rules live in Postgres with RLS and a SQL suite; copy is centralised and scanned for shaming words.
- 27 migrations, 17 web routes, MV3 extension, Expo app with a Kotlin blocking module, CI with four jobs
  plus an Android Gradle build.

What is weak, in order of how much it costs the product
1. **Nobody can use it.** It has never run against a real Supabase project, is not deployed, and the
   Android engine has never run on a phone or emulator. Every claim about behaviour is a claim about
   tests against a fake backend. **[verified from STATUS, BETA.md]**
2. **The partner key cannot work in real life.** A locked session's owner asks the partner to end it, but
   the partner is told only inside the app. There is no notification of any kind in the web app, extension
   or shared code (grep for Notification/pushManager: nothing). A partner who is not looking at Sparrow
   never sees the request. The same gap means no morning or evening reminder exists. **[verified]**
3. **The extension only talks to localhost.** `manifest.json` content script matches only
   `localhost:3000` and `127.0.0.1:3000`; `background.js` falls back to `http://localhost:3000`. A deployed
   site cannot signal the extension. **[verified]**
4. **First run explains nothing.** The landing page is 45 lines: a title, a sample branch, three buttons.
   Onboarding is a profile form. Nothing leads a new person to a first task, a first focus session or a
   partner. **[verified]**
5. **Breadth hides the point.** Pledges, partner penalty, ratings, leaderboard, crafting, circle goals,
   focus links and kind acts all sit at the same level as the core loop, and all their formulas are
   unvalidated guesses (the project's own words). With zero users, each one is cost without evidence.
   **[verified they exist; the judgement is opinion]**
6. **Phone app is a fraction of the web app.** Five screens (Login, Today, Focus, Apps, Protect): no
   evening review, no proofs, no partner requests. **[verified]**
7. Smaller: `today/page.tsx` is 803 lines; `next.config.ts` sets no security headers; the anonymous
   `use_focus_link` RPC has no attempt limit (keys are random, so risk is low); the extension asks for
   `<all_urls>` (known Web Store review risk, D21). **[verified]**

## 2. The market

Source caveat: every page read was a comparison post written by a competitor (Accountablo, FLOWN,
12Focus, Unhookd, BlockP), dated Feb to Oct 2026. Prices and platform lists conflicted between pages.
Treat product facts as leads to re-check, not as settled. Finch was not covered by any page read.

| Group | Products | What they do | What they lack (per the pages read) |
| --- | --- | --- | --- |
| Money stakes | Beeminder, StickK, Forfeit, Accountablo | Charge you on a miss; Forfeit checks photo proof; StickK has referees and charity/anti-charity | No blocking. Criticised as harsh, punishing, dated or complex |
| Human boss | Boss as a Service | A person checks in daily, from $25/month | Expensive, a stranger, no blocking |
| Body doubling | Focusmate, Flow Club, FLOWN | Work next to someone on video | Self-report only, no blocking, no daily plan |
| Blockers | Opal, One Sec, ScreenZen, Brick, Jomo, Roots, Forest, AppBlock | Block or delay apps | Mostly phone-first; no tasks, no proof |
| Blockers that sync | Freedom | One session across phone and computer | No partner, no tasks |
| Blockers with a second person | BlockP (partner emailed on bypass, holds the settings password), Clearspace (teammates notified), AppBlock Strict Mode ("someone else's approval") | A partner sees or gates tampering | No daily plan or proof; none is stated to let a partner end a running session |

Findings
- **[verified in the pages read]** No product was described as combining (a) a daily commitment with
  proof, (b) a known person who verifies and holds the key, and (c) one focus session that blocks on
  Android and desktop together. Absence from six vendor posts is weak evidence, not proof.
- **[inferred]** The brief's own "unique differentiators" are mostly not unique: charity stakes (StickK),
  AI plus human proof checks (Forfeit), money on a miss (three products). Sparrow cannot win there and
  D25 keeps money in practice mode anyway.
- **[inferred]** The recurring complaints about competitors are punishment, price ($20 to $100 a year
  for blockers), and partner fatigue ("needs willing partners who tire", said of Clearspace).

## 3. Position

> **A friend holds the key.** One focus session locks your phone and your laptop together, and only
> someone you trust can let you out early. No money, no shame, nothing tracked.

Four things have to be true for that sentence to be honest. Each maps to a workstream.
1. The key works in seconds, wherever the partner is (WS2).
2. The partner does not need to adopt the app (WS2).
3. Phone and laptop really lock together (WS3, WS1).
4. "Nothing tracked" is checkable by a stranger (WS4): MIT licence, no analytics, a page listing every
   stored field.

Everything else is secondary and moves under a "Labs" switch (WS5) until beta data says otherwise.

## 4. Decisions this plan makes (add to `docs/DECISIONS.md` when the task lands)

- **D38: Web Push for partner requests and reminders.** Reverses the "needs a provider" part of D21: Web
  Push needs only a VAPID key pair, no third-party service. In-app remains the fallback.
- **D39: Guest partner.** A partner can act through a secret link without an account (same hashed-secret
  pattern as focus links D35 and device secrets D29). A guest can approve or encourage and see proofs
  shared with them; nothing else.
- **D40: Labs.** Pledges, partner pledge, ratings, leaderboard, badge crafting and circle goals are off by
  default behind one Settings switch. No data or migration is removed.
- **D41: Static web hosting.** Prefer a static export on GitHub Pages so deployment needs no extra
  account. Fall back to Vercel only if the export cannot work.

Unchanged: D1/D25 (no live money), D3 limits, D4 (no public ratings), D5 (no AI scoring), D34 (no Tauri,
iOS, marketplace, crypto).

## 5. Tasks

Rules: one task = one branch = one pull request. Tasks in the **web+db** lane run one at a time, in order,
because they share `copy.ts`, `fake-supabase.ts`, `rls_test.sql` and migration numbers. Migration numbers
are pre-assigned; do not reuse or reorder them. Every task ships tests and passes the full check list in
the repo's `CLAUDE.md`.

### WS0: make it real (lane: infra)
- **T0.1 Repo housekeeping.** Commit `docs/ROADMAP.md`, `docs/AUTONOMY.md`, `docs/STATUS.md` and the
  already-rewritten `CLAUDE.md` (all four are in the working folder, uncommitted, as of 2026-11-15). Add
  D38 to D41 to `docs/DECISIONS.md`. Keep `docs/STATUS.md` as the source of truth for local runs.
  *Done when:* merged.
- **T0.2 Database deploy workflow.** `.github/workflows/deploy-db.yml`: on push to `main` touching
  `supabase/**`, run `supabase db push` and `supabase functions deploy`. Uses secrets
  `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`, `SUPABASE_DB_PASSWORD`. If any is missing the job
  exits green with a notice. *Done when:* workflow merged and its skip path seen green.
- **T0.3 Web deploy workflow (D41).** Try `output: "export"` with a base path; publish to GitHub Pages
  with the built-in token. Public Supabase URL and anon key come from repo variables. *Done when:* the
  Pages URL serves the landing page, or a DECISIONS entry explains why Vercel was needed.
  **[assumed]** that all routes can be exported; check with a real build first.
- **T0.4 Live smoke test.** A workflow that runs four Playwright flows against the real project (sign up,
  commit a day, focus session start/stop, delete the account) when the secrets exist. *Done when:* green
  against the real project, or skipped green without secrets.
- **T0.5 Android emulator test.** A workflow using an Android emulator on GitHub's runners: install the
  debug APK, enable the Accessibility service with `adb shell settings put secure`, start a session
  through a test hook, open a listed app, assert the blocked screen is on top. *Done when:* green, or
  the exact failure is written in STATUS. This is the first time the engine runs at all.

### WS1: a stranger can start (lane: web+db)
- **T1.1 Split `today/page.tsx`** into components without behaviour change. *Done when:* e2e unchanged
  and green, no file over about 250 lines.
- **T1.2 Extension works with a deployed site.** Build script writes the production origin into the
  manifest's content-script matches and the background fallback; localhost stays for dev. Move
  `<all_urls>` to `optional_host_permissions` requested per listed site (closes D21's second half).
  *Done when:* extension tests cover both origins and the permission request.
- **T1.3 Landing page.** State the position in section 3, show the three steps (plan, lock, friend holds
  the key), link Privacy and Help. Copy in `copy.ts`. *Done when:* e2e covers it at phone width.
- **T1.4 Guided first day.** After the profile form: add one task, split it, run one five-minute step,
  then "invite someone to hold your key" (skippable). *Done when:* e2e walks a new account to a
  finished step in one flow.
- **T1.5 Security headers** (CSP that allows the Supabase origin, frame-ancestors none, referrer policy).
  For a static export these go in a `<meta>` tag or the host's config. *Done when:* a test asserts them.

### WS2: the key works (lane: web+db)
- **T2.1 Web Push, migration `0028`.** `push_subscriptions` table (RLS: own rows), Settings switch,
  service worker `push` and `notificationclick` handlers, Edge Function `notify` that sends with VAPID.
  The deploy workflow creates the VAPID pair once and stores it with `supabase secrets set`; the public
  key is served by the function. Events: partner asks to end a session (actions: "Let them out",
  "Keep going"), partner answered, proof shared. No message body ever contains a task title or proof
  text. *Done when:* SQL tests, function logic tests (`node --test`), e2e with a mocked push manager.
- **T2.2 Reminders, migration `0029`.** Per-person morning and evening times (off by default), sent by a
  scheduled job guarded like `0008` when `pg_cron` is absent. At most two a day; none on a day already
  reviewed. *Done when:* SQL tests cover time zones and the cap.
- **T2.3 Guest partner (D39), migration `0030`.** Invite link with a hashed secret; public page
  `/key#<secret>` that lists pending requests and shared proofs and can approve or encourage; can
  register for Web Push without an account. Owner can revoke. A guest converts to a full account by
  signing up from that page. *Done when:* SQL tests prove a guest secret can do exactly those things
  and nothing else; e2e covers invite, request, approve.
- **T2.4 Partner fatigue guard, migration `0031`.** At most three key requests per session and a
  per-day cap; the partner can set quiet hours; outside them requests wait and the owner is told kindly.
  *Done when:* SQL tests.
- **T2.5 Instant start on the laptop.** The extension subscribes to Web Push in its service worker so a
  session started elsewhere reaches it in seconds; 30-second polling stays as the fallback (D10).
  **[assumed]** that silent push is allowed for extensions in current Chrome; read Chrome's docs first
  and drop the task with a DECISIONS note if it is not. *Done (D44): allowed since Chrome 121; built with
  migration `0036` (no number was assigned; `0032` to `0035` stay with their tasks and must not replace
  `claim_push`).*

### WS3: the phone (lane: android)
- **T3.1 Evening review and proofs on Android** (photo through the system camera, text).
- **T3.2 Partner requests on Android:** `device_sync()` also returns pending key requests (migration
  `0032`, scheduled after WS2); the native service posts a local notification with the two actions.
- **T3.3 "Check my setup" screen:** runs the BETA.md device checklist on the phone and shows pass or
  not yet for each line, so the owner's one phone test takes five minutes.
- *Done when (all three):* JVM tests, API type-check, Gradle build and the T0.5 emulator job are green.

### WS4: trust you can check (lane: web+db, after WS2)
- **T4.1 "What Sparrow stores" page** generated at build time from the migrations (table, column, who
  can read it), with a test that fails when a new column is not described.
- **T4.2 Proof retention setting, migration `0033`:** keep proofs 7, 30, 90 days or until deleted;
  a scheduled job removes older ones, photos first (same order as D20).
- **T4.3 Attempt limit on `use_focus_link`, migration `0034`.**
- **T4.4 `SECURITY.md`** and a short threat model in `docs/`.

### WS5: focus the product (lane: web+db, last)
- **T5.1 Labs switch (D40), migration `0035`:** `profiles.labs` default false; hide the six features in
  navigation and pages when off; existing e2e for them turns it on first.
- **T5.2 Screenshots by script:** a Playwright script produces store and README screenshots.
- **T5.3 README:** the position, a comparison table with sources and dates, and an honest "what is not
  verified yet" list.
- **T5.4 Owner metrics page:** shows `beta_metrics()` to the project owner only.

### Not in this plan
Live money, marketplace, crypto, AI proof scoring, public ratings, iOS, Tauri desktop agent, Google
Calendar sync, physical badges. Reasons stand as in D25 and D34.

## 6. What only the owner can do (none of it blocks the tasks above)
1. Attach the repository to the session with push access (see AUTONOMY.md, section 1).
2. Create a Supabase project and add three repository secrets and two repository variables on GitHub.
3. Install the APK on a phone once and open "Check my setup".
4. Developer accounts for the Chrome Web Store and Google Play, and the store declarations.
5. Find 20 to 50 testers.

## 7. Order
T0.1 → T0.2, T0.3 (parallel with T1.1) → T0.4, T0.5 → WS1 → WS2 → WS4 → WS5, with WS3 in the android
lane alongside WS2 onwards (T3.2 after T2.1).
