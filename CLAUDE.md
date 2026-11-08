# CLAUDE.md: context for AI sessions on Sparrow

Read `docs/PLAN.md` and `docs/DECISIONS.md` (D1-D29) before changing anything. The owner wants work done
without asking permission for each step, but decisions in DECISIONS.md are not reversed without a new entry.

## Where things stand
- Status, branches and open items: the Claude project doc `claude/STATUS.md` (kept up to date at the end of each session).
- Latest local branch: `next-features` (on top of `money-and-social`). Migrations run `0001` → `0020`.
- Android blocking engine (D29) is written but has never been compiled with the Android SDK or run on a phone.

## Layout
`apps/web` Next.js PWA · `apps/extension` MV3 extension, plain JS · `apps/mobile` Expo + Kotlin module
`modules/sparrow-blocker` · `packages/shared` types, rules, all UI copy · `supabase/migrations`, `supabase/tests`.

## Rules of the repo
- New migration file for every DB change; never edit an applied one. Every new public function: `revoke ... from public, anon; grant ... to authenticated` (internal `_helpers`: revoke from all).
- Business rules live in Postgres (D13). Change `supabase/tests/rls_test.sql` together with the migration; use a fresh user-id prefix (used: 2-9, a-f repeated, a1a1a1a1, c1c1c1c1, d1d1d1d1).
- All user-facing sentences go in `packages/shared/src/copy.ts` (a test fails on inline JSX sentences and on banned words like "failed", "lazy", "broken").
- Playwright e2e runs against an in-memory fake (`apps/web/e2e/fake-supabase.ts`, D19): add any new table/RPC there.
- Shared constants mirrored in SQL or Kotlin have a test pinning them (scoring, light day, pledge, ALWAYS_ALLOWED_PACKAGES vs `BlockRules.kt`).
- Tests ship with features. Before finishing: `npm run lint && npm run format:check && npm run typecheck && npm test && npm run test:extension && npm run test:functions`, `bash supabase/tests/run.sh`, `npm run test:e2e`, and `apps/mobile/modules/sparrow-blocker/android/run-jvm-tests.sh`.

## Running checks in the cloud sandbox
```bash
npm ci
# PostgreSQL 16 (binaries present, must run as the postgres user)
mkdir -p /tmp/pg && chown postgres /tmp/pg
su postgres -c "/usr/lib/postgresql/16/bin/initdb -D /tmp/pg/data -A trust >/dev/null && /usr/lib/postgresql/16/bin/pg_ctl -D /tmp/pg/data -o '-k /tmp/pg -c listen_addresses=' -l /tmp/pg/log start"
PGHOST=/tmp/pg PGUSER=postgres bash supabase/tests/run.sh
# Kotlin (GitHub releases are reachable; Maven Central and dl.google.com are not, so no Android SDK)
curl -sSL -o /tmp/k.zip https://github.com/JetBrains/kotlin/releases/download/v2.1.21/kotlin-compiler-2.1.21.zip && unzip -q /tmp/k.zip -d /tmp/kt
PATH=/tmp/kt/kotlinc/bin:$PATH apps/mobile/modules/sparrow-blocker/android/run-jvm-tests.sh
cd apps/web && npx playwright test   # builds the app first (~1.5 min); Chromium is preinstalled
```

## Getting work onto the Mac and GitHub
- The cloud sandbox can clone the public repo but cannot push (repo not in the session's authorized sources), and the Mac shell has no GitHub credentials. The owner pushes: `cd ~/Sparrow && git push -u origin <branch>`. (Adding the repo to the session's sources would let the cloud session push.)
- Flow that works: clone in the cloud, branch from the latest branch, commit, `git format-patch <base> -o /tmp/patches`, copy the patches to `/mnt/user-data/outputs/`, write them into `~/Sparrow/.sparrow-patches/` with device_commit_files, then on the Mac: `git checkout -b <branch> <base>` and `GIT_COMMITTER_NAME="Souvik Mandal" GIT_COMMITTER_EMAIL="souvik.mandal@osfin.ai" git am .sparrow-patches/*.patch`, remove `.sparrow-patches`, and compare `git rev-parse HEAD^{tree}` with the cloud clone.
- Request delete permission for `/Users/user/Sparrow` BEFORE running git on the Mac: without it git cannot remove its own `.lock` files and every later git command fails with "File exists".
- Commit author: Souvik Mandal <souvik.mandal@osfin.ai>. End commit messages with the session's Co-Authored-By / Claude-Session lines.
