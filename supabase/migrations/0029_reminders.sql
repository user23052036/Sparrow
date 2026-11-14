-- Morning and evening reminders (D38, ROADMAP T2.2). Off by default; each is a local time in the person's
-- own time zone. At most two a day (one per slot), no morning reminder on a day already planned, and
-- nothing on a day already reviewed. Sent as Web Push by the `remind` Edge Function, which a pg_cron job
-- calls every five minutes through pg_net (scheduled by configure_reminders(), which the deploy workflow
-- runs). Without pg_cron or pg_net nothing is scheduled, as with 0008.

alter table public.profiles
  add column remind_morning time,
  add column remind_evening time;

create table public.reminder_sent (
  user_id uuid not null references auth.users (id) on delete cascade,
  local_date date not null,
  slot text not null check (slot in ('morning', 'evening')),
  sent_at timestamptz not null default now(),
  primary key (user_id, local_date, slot)
);
alter table public.reminder_sent enable row level security;
revoke all on public.reminder_sent from anon, authenticated;

-- A reminder more than this late (a paused job, a deploy) is skipped rather than sent at an odd hour.
create function public._reminder_window() returns interval language sql immutable as $$ select interval '2 hours' $$;
create function public._reminders_per_day() returns int language sql immutable as $$ select 2 $$;

-- The person's local clock, or null for a time zone Postgres doesn't know (so one odd profile can't stop the job).
create function public._local_time(p_now timestamptz, p_tz text) returns timestamp
language plpgsql stable set search_path = '' as $$
begin
  return p_now at time zone p_tz;
exception when others then
  return null;
end;
$$;

-- Reminders due at p_now, marked as sent in the same step so two runs never send one twice.
create function public.claim_due_reminders(p_now timestamptz default now())
returns table (user_id uuid, slot text)
language plpgsql security definer set search_path = '' as $$
begin
  return query
  with local as (
    select p.id, p.timezone as tz, (public._local_time(p_now, p.timezone))::date as today, p.remind_morning, p.remind_evening
      from public.profiles p
     where (p.remind_morning is not null or p.remind_evening is not null)
       and public._local_time(p_now, p.timezone) is not null
  ), candidates as (
    -- Real moments, not times of day: a slot is due from its local date and time until the window closes, so a
    -- 23:57 reminder caught by the 00:00 run still counts for the day it belongs to.
    select l.id, d.d, s.slot
      from local l
     cross join lateral (values ('morning', l.remind_morning), ('evening', l.remind_evening)) as s(slot, t)
     cross join lateral (values (l.today), (l.today - 1)) as d(d)
     where s.t is not null
       and ((d.d + s.t) at time zone l.tz) <= p_now
       and p_now < ((d.d + s.t) at time zone l.tz) + public._reminder_window()
  ), due as (
    select c.* from candidates c
     where not exists (select 1 from public.reminder_sent r where r.user_id = c.id and r.local_date = c.d and r.slot = c.slot)
       and (select count(*) from public.reminder_sent r where r.user_id = c.id and r.local_date = c.d) < public._reminders_per_day()
       and not exists (select 1 from public.daily_plans dp where dp.user_id = c.id and dp.date = c.d and dp.reviewed_at is not null)
       and not (c.slot = 'morning'
                and exists (select 1 from public.daily_plans dp where dp.user_id = c.id and dp.date = c.d and dp.committed_at is not null))
  ), sent as (
    insert into public.reminder_sent (user_id, local_date, slot)
    select due.id, due.d, due.slot from due
    on conflict do nothing
    returning reminder_sent.user_id, reminder_sent.slot
  )
  select sent.user_id, sent.slot from sent;
end;
$$;

-- Where the cron job sends its call, and the secret it proves itself with. Never readable by clients.
create table public.reminder_job (
  id boolean primary key default true check (id),
  function_url text not null check (function_url ~ '^https://'),
  secret uuid not null default gen_random_uuid()
);
alter table public.reminder_job enable row level security;
revoke all on public.reminder_job from anon, authenticated;

create function public.reminder_secret_ok(p_secret text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.reminder_job j where j.secret::text = p_secret);
$$;

-- Records the remind function's address and schedules the five-minute job. Returns what happened.
create function public.configure_reminders(p_function_url text) returns text
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.reminder_job (function_url) values (p_function_url)
    on conflict (id) do update set function_url = excluded.function_url;
  if not exists (select 1 from pg_available_extensions where name = 'pg_cron')
     or not exists (select 1 from pg_available_extensions where name = 'pg_net') then
    return 'pg_cron or pg_net is not available: reminders are not scheduled';
  end if;
  begin
    create extension if not exists pg_cron;
    create extension if not exists pg_net;
    perform cron.schedule('sparrow-reminders', '*/5 * * * *', $job$
      select net.http_post(
        url := (select function_url from public.reminder_job),
        body := '{}'::jsonb,
        timeout_milliseconds := 30000,
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-reminder-secret', (select secret::text from public.reminder_job)))
    $job$);
  exception when others then
    return 'could not schedule reminders: ' || sqlerrm;
  end;
  return 'scheduled';
end;
$$;

revoke execute on function public._reminder_window(), public._reminders_per_day(), public._local_time(timestamptz, text) from public, anon, authenticated;
revoke execute on function public.claim_due_reminders(timestamptz), public.reminder_secret_ok(text), public.configure_reminders(text)
  from public, anon, authenticated;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.claim_due_reminders(timestamptz), public.reminder_secret_ok(text), public.configure_reminders(text)
      to service_role;
  end if;
end $$;
