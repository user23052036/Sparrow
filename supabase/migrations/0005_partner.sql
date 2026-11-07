-- Accountability partner (M6): invites, mutual visibility, proof verification,
-- and "partner key" focus sessions that only the partner can end early.
-- All writes go through SECURITY DEFINER functions; clients can only read their own rows.

-- ------------------------------------------------------------ sharing flags
drop policy tamper_select_buddy on public.tamper_events;
alter table public.buddy_links
  add column requester_shares boolean not null default true,
  add column partner_shares boolean not null default true;
alter table public.buddy_links drop column share_tamper_events;

-- one open invite/partnership per person
create unique index buddy_one_open_per_requester on public.buddy_links (requester_id) where status in ('pending', 'active');
create unique index buddy_one_active_per_partner on public.buddy_links (partner_id) where status = 'active';

-- links are created/changed only through the functions below
drop policy buddy_insert on public.buddy_links;
drop policy buddy_update on public.buddy_links;

-- a partner can read the other person's focus events when that person shares activity
create policy tamper_select_buddy on public.tamper_events for select using (
  exists (select 1 from public.buddy_links b
           where b.status = 'active'
             and ((b.requester_id = tamper_events.user_id and b.partner_id = auth.uid() and b.requester_shares)
               or (b.partner_id = tamper_events.user_id and b.requester_id = auth.uid() and b.partner_shares))));

-- ------------------------------------------------------------ locked sessions
alter table public.focus_sessions add column locked boolean not null default false;

create table public.end_requests (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.focus_sessions (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  reason text not null check (char_length(reason) between 3 and 300),
  status text not null default 'pending' check (status in ('pending', 'approved', 'denied')),
  decided_by uuid references auth.users (id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.end_requests (session_id);
alter table public.end_requests enable row level security;
create policy end_requests_select_own on public.end_requests for select using (user_id = auth.uid());

-- ------------------------------------------------------------ helpers (internal)
create function public._partner_of(uid uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select case when b.requester_id = uid then b.partner_id else b.requester_id end
    from public.buddy_links b
   where b.status = 'active' and (b.requester_id = uid or b.partner_id = uid)
   limit 1;
$$;

-- Records tamper events for a user's running session (same rules as before).
create function public._record_heartbeat_events(p_uid uuid) returns int
language plpgsql security definer set search_path = '' as $$
declare s public.focus_sessions; n int := 0; r record;
begin
  select * into s from public.focus_sessions
   where user_id = p_uid and ended_at is null and ends_at > now() limit 1;
  if s.id is null then return 0; end if;
  for r in
    select d.id,
           case when not d.protection_enabled then 'protection_disabled' else 'heartbeat_lost' end as kind
      from public.devices d
     where d.user_id = p_uid and d.platform in ('extension', 'android')
       and d.last_heartbeat_at > now() - interval '24 hours'
       and (not d.protection_enabled
            or (d.last_heartbeat_at < now() - interval '3 minutes'
                and now() > s.started_at + interval '3 minutes'))
  loop
    if not exists (select 1 from public.tamper_events t
                   where t.focus_session_id = s.id and t.device_id = r.id and t.kind = r.kind) then
      insert into public.tamper_events (user_id, device_id, focus_session_id, kind)
        values (p_uid, r.id, s.id, r.kind);
      n := n + 1;
    end if;
  end loop;
  return n;
end;
$$;

create or replace function public.check_my_heartbeats() returns int
language plpgsql security definer set search_path = '' as $$
begin
  return public._record_heartbeat_events(public.require_user());
end;
$$;

-- ------------------------------------------------------------ invites
create function public.create_buddy_invite() returns public.buddy_links
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.require_user(); l public.buddy_links;
begin
  if public._partner_of(uid) is not null then raise exception 'you already have an accountability partner'; end if;
  select * into l from public.buddy_links where requester_id = uid and status = 'pending' limit 1;
  if l.id is not null then return l; end if;
  insert into public.buddy_links (requester_id) values (uid) returning * into l;
  return l;
end;
$$;

create function public.preview_buddy_invite(p_code text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := public.require_user(); l public.buddy_links; nm text;
begin
  select * into l from public.buddy_links where invite_code = lower(trim(p_code)) and status = 'pending';
  if l.id is null then
    return jsonb_build_object('valid', false, 'reason', 'This invite link isn''t valid anymore. Ask for a new one.');
  end if;
  if l.requester_id = uid then
    return jsonb_build_object('valid', false, 'reason', 'This is your own invite link. Send it to your partner.');
  end if;
  if public._partner_of(uid) is not null then
    return jsonb_build_object('valid', false, 'reason', 'You already have an accountability partner.');
  end if;
  select coalesce(display_name, 'Someone') into nm from public.profiles where id = l.requester_id;
  return jsonb_build_object('valid', true, 'from', nm);
end;
$$;

create function public.accept_buddy_invite(p_code text) returns public.buddy_links
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.require_user(); l public.buddy_links;
begin
  select * into l from public.buddy_links where invite_code = lower(trim(p_code)) and status = 'pending' for update;
  if l.id is null then raise exception 'this invite link isn''t valid anymore'; end if;
  if l.requester_id = uid then raise exception 'you can''t accept your own invite'; end if;
  if public._partner_of(uid) is not null then raise exception 'you already have an accountability partner'; end if;
  -- drop any invite of my own that was still waiting
  update public.buddy_links set status = 'ended' where requester_id = uid and status = 'pending';
  update public.buddy_links set partner_id = uid, status = 'active', mutual = true where id = l.id returning * into l;
  return l;
end;
$$;

-- Either person can end the partnership (or cancel a pending invite) at any time.
-- Locked sessions are released so nobody stays trapped.
create function public.end_buddy_link(p_link_id uuid) returns public.buddy_links
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.require_user(); l public.buddy_links;
begin
  select * into l from public.buddy_links
   where id = p_link_id and (requester_id = uid or partner_id = uid) for update;
  if l.id is null then raise exception 'partnership not found'; end if;
  update public.buddy_links set status = 'ended' where id = l.id returning * into l;
  update public.focus_sessions set locked = false
   where user_id in (l.requester_id, l.partner_id) and ended_at is null and locked;
  return l;
end;
$$;

create function public.set_my_sharing(p_share boolean) returns public.buddy_links
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.require_user(); l public.buddy_links;
begin
  select * into l from public.buddy_links
   where status = 'active' and (requester_id = uid or partner_id = uid) for update;
  if l.id is null then raise exception 'you don''t have a partner yet'; end if;
  if l.requester_id = uid then
    update public.buddy_links set requester_shares = coalesce(p_share, true) where id = l.id returning * into l;
  else
    update public.buddy_links set partner_shares = coalesce(p_share, true) where id = l.id returning * into l;
  end if;
  return l;
end;
$$;

-- ------------------------------------------------------------ overview for the Partner page
create function public.partner_overview() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.require_user();
  l public.buddy_links;
  pid uuid; pname text; ptz text; pd date;
  they_share boolean; i_share boolean;
  plan public.daily_plans;
  items jsonb := '[]'::jsonb; streak int := 0; events jsonb := '[]'::jsonb;
  f_sessions int := 0; f_minutes int := 0; active_sess jsonb := null;
  reqs jsonb; proofs jsonb; activity jsonb := null;
begin
  select * into l from public.buddy_links
   where status in ('pending', 'active') and (requester_id = uid or partner_id = uid)
   order by status limit 1;
  if l.id is null then return jsonb_build_object('state', 'none'); end if;
  if l.status = 'pending' then
    return jsonb_build_object('state', 'pending', 'link_id', l.id, 'invite_code', l.invite_code);
  end if;

  pid := case when l.requester_id = uid then l.partner_id else l.requester_id end;
  they_share := case when l.requester_id = uid then l.partner_shares else l.requester_shares end;
  i_share := case when l.requester_id = uid then l.requester_shares else l.partner_shares end;
  select coalesce(display_name, 'Your partner'), timezone into pname, ptz from public.profiles where id = pid;
  perform public._record_heartbeat_events(pid);

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', r.id, 'reason', r.reason, 'created_at', r.created_at, 'session_ends_at', s.ends_at)
           order by r.created_at), '[]'::jsonb)
    into reqs
    from public.end_requests r join public.focus_sessions s on s.id = r.session_id
   where r.user_id = pid and r.status = 'pending' and s.ended_at is null and s.ends_at > now();

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', p.id, 'kind', p.kind, 'text', p.text_body, 'path', p.storage_path,
           'flagged', p.flagged_similar, 'created_at', p.server_created_at, 'task', t.title,
           'verdict', v.verdict, 'comment', v.comment)
           order by p.server_created_at desc), '[]'::jsonb)
    into proofs
    from public.proofs p
    join public.plan_items i on i.id = p.plan_item_id
    join public.tasks t on t.id = i.task_id
    left join public.verifications v on v.proof_id = p.id and v.verifier_id = uid
   where p.user_id = pid and p.visibility = 'buddy' and p.server_created_at > now() - interval '3 days';

  if they_share then
    pd := public.user_today(pid);
    select * into plan from public.daily_plans where user_id = pid and date = pd;
    if plan.id is not null then
      select coalesce(jsonb_agg(jsonb_build_object('title', t.title, 'status', i.status) order by t.created_at), '[]'::jsonb)
        into items
        from public.plan_items i join public.tasks t on t.id = i.task_id
       where i.daily_plan_id = plan.id;
    end if;

    with days as (
      select d.date from public.daily_plans d
       where d.user_id = pid and d.reviewed_at is not null and coalesce(d.points_earned, 0) > 0 and d.date <= pd
    ), numbered as (
      select date, (date + (row_number() over (order by date desc))::int) as grp from days
    )
    select case when (select max(date) from days) >= pd - 1
                then count(*) filter (where grp = (select grp from numbered order by date desc limit 1))
                else 0 end
      into streak from numbered;

    select coalesce(jsonb_agg(jsonb_build_object('kind', e.kind, 'at', e.created_at, 'detail', e.detail)
                              order by e.created_at desc), '[]'::jsonb)
      into events
      from (select * from public.tamper_events
             where user_id = pid and created_at > now() - interval '7 days'
             order by created_at desc limit 20) e;

    select count(*), coalesce(sum(planned_minutes), 0) into f_sessions, f_minutes
      from public.focus_sessions
     where user_id = pid and (started_at at time zone coalesce(ptz, 'UTC'))::date = pd;

    select jsonb_build_object('ends_at', s.ends_at, 'locked', s.locked) into active_sess
      from public.focus_sessions s
     where s.user_id = pid and s.ended_at is null and s.ends_at > now()
     order by s.started_at desc limit 1;

    activity := jsonb_build_object(
      'today', jsonb_build_object('date', pd, 'committed', plan.committed_at is not null,
                                  'reviewed', plan.reviewed_at is not null, 'items', items),
      'streak', coalesce(streak, 0), 'events', events,
      'focus', jsonb_build_object('sessions', f_sessions, 'minutes', f_minutes),
      'active_session', active_sess);
  end if;

  return jsonb_build_object(
    'state', 'active', 'link_id', l.id,
    'partner', jsonb_build_object('name', pname, 'shares', they_share),
    'i_share', i_share, 'pending_end_requests', reqs, 'proofs', proofs, 'activity', activity);
end;
$$;

-- Cheap count for the navigation badge: things waiting on me as a partner.
create function public.partner_badge() returns int
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := public.require_user(); pid uuid := public._partner_of(public.require_user());
begin
  if pid is null then return 0; end if;
  return (select count(*) from public.end_requests r join public.focus_sessions s on s.id = r.session_id
           where r.user_id = pid and r.status = 'pending' and s.ended_at is null and s.ends_at > now())::int
       + (select count(*) from public.proofs p
           where p.user_id = pid and p.visibility = 'buddy' and p.server_created_at > now() - interval '3 days'
             and not exists (select 1 from public.verifications v where v.proof_id = p.id and v.verifier_id = uid))::int;
end;
$$;

-- ------------------------------------------------------------ verification
create function public.verify_proof(p_proof_id uuid, p_verdict text, p_comment text default null)
returns public.verifications
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.require_user(); pr public.proofs; v public.verifications;
begin
  if p_verdict not in ('approve', 'question') then raise exception 'bad verdict'; end if;
  select * into pr from public.proofs where id = p_proof_id and visibility = 'buddy';
  if pr.id is null or not public.is_buddy_of(pr.user_id, uid) then raise exception 'proof not found'; end if;
  insert into public.verifications (proof_id, verifier_id, verdict, comment)
    values (p_proof_id, uid, p_verdict, left(nullif(trim(p_comment), ''), 500))
  on conflict (proof_id, verifier_id)
    do update set verdict = excluded.verdict, comment = excluded.comment, created_at = now()
  returning * into v;
  return v;
end;
$$;

-- ------------------------------------------------------------ locked focus sessions
drop function public.start_focus_session(int, uuid, uuid);
create function public.start_focus_session(p_minutes int, p_device_id uuid default null,
                                           p_item_id uuid default null, p_locked boolean default false)
returns public.focus_sessions
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.require_user(); s public.focus_sessions;
begin
  if p_minutes < 5 or p_minutes > 240 then raise exception 'sessions are 5 to 240 minutes'; end if;
  if coalesce(p_locked, false) then
    if public._partner_of(uid) is null then raise exception 'locking a session needs an accountability partner'; end if;
    if p_minutes > 120 then raise exception 'locked sessions can be up to 120 minutes'; end if;
  end if;
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
  insert into public.focus_sessions (user_id, planned_minutes, ends_at, started_from_device_id, plan_item_id, locked)
    values (uid, p_minutes, now() + make_interval(mins => p_minutes), p_device_id, p_item_id, coalesce(p_locked, false))
    returning * into s;
  return s;
end;
$$;

create or replace function public.end_focus_session(p_session_id uuid, p_reason text default null)
returns public.focus_sessions
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.require_user(); s public.focus_sessions;
begin
  select * into s from public.focus_sessions where id = p_session_id and user_id = uid for update;
  if s.id is null then raise exception 'session not found'; end if;
  if s.ended_at is not null then return s; end if;
  if now() < s.ends_at then
    if s.locked then raise exception 'this session is locked: ask your partner to end it'; end if;
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

create or replace function public.get_focus_state() returns jsonb
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
    'locked', coalesce(s.locked, false),
    'domains', coalesce(to_jsonb(doms), '[]'::jsonb));
end;
$$;

create function public.request_end_session(p_session_id uuid, p_reason text) returns public.end_requests
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.require_user(); s public.focus_sessions; r public.end_requests;
begin
  select * into s from public.focus_sessions
   where id = p_session_id and user_id = uid and ended_at is null and ends_at > now();
  if s.id is null then raise exception 'session not found'; end if;
  if not s.locked then raise exception 'this session isn''t locked'; end if;
  if char_length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'tell your partner why you want to stop'; end if;
  select * into r from public.end_requests where session_id = s.id and status = 'pending';
  if r.id is not null then return r; end if;
  insert into public.end_requests (session_id, user_id, reason)
    values (s.id, uid, left(trim(p_reason), 300)) returning * into r;
  return r;
end;
$$;

create function public.decide_end_request(p_request_id uuid, p_approve boolean) returns public.end_requests
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.require_user(); r public.end_requests;
begin
  select * into r from public.end_requests where id = p_request_id and status = 'pending' for update;
  if r.id is null or not public.is_buddy_of(r.user_id, uid) then raise exception 'request not found'; end if;
  if p_approve then
    update public.focus_sessions
       set ended_at = now(), ended_early = true, locked = false,
           exit_reason = left('approved by partner: ' || r.reason, 300)
     where id = r.session_id and ended_at is null;
    insert into public.tamper_events (user_id, focus_session_id, kind, detail)
      values (r.user_id, r.session_id, 'early_exit', left('partner approved: ' || r.reason, 300));
  end if;
  update public.end_requests
     set status = case when p_approve then 'approved' else 'denied' end, decided_by = uid, decided_at = now()
   where id = r.id returning * into r;
  return r;
end;
$$;

-- ------------------------------------------------------------ permissions
revoke execute on function public._partner_of(uuid), public._record_heartbeat_events(uuid)
  from public, anon, authenticated;
revoke execute on function
  public.create_buddy_invite(), public.preview_buddy_invite(text), public.accept_buddy_invite(text),
  public.end_buddy_link(uuid), public.set_my_sharing(boolean), public.partner_overview(),
  public.partner_badge(), public.verify_proof(uuid, text, text),
  public.start_focus_session(int, uuid, uuid, boolean),
  public.request_end_session(uuid, text), public.decide_end_request(uuid, boolean)
  from public, anon;
grant execute on function
  public.create_buddy_invite(), public.preview_buddy_invite(text), public.accept_buddy_invite(text),
  public.end_buddy_link(uuid), public.set_my_sharing(boolean), public.partner_overview(),
  public.partner_badge(), public.verify_proof(uuid, text, text),
  public.start_focus_session(int, uuid, uuid, boolean),
  public.request_end_session(uuid, text), public.decide_end_request(uuid, boolean)
  to authenticated;
