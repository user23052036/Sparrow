# CLAUDE.md: context for AI sessions on Sparrow

Read these, in this order, before changing anything:
1. `docs/AUTONOMY.md` how to work without the owner: preflight, git and pull-request loop, agents, standing rules.
2. `docs/ROADMAP.md` the audit, the position, and the task list (T0.1 to T5.4) with pre-assigned migration numbers.
3. `docs/STATUS.md` what is done and the next task ID.
4. `docs/PLAN.md` and `docs/DECISIONS.md` (D1 to D44; D38 to D41 came from the roadmap and their status line changes when their tasks land).

The owner wants work done without being asked for permission, commands, pushes or confirmations. Decisions in
DECISIONS.md are not reversed without a new entry. If a task would contradict one, park that part in
`docs/STATUS.md` ("Parked for the owner") and take the next task; do not stop to ask.

## Where things stand
- `main` has the roadmap through T2.5: decisions D1 to D44, migrations to `0031` plus `0036` (D44: `0032` to `0035` stay with their tasks and must not replace `claim_push` or `save_extension_push`). Always `git fetch origin` and branch from `origin/main`.
- Start at the task ID that `docs/STATUS.md` names as next (T3.1 after 2026-11-16).
- The web app is deployed as a static export on GitHub Pages (https://user23052036.github.io/Sparrow/), with no Supabase project behind it yet; deploy, live-smoke and reminder workflows skip green until the owner adds the secrets.
- The Android app-blocking engine has run on an emulator in CI (`Android emulator test`); never on a phone. Phone website blocking (D30) has never run.

## Layout
`apps/web` Next.js PWA · `apps/extension` MV3 extension, plain JS · `apps/mobile` Expo + Kotlin module
`modules/sparrow-blocker` · `packages/shared` types, rules, all UI copy · `supabase/migrations`, `supabase/tests`.

## Rules of the repo
- New migration file for every DB change; never edit an applied one. Roadmap migration numbers are pre-assigned (`0028` onward): use the number the task names. Every new public function: `revoke ... from public, anon; grant ... to authenticated` (internal `_helpers`: revoke from all).
- Business rules live in Postgres (D13). Change `supabase/tests/rls_test.sql` together with the migration; use a fresh user-id prefix (used: 2-9, a-f repeated, a1a1a1a1, c1c1c1c1, d1d1d1d1, e1e1e1e1, f1f1f1f1, 24242424, 25252525, 26262626, 28282828, 29292929, 30303030, 31313131, 32323232). Server-only functions are granted to `service_role` (present in the test stub).
- All user-facing sentences go in `packages/shared/src/copy.ts` (a test fails on inline JSX sentences and on banned words like "failed", "lazy", "broken").
- Playwright e2e runs against an in-memory fake (`apps/web/e2e/fake-supabase.ts`, D19): add any new table/RPC there.
- Shared constants mirrored in SQL or Kotlin have a test pinning them (scoring, light day, pledge, ALWAYS_ALLOWED_PACKAGES vs `BlockRules.kt`, focus-link limits vs `0024`, craft recipes vs `0025`, circle-goal limits vs `0026`, the circle-name pattern and the one-day photo line vs migrations `0022`/`0023`).
- Android: anything without Android imports goes in `BlockRules.kt` / `DnsRules.kt` with a JVM test; `android/apicheck-stubs` must keep up with the expo-modules-core names `SparrowBlockerModule.kt` uses.
- Tests ship with features. Before finishing: `npm run lint && npm run format:check && npm run typecheck && npm test && npm run test:extension && npm run test:functions`, `bash supabase/tests/run.sh`, `npm run test:e2e`, `apps/mobile/modules/sparrow-blocker/android/run-jvm-tests.sh` and `apps/mobile/modules/sparrow-blocker/android/check-android-api.sh`. If a tool is missing locally (PostgreSQL 16, Java 17, kotlinc), say which check you could not run and rely on the pull request's CI jobs for it.
- Secrets never go into this repository (it is public), docs, commit messages or logs. Workflows read GitHub Actions secrets and must pass with a notice when one is absent (`docs/AUTONOMY.md` section 6 lists them).
- Never: force-push, rewrite `main`, edit an applied migration, weaken or delete a test to get green, or switch off a CI job.

## Working locally on the owner's Mac (preferred)
Use the Mac's own git and network. Run the checks with Node 24 (`fnm exec --using=24 …`; the default Node 20 is too old) and the SQL suite in Docker (`colima start`, then a `postgres:16` container with the repo mounted: see `docs/STATUS.md`). Branch from `origin/main`, build the task, run the check list, commit, `git push -u origin <branch>`, then `gh pr create`, `gh pr checks --watch` and `gh pr merge --squash` when `gh` is signed in (`gh auth status`). **The owner has authorized pushing straight to `main`** when `gh` is missing, a merge is refused or CI cannot be read: after the full check list passes, `git fetch && git rebase origin/main`, then `git switch main && git merge --ff-only <branch> && git push origin main`, and say in STATUS what was not run. Never `--force`. If `main` rejects the push (branch protection), keep a pull request open and stack the next task on it instead of working around it. A migration reaches `main` only after `bash supabase/tests/run.sh` has passed (once T0.2 exists, a push to `main` that touches `supabase/` deploys to the real database). Full loop and agent roles: `docs/AUTONOMY.md` sections 1b, 3 and 5. Update `docs/STATUS.md` at the end of every session.

## Cloud sandbox only (a Claude session on claude.ai, not a local run)
```bash
npm ci
# PostgreSQL 16 (binaries present, must run as the postgres user)
mkdir -p /tmp/pg && chown postgres /tmp/pg
su postgres -c "/usr/lib/postgresql/16/bin/initdb -D /tmp/pg/data -A trust >/dev/null && /usr/lib/postgresql/16/bin/pg_ctl -D /tmp/pg/data -o '-k /tmp/pg -c listen_addresses=' -l /tmp/pg/log start"
PGHOST=/tmp/pg PGUSER=postgres bash supabase/tests/run.sh
# Kotlin (GitHub releases are reachable; Maven Central and dl.google.com are not, so no Android SDK)
curl -sSL -o /tmp/k.zip https://github.com/JetBrains/kotlin/releases/download/v2.1.21/kotlin-compiler-2.1.21.zip && unzip -q /tmp/k.zip -d /tmp/kt
PATH=/tmp/kt/kotlinc/bin:$PATH apps/mobile/modules/sparrow-blocker/android/run-jvm-tests.sh
# Real Android API jar: github.com/<repo>/raw is blocked but raw.githubusercontent.com works (the script downloads it itself)
PATH=/tmp/kt/kotlinc/bin:$PATH apps/mobile/modules/sparrow-blocker/android/check-android-api.sh
# `cd apps/mobile && npx expo prebuild --platform android --no-install` works here (template comes from npm); Gradle does not (no Maven). Delete apps/mobile/android afterwards. `npx expo export:embed --platform android --dev false --entry-file index.ts --bundle-output /tmp/b/index.android.bundle --assets-dest /tmp/b/res` checks the JS bundle a release build embeds.
cd apps/web && npx playwright test   # builds the app first (~1.5 min); Chromium is preinstalled
```
A cloud session can push only if the repository is attached to it with push access; run the preflight in `docs/AUTONOMY.md` section 1. If it is not attached, use the patch flow: commit in a cloud clone, `git format-patch origin/main -o patches/`, write the patches to `~/Sparrow/.sparrow-patches/` with the device file tools, and do not run git on the Mac from the cloud shell (it needs a delete-permission prompt first, or git cannot remove its own `.lock` files).

## Commits
Author: whatever `git config user.name` and `user.email` already say on the machine; do not change git config. End commit messages with the session's Co-Authored-By / Claude-Session lines.
