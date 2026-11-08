-- M8: closed-beta support. Three independent pieces:
--  1. check_all_heartbeats(): records "blocking went quiet" events for every user with a
--     running session, and is scheduled every minute when pg_cron is available. Before this,
--     the check only ran when the user opened the website.
--  2. feedback: a one-way inbox (users can add and read their own, nothing else).
--  3. beta_metrics(): aggregate-only numbers for the founder, computed from data Sparrow
--     already holds. No tracking events, no third-party analytics, nothing per person.

-- ------------------------------------------------------------ 1. scheduled heartbeat check
create function public.check_all_heartbeats() returns int
language plpgsql security definer set search_path = '' as $$
declare r record; n int := 0;
begin
  for r in select distinct user_id from public.focus_sessions where ended_at is null and ends_at > now() loop
    n := n + public._record_heartbeat_events(r.user_id);
  end loop;
  return n;
end;
$$;
revoke execute on function public.check_all_heartbeats() from public, anon, authenticated;

-- Schedule it every minute where pg_cron exists (Supabase: Database > Extensions > pg_cron).
-- On plain PostgreSQL (tests) this is skipped with a notice.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('sparrow-heartbeats', '* * * * *', 'select public.check_all_heartbeats()');
  else
    raise notice 'pg_cron is not available: heartbeat checks only run when the website is open';
  end if;
exception when others then
  raise notice 'could not schedule heartbeat checks (%): enable pg_cron and run the schedule by hand', sqlerrm;
end $$;

-- ------------------------------------------------------------ 2. feedback
create table public.feedback (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  message text not null check (char_length(trim(message)) between 1 and 2000),
  helpful smallint check (helpful between 1 and 5),   -- "How helpful has Sparrow been?" 1-5
  page text check (char_length(page) <= 100),
  created_at timestamptz not null default now()
);
alter table public.feedback enable row level security;
create policy feedback_insert on public.feedback for insert with check (user_id = auth.uid());
create policy feedback_select on public.feedback for select using (user_id = auth.uid());

-- A gentle cap so the inbox can't be flooded: 20 messages per day per person.
create function public._feedback_limit() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.feedback where user_id = new.user_id and created_at > now() - interval '1 day') >= 20 then
    raise exception 'that''s plenty for today, thank you. Try again tomorrow';
  end if;
  return new;
end;
$$;
create trigger feedback_limit before insert on public.feedback for each row execute function public._feedback_limit();
revoke execute on function public._feedback_limit() from public, anon, authenticated;

-- ------------------------------------------------------------ 3. beta metrics (founder only)
-- Run from the Supabase SQL editor:  select public.beta_metrics(30);
-- Not callable from the browser or the anon key (see the revoke below).
create function public.beta_metrics(p_days int default 30) returns jsonb
language sql stable security definer set search_path = '' as $$
  with win as (select (current_date - p_days) as since),
  committed as (
    select d.user_id, d.date, d.id as plan_id, d.mood_morning, d.reviewed_at
      from public.daily_plans d where d.committed_at is not null
  ),
  active as (select distinct user_id from committed, win where date >= win.since),
  first_day as (select user_id, min(date) as day0 from committed group by user_id),
  retention as (
    select n,
           count(*) filter (where f.day0 <= current_date - n) as cohort,
           count(*) filter (where f.day0 <= current_date - n
                              and exists (select 1 from committed c where c.user_id = f.user_id and c.date = f.day0 + n)) as kept
      from first_day f cross join (values (1), (7), (30)) as v(n) group by n
  ),
  day_scores as (
    select c.plan_id,
           case when count(*) filter (where i.status <> 'rescheduled') = 0 then null
                else (count(*) filter (where i.status = 'done') + 0.5 * count(*) filter (where i.status = 'partial'))
                     / count(*) filter (where i.status <> 'rescheduled') end as score
      from committed c join public.plan_items i on i.daily_plan_id = c.plan_id, win
     where c.reviewed_at is not null and c.date >= win.since group by c.plan_id
  ),
  sessions as (select * from public.focus_sessions, win where started_at::date >= win.since),
  tampered as (
    select distinct focus_session_id from public.tamper_events
     where kind in ('heartbeat_lost', 'protection_disabled') and focus_session_id is not null
  ),
  counted as (
    select i.id, exists (select 1 from public.proofs p where p.plan_item_id = i.id) as has_proof
      from public.plan_items i join committed c on c.plan_id = i.daily_plan_id, win
     where i.status in ('done', 'partial') and c.date >= win.since
  ),
  pairs as (
    select * from public.buddy_links where status in ('active', 'ended') and partner_id is not null
  )
  select jsonb_build_object(
    'window_days', p_days,
    'active_users', (select count(*) from active),
    'daily_completion_rate', (select round(avg(score)::numeric, 3) from day_scores),
    'retention', (select coalesce(jsonb_object_agg('day_' || n, jsonb_build_object('cohort', cohort, 'kept', kept,
                   'rate', case when cohort = 0 then null else round(kept::numeric / cohort, 3) end)), '{}'::jsonb) from retention),
    'focus_sessions_per_active_user', (select case when (select count(*) from active) = 0 then null
                   else round((select count(*) from sessions)::numeric / (select count(*) from active), 2) end),
    'early_exit_rate', (select case when count(*) = 0 then null else round(count(*) filter (where ended_early)::numeric / count(*), 3) end from sessions),
    'tamper_rate', (select case when count(*) = 0 then null else round(count(*) filter (where id in (select focus_session_id from tampered))::numeric / count(*), 3) end from sessions),
    'proof_rate', (select case when count(*) = 0 then null else round(count(*) filter (where has_proof)::numeric / count(*), 3) end from counted),
    'buddy_pair_retention_7d', (select jsonb_build_object('pairs', count(*) filter (where created_at <= now() - interval '7 days'),
                   'still_active', count(*) filter (where created_at <= now() - interval '7 days' and status = 'active')) from pairs),
    'helpfulness_avg', (select round(avg(helpful)::numeric, 2) from public.feedback, win where created_at::date >= win.since and helpful is not null),
    'mood_trend_weekly', (select coalesce(jsonb_agg(jsonb_build_object('week', w, 'avg_morning_mood', m) order by w), '[]'::jsonb)
                   from (select date_trunc('week', date)::date as w, round(avg(mood_morning)::numeric, 2) as m
                           from committed, win where date >= win.since and mood_morning is not null group by 1) t)
  );
$$;
revoke execute on function public.beta_metrics(int) from public, anon, authenticated;
