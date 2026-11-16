-- Partner fatigue guard (ROADMAP T2.4, D43). Holding someone's key should stay easy to say yes to:
--   at most three key requests per locked session and five per day (the asker's local day);
--   the key holder (an account partner or a guest, D39) can set quiet hours in their own time zone.
-- During quiet hours a request is still made and waits on the holder's page, but it sends no notification
-- (shared proofs don't either). When quiet hours end, the reminder job (0029) delivers requests still
-- waiting on a running session. The asker's Focus page is told kindly through key_request_status().

create function public._key_requests_per_session() returns int language sql immutable as $$ select 3 $$;
create function public._key_requests_per_day() returns int language sql immutable as $$ select 5 $$;

-- Quiet hours: both times or neither, never the same time. They may cross midnight (22:00 to 07:00).
alter table public.profiles
  add column quiet_from time,
  add column quiet_to time,
  add constraint profiles_quiet_hours check ((quiet_from is null) = (quiet_to is null) and (quiet_from is null or quiet_from <> quiet_to));
-- A guest has no profile, so the guest keeps their own, with the time zone their browser reported.
alter table public.guest_keys
  add column quiet_from time,
  add column quiet_to time,
  add column quiet_tz text,
  add constraint guest_keys_quiet_hours check ((quiet_from is null) = (quiet_to is null) and (quiet_from is null) = (quiet_tz is null)
                                               and (quiet_from is null or quiet_from <> quiet_to));

-- ------------------------------------------------------------ helpers (internal)
-- When quiet hours that are on at p_now end, or null when they aren't on (or the time zone is unknown).
create function public._quiet_until(p_from time, p_to time, p_tz text, p_now timestamptz) returns timestamptz
language plpgsql stable set search_path = '' as $$
declare lt timestamp := public._local_time(p_now, p_tz); tm time; d date; ends timestamp;
begin
  if p_from is null or p_to is null or p_from = p_to or lt is null then return null; end if;
  tm := lt::time; d := lt::date;
  if p_from < p_to then
    if tm >= p_from and tm < p_to then ends := d + p_to; end if;
  elsif tm >= p_from then
    ends := (d + 1) + p_to;
  elsif tm < p_to then
    ends := d + p_to;
  end if;
  if ends is null then return null; end if;
  return ends at time zone p_tz;
end;
$$;

-- Whoever holds this person's key: their account partner, or else their guest.
create function public._key_holder(uid uuid) returns table (to_kind text, id uuid)
language plpgsql stable security definer set search_path = '' as $$
declare p uuid := public._partner_of(uid); g uuid;
begin
  if p is not null and public.is_buddy_of(uid, p) then
    return query select 'user'::text, p;
  else
    g := public._guest_key_of(uid);
    if g is not null then return query select 'guest'::text, g; end if;
  end if;
end;
$$;

-- When the key holder's quiet hours end, or null when they aren't in quiet hours (or nobody holds the key).
create function public._holder_quiet_until(uid uuid, p_now timestamptz) returns timestamptz
language plpgsql stable security definer set search_path = '' as $$
declare h record;
begin
  select * into h from public._key_holder(uid);
  if h.id is null then return null; end if;
  if h.to_kind = 'user' then
    return (select public._quiet_until(p.quiet_from, p.quiet_to, coalesce(p.timezone, 'UTC'), p_now) from public.profiles p where p.id = h.id);
  end if;
  return (select public._quiet_until(g.quiet_from, g.quiet_to, g.quiet_tz, p_now) from public.guest_keys g where g.id = h.id);
end;
$$;

-- How many key requests this person made today (their local day) and in a session.
create function public._key_requests_today(uid uuid) returns int
language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.end_requests e, public.profiles p
   where e.user_id = uid and p.id = uid
     and (public._local_time(e.created_at, coalesce(p.timezone, 'UTC')))::date = (public._local_time(now(), coalesce(p.timezone, 'UTC')))::date;
$$;

-- ------------------------------------------------------------ the asker's side
create or replace function public.request_end_session(p_session_id uuid, p_reason text) returns public.end_requests
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.require_user(); s public.focus_sessions; r public.end_requests;
begin
  select * into s from public.focus_sessions
   where id = p_session_id and user_id = uid and ended_at is null and ends_at > now() for update;
  if s.id is null then raise exception 'session not found'; end if;
  if not s.locked then raise exception 'this session isn''t locked'; end if;
  if char_length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'tell your partner why you want to stop'; end if;
  select * into r from public.end_requests where session_id = s.id and status = 'pending';
  if r.id is not null then return r; end if;
  if (select count(*) from public.end_requests where session_id = s.id) >= public._key_requests_per_session() then
    raise exception 'you have asked for the key % times in this session, which is the most: it ends on its own', public._key_requests_per_session();
  end if;
  if public._key_requests_today(uid) >= public._key_requests_per_day() then
    raise exception 'you have asked for the key % times today, which is the most for one day', public._key_requests_per_day();
  end if;
  insert into public.end_requests (session_id, user_id, reason)
    values (s.id, uid, left(trim(p_reason), 300)) returning * into r;
  return r;
end;
$$;

-- What the Focus page needs to be kind about it: how many asks are left, and the key holder's quiet hours.
create function public.key_request_status(p_session_id uuid default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := public.require_user(); in_session int := 0; today int := public._key_requests_today(uid);
begin
  if p_session_id is not null then
    select count(*) into in_session from public.end_requests r where r.session_id = p_session_id and r.user_id = uid;
  end if;
  return jsonb_build_object(
    'session_asked', in_session, 'session_max', public._key_requests_per_session(),
    'day_asked', today, 'day_max', public._key_requests_per_day(),
    'can_ask', in_session < public._key_requests_per_session() and today < public._key_requests_per_day(),
    'quiet_until', public._holder_quiet_until(uid, now()));
end;
$$;

-- ------------------------------------------------------------ the key holder's side
-- An account partner's quiet hours, in their profile's time zone. Both null switches them off.
create function public.set_quiet_hours(p_from time, p_to time) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.require_user();
begin
  if (p_from is null) <> (p_to is null) or p_from = p_to then raise exception 'pick two different times, or none'; end if;
  update public.profiles set quiet_from = p_from, quiet_to = p_to where id = uid;
end;
$$;

-- A guest's quiet hours, in the time zone their browser reports. Both null switches them off.
create function public.guest_set_quiet(p_key text, p_from time, p_to time, p_tz text) returns void
language plpgsql security definer set search_path = '' as $$
declare g public.guest_keys := public._guest_by_secret(p_key);
begin
  if (p_from is null) <> (p_to is null) or p_from = p_to then raise exception 'pick two different times, or none'; end if;
  if p_from is not null and not exists (select 1 from pg_catalog.pg_timezone_names where name = p_tz) then
    raise exception 'unknown time zone';
  end if;
  update public.guest_keys
     set quiet_from = p_from, quiet_to = p_to, quiet_tz = case when p_from is null then null else p_tz end
   where id = g.id;
end;
$$;

-- As in 0030, plus the guest's own quiet hours so the key page can show them.
create or replace function public.guest_overview(p_key text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare g public.guest_keys := public._guest_by_secret(p_key); nm text; reqs jsonb; proofs jsonb;
begin
  update public.guest_keys set last_seen_at = now() where id = g.id;
  select coalesce(display_name, 'Your friend') into nm from public.profiles where id = g.owner_id;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', r.id, 'reason', r.reason, 'created_at', r.created_at, 'session_ends_at', s.ends_at)
           order by r.created_at), '[]'::jsonb)
    into reqs
    from public.end_requests r join public.focus_sessions s on s.id = r.session_id
   where r.user_id = g.owner_id and r.status = 'pending' and s.ended_at is null and s.ends_at > now();

  -- written proofs in full; photos and voice notes stay in private storage that needs an account
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', p.id, 'kind', p.kind, 'text', case when p.kind = 'text' then p.text_body end,
           'task', t.title, 'created_at', p.server_created_at)
           order by p.server_created_at desc), '[]'::jsonb)
    into proofs
    from public.proofs p
    join public.plan_items i on i.id = p.plan_item_id
    join public.tasks t on t.id = i.task_id
   where p.user_id = g.owner_id and p.visibility = 'buddy' and p.server_created_at > now() - interval '3 days';

  return jsonb_build_object('name', nm, 'guest', g.name, 'pending_end_requests', reqs, 'proofs', proofs,
    'quiet', case when g.quiet_from is null then null
                  else jsonb_build_object('from', to_char(g.quiet_from, 'HH24:MI'), 'to', to_char(g.quiet_to, 'HH24:MI')) end);
end;
$$;

-- ------------------------------------------------------------ notifications respect quiet hours
-- As in 0030, except that nothing is sent to a key holder in quiet hours. A key request is then left
-- unclaimed, so claim_waiting_key_requests() can deliver it once quiet hours end.
create or replace function public.claim_push(p_kind text, p_ref uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.require_user(); mine boolean := false; target uuid; guest uuid;
begin
  if p_kind in ('key_request', 'proof_shared') then
    if p_kind = 'key_request' then
      mine := exists (select 1 from public.end_requests r where r.id = p_ref and r.user_id = uid and r.status = 'pending');
    else
      mine := exists (select 1 from public.proofs p where p.id = p_ref and p.user_id = uid and p.visibility = 'buddy')
              and not exists (select 1 from public.push_sent ps join public.proofs p on p.id = ps.ref
                               where ps.kind = 'proof_shared' and p.user_id = uid and ps.created_at > now() - interval '10 minutes');
    end if;
    if mine and public._holder_quiet_until(uid, now()) is null then
      target := public._partner_of(uid);
      if target is not null and not public.is_buddy_of(uid, target) then target := null; end if;
      if target is null then guest := public._guest_key_of(uid); end if;
    end if;
  elsif p_kind = 'key_answer' then
    select r.user_id into target
      from public.end_requests r where r.id = p_ref and r.decided_by = uid and r.status in ('approved', 'denied');
  else
    raise exception 'unknown kind of notification';
  end if;
  if target is null and guest is null then return null; end if;
  insert into public.push_sent (kind, ref) values (p_kind, p_ref) on conflict do nothing;
  if not found then return null; end if;
  if guest is not null then return jsonb_build_object('to', 'guest', 'id', guest); end if;
  return jsonb_build_object('to', 'user', 'id', target);
end;
$$;

-- For the reminder job: key requests still waiting on a running session whose holder is out of quiet hours
-- and was never notified, marked as sent in the same step. A request gets a minute for the app's own
-- notify call first, so this is also the fallback when that call never arrived.
create function public.claim_waiting_key_requests(p_now timestamptz default now())
returns table (to_kind text, recipient uuid, request_id uuid)
language plpgsql security definer set search_path = '' as $$
begin
  return query
  with waiting as (
    select r.id, h.to_kind as kind, h.id as holder
      from public.end_requests r
      join public.focus_sessions s on s.id = r.session_id
     cross join lateral public._key_holder(r.user_id) h
     where r.status = 'pending' and s.ended_at is null and s.ends_at > p_now
       and r.created_at <= p_now - interval '1 minute'
       and not exists (select 1 from public.push_sent ps where ps.kind = 'key_request' and ps.ref = r.id)
       and public._holder_quiet_until(r.user_id, p_now) is null
  ), sent as (
    insert into public.push_sent (kind, ref)
    select 'key_request', w.id from waiting w
    on conflict do nothing
    returning push_sent.ref
  )
  select w.kind, w.holder, w.id from waiting w join sent on sent.ref = w.id;
end;
$$;

-- ------------------------------------------------------------ permissions
revoke execute on function public._key_requests_per_session(), public._key_requests_per_day(),
  public._quiet_until(time, time, text, timestamptz), public._key_holder(uuid), public._holder_quiet_until(uuid, timestamptz),
  public._key_requests_today(uuid)
  from public, anon, authenticated;
revoke execute on function public.key_request_status(uuid), public.set_quiet_hours(time, time) from public, anon;
grant execute on function public.key_request_status(uuid), public.set_quiet_hours(time, time) to authenticated;
revoke execute on function public.guest_set_quiet(text, time, time, text) from public;
grant execute on function public.guest_set_quiet(text, time, time, text) to anon, authenticated;
revoke execute on function public.claim_waiting_key_requests(timestamptz) from public, anon, authenticated;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.claim_waiting_key_requests(timestamptz) to service_role;
  end if;
end $$;
