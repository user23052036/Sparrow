# Closed beta runbook (M8)

Goal from the plan: 20 to 50 users, including people outside the founder's circle. This page is what is built, how to read the numbers, and what still needs a human.

## What is built

- **Installable web app (PWA):** manifest with PNG icons (192, 512, maskable), a service worker that caches only fingerprinted static assets and an offline page (never pages or personal data, never other origins), and a one-time, dismissible install banner.
- **Feedback button** in the footer of every signed-in page: a 1 to 5 "how helpful" rating plus free text. Stored in `feedback` (migration `0008`), readable only by its author and the project owner. Limited to 20 per day per person.
- **Privacy page** at `/privacy`, linked from the footer, written to match what the database actually stores.
- **Metrics without tracking.** There are no analytics scripts or event logs. `beta_metrics(p_days)` computes everything from tables the app already needs, and only the project owner (service role) can call it.
- **Heartbeat checking runs on a schedule** (`check_all_heartbeats()` via pg_cron, every minute) so a device that goes quiet is noticed even when nobody has the app open.
- **Account deletion** in Settings (D20): removes the account, every table row and every proof photo. Photos are removed before the account, so a failure never leaves orphaned images.
- **Small helps:** if-then plans, calendar-file import, a kind act after a hard day, a private Progress page (badges, mood trend, days you supported your partner) and a data download. See D22 to D24.
- **Practice mode (D25):** pledges to a charity, an opt-in partner pledge, support nudges, private ratings and an opt-in leaderboard. No money moves. Insert charities into the `charities` table first. See docs/PAYMENTS.md for what real charging needs.
- **Chrome extension packaging:** see `docs/STORE_LISTING.md`.

## Reading the numbers

In the Supabase SQL editor (runs as the owner):

```sql
select public.beta_metrics(14);
```

The result is one JSON object:

| Field | Meaning |
| --- | --- |
| `active_users` | People who committed to at least one day in the window. |
| `daily_completion_rate` | Average share of planned tasks done (partly done counts as half; moved tasks are excluded), over reviewed days in the window. |
| `retention.day_1 / day_7 / day_30` | `cohort` is people whose first plan is at least that many days old; `kept` is how many of them planned again exactly that many days after their first plan; `rate` is the ratio. |
| `focus_sessions_per_active_user` | Sessions started in the window per active person. |
| `early_exit_rate` | Share of sessions ended early. |
| `tamper_rate` | Share of sessions with a "went quiet" or "protection disabled" event. |
| `proof_rate` | Share of done or partly done items that have a proof. |
| `buddy_pair_retention_7d` | `pairs` is partnerships at least 7 days old; `still_active` is how many are still active. |
| `helpfulness_avg` | Average of the 1 to 5 feedback ratings in the window. |
| `mood_trend_weekly` | Average **morning** mood per week (1 Heavy to 5 Bright). |

Read them as signals, not grades. With 20 to 50 people a single person moves a rate by several points. Do not compare individuals; the function only returns totals.

## Needs a human (cannot be done from the repo)

0. Deploy the account-deletion function once: `supabase functions deploy delete-account` (keep JWT verification on). Without it the "Delete my account" button in Settings shows an error and nothing is deleted. Try it with a throwaway account first (see D20).
1. Deploy the web app over HTTPS (installability requires it) and put the real address into the privacy page and store listing.
2. Connect SMTP and turn "Confirm email" back on in Supabase (see D14). Until then, anyone can sign up with an address they do not own.
3. Enable `pg_cron` in the Supabase project (Database, Extensions). Without it, migration `0008` only prints a notice and heartbeats are checked when a page asks.
4. Submit the extension to the Chrome Web Store (account, screenshots, review).
5. Recruit people. Include some who do not know you, and tell them plainly that this is a prototype and Android blocking is not available yet.
6. Decide a support channel for the "talk to someone" page and replace it if you add a local helpline list for your testers' countries.

## Not part of this beta

Android blocking (M5b-2 to M5b-5) and Play internal testing, partner notifications by email or push (D15).
