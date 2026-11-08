# Sparrow

A gentle daily accountability app for people who struggle with focus, motivation, internet and phone addiction, or low mood.

**Status:** Working prototype: website + Chrome extension, plus an Android app shell (M5b-1). App blocking on the phone comes next (see `docs/PLAN.md`, milestone M5b-2).

## What works in this prototype

- **Sign in** with email + password (or an emailed link), then a short onboarding (name, time zone, Gentle Mode).
- **Tasks** broken into small steps, each with a "Start now" timer.
- **Morning commitment:** mood check-in, pick 1–5 tasks, optional points stake (only when Gentle Mode is off; never money).
- **During the day:** tasks shown as birds on a branch, step checklists, Done / Partly buttons, photo or note proof.
- **Evening review:** partial days count, missed tasks are met kindly, points are awarded by the server. Unreviewed past days can be closed later.
- **Focus sessions:** choose sites to block, start a session, and the extension blocks those sites in your browser. Ending early asks you to wait 30 seconds and say what you'll do instead. Sites can be added, but not removed, while a session runs.
- **Tamper visibility:** if the extension goes quiet during a session, it's noted on the Focus page.
- **Accountability partner:** invite one person with a link. Each of you sees what you choose to share (your day, focus moments, and proofs one at a time). They can approve a proof or ask a question.
- **Partner key:** lock a focus session so only your partner can end it early. You ask, they decide. Ending the partnership releases any lock immediately.
- **Lighter days:** a low mood check-in, or three hard days in a row, offers a small day (one or two things, no stake). The support page is one tap from Settings and the evening review.
- **If-then plans:** add "If X, then I will Y" to any task; it shows on the morning list.
- **Calendar import:** choose an `.ics` file (Google Calendar, Apple Calendar and Outlook can export one) and pick events to add as tasks. Read on your device only.
- **Kind act:** after a day with something that didn't happen, log one small kind thing for someone (+5 points, once a day). No money, nothing shared.
- **Progress page:** private badges, a mood trend in words, and how many days you supported your partner. Nothing is ranked or rated.
- **Your data:** download everything Sparrow holds about you, or delete the account (photos included), from Settings.
- **Install and feedback:** the website installs as an app (PWA), has a feedback button, and a plain-language privacy page.
- **Privacy:** every table has Row-Level Security; proofs are private by default.

## Project layout

```
apps/web         Next.js website (installable as a PWA)
apps/extension   Chrome MV3 extension (plain JS, load unpacked)
apps/mobile      Expo Android app (development build) + Kotlin module
packages/shared  Shared types, points rules, wording, helpers (+ tests)
supabase/        Database migrations and RLS tests
docs/            PLAN.md, DECISIONS.md
```

## Setup (about 15 minutes)

You need Node.js 20+ and a free [Supabase](https://supabase.com) account.

### 1. Create the Supabase project

1. Create a new project in Supabase.
2. Open **SQL Editor** and run each file in `supabase/migrations/` **in order** (`0001` → `0016`).
3. **Authentication → URL Configuration:** set Site URL to `http://localhost:3000` and add `http://localhost:3000/auth/callback` to Redirect URLs.
4. **Authentication → Sign In / Providers → User Signups:** turn **Confirm email** off, so new accounts work immediately without an email service. (Turn it back on once you connect your own SMTP provider for real users.)

> Supabase's built-in email sender is heavily rate-limited and its templates can't be edited without custom SMTP. That's why Sparrow signs in with email + password; the emailed link remains available as a secondary option.

### 2. Run the website

```bash
npm install
cp apps/web/.env.example apps/web/.env.local   # then paste your URL and anon key
npm run dev                                    # http://localhost:3000
```

The URL and anon (publishable) key are in Supabase under **Project Settings → API**. The anon key is safe in the browser; the database's RLS policies protect the data. Never put the `service_role` key in this app.

### 3. Load the extension

1. Open `chrome://extensions` (Edge: `edge://extensions`, Brave: `brave://extensions`).
2. Turn on **Developer mode**, click **Load unpacked**, choose `apps/extension`.
3. In Sparrow go to **Settings → Connect the extension** and enter your Sparrow password. It's used once to sign the extension in and isn't stored.

To use a deployed site instead of localhost, add its origin to `content_scripts.matches` in `apps/extension/manifest.json` and reload the extension.

### 4. Android app (optional, development build)

You need Android Studio (SDK + an emulator or a phone with USB debugging) and JDK 17+. Expo Go will not work: Sparrow uses a custom native module.

```bash
cp apps/mobile/.env.example apps/mobile/.env     # same Supabase URL + anon key as the website
# Firebase (only needed for push, which stays off until the blocker ships):
#   create a Firebase project, add an Android app with id com.sparrow.app,
#   and save its google-services.json as apps/mobile/google-services.json
cd apps/mobile && npx expo install --fix         # align package versions with your Expo SDK
npx expo run:android                              # builds and installs the development build
```

Today it signs in, shows your plan, starts and stops focus sessions, and lets you pick apps for your list. It does **not** block apps yet. If the Kotlin module fails to build, the app still runs and offers manual app-id entry. **This shell was written without a device, so expect small fixes on first run.**

## Tests

```bash
npm test                  # shared logic: points, domains, image hash, gentle wording
npm run test:extension    # extension logic: rules, clock skew, domain matching
npm run lint && npm run format:check
npm run test:e2e          # Playwright in Chromium against a fake Supabase (first run: npx playwright install chromium)
npm run typecheck
npm run build
npm run test:functions   # delete-account Edge Function logic (node --test)
bash supabase/tests/run.sh   # migrations (0001 to 0016) + privacy/RLS checks on a local PostgreSQL 15+
```

## Known limits

- Blocking is friction, not a lock: the extension can be disabled, and another browser isn't covered. That's why going quiet mid-session is logged.
- A session started on another device can take up to ~30 seconds to reach this browser.
- Partner pings are in-app only (a badge and the Partner page); there is no email or push notification yet. No Android app yet (M5b).
- The partner flow needs two accounts, so try it with a friend (or a second email).
- Photo "proof" raises the effort of faking; it doesn't prove anything. Re-used photos are flagged.

## Docs

- [`docs/PLAN.md`](docs/PLAN.md): implementation plan and milestones
- [`docs/DECISIONS.md`](docs/DECISIONS.md): what was cut or deferred, and why
- [`docs/BETA.md`](docs/BETA.md): closed beta runbook and metrics
- [`docs/STORE_LISTING.md`](docs/STORE_LISTING.md): Chrome Web Store listing draft

## License

MIT
