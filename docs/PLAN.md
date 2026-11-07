# Sparrow — Implementation Plan

> **For any AI model or contributor working on this repo:** read this file and `docs/DECISIONS.md` before writing code. Work on **one milestone at a time**. Do not add features that `DECISIONS.md` lists as cut or deferred.

## 1. What Sparrow is

A gentle daily accountability app for people who struggle with motivation, focus, internet/phone addiction, depression, or loneliness. The original concept is in `docs/` (project brief, "Accountable").

**Core loop (the MVP must make this excellent):**

1. **Morning** — pick 1–5 tasks for today, each broken into ~5-minute steps; quick mood check-in.
2. **During the day** — start focus sessions that block distracting apps/sites on **both laptop and Android phone** at the same time.
3. **Proof** — capture a photo or short note per task, in-app.
4. **Evening** — review the day; partial wins count; misses lead to a gentle "one small win before bed?" prompt, never shame.

**Primary platforms:** web app (PWA), Chromium browser extension (desktop), Android app. iOS is deferred.

## 2. Principles (apply to every milestone)

- **Gentle by default.** Gentle Mode (no stakes) is the default. No copy that shames, blames, or uses "failed".
- **Private by default.** Every proof, mood entry, and stat is private unless the user explicitly shares it. Enforced in the database (Row-Level Security), not only in the UI.
- **Friction + visibility, not a prison.** Blocking can always be bypassed by a determined user on a personal device. Make bypassing slow, deliberate, and visible (logged; optionally shown to a buddy).
- **Server is the source of truth for time.** Timestamps on proofs, sessions, and plans are set server-side.
- **Append-only points.** Points are a ledger; balances are computed.
- **Tests ship with features.** Every milestone includes tests; privacy (RLS) tests are mandatory.

## 3. Tech stack

| Layer | Choice |
|---|---|
| Monorepo | npm workspaces (or pnpm) — `apps/web`, `apps/extension`, `apps/mobile`, `packages/shared` |
| Web | Next.js (App Router) + TypeScript + Tailwind, installable PWA |
| Backend | Supabase: Postgres, Auth (magic link), Storage, Realtime, Edge Functions |
| Desktop blocking | Chrome Manifest V3 extension (TypeScript), `declarativeNetRequest` |
| Android | Expo (React Native, TypeScript) **development build** (not Expo Go) + custom native module in Kotlin via the Expo Modules API |
| Push to phone | Firebase Cloud Messaging (FCM), triggered from a Supabase Edge Function |
| Testing | Vitest (unit), Playwright (web end-to-end), Supabase local stack for RLS tests, Android instrumented tests for the native module where practical |
| CI | GitHub Actions: lint, typecheck, unit + e2e tests |
| Hosting | Vercel (web), Supabase cloud |

## 4. Repository layout

```
/apps
  /web          Next.js app (PWA)
  /extension    Chrome MV3 extension
  /mobile       Expo app + Kotlin native module (modules/sparrow-blocker)
/packages
  /shared       Shared TS types, zod schemas, constants (copy strings)
/supabase
  /migrations   SQL migrations (schema + RLS policies)
  /functions    Edge Functions (e.g. focus-session push)
  /tests        RLS / policy tests
/docs
  PLAN.md  DECISIONS.md  (+ original brief)
```

## 5. Data model (initial)

All tables have RLS enabled. `user_id` always references `auth.users`.

**Core**
- `profiles` — id, display_name, timezone, gentle_mode (bool, default true), created_at
- `tasks` — id, user_id, title, notes, recurrence (nullable), proof_required (bool), archived (bool)
- `task_steps` — id, task_id, title, est_minutes (default 5), position
- `daily_plans` — id, user_id, date, committed_at, stake_type (`none` | `points`), stake_amount, mood_morning, mood_evening, reviewed_at — unique (user_id, date)
- `plan_items` — id, daily_plan_id, task_id, status (`pending` | `done` | `partial` | `missed` | `rescheduled`), completed_at
- `proofs` — id, plan_item_id, user_id, kind (`photo` | `text`), storage_path, server_created_at (default now()), image_phash, visibility (`private` | `buddy`)
- `points_ledger` — id, user_id, delta, reason, ref_table, ref_id, created_at (insert-only)

**Focus & devices**
- `devices` — id, user_id, platform (`web` | `extension` | `android`), label, push_token (nullable), last_heartbeat_at, protection_enabled (bool)
- `blocklists` — id, user_id, domains (text[]), android_packages (text[]), updated_at
- `focus_sessions` — id, user_id, started_at, planned_minutes, ends_at, ended_at, ended_early (bool), started_from_device_id, plan_item_id (nullable)
- `tamper_events` — id, user_id, device_id, focus_session_id (nullable), kind (`heartbeat_lost` | `protection_disabled` | `early_exit`), created_at

**Social**
- `buddy_links` — id, requester_id, partner_id, status (`pending` | `active` | `ended`), mutual (bool), share_tamper_events (bool, default false)
- `verifications` — id, proof_id, verifier_id, verdict (`approve` | `question`), comment, created_at

**Key RLS rules**
- Users read/write only their own rows.
- A buddy can read a proof only if `visibility = 'buddy'` and an `active` buddy_link exists.
- A buddy can read `tamper_events` only if the owner set `share_tamper_events = true`.
- `points_ledger`: insert only through server-side functions; no client updates/deletes.

## 6. Milestones

Each milestone ends with a short report: what was built, how to run it, what was tested, known gaps.

### M0 — Project setup
- Monorepo, Next.js + Supabase wiring, shared package, ESLint/Prettier, GitHub Actions CI, real README.
- **Done when:** `npm run dev` starts the web app against a local Supabase; CI passes on a PR; README setup steps work from a fresh clone.

### M1 — Auth & profile
- Magic-link sign in, sign out, onboarding (name, timezone, Gentle Mode explanation).
- **Done when:** same account shows the same data in two browsers; Playwright test covers sign-up → onboarding → dashboard.

### M2 — Tasks & micro-steps
- Create/edit/archive tasks; split into steps; "Start now" 5-minute step timer.
- **Done when:** CRUD works on mobile width; RLS test proves user B cannot read user A's tasks.

### M3 — Daily commitment & evening review
- Morning flow (pick tasks, mood, stake type `none`/`points`); evening review with `done/partial/missed/rescheduled`; points via ledger; partial-credit streaks (one miss never resets the day to zero).
- **Done when:** a simulated full day (mocked date) yields correct points; missing one task keeps credit for the rest; copy passes the gentle-language checklist (§7).

### M4 — Proofs
- In-app camera capture on mobile web (`<input type="file" accept="image/*" capture>`), text fallback, client-side compression, private storage upload, server timestamp, perceptual hash to flag reused images.
- **Done when:** proofs are private by default (RLS test); re-uploading the same image is flagged; images < ~500 KB after compression.

### M5 — Desktop: browser extension + focus sessions
- Web UI to manage blocklist and start/stop focus sessions.
- Extension: sign-in, subscribe to `focus_sessions` and `blocklists` via Realtime, block domains with `declarativeNetRequest` dynamic rules during active sessions, show a calm "blocked" page with the current task.
- Early exit requires a deliberate pause screen (e.g. 30-second wait + "what will you do instead?") and logs `early_exit`.
- Heartbeat every ~60 s while a session is active → `devices.last_heartbeat_at`; an Edge Function / scheduled job records `heartbeat_lost` if heartbeats stop mid-session.
- **Done when:** starting a session in the web app blocks listed sites in the extension within a few seconds; ending it unblocks; disabling the extension mid-session produces a `heartbeat_lost` event.

### M5b — Android app + app blocking
Built with Expo dev build + Kotlin native module `sparrow-blocker`.

**M5b-1: App shell**
- Expo app with sign-in, today's plan, focus session start/stop, blocklist editor (pick installed apps → `android_packages`).
- Registers device in `devices` with FCM push token.

**M5b-2: Blocking engine (native, Kotlin)**
- `AccessibilityService` listening to `TYPE_WINDOW_STATE_CHANGED` to detect the foreground app package.
- If a session is active and the package is in the blocklist → launch Sparrow's full-screen "blocked" activity (current task + "start a 5-minute step" button).
- Session state (active, ends_at, blocked packages) is persisted locally (DataStore) so blocking works **offline** and survives app restarts; expiry is checked against `ends_at`.
- Always allow: phone/dialer, SMS, emergency, Sparrow itself, and the user's chosen "always allowed" apps.

**M5b-3: Cross-device sync**
- Session started on laptop → DB insert → Edge Function sends FCM **data message** → phone updates local state and starts enforcing (Realtime alone is not enough because it only works while the app is running).
- Session started on phone → DB insert → extension receives it via Realtime.
- **Done when:** start on laptop → phone blocks within ~10 s; start on phone → laptop blocks within ~10 s; works with the Sparrow app swiped away.

**M5b-4: Tamper visibility & reliability**
- Detect Accessibility service disabled → log `protection_disabled`; heartbeat like the extension.
- Onboarding screen guiding the user to: enable the Accessibility service (with a clear, honest disclosure of what it reads and why), exempt Sparrow from battery optimization, and (for aggressive OEMs like Xiaomi/Oppo/Vivo/Samsung) enable autostart.
- Note: uninstalling cannot be reliably prevented on a personal device — log and make it visible instead.

**M5b-5 (optional, later): Website blocking in mobile browsers**
- Local `VpnService` DNS filter for blocked domains. Caveat: conflicts with any other VPN the user runs. Defer unless browser-based distraction on the phone is a real problem in testing.

**Distribution notes (verify before release):**
- Google Play reviews apps using the Accessibility API; prepare the required declaration and prominent in-app disclosure, and check current policy at submission time.
- For personal testing, install the APK directly / via `adb`. Google has announced developer-verification requirements for apps installed outside Play; check whether and when they apply in your region.

### M6 — Accountability partner (built; see DECISIONS D15)
- Invite via link; accept/decline; share selected proofs; buddy can `approve` or `question` (gentle wording); optional sharing of tamper events; see buddy's shared streak.
- **No penalties of any kind on the buddy** (see DECISIONS.md).
- **Done when:** two test accounts complete the full invite → share → verify loop; RLS tests prove non-shared proofs stay invisible.

### M7 — Safety, mood & copy pass
- Low morning mood → offer to shrink the day to 1–2 steps.
- 3 consecutive heavy-miss days → "Want to make tomorrow lighter?" (never punitive).
- Help & crisis-resources page reachable from settings and the evening review.
- Audit all copy against §7.
- **Done when:** low mood visibly changes the flow; no screen fails the checklist.

### M8 — Closed beta
- PWA install prompt, Chrome Web Store submission, Android internal testing track (or direct APK), feedback button, privacy-respecting analytics.
- **Metrics:** daily completion rate; 1/7/30-day retention; focus sessions per active user; early-exit and tamper rates; proof rate; buddy-pair retention; self-reported helpfulness and mood trend.
- **Done when:** 20–50 users, including people outside the founder's circle.

## 7. Gentle-language checklist (all UI copy)

- No "failed", "lazy", "broken streak", red-X shaming visuals.
- Misses are framed as information or as a choice to try again ("Want one small win before bed?").
- Partial progress is always acknowledged.
- Stakes and blocking are always explained before they apply; the user can always lower them.
- Store all user-facing strings in `packages/shared/copy.ts` so they can be reviewed in one place.

## 8. Later phases (only if beta data supports them)

- **Phase 2:** Accountability circles (small, anonymous option); AI plausibility score on proofs (assistive only); desktop native agent (Tauri) to block desktop apps, not just sites.
- **Phase 3 (after legal review):** real-money pledges via a payment provider using a charge-on-failure model, low caps, cooling-off period before raising stakes; charity partners.
- **Phase 4:** iOS (Screen Time APIs, requires Apple's Family Controls entitlement); physical milestone badges; partner API.

## 9. How to work on this repo (for AI models)

1. Read `PLAN.md` and `DECISIONS.md`.
2. Work on only the milestone you were given. List the files you will create/change before writing them.
3. Write migrations as new files in `supabase/migrations`; never edit an applied migration.
4. Include tests in the same change; run lint, typecheck, and tests before reporting done.
5. End with a report: built / how to run / tested / known gaps / questions.
6. If a requirement conflicts with `DECISIONS.md`, stop and ask instead of choosing.
