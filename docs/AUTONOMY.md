# Sparrow: how to run without the owner (written 2026-11-15)

The owner does not want to be asked to run commands, push, or approve steps. This file says how to
work so that never happens, and what to do when something is truly out of reach.

## 1. Preflight (first two minutes of every session)

Run in the cloud workspace:

```bash
git clone https://github.com/user23052036/Sparrow.git && cd Sparrow
git push --dry-run origin HEAD 2>&1 | tail -2
gh api repos/user23052036/Sparrow --jq .permissions 2>&1 | tail -2
```

- **Both work → Mode A (hands-off).** Use section 3.
- **Either answers "not in this session's authorized repository set" or "GitHub access to this
  repository is not enabled for this session" → Mode B.** Use section 4. Do not stop, do not ask.

What was measured on 2026-11-15 in a session without the repository attached:
- Cloning and `raw.githubusercontent.com` work. Push and the whole GitHub API are refused by the
  session's git proxy because the repository is not one of the session's sources. The refusal names the
  fix: add the repository to the session's sources with push access. That is a setting on the session,
  chosen by the owner when the task is started; a model cannot grant it to itself, and no tool for it
  was present.
- A personal access token is **not** the fix. The API stays refused whatever token is sent, so pull
  requests, merges and CI results would still be out of reach, and sending your own credential past the
  proxy sidesteps the session's repository authorization. Do not do it and do not ask for one.
- Reachable from the cloud workspace: npm registry, PyPI, GitHub clone and release downloads.
  Refused: `api.supabase.com`, `supabase.com`, `api.vercel.com`, `api.expo.dev`, Maven Central,
  `dl.google.com`, Cloudflare, Netlify.
- The shell on the owner's Mac (a Linux VM with `~/Sparrow` mounted) reaches npm but not GitHub,
  Supabase or Vercel. It has node, npm, git and java; no gh, psql or docker.

Consequence: **anything that needs Supabase, a web host or the Android SDK happens in GitHub Actions**,
which runs on GitHub's network. The model's job is to push code and read results.

## 1b. Mode C: Claude Code started in `~/Sparrow` on the owner's Mac (preferred when available)

Running locally removes most of the limits above: the Mac's own git credentials and network are used,
so there is no session proxy. Copies of this file and the roadmap are in the repo at
`docs/AUTONOMY.md` and `docs/ROADMAP.md` so a local run has the same context; status is kept in
`docs/STATUS.md` there (the Claude project doc `docs/STATUS.md` is not visible from a local run).

Preflight for Mode C:

```bash
git fetch origin && git status -sb | head -3
git push --dry-run origin HEAD 2>&1 | tail -2      # proves the Mac can push
gh auth status 2>&1 | tail -3                       # is the GitHub CLI installed and signed in?
```

- Push works and `gh` is signed in → follow section 3 exactly, on the Mac.
- Push works, no `gh` → merge each finished task into `main` locally after the full check list passes
  and push it (`git fetch && git rebase origin/main`, then `git switch main && git merge --ff-only
  <branch> && git push origin main`). This is authorized (rule 5a). CI results cannot be read, so say
  so in STATUS. Do not install or sign in to anything on the owner's behalf.
- Push fails → commit locally on stacked branches, keep going, report at the end.

Permission prompts in Mode C are controlled by the owner's own Claude Code settings. No permissions
file was written for this repo (the linked-computer tools refuse to write under `.claude/`, and that
choice belongs to the owner). Until the owner sets an allow-list or a permission mode, the first use of
each command may ask once; choose the "always allow" answer.
Not measured for Mode C: whether PostgreSQL 16, Java 17 and kotlinc are installed on the Mac. If the SQL
suite or the Android scripts cannot run locally, rely on the pull request's CI jobs for them and say so.

## 2. Standing rules

1. Never ask the owner to run a command, push, open a pull request, or confirm a step. Never end a turn
   with a question when another task in the roadmap can be started.
2. Do not use the owner's Mac folder in Mode A. All work is in the cloud clone. (Git on the Mac needs a
   delete permission prompt; avoiding the Mac avoids the prompt.)
3. Decisions: `docs/DECISIONS.md` plus D38 to D41 in `docs/ROADMAP.md` are approved. If a task would
   contradict any other decision, skip that part, write it under "Parked for the owner" in
   `docs/STATUS.md`, and continue with the next task. This replaces "stop and ask" in `docs/PLAN.md`.
4. Secrets never go into the repository (it is public), project docs, memory, commit messages or logs.
   Workflows read them from GitHub Actions secrets and must pass, with a notice, when a secret is absent.
5. Never: force-push, rewrite `main`, delete a branch you did not create, edit an applied migration,
   weaken or delete a test to get green, turn off a CI job, or touch any repository other than Sparrow.
5a. **The owner has authorized pushing straight to `main`** (stated 2026-11-15: "it should autonomously do
   everything"). Use it whenever the pull request route is unavailable: `gh` missing or not signed in, a
   merge refused, or CI unreadable. Conditions: the full local check list has passed in this session
   (or, for a tool missing locally, the check is named in STATUS as unrun); the push is a plain
   fast-forward (`git fetch && git rebase origin/main` first, never `--force`); and the commit message
   says what was and was not run. If `main` rejects the push (branch protection), do not try to get
   around it: open or keep a pull request and stack the next task on it.
5b. **Migrations are the exception to speed.** Once `deploy-db.yml` (T0.2) exists, a push to `main` that
   touches `supabase/` deploys to the real database. A migration reaches `main` only after
   `bash supabase/tests/run.sh` has passed in this session or the pull request's `database` job is
   green. If neither is possible, park the task.
6. Report truthfully. "Passed" means you ran it and saw it pass in this session. Anything else is
   "written, not run", with the reason.
7. End of session: rewrite `docs/STATUS.md` (done, in flight, parked, next task ID).

## 3. Mode A: hands-off loop

For each task in roadmap order:

1. `git fetch && git switch -c <task-id>-<slug> origin/main`.
2. Build it with its tests. Run the full check list from the repo's `CLAUDE.md` (lint, format, typecheck,
   unit, extension, functions, SQL suite on local PostgreSQL 16, Playwright, the two Android scripts when
   Android or shared code changed).
3. Commit with the git identity already configured on the machine (do not change git config) and the
   session's attribution lines, push, and
   `gh pr create --base main --fill`.
4. Wait for checks: `gh pr checks <n> --watch --interval 30`. On a red check read the log
   (`gh run view <id> --log-failed`), fix, push again. Three failed rounds on the same cause: park the
   task with the log excerpt in STATUS and move on.
5. Independent review (section 5). Then `gh pr merge <n> --squash --delete-branch`.
6. After a merge that triggers a deploy or emulator workflow, read its result with `gh run list
   --branch main --limit 5` and record it.

**[assumed]** `gh pr create`, `gh pr checks` and `gh pr merge` work once the repository is attached with
push access; none could be tried on 2026-11-15. If a merge is refused, push the branch to `main`
directly under rule 5a (after green checks). If `main` rejects that push too, leave the pull request
open, stack the next task's branch on it, and say so in STATUS.

## 4. Mode B: repository not attached

Keep building; lose nothing; do not interrupt.

1. Work in the cloud clone exactly as in Mode A steps 1 and 2, stacking each task's branch on the last.
2. After each finished task: `git bundle create sparrow-<date>.bundle origin/main..HEAD` plus
   `git format-patch origin/main -o patches/`, copy both to `/mnt/user-data/outputs/`, and write them to
   `~/Sparrow/.sparrow-patches/` with `device_commit_files` (writing files needs no prompt). Do not run
   git on the Mac.
3. CI cannot be read, so the local check list is the only evidence. Say that in STATUS.
4. At the very end of the session, one sentence to the owner: work is saved in `.sparrow-patches`, and
   starting the next task with the repository attached makes every later run hands-off. Nothing more.

## 5. Agents

Three roles. Use them when the session has an agent tool; otherwise one model does the roles in turn.

- **Orchestrator** (the main session). Owns the roadmap order, branch names, pre-assigned migration
  numbers, merging, and STATUS. Writes no feature code.
- **Builder** (one per task, own git worktree). Gets: the task text from the roadmap, the repo rules in
  `CLAUDE.md`, the branch name, the migration number, and the files it may touch. Returns: branch name,
  what it ran and the results, what it could not verify. May start read-only search helpers.
- **Reviewer** (fresh agent per pull request, never the builder). Reads the diff against the task's
  "done when", re-runs the check list, and looks for: a rule enforced only in the UI, a new function
  without `revoke ... from public, anon`, copy outside `copy.ts`, a constant mirrored in SQL or Kotlin
  without a pinning test, anything that reads private data it should not. Returns pass, or a list the
  builder must fix. Two rounds at most, then the orchestrator decides or parks.

Lanes and parallelism
- **web+db**: one builder at a time, in roadmap order (shared hot files: `copy.ts`,
  `apps/web/e2e/fake-supabase.ts`, `supabase/tests/rls_test.sql`, migrations).
- **android**, **infra** (workflows, docs) and **extension-only** tasks may each run one builder
  alongside. At most three builders at once.
- A builder rebases on `origin/main` before opening its pull request. The orchestrator merges one pull
  request at a time and lets the next one rebase.

## 6. Credentials

| Name | Where it lives | Who creates it | Used by |
| --- | --- | --- | --- |
| Push and API access to the repo | The session's attached repository | Owner, when starting the task | Everything in Mode A |
| `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`, `SUPABASE_DB_PASSWORD` | GitHub repo secrets | Owner, once | T0.2, T0.4 |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (public values) | GitHub repo variables | Owner, once | T0.3, T0.4 |
| `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` | GitHub repo secrets | Owner, once (same values) | Android standalone APK |
| VAPID key pair | Supabase function secrets | The deploy workflow, on first run | T2.1 |
| GitHub Pages token | Built into Actions | Nobody | T0.3 |

None of these exist yet as of 2026-11-15, and none is stored in this project. Every workflow is written
to pass without them, so missing credentials never block a task; they only leave "live" checks skipped.

## 7. The only reasons to stop
- A step would spend money, publish to a store, email or message real people, or delete data that is
  not test data.
- Every remaining task is parked.
Anything else: park it, write it down, take the next task.

## 8. Kickoff prompt (paste as the first message of a run)

> Read the project docs `docs/AUTONOMY.md`, `docs/ROADMAP.md` and `docs/STATUS.md`, then the repo's
> `CLAUDE.md` and `docs/DECISIONS.md`. Run the preflight. Work through the roadmap from the next task ID
> in STATUS, following AUTONOMY.md exactly. Do not ask me anything and do not ask me to run anything.
> Update `docs/STATUS.md` before you finish.
