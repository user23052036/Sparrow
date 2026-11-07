-- Server-side functions. All SECURITY DEFINER functions check auth.uid()
-- themselves and pin search_path. Points rules mirror
-- packages/shared/src/scoring.ts — keep them in sync.

create function public.require_user() returns uuid
language plpgsql stable set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not signed in' using errcode = '28000'; end if;
  return uid;
end;
$$;

create function public.user_today(uid uuid) returns date
language sql stable security definer set search_path = '' as $$
  select (now() at time zone coalesce(
            (select p.timezone from public.profiles p where p.id = uid), 'UTC'))::date;
$$;

create function public.points_balance() returns int
language sql stable security definer set search_path = '' as $$
  select coalesce(sum(delta), 0)::int from public.points_ledger where user_id = auth.uid();
$$;

-- Today's plan for the current user (created on first call).
create function public.get_today() returns public.daily_plans
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.require_user(); d date := public.user_today(uid); plan public.daily_plans;
begin
  insert into public.daily_plans (user_id, date) values (uid, d) on conflict (user_id, date) do nothing;
  select * into plan from public.daily_plans where user_id = uid and date = d;
  return plan;
end;
$$;

-- Morning commitment.
create function public.commit_day(p_task_ids uuid[], p_mood int, p_stake int default 0)
returns public.daily_plans
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.require_user();
  plan public.daily_plans := public.get_today();
  gentle boolean;
  n int := coalesce(cardinality(p_task_ids), 0);
begin
  if plan.committed_at is not null then raise exception 'today is already planned'; end if;
  if n < 1 or n > 5 then raise exception 'pick between one and five tasks'; end if;
  if p_mood is not null and (p_mood < 1 or p_mood > 5) then raise exception 'mood must be 1-5'; end if;
  if (select count(*) from public.tasks t
      where t.id = any (p_task_ids) and t.user_id = uid and not t.archived) <> n then
    raise exception 'unknown task';
  end if;

  select gentle_mode into gentle from public.profiles where id = uid;
  p_stake := coalesce(p_stake, 0);
  if gentle then p_stake := 0; end if;
  if p_stake < 0 or p_stake > 50 then raise exception 'stake must be 0-50 points'; end if;
  if p_stake > public.points_balance() then raise exception 'not enough points for that stake'; end if;

  insert into public.plan_items (daily_plan_id, user_id, task_id)
    select plan.id, uid, unnest(p_task_ids);

  update public.daily_plans
     set committed_at = now(), mood_morning = p_mood,
         stake_type = case when p_stake > 0 then 'points' else 'none' end,
         stake_amount = p_stake
   where id = plan.id
   returning * into plan;

  if p_stake > 0 then
    insert into public.points_ledger (user_id, delta, reason, ref_id)
      values (uid, -p_stake, 'stake_set', plan.id);
  end if;
  return plan;
end;
$$;

-- During the day: mark an item.
create function public.set_item_status(p_item_id uuid, p_status text)
returns public.plan_items
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.require_user(); item public.plan_items;
begin
  if p_status not in ('pending', 'done', 'partial', 'missed', 'rescheduled') then
    raise exception 'bad status';
  end if;
  update public.plan_items i
     set status = p_status,
         completed_at = case when p_status in ('done', 'partial') then now() else null end
    from public.daily_plans d
   where i.id = p_item_id and i.user_id = uid and d.id = i.daily_plan_id and d.reviewed_at is null
  returning i.* into item;
  if item.id is null then raise exception 'item not found or day already reviewed'; end if;
  return item;
end;
$$;

-- Evening review: finalise statuses, award points once.
-- p_statuses: {"<item uuid>": "done" | "partial" | "missed" | "rescheduled"}
create function public.review_day(p_plan_id uuid, p_statuses jsonb, p_mood int default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.require_user();
  plan public.daily_plans;
  n_count int; n_done int; n_partial int;
  completion numeric; item_pts int; bonus int; refund int;
begin
  select * into plan from public.daily_plans where id = p_plan_id and user_id = uid for update;
  if plan.id is null then raise exception 'plan not found'; end if;
  if plan.committed_at is null then raise exception 'this day was never planned'; end if;
  if plan.reviewed_at is not null then raise exception 'already reviewed'; end if;
  if p_mood is not null and (p_mood < 1 or p_mood > 5) then raise exception 'mood must be 1-5'; end if;

  update public.plan_items i
     set status = case
           when p_statuses ? i.id::text and p_statuses ->> i.id::text in ('done','partial','missed','rescheduled')
             then p_statuses ->> i.id::text
           when i.status = 'pending' then 'missed'
           else i.status end
   where i.daily_plan_id = plan.id;

  update public.plan_items set completed_at = coalesce(completed_at, now())
   where daily_plan_id = plan.id and status in ('done', 'partial');

  select count(*) filter (where status <> 'rescheduled'),
         count(*) filter (where status = 'done'),
         count(*) filter (where status = 'partial')
    into n_count, n_done, n_partial
    from public.plan_items where daily_plan_id = plan.id;

  completion := case when n_count = 0 then 1 else (n_done + 0.5 * n_partial) / n_count end;
  item_pts := n_done * 10 + n_partial * 5;
  bonus := case when n_count > 0 and n_done = n_count then 10 else 0 end;
  refund := floor(plan.stake_amount * completion);

  if item_pts > 0 then
    insert into public.points_ledger (user_id, delta, reason, ref_id) values (uid, item_pts, 'day_items', plan.id);
  end if;
  if bonus > 0 then
    insert into public.points_ledger (user_id, delta, reason, ref_id) values (uid, bonus, 'full_day_bonus', plan.id);
  end if;
  if refund > 0 then
    insert into public.points_ledger (user_id, delta, reason, ref_id) values (uid, refund, 'stake_refund', plan.id);
  end if;

  update public.daily_plans
     set reviewed_at = now(), mood_evening = p_mood, points_earned = item_pts + bonus + refund
   where id = plan.id;

  return jsonb_build_object(
    'item_points', item_pts, 'full_day_bonus', bonus, 'stake_refund', refund,
    'completion', completion, 'total', item_pts + bonus + refund,
    'done', n_done, 'partial', n_partial, 'countable', n_count);
end;
$$;

-- Committed but unreviewed days before today (so the user can close them).
create function public.unreviewed_days() returns setof public.daily_plans
language sql stable security definer set search_path = '' as $$
  select * from public.daily_plans
   where user_id = auth.uid() and committed_at is not null and reviewed_at is null
     and date < public.user_today(auth.uid())
   order by date desc limit 7;
$$;

-- Last N reviewed days' completion, for the "heavy stretch" check.
create function public.recent_completion(p_days int default 3)
returns table (date date, completion numeric)
language sql stable security definer set search_path = '' as $$
  select d.date,
         case when count(*) filter (where i.status <> 'rescheduled') = 0 then 1
              else (count(*) filter (where i.status = 'done') + 0.5 * count(*) filter (where i.status = 'partial'))
                   / count(*) filter (where i.status <> 'rescheduled') end
    from public.daily_plans d join public.plan_items i on i.daily_plan_id = d.id
   where d.user_id = auth.uid() and d.reviewed_at is not null
   group by d.date order by d.date desc limit p_days;
$$;

-- ------------------------------------------------------- focus sessions
create function public.start_focus_session(p_minutes int, p_device_id uuid default null, p_item_id uuid default null)
returns public.focus_sessions
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.require_user(); s public.focus_sessions;
begin
  if p_minutes < 5 or p_minutes > 240 then raise exception 'sessions are 5 to 240 minutes'; end if;
  if exists (select 1 from public.focus_sessions
             where user_id = uid and ended_at is null and ends_at > now()) then
    raise exception 'a focus session is already running';
  end if;
  if p_device_id is not null and not exists (select 1 from public.devices where id = p_device_id and user_id = uid) then
    p_device_id := null;
  end if;
  if p_item_id is not null and not exists (select 1 from public.plan_items where id = p_item_id and user_id = uid) then
    p_item_id := null;
  end if;
  insert into public.focus_sessions (user_id, planned_minutes, ends_at, started_from_device_id, plan_item_id)
    values (uid, p_minutes, now() + make_interval(mins => p_minutes), p_device_id, p_item_id)
    returning * into s;
  return s;
end;
$$;

create function public.end_focus_session(p_session_id uuid, p_reason text default null)
returns public.focus_sessions
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.require_user(); s public.focus_sessions;
begin
  select * into s from public.focus_sessions where id = p_session_id and user_id = uid for update;
  if s.id is null then raise exception 'session not found'; end if;
  if s.ended_at is not null then return s; end if;
  if now() < s.ends_at then
    if p_reason is null or char_length(trim(p_reason)) < 3 then
      raise exception 'tell us what you will do instead before ending early';
    end if;
    update public.focus_sessions set ended_at = now(), ended_early = true, exit_reason = left(p_reason, 300)
     where id = s.id returning * into s;
    insert into public.tamper_events (user_id, focus_session_id, kind, detail)
      values (uid, s.id, 'early_exit', left(p_reason, 300));
  else
    update public.focus_sessions set ended_at = s.ends_at where id = s.id returning * into s;
  end if;
  return s;
end;
$$;

-- What the extension (and later Android) polls. Includes server time so
-- clients can correct for clock skew.
create function public.get_focus_state() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := public.require_user(); s public.focus_sessions; doms text[];
begin
  select * into s from public.focus_sessions
   where user_id = uid and ended_at is null and ends_at > now()
   order by started_at desc limit 1;
  select domains into doms from public.blocklists where user_id = uid;
  return jsonb_build_object(
    'server_now', now(),
    'active', s.id is not null,
    'session_id', s.id,
    'ends_at', s.ends_at,
    'domains', coalesce(to_jsonb(doms), '[]'::jsonb));
end;
$$;

-- --------------------------------------------------------- devices
create function public.heartbeat(p_device_id uuid, p_platform text, p_label text default null,
                                 p_protection boolean default true)
returns public.devices
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.require_user(); d public.devices;
begin
  if exists (select 1 from public.devices where id = p_device_id and user_id <> uid) then
    raise exception 'device belongs to another account';
  end if;
  insert into public.devices (id, user_id, platform, label, last_heartbeat_at, protection_enabled)
    values (p_device_id, uid, p_platform, left(p_label, 60), now(), coalesce(p_protection, true))
  on conflict (id) do update
    set last_heartbeat_at = now(),
        label = coalesce(excluded.label, public.devices.label),
        protection_enabled = excluded.protection_enabled
  returning * into d;
  return d;
end;
$$;

-- Records tamper events for the current user's running session:
--  * heartbeat_lost: a blocking device seen in the last 24h has been silent > 3 min
--  * protection_disabled: a blocking device reports protection off
-- Each (session, device, kind) is recorded once. Called by the web app; can
-- also be scheduled with pg_cron for all users (see docs).
create function public.check_my_heartbeats() returns int
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.require_user(); s public.focus_sessions; n int := 0; r record;
begin
  select * into s from public.focus_sessions
   where user_id = uid and ended_at is null and ends_at > now() limit 1;
  if s.id is null then return 0; end if;
  for r in
    select d.id,
           case when not d.protection_enabled then 'protection_disabled' else 'heartbeat_lost' end as kind
      from public.devices d
     where d.user_id = uid and d.platform in ('extension', 'android')
       and d.last_heartbeat_at > now() - interval '24 hours'
       and (not d.protection_enabled
            or (d.last_heartbeat_at < now() - interval '3 minutes'
                and now() > s.started_at + interval '3 minutes'))
  loop
    if not exists (select 1 from public.tamper_events t
                   where t.focus_session_id = s.id and t.device_id = r.id and t.kind = r.kind) then
      insert into public.tamper_events (user_id, device_id, focus_session_id, kind)
        values (uid, r.id, s.id, r.kind);
      n := n + 1;
    end if;
  end loop;
  return n;
end;
$$;

-- --------------------------------------------------------- permissions
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function
  public.points_balance(), public.get_today(), public.commit_day(uuid[], int, int),
  public.set_item_status(uuid, text), public.review_day(uuid, jsonb, int),
  public.unreviewed_days(), public.recent_completion(int),
  public.start_focus_session(int, uuid, uuid), public.end_focus_session(uuid, text),
  public.get_focus_state(), public.heartbeat(uuid, text, text, boolean),
  public.check_my_heartbeats(), public.is_buddy_of(uuid, uuid)
to authenticated;
