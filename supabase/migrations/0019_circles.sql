-- Circles (D28): small groups of 2 to 4 people who keep each other company.
-- This sits NEXT TO the one-partner model (D15); it does not replace it. A partner still holds the
-- key to locked sessions and verifies proofs. A circle only shares a light summary of each day:
-- how many planned things moved forward and how many focus minutes, never task titles, proofs,
-- moods or tamper events. Each member can switch their own sharing off. Members can send one
-- "cheer" per person per day. Nobody can be removed by someone else and nothing is ranked.
-- All writes go through the functions below.

create table public.circles (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 40),
  invite_code text unique not null default substr(replace(gen_random_uuid()::text, '-', ''), 1, 16),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.circle_members (
  circle_id uuid not null references public.circles (id) on delete cascade,
  user_id uuid not null unique references auth.users (id) on delete cascade, -- one circle per person
  -- what other members use to address this person (so user ids are never handed out)
  member_key uuid not null unique default gen_random_uuid(),
  shares boolean not null default true,
  joined_at timestamptz not null default now(),
  primary key (circle_id, user_id)
);

create table public.circle_cheers (
  id uuid primary key default gen_random_uuid(),
  circle_id uuid not null references public.circles (id) on delete cascade,
  from_id uuid not null references auth.users (id) on delete cascade,
  to_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  created_at timestamptz not null default now(),
  unique (from_id, to_id, day),
  check (from_id <> to_id)
);
create index on public.circle_cheers (to_id, day);

alter table public.circles enable row level security;
alter table public.circle_members enable row level security;
alter table public.circle_cheers enable row level security;

create function public._circle_of(uid uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select circle_id from public.circle_members where user_id = uid;
$$;
revoke execute on function public._circle_of(uuid) from public, anon, authenticated;

create policy circles_select_member on public.circles for select
  using (exists (select 1 from public.circle_members m where m.circle_id = circles.id and m.user_id = auth.uid()));
create policy circle_members_select_own on public.circle_members for select using (user_id = auth.uid());
create policy circle_cheers_select_own on public.circle_cheers for select using (from_id = auth.uid() or to_id = auth.uid());

-- ------------------------------------------------------------------ create / join / leave
create function public.create_circle(p_name text) returns public.circles
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.require_user(); c public.circles;
begin
  if public._circle_of(uid) is not null then raise exception 'you are already in a circle'; end if;
  if p_name is null or char_length(trim(p_name)) not between 1 and 40 then raise exception 'give the circle a short name (up to 40 letters)'; end if;
  insert into public.circles (name, created_by) values (trim(p_name), uid) returning * into c;
  insert into public.circle_members (circle_id, user_id) values (c.id, uid);
  return c;
end;
$$;

create function public.preview_circle_invite(p_code text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := public.require_user(); c public.circles; n int;
begin
  select * into c from public.circles where invite_code = lower(trim(p_code));
  if c.id is null then return jsonb_build_object('valid', false, 'reason', 'This circle link isn''t valid anymore. Ask for a new one.'); end if;
  if public._circle_of(uid) = c.id then return jsonb_build_object('valid', false, 'reason', 'You''re already in this circle.'); end if;
  if public._circle_of(uid) is not null then return jsonb_build_object('valid', false, 'reason', 'You''re already in a circle. Leave it first to join this one.'); end if;
  select count(*) into n from public.circle_members where circle_id = c.id;
  if n >= 4 then return jsonb_build_object('valid', false, 'reason', 'This circle is full (four people).'); end if;
  return jsonb_build_object('valid', true, 'name', c.name, 'members', n);
end;
$$;

create function public.join_circle(p_code text) returns public.circles
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.require_user(); c public.circles; n int;
begin
  -- the row lock serialises joins, so two people can't both take the last seat
  select * into c from public.circles where invite_code = lower(trim(p_code)) for update;
  if c.id is null then raise exception 'this circle link isn''t valid anymore'; end if;
  if public._circle_of(uid) is not null then raise exception 'you are already in a circle'; end if;
  select count(*) into n from public.circle_members where circle_id = c.id;
  if n >= 4 then raise exception 'this circle is full (four people)'; end if;
  insert into public.circle_members (circle_id, user_id) values (c.id, uid);
  return c;
end;
$$;

-- Leaving is always possible. An empty circle is removed; a fresh invite code is made so the old
-- link (which the leaver may still have) stops working.
create function public.leave_circle() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.require_user(); cid uuid := public._circle_of(uid);
begin
  if cid is null then return jsonb_build_object('state', 'none'); end if;
  perform 1 from public.circles where id = cid for update;
  delete from public.circle_members where user_id = uid;
  if not exists (select 1 from public.circle_members where circle_id = cid) then
    delete from public.circles where id = cid;
  else
    update public.circles set invite_code = substr(replace(gen_random_uuid()::text, '-', ''), 1, 16) where id = cid;
  end if;
  return jsonb_build_object('state', 'none');
end;
$$;

create function public.set_circle_sharing(p_on boolean) returns boolean
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.require_user(); v boolean;
begin
  update public.circle_members set shares = coalesce(p_on, true) where user_id = uid returning shares into v;
  if v is null then raise exception 'you are not in a circle'; end if;
  return v;
end;
$$;

-- One cheer per person per day (the sender's day).
create function public.send_cheer(p_member_key uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.require_user(); cid uuid := public._circle_of(uid); target uuid; ins uuid;
begin
  if cid is null then raise exception 'you are not in a circle'; end if;
  select user_id into target from public.circle_members where member_key = p_member_key and circle_id = cid;
  if target is null then raise exception 'that person isn''t in your circle'; end if;
  if target = uid then raise exception 'cheer someone else in your circle'; end if;
  insert into public.circle_cheers (circle_id, from_id, to_id, day)
    values (cid, uid, target, public.user_today(uid))
    on conflict (from_id, to_id, day) do nothing
    returning id into ins;
  return jsonb_build_object('sent', ins is not null);
end;
$$;

-- ------------------------------------------------------------------ overview for the Circle page
-- Shared per member (only when they share): today's planned/done/partly counts, whether the day
-- is closed, and focus minutes started today. Never titles, proofs, moods or tamper events.
create function public.circle_overview() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := public.require_user(); cid uuid := public._circle_of(uid); c public.circles; me_today date;
begin
  if cid is null then return jsonb_build_object('state', 'none'); end if;
  select * into c from public.circles where id = cid;
  me_today := public.user_today(uid);
  return jsonb_build_object(
    'state', 'active',
    'circle', jsonb_build_object('name', c.name, 'invite_code', c.invite_code,
                                 'size', (select count(*) from public.circle_members where circle_id = cid), 'max', 4),
    'i_share', (select shares from public.circle_members where user_id = uid),
    'cheers_today', (select coalesce(jsonb_agg(coalesce(p.display_name, 'Someone') order by ch.created_at), '[]'::jsonb)
                       from public.circle_cheers ch join public.profiles p on p.id = ch.from_id
                      where ch.to_id = uid and ch.circle_id = cid and ch.created_at > now() - interval '24 hours'),
    'members', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'key', m.member_key,
               'name', coalesce(p.display_name, 'Someone'),
               'me', m.user_id = uid,
               'shares', m.shares,
               'cheered', exists (select 1 from public.circle_cheers ch
                                   where ch.from_id = uid and ch.to_id = m.user_id and ch.day = me_today),
               'today', case when m.shares or m.user_id = uid then (
                   select jsonb_build_object(
                     'planned', count(i.id) filter (where i.status <> 'rescheduled'),
                     'done', count(i.id) filter (where i.status = 'done'),
                     'partial', count(i.id) filter (where i.status = 'partial'),
                     'closed', bool_or(d.reviewed_at is not null))
                     from public.daily_plans d left join public.plan_items i on i.daily_plan_id = d.id
                    where d.user_id = m.user_id and d.date = public.user_today(m.user_id) and d.committed_at is not null)
                 else null end,
               'focus_minutes', case when m.shares or m.user_id = uid then (
                   select coalesce(sum(f.planned_minutes), 0) from public.focus_sessions f
                    where f.user_id = m.user_id
                      and (f.started_at at time zone coalesce(p.timezone, 'UTC'))::date = public.user_today(m.user_id))
                 else null end)
             order by m.joined_at), '[]'::jsonb)
        from public.circle_members m join public.profiles p on p.id = m.user_id
       where m.circle_id = cid));
end;
$$;

revoke execute on function public.create_circle(text), public.preview_circle_invite(text), public.join_circle(text),
  public.leave_circle(), public.set_circle_sharing(boolean), public.send_cheer(uuid), public.circle_overview()
  from public, anon;
grant execute on function public.create_circle(text), public.preview_circle_invite(text), public.join_circle(text),
  public.leave_circle(), public.set_circle_sharing(boolean), public.send_cheer(uuid), public.circle_overview()
  to authenticated;

-- ------------------------------------------------------------------ export: add the new tables
create or replace function public.export_my_data() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := public.require_user();
begin
  return jsonb_build_object(
    'exported_at', now(),
    'profile', (select to_jsonb(p) from public.profiles p where p.id = uid),
    'tasks', (select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at), '[]') from public.tasks t where t.user_id = uid),
    'task_steps', (select coalesce(jsonb_agg(to_jsonb(s) order by s.task_id, s.position), '[]') from public.task_steps s where s.user_id = uid),
    'daily_plans', (select coalesce(jsonb_agg(to_jsonb(d) order by d.date), '[]') from public.daily_plans d where d.user_id = uid),
    'plan_items', (select coalesce(jsonb_agg(to_jsonb(i)), '[]') from public.plan_items i where i.user_id = uid),
    'proofs', (select coalesce(jsonb_agg(to_jsonb(p) - 'storage_path' order by p.server_created_at), '[]') from public.proofs p where p.user_id = uid),
    'points_ledger', (select coalesce(jsonb_agg(to_jsonb(l) order by l.id), '[]') from public.points_ledger l where l.user_id = uid),
    'focus_sessions', (select coalesce(jsonb_agg(to_jsonb(f) order by f.started_at), '[]') from public.focus_sessions f where f.user_id = uid),
    'tamper_events', (select coalesce(jsonb_agg(to_jsonb(e) order by e.created_at), '[]') from public.tamper_events e where e.user_id = uid),
    'blocklist', (select to_jsonb(b) from public.blocklists b where b.user_id = uid),
    'devices', (select coalesce(jsonb_agg(to_jsonb(v) - 'push_token' - 'secret_hash'), '[]') from public.devices v where v.user_id = uid),
    'kind_acts', (select coalesce(jsonb_agg(to_jsonb(k) order by k.created_at), '[]') from public.kind_acts k where k.user_id = uid),
    'pledges', (select coalesce(jsonb_agg(to_jsonb(p) order by p.created_at), '[]') from public.pledges p where p.user_id = uid),
    'partner_pledges_paid', (select coalesce(jsonb_agg(to_jsonb(p) order by p.created_at), '[]') from public.partner_pledges p where p.payer_id = uid),
    'makeup_steps', (select coalesce(jsonb_agg(to_jsonb(m) order by m.created_at), '[]') from public.makeup_steps m where m.user_id = uid),
    'circle', (select jsonb_build_object('name', c.name, 'joined_at', m.joined_at, 'shares', m.shares)
                 from public.circle_members m join public.circles c on c.id = m.circle_id where m.user_id = uid),
    'cheers_sent', (select coalesce(jsonb_agg(jsonb_build_object('day', ch.day, 'created_at', ch.created_at) order by ch.created_at), '[]')
                      from public.circle_cheers ch where ch.from_id = uid),
    'feedback', (select coalesce(jsonb_agg(to_jsonb(f) order by f.id), '[]') from public.feedback f where f.user_id = uid),
    'verifications_given', (select coalesce(jsonb_agg(to_jsonb(v) order by v.created_at), '[]') from public.verifications v where v.verifier_id = uid),
    'partnership', (select to_jsonb(b) - 'invite_code' from public.buddy_links b
                     where b.status in ('pending', 'active') and (b.requester_id = uid or b.partner_id = uid) limit 1)
  );
end;
$$;
