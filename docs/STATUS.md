# Sparrow: current status (2026-11-15)

Repo: github.com/user23052036/Sparrow. **`main` is at 66cc94d: PR #9 (`brief-extras`) is merged**, so
`main` holds everything through D37 / migration 0027 (focus links, badge crafting, circle goals).

## Start here
1. `docs/AUTONOMY.md`: how to run without the owner (preflight, modes A/B/C, agents, credentials).
2. `docs/ROADMAP.md`: audit, market, position, tasks T0.1 to T5.4 with pre-assigned migration numbers.
3. Repo `CLAUDE.md` and `docs/DECISIONS.md`.
These files live in the repo under `docs/` (committed by T0.1) and are the source of truth.
No `.claude/settings.json` exists.

**Next task: T1.1.**

## Roadmap progress
- T0.1 done (PR #10): docs committed, D38 to D41 written.
- T0.2 done: `.github/workflows/deploy-db.yml`. On pull requests it runs `supabase db push` (CLI 2.122.1)
  into a throwaway PostgreSQL 16 with the stub; on `main` it links, pushes and deploys functions, or
  ends green with a notice when the three secrets are missing (none are set as of 2026-11-15).
  Merged as PR #12 (PR #11 was closed: its first commit had a throwaway CI password GitGuardian
  flagged; that incident on the GitGuardian dashboard is a false positive). Skip path seen green on main.
- T0.3: static export on GitHub Pages (`deploy-web.yml`, D41). `STATIC_EXPORT=1` and
  `NEXT_PUBLIC_BASE_PATH=/Sparrow`; `apps/web/lib/site.ts` adds the base path to links people copy
  (invites, focus links, the sign-in email link); the service worker and manifest use paths relative to
  where they are served. Pages was switched on with build type "workflow" through the API.
  Owner, once Supabase exists: set the two `NEXT_PUBLIC_SUPABASE_*` repository variables and add
  `https://user23052036.github.io/Sparrow/auth/callback` to Supabase's allowed redirect URLs.

## Verified on 2026-11-15 (main, cloud workspace)
- `npm ci`, lint, typecheck: clean. 163 shared tests, 25 extension tests, 7 function tests: pass.
- Not re-run this session: SQL suite, Playwright, Android JVM tests and API check.
- Cloud session without the repo attached: clone works; push and the GitHub API are refused by the
  session's git proxy; Supabase, Vercel, Expo, Maven and dl.google.com hosts are refused.
- Mac shell (Linux VM): npm reachable; GitHub, Supabase, Vercel not.

## Done before this roadmap
Web app, extension, partner and partner key, safety and mood flows, Android shell and blocking engine
(written, built by Gradle in CI, never run on a device), copy checks, CI, account deletion, if-then,
calendar import, kind act, Progress and export, practice-mode pledges, partner pledge, ratings,
leaderboard, micro-task stake, voice proofs, circles, phone website blocking, circle names, proof
context, focus links, badge crafting, circle goals (D1 to D37, migrations 0001 to 0027).

## Known gaps (detail in ROADMAP section 1)
- Never run against a real Supabase project; not deployed; Android never run on a phone or emulator.
- No notifications anywhere, so a partner never learns of a key request unless the app is open.
- Extension content script and fallback origin are localhost only.
- No guided first run; six unvalidated extras sit beside the core loop.

## Parked for the owner
- Attach the repository to cloud sessions with push access, or run Claude Code locally in `~/Sparrow`.
- Create a Supabase project; add the GitHub secrets and variables listed in AUTONOMY section 6.
- One phone test, store developer accounts, testers.

## Working notes (still true)
- SQL test user prefixes used so far: 2-9, a-f repeated, a1a1a1a1, c1c1c1c1, d1d1d1d1, e1e1e1e1,
  f1f1f1f1, 24242424, 25252525, 26262626.
- The e2e fake answers `use_focus_link` before its signed-in check (the only anonymous RPC).
- Cloud workspace: PostgreSQL 16 binaries are present and must run as the `postgres` user; kotlinc comes
  from GitHub releases; no Gradle (Maven is unreachable). Commands are in the repo's `CLAUDE.md`.
- If git is ever run on the Mac through the linked-computer shell, request delete permission for
  `/Users/user/Sparrow` first, or git cannot remove its own lock files.
