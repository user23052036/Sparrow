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
**Status:** Prototype. Revisit if 30 s proves too slow. Since T2.5 (D44) a silent push makes the extension check at once; the 30-second poll stays as the fallback.

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

## D25 — Money, partner penalty and ratings are built, but only in practice mode and with safeguards
**Decision:** At the owner's request this reverses D1 (no money), D3 (no partner penalty) and part of D4 (no ratings or leaderboards), with limits. Migrations `0013`–`0016`:
- **Pledges:** before a day a person can pledge a small amount to a listed charity. Missing tasks "owes" a share, by completion. **`mode` is locked to `practice` by a check constraint: no money moves anywhere.** Needs Gentle Mode off, not allowed on a lighter day or after a heavy-mood morning, starts at a limit of 20 and doubles with the biggest pledge in the last 14 days up to 100, and shows an understanding step. Charities are seeded by the operator in `charities`.
- **Partner penalty:** both people must opt in, either can turn it off. The partner's practice share is a quarter of what is owed, 1 to 10, and is skipped if the payer is in Gentle Mode or on a lighter day. A partner's approve/reject never changes the outcome (D3's fraud worry), so approval has no price. In-app support nudges appear for a partner who shares activity and has had 2 or 3+ hard days.
- **Ratings:** reliability 1 to 5 (30 days, needs 7 reviewed days, counts partly done) and support 1 to 5 (days of helping in 30). Private by default; the person may share both with their partner only. No public star rating.
- **Leaderboard:** opt-in with a made-up handle (3 to 20 letters, numbers, underscores), hidden until 10 people join, shows the top 10 by days with something done this month, and everyone else only a band. It ranks progress, never support.
**Not built, on purpose:** live charging or payouts (needs a payment provider, keys, legal review and refund handling; steps in docs/PAYMENTS.md), the accountability-partner marketplace and hiring, crypto stakes, public star ratings. These carry legal, vetting and fraud risk that code alone does not solve.
**Risks:** the formulas (limit doubling, 25 percent share, rating weights, 10-person floor) are unvalidated guesses; watch `select public.pledge_metrics(30)` and beta feedback. Tested on real Postgres and the fake-Supabase e2e, not against a live Supabase project.
**Status:** Practice mode final for the beta. Going live is a separate decision.

## D26 — Micro-task stake: a stake paid in effort, capped at one step
**Decision:** With Gentle Mode off (and not on a lighter day) a person can stake "one extra five-minute step tomorrow" instead of points (`commit_day(..., p_micro)`, migration `0017`). When the day is reviewed with at least one missed task, the server adds exactly one make-up step for the next day, named after the first missed task. It can be done or let go; letting go is allowed and only visible to the person. Points and a make-up step can't both be staked on the same day.
**Reason:** The brief's non-money stake. Capping it at one step per day means it can never snowball into a backlog, which would be harmful for the target audience.
**Status:** Final for the beta.

## D27 — Voice-note proofs
**Decision:** A proof can be a voice note of up to 60 seconds (`proofs.kind = 'voice'`, migration `0018`), recorded in the browser with MediaRecorder at about 32 kbps (a minute is about 240 KB, client cap 1 MB). It follows the photo rules: private bucket under `proofs/<user_id>/` (enforced by a trigger too), server timestamp, private by default, shared one at a time with a partner who can play it.
**Not built:** transcription or any automatic check of what was said (D5: verification is social, not automated).
**Status:** Final for the beta. Tested with Chromium's fake microphone, not on real phones yet.

## D28 — Circles of 2 to 4, next to the one partner
**Decision:** A person can be in one circle of two to four people (migration `0019`), in addition to an optional partner (D15 is unchanged: only the partner holds the key and verifies proofs). A circle sees each member's name and, unless that member switches it off, counts only: how many planned things moved forward today, whether the day is closed, and focus minutes. Never task titles, proofs, moods or tamper events. Members can send one cheer per person per day. Anyone can leave at any time; leaving makes a new invite code so old links stop working; an empty circle is deleted. Nobody can remove someone else, and nothing is ranked.
**Reason:** The brief asks for groups. Extending the partner model to many people would multiply the partner key and proof verification, which carry the most pressure; a lighter, counts-only circle gives company without surveillance. Member keys (not user ids) are used inside the circle.
**Risks:** no moderation tools (a circle is invite-only and anyone can leave). Revisit if beta users ask for removal or reporting.
**Status:** Prototype.

## D29 — Android blocking engine: device secret and polling instead of FCM
**Decision:** M5b-2 to M5b-4 are written: an AccessibilityService that reads only the foreground app's package name, a local copy of the session (SharedPreferences) so blocking works offline and after restarts, a calm blocked screen, always-allowed apps (the shared list plus the phone's own dialer, SMS app, launcher and keyboard; Settings is always allowed so protection can always be switched off), and a Protect tab with the prominent disclosure, Accessibility, battery and OEM autostart steps.
**How the phone talks to the server:** the service can't share the app's Supabase session (D9). Each phone gets its own random device secret (`issue_device_secret`, stored hashed, migration `0020`). With it, and only the anon key, the phone can call one function, `device_sync()`, every 30 seconds while the screen is on. That call is the heartbeat and also how a session started on the laptop reaches the phone (worst case ~30 s, same as the extension, D10). This replaces the planned FCM push for M5b-3, so no Firebase project is needed.
**Screen off:** when the screen goes off during a session the phone reports "asleep", and the server doesn't count its silence as going quiet. Switching protection off is still recorded. The foreground app's heartbeat clears "asleep". Apps, like sites, can't be removed from the list during a session.
**Registering:** `ENGINE_READY` now follows whether the native module is built in, and the phone registers only once Accessibility is switched on, so a phone that can't block never produces tamper events (D17's concern).
**Not verified:** the Kotlin code that touches Android has not been compiled against the Android SDK or run on a phone (the build environment had no Android SDK). The pure rules (`BlockRules.kt`) are compiled and tested on a plain JVM (`android/run-jvm-tests.sh`), and the rest was type-checked against hand-written stubs only. Expect small fixes on the first device build. M5b-5 (VPN-based website blocking on the phone) stays deferred.
**Status:** Written, untested on a device.

## D30 — Website blocking on the phone: a local DNS filter, optional and off by default
**Decision:** M5b-5 is written. During a focus session the phone can keep the sites on the person's list away in its browsers with a local `VpnService` (`SparrowVpnService`). Only one made-up address (the DNS server Sparrow announces) is routed to it, so the only thing it ever sees is the phone asking where a site is. A listed site (or anything under it) gets "no such name"; every other question is passed to the DNS servers the phone was already using, outside the VPN, and the answer is handed back. Pages and all other traffic never pass through Sparrow, and nothing is logged or sent. `device_sync()` now also returns the site list (migration `0021`).
**Why optional and off by default:** Android allows one VPN at a time, so this pauses any other VPN while it runs. It has its own disclosure and switch on the Protect tab and needs Android's own "allow VPN" question. It runs only while a session with listed sites is active and stops by itself when the session ends, also offline. Sparrow's own server can never be blocked, whatever the list says.
**Limits, on purpose (D6):** a blocked site shows the browser's own "can't be reached" page (showing Sparrow's calm screen would mean intercepting encrypted traffic). A browser or phone set to its own secure DNS (Private DNS with a named provider, or a browser's DNS-over-HTTPS) gets around it; Sparrow does not try to stop that. If the VPN is switched off in Android's settings during a session, website blocking stops and no tamper event is recorded; only the Accessibility service is treated as "protection" (D29).
**Tested:** the DNS rules (reading a question, matching, the refusal, the reply packet and its checksum, malformed input) run on a plain JVM (`run-jvm-tests.sh`, 12 tests); the SQL change is in `rls_test.sql`. **Not verified:** the service itself has never run on a phone. In particular, whether Android lets the Accessibility service start it while the app is in the background, and how opportunistic Private DNS behaves with the made-up server, need a real device.
**Play:** apps using `VpnService` need Google's VPN declaration in addition to the Accessibility one. Check the policy at submission time.
**Status:** Written, untested on a device.

## D31 — Circle names: the anonymous option for circles
**Decision:** A member can go by a made-up name in their circle (2 to 20 letters, numbers, spaces, `-` or `_`; migration `0022`). It can be chosen when creating or joining, so the profile name is never shown first, and changed or cleared later. With a circle name set, the circle never sees the profile name: members, cheers and the overview all use it. A name another member is already shown as (their circle name or their own name) can't be taken.
**Reason:** The plan's Phase 2 asks for an anonymous option. Circles already share only counts (D28), so the name was the one identifying thing left.
**Not built:** matching strangers into circles. A circle is still invite-only, so the people in it usually know who they invited; the made-up name protects against the rest of the circle, not against the person who sent the link.
**Status:** Prototype.

## D32 — Proof context: plain notes from simple checks, never a score
**Decision:** The plan's Phase 2 "plausibility score (assistive only)" is built as rule-based notes without a number. `proof_context()` (migration `0023`) returns, for one proof, to its owner or to the partner it was shared with: how many days after the planned day it was added, whether it was added within five minutes of planning the day, and for photos whether the photo's own date (EXIF, read in the browser before the image is re-encoded) is more than a day older than the moment it was added. The Partner page shows these under "About this proof" with the line that they are not a verdict. A person adding an older photo is told kindly and can still save it.
**Why no score and no AI:** a number next to someone's proof reads as a judgement of the person, which is what D3, D5 and the gentle-language rules exist to avoid, and a model call would need an outside service and send proofs to it. The photo date is reported by the person's own browser and is easy to remove or edit, so it is a hint like the "similar photo" flag, and it never changes points, pledges or ratings.
**Privacy:** the context holds nothing that wasn't shared: no other proofs, no focus sessions, no paths or ids. Private proofs give the partner no context, and an unknown id answers the same as a forbidden one.
**Also fixed:** the note shown after saving a photo (for example "looks like one you've used before") used to disappear as soon as the day reloaded; it now stays under the task.
**Status:** Final for the beta.

## D33 — Checking the Android code without a phone: real API type-check, a build workflow, no Firebase
**Decision:** Three things reduce the "never compiled" risk from D29 without a device:
- `android/check-android-api.sh` type-checks all the module's Kotlin (engine, VPN filter, Expo bridge) against the real Android API jar (API 34), with small stand-ins for `R` and the handful of expo-modules-core names the bridge uses. This replaces the hand-written Android stubs from D29 and runs in CI (`android-rules` job) next to the JVM tests.
- `.github/workflows/android-build.yml` runs `expo prebuild` and `gradlew :app:assembleDebug` on GitHub's runners (which have the Android SDK) and uploads the debug APK. It could not be run from where it was written, so treat its first run as the first real build.
- `googleServicesFile` and the unused `expo-notifications` plugin are removed from the app config. Since D29 the phone polls instead of using push, and the missing `google-services.json` would have stopped every build. `expo prebuild` now succeeds from a clean checkout and autolinking finds the `sparrow-blocker` module (both checked).
**Update, 13 Nov 2026:** the workflow's first two runs (the pull request and `main`) passed: Gradle compiled the whole module against the real SDK, merged the manifest and produced a debug APK, with no changes needed to the Kotlin. The workflow now also tries a standalone APK with the app's code bundled in (signed with the debug key, for your own phone only); the JavaScript bundling half of that was checked locally with `expo export:embed`, the Gradle half has not run yet, so that step is allowed to stop without turning the workflow red.
**Still not verified:** anything at run time on a phone.
**Status:** Final until the first device run.

## D34 — Not built in this pass, and why
- **Desktop native agent (Tauri)** from Phase 2: a separate application with OS-specific blocking, code signing and installers; it can't be exercised without the target desktops.
- **AI scoring of proofs, Google Calendar sync, partner email or push, wearables, open API, mentors, micro-verifier marketplace, physical badges, iOS:** each needs an outside service, credentials, vetting or a legal step (see D21, D24, D25).
- **Live money, partner marketplace, crypto, public ratings:** unchanged from D25.
**Status:** Open; each is its own decision.


## D35 — Focus links: a key that can only start focus
**Decision:** The brief's "wearables and smart-home triggers" is built as focus links (migration `0024`). A person can make up to five links, each with a name and a length (5 to 120 minutes). Opening `/go#<key>` (an NFC tag, a home-screen shortcut, a watch, phone or smart-speaker routine), or sending the one web request shown next to it, starts a focus session of that length; the extension and the phone then block as usual (D10, D29). No sign-in is needed to use a link: the key is the whole permission.
**What a key cannot do:** end a session, lock one, start a second one while one runs, or read anything (no tasks, names, sites or ids come back, only whether a session started and when it ends). So the worst a leaked key can do is start focus time, and the owner can remove the link at once. Keys are stored as a SHA-256 hash and shown once. The key travels after `#` so it is not sent to the web server when the page is opened.
**Why not a general API:** an open API with read access (the brief's "open API for partners") would put tasks, moods and proofs behind a long-lived secret. A write-only key with one harmless action gives the useful part (start focus from anything) without that risk.
**Risks:** a link opened while a blocking device is offline starts a session that the device joins late, which can log "went quiet" like any other session. A link preview service that runs page scripts could start a session by fetching the link; none was seen, and the cost is a focus session the owner can end.
**Tested:** SQL suite (anonymous use, hashing, limits, removal, export), unit tests pinning the limits to the migration, Playwright against the fake. **Not tested:** a real NFC tag, automation app or a real Supabase project.
**Status:** Prototype.

## D36 — Badge crafting: digital, private, nothing used up
**Decision:** The brief's "badge crafting and collections" is built for the digital badges (migration `0025`). Four crafted badges are made from badges a person already holds: Steady hands, Honest work, Warm heart, and Full nest (the other three plus a full week). Crafting is a button the person presses, so it is stored; the server checks the ingredients.
**Why ingredients are kept:** taking earned badges away to make a new one would turn progress into a loss, which the gentle-language rules (PLAN §7) and D23 avoid. Crafting earns no points and is shown to nobody else, so there is nothing to gain by gaming it.
**Not built:** physical badges and limited runs (need a fulfilment partner, D34).
**Status:** Final for the beta.

## D37 — Circle goals: one shared number, no ranking
**Decision:** The brief's "group challenges" is built as a circle goal (migration `0026`): a circle of two or more can set one goal at a time, "together, move N planned things forward in seven days" (3 to 100; five per person is suggested). The page shows one number for the whole circle. Only members who share their counts are counted, done and partly done both count, and only things moved after the goal started. Any member can start a goal or let it go. A goal that was reached stays reached, also if someone later changes an item or leaves. It stays on the page for three days after it ends.
**Why cooperative and without a breakdown:** the brief describes groups competing. In a circle of two to four people a per-person number is a ranking of friends, which D4, D28 and the brief's own "safeguards against bullying or excessive pressure" argue against. One number means nobody can be pointed at. No points are given for reaching it, so padding a day earns nothing.
**Limit:** with two members who both share, a person can work out the other's count by subtracting their own. That is the same information the circle already shows per day (D28), and switching sharing off removes it from the goal too.
**Risks:** the suggested size (five per person per week) is a guess; watch whether circles reach their goals.
**Status:** Prototype.

## D38 — Web Push for partner requests and reminders
**Decision:** Partner key requests, answers, shared proofs and the optional morning and evening reminders are sent with Web Push (VAPID). This reverses the "needs a provider" part of D21: Web Push needs only a VAPID key pair that Sparrow generates itself, no third-party account. In-app notices remain the fallback for anyone who does not turn push on.
**Privacy:** no message ever carries a task title, proof text or anything the person wrote; the notification says only what kind of event happened and opens the app.
**How (T2.1, migration `0028`):** a browser that switches notifications on in Settings stores its push address (`push_subscriptions`, readable only by its owner, written only through `save_push_subscription`, at most ten per person, a browser belongs to whoever switched it on last). After a key request, an answer or a shared proof, the app asks the `notify` Edge Function to tell the other person. The function first calls `claim_push(kind, ref)` as the caller: the database returns the recipient only if the caller really caused that event and the recipient may see it, and only once per event (`push_sent`). Then it sends with VAPID to that person's browsers and forgets the ones the push service says are gone. A key request carries two buttons, "Let them out" and "Keep going"; they open the Partner page pointing at that answer, and one tap confirms it, so a link alone never answers for anyone. The deploy workflow creates the VAPID pair on the first deploy and stores it as function secrets.
**Tested:** SQL suite (who can claim what, once; subscription rules), function logic and the service worker's handlers with `node --test`, e2e with a stand-in push manager. **Not verified:** a real push service delivering to a real browser or phone (needs the deployed project).
**Reminders (T2.2, migration `0029`):** morning and evening times on the profile, off by default, in the person's own time zone. `claim_due_reminders()` picks what is due and logs it in one step: one per slot per local day, at most two a day, no morning reminder once the day is planned, nothing once it is reviewed, and nothing more than two hours late. A pg_cron job calls the `remind` Edge Function every five minutes through pg_net with a secret generated inside the database (`reminder_job`, unreadable by clients); the deploy workflow records the function's address and schedules the job with `configure_reminders()`. Without pg_cron or pg_net nothing is scheduled (as with 0008). `remind` is deployed without JWT verification because the call comes from the database; the secret is the permission.
**Status:** T2.1 and T2.2 built; delivery and the cron call need the deployed project to verify.

## D39 — Guest partner
**Decision:** A partner can act through a secret link without an account, using the same hashed-secret pattern as focus links (D35) and device secrets (D29). A guest can see pending key requests and proofs shared with them, approve a request or send encouragement, and register for Web Push. Nothing else. The owner can revoke the link at any time; a guest can turn into a full account by signing up from the same page.
**Reason:** the position ("a friend holds the key") only works if the friend does not first have to adopt the app.
**How (T2.3, migration `0030`):** the owner names the friend on the Partner page and gets a link `/key#spg_…` once (`create_guest_key`; only the hash is stored in `guest_keys`, one per person; a new link replaces the old one and silences its browsers). The anonymous functions `guest_overview`, `guest_decide`, `save_guest_push` and `remove_guest_push` take the key as their only permission: the guest sees the owner's name, pending key requests with their reason, and proofs shared in the last three days (written ones in full; a photo or voice note only as "there is one", since storage needs an account). A person has one key holder at a time, an account partner or a guest: invites are refused while a guest holds the key and a guest replaces a waiting invite. Accepting an invite and converting a guest lock both people's profiles, and a key never works while its owner has an account partner, so a race cannot leave a hidden second key holder. A guest can hold the key to a locked session; taking the key back (`remove_guest_key`) unlocks it. `claim_push` now answers `{to: user|guest, id}`, so key requests and shared proofs reach a guest's browsers (they open `/key`, which remembers the key in that browser and takes it out of the address bar). Whether notifications are on is asked of the server (`guest_push_is_on`), since an account may have taken the same browser since. **Limit:** a browser holds one key link at a time, because a push address belongs to one holder (0028); opening someone else's link replaces the first, and the page says so. A guest's answer is claimed by the server only (`claim_guest_push`, granted to `service_role`), so the owner's account id never reaches the guest. Signing in from the key page and pressing one button (`convert_guest_key`) turns the guest into a full partner; their notification browsers move to the account and a locked session stays locked.
**Tested:** SQL suite (what a key can and cannot do, taking back, replacing, one key holder, converting), notify function logic, shared helpers pinned to `0030`, e2e (invite, request, approve, notifications, take back, convert). **Not verified:** a real push service delivering to a guest's browser.
**Status:** Built (T2.3).

## D40 — Labs
**Decision:** Pledges, partner pledge, ratings, leaderboard, badge crafting and circle goals are off by default behind one Settings switch (`profiles.labs`). No data or migration is removed, and turning the switch on brings everything back as it was.
**Reason:** with zero users each of these is cost without evidence, and together they hide the core loop (plan, lock, friend holds the key).
**Status:** Approved in `docs/ROADMAP.md` (task T5.1). Not built yet.

## D41 — Static web hosting
**Decision:** Prefer a static export of the web app on GitHub Pages, so deployment needs no extra account. Fall back to Vercel only if the export cannot work, and record why in a new entry.
**How:** `.github/workflows/deploy-web.yml` builds with `STATIC_EXPORT=1` (Next.js `output: "export"`) and `NEXT_PUBLIC_BASE_PATH=/Sparrow`, checks the export, publishes it with the built-in Pages token and fetches the landing page. Every route is a client page, so all of them export. Links people copy or open from email (`apps/web/lib/site.ts`), the service worker and the manifest work under the base path. Local development and the e2e suite still run at the root with `next start`.
**Not covered by the export:** response headers (a static host cannot set them), so the security headers (T1.5) go into a `<meta>` tag.
**Status:** Built (T0.3).

## D42 — The extension works with a deployed site and asks for site access one site at a time
**Decision:** Closes the second half of D21 (ROADMAP T1.2).
- **Deployed site:** the store package is built with `SPARROW_SITE` (an https address, a folder such as `/Sparrow/` allowed). Its content script matches only that site, and `lib/site.js` makes the extension open that site before the person connects. The unpacked copy keeps localhost for development. Every message from the website now says where the app lives (`site`, origin plus base path); the extension keeps it only when it is on the sending page's own origin, and opens Sparrow there afterwards.
- **No `<all_urls>`:** `host_permissions` is gone; `optional_host_permissions: *://*/*` lets the popup ask for exactly the listed sites (and their subdomains) when the person presses "Allow". A listed site without that access is still blocked (`declarativeNetRequest` "block" needs no host access), only with the browser's own page instead of the calm "This can wait" page. Granting or taking back access rebuilds the rules at once. Open tabs on a site are sent to the blocked page only where access was granted, since tab addresses are invisible otherwise.
**Why:** the installation prompt no longer asks to "read and change all your data on all websites", which was the main Chrome Web Store review risk and a poor fit for "nothing tracked". Blocking itself never depends on the grant.
**Tested:** extension unit and integration tests (rules per grant, the popup's request, base-path handling, store packaging). **Not verified:** a real Chrome (the prompt, and the redirect once access is granted).
**Status:** Built, untested in a real browser.

## D43 — Partner fatigue guard
**Decision:** ROADMAP T2.4, migration `0031`. Holding someone's key should stay easy to say yes to.
- **Ask limits:** at most 3 key requests per locked session and 5 per day (the asker's local day; UTC days when their time zone is unknown, so a made-up zone can't skip the cap), enforced in `request_end_session`. Asking again while a request waits is not another ask. The numbers live in `_key_requests_per_session()` / `_key_requests_per_day()` and are mirrored in shared (`KEY_REQUESTS_PER_SESSION`, `KEY_REQUESTS_PER_DAY`, pinned by a test).
- **Quiet hours:** the key holder sets them. An account partner sets them on their profile (`quiet_from`, `quiet_to`, in their profile's time zone; Partner page). A guest (D39) sets them on the key page (`guest_set_quiet`, in the time zone their browser reports, kept on `guest_keys`). They may cross midnight and are whole minutes. A guest's quiet hours and time zone are theirs: the owner can't read those columns, and the export lists the guest by name and dates only. A new key link starts without quiet hours; a guest who signs up keeps theirs on the new account.
- **Requests wait:** during quiet hours a request is still made and shows on the holder's page, but `claim_push` sends nothing (shared proofs don't notify either). The five-minute reminder job (0029) also calls `claim_waiting_key_requests()`, which delivers requests still waiting on a running session once quiet hours end, once each. It also catches a request whose app never sent its own notification, after a minute.
- **Told kindly:** `key_request_status()` gives the Focus page asks used and left, and when the holder's quiet hours end. The asker sees the quiet-hours note before locking and after asking, how many asks are left, and a kind sentence instead of the button once a limit is reached; the session still ends on its own.
**Why:** the roadmap's "partner fatigue" risk; with both limits and quiet hours, a friend never gets more than a handful of asks a day and never at night.
**Tested:** SQL suite (limits, a new local day, quiet-hours arithmetic across midnight and time zones, no push in quiet hours, delivery after them for partners and guests, nothing for ended sessions, permissions), the remind function's delivery, e2e (limits, quiet notes, setting quiet hours as partner and guest). **Not verified:** the job's delivery against a real project.
**Status:** Built (T2.4).

## D44 — Instant start on the laptop: silent Web Push to the extension
**Decision:** ROADMAP T2.5, migration `0036`. Chrome's docs (developer.chrome.com/docs/extensions/how-to/integrate/web-push) say an extension service worker may subscribe with `userVisibleOnly: false` since Chrome 121, needs the `notifications` permission for the Push API (it shows an install warning; no prompt), and a push wakes a suspended worker. So the roadmap's assumption holds and the task was built, not dropped.
- **Extension:** after a successful sync it subscribes once per account with the `notify` function's VAPID key, saves the address with `save_extension_push`, and checks again daily (a new server key or a forgotten row mends itself; after a failed try it waits six hours). A `push` event runs the usual sync; `pushsubscriptionchange` saves the new address. Disconnecting removes the address on the server and unsubscribes; being signed out elsewhere unsubscribes locally. `minimum_chrome_version` is 121. The 30-second alarm (D10) stays as the fallback.
- **Server:** `push_subscriptions.silent` marks an extension's address (never a guest's). Extensions and notifying browsers each keep their own ten addresses (`save_push_subscription` from 0028 and `convert_guest_key` from 0031 are replaced to trim only notifying ones), and the extension's daily re-save of the same address only refreshes its keys. `claim_push` gains `session_started` (the caller's running session) and `session_ended` (the caller's session ended early), once each, only ever to the caller. The `notify` function sends those only to the person's silent addresses, and also wakes them after a `key_answer` (an approval ends the session). Visible notifications and reminders never go to silent addresses. The push body is `{"sync":true}`: nothing about the session travels in it.
- **Callers:** the web Focus page and the phone app call `notify` after starting a session or ending one early, fire and forget.
- **Migration number:** the roadmap gave T2.5 none, and `0032` to `0035` belong to later tasks, so it takes `0036`. Live databases therefore apply `0036` before `0032` to `0035`; the deploy workflow pushes with `--include-all` for that; take the flag out once `0035` has landed. A fresh database applies files in name order, so **`0032` to `0035` must not touch `claim_push`, `save_push_subscription`, `save_extension_push` or the `silent` column (a test checks)**; a later change to either goes in a migration numbered after `0036`.
**Not covered:** a session started through a focus link (`/go`, the iOS Shortcut) has no signed-in caller, so it still reaches the laptop at the next 30-second check. The `notifications` permission shows an install warning, and a store update from a version without it would disable the extension until accepted; no version is published yet, so the first store version ships with it.
**Why:** a session started on the phone should block the laptop in seconds, not up to 30 s later.
**Tested:** SQL suite (silent addresses, the two kinds, once each, only one's own sessions, natural ends wake nothing, guests can't be silent), the notify function (silent kinds reach only extensions with an empty body; an answer also wakes them), the extension against a fake service worker and server (subscribe once with `userVisibleOnly: false`, push syncs at once, daily re-check replaces an old key, sign-out removes the address, a server without keys keeps polling), e2e (the web app reports starts and early ends). **Not verified:** a real push through FCM to an installed extension (needs the owner's Supabase project and the extension loaded in Chrome).
**Status:** Built (T2.5).

## D45 — Proofs and the evening review on Android
**Decision:** ROADMAP T3.1. The phone's Today screen does what the website does at the end of the day: mark items, add proof, review the day.
- **Photo:** the system camera through `expo-image-picker` (`launchCameraAsync`, asking for the camera permission only then; the app declares no microphone or photo-library permission). The photo's own date comes from the camera's EXIF (`exifTextAgeHours` in shared) before `expo-image-manipulator` re-encodes it as JPEG within the same size steps as the website (`compressWithin`), which drops its hidden details. Uploaded to the same private `proofs` bucket under the person's folder.
- **No similar-photo check from the phone:** the website's dHash needs pixels, which the phone's image tools don't hand to JavaScript without more native code. Phone photos are saved without `image_phash`, so `flagged_similar` stays false for them; the D32 notes (date taken, days late) still apply.
- **Notes and sharing:** a written note, and a switch to share with the key holder (on by default when there is one, as on the website); a shared proof calls `notify` like the website.
- **Evening review:** the same `review_day()` with the four answers and the mood; `reviewStartStatuses` and `reviewMessage` now live in shared and the website uses them too.
- **Not on the phone yet:** voice notes, closing earlier days, kind acts and make-up steps (the website has them).
**Tested:** shared unit tests (EXIF text ages, review start and message, base64), typecheck, the Android JS bundle, the Gradle build and emulator job in CI. **Not verified:** taking a photo on a real phone.
**Status:** Built (T3.1).

