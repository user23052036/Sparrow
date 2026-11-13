-- Circle names (D31): the "anonymous option" for circles from the plan's Phase 2.
-- A member can go by a made-up name inside their circle instead of their profile name. The circle
-- then never learns the profile name: the alias is what circle_overview() and cheers show. It can
-- be chosen when creating or joining (so the real name is never shown first) and changed or
-- cleared later. Everything else about circles (0019, D28) is unchanged.

alter table public.circle_members
  add column alias text check (alias ~ '^[A-Za-z0-9][A-Za-z0-9 _-]{0,18}[A-Za-z0-9]$');

-- Trims and validates; null or blank means "use my profile name".
create function public._circle_alias(p_alias text) returns text
language plpgsql immutable set search_path = '' as $$
declare a text := nullif(regexp_replace(trim(coalesce(p_alias, '')), '\s+', ' ', 'g'), '');
begin
  if a is null then return null; end if;
  if a !~ '^[A-Za-z0-9][A-Za-z0-9 _-]{0,18}[A-Za-z0-9]$' then
    raise exception 'a circle name is 2 to 20 letters, numbers, spaces, - or _';
  end if;
  return a;
end;
$$;
revoke execute on function public._circle_alias(text) from public, anon, authenticated;

-- Nobody may take a name another member of the same circle is already shown as.
create function public._circle_name_taken(p_circle uuid, p_uid uuid, p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.circle_members m join public.profiles p on p.id = m.user_id
     where m.circle_id = p_circle and m.user_id <> p_uid
       and lower(coalesce(m.alias, p.display_name, 'Someone')) = lower(p_name));
$$;
revoke execute on function public._circle_name_taken(uuid, uuid, text) from public, anon, authenticated;

drop function public.create_circle(text);
create function public.create_circle(p_name text, p_alias text default null) returns public.circles
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.require_user(); c public.circles; a text := public._circle_alias(p_alias);
begin
  if public._circle_of(uid) is not null then raise exception 'you are already in a circle'; end if;
  if p_name is null or char_length(trim(p_name)) not between 1 and 40 then raise exception 'give the circle a short name (up to 40 letters)'; end if;
  insert into public.circles (name, created_by) values (trim(p_name), uid) returning * into c;
  insert into public.circle_members (circle_id, user_id, alias) values (c.id, uid, a);
  return c;
end;
$$;

drop function public.join_circle(text);
create function public.join_circle(p_code text, p_alias text default null) returns public.circles
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.require_user(); c public.circles; n int; a text := public._circle_alias(p_alias);
begin
  -- the row lock serialises joins, so two people can't both take the last seat (or the same name)
  select * into c from public.circles where invite_code = lower(trim(p_code)) for update;
  if c.id is null then raise exception 'this circle link isn''t valid anymore'; end if;
  if public._circle_of(uid) is not null then raise exception 'you are already in a circle'; end if;
  select count(*) into n from public.circle_members where circle_id = c.id;
  if n >= 4 then raise exception 'this circle is full (four people)'; end if;
  if a is not null and public._circle_name_taken(c.id, uid, a) then
    raise exception 'someone in this circle already goes by that name';
  end if;
  insert into public.circle_members (circle_id, user_id, alias) values (c.id, uid, a);
  return c;
end;
$$;

-- Change or clear (null / blank) my circle name. Returns the name the circle now sees.
create function public.set_circle_alias(p_alias text) returns text
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.require_user(); cid uuid := public._circle_of(uid); a text := public._circle_alias(p_alias); shown text;
begin
  if cid is null then raise exception 'you are not in a circle'; end if;
  perform 1 from public.circles where id = cid for update;
  if a is not null and public._circle_name_taken(cid, uid, a) then
    raise exception 'someone in this circle already goes by that name';
  end if;
  update public.circle_members set alias = a where user_id = uid;
  select coalesce(a, p.display_name, 'Someone') into shown from public.profiles p where p.id = uid;
  return shown;
end;
$$;

-- Same as 0019, except every name shown to the circle is the member's circle name when they set one.
create or replace function public.circle_overview() returns jsonb
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
    'my_alias', (select alias from public.circle_members where user_id = uid),
    'cheers_today', (select coalesce(jsonb_agg(coalesce(fm.alias, p.display_name, 'Someone') order by ch.created_at), '[]'::jsonb)
                       from public.circle_cheers ch
                       join public.profiles p on p.id = ch.from_id
                       left join public.circle_members fm on fm.user_id = ch.from_id and fm.circle_id = cid
                      where ch.to_id = uid and ch.circle_id = cid and ch.created_at > now() - interval '24 hours'),
    'members', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'key', m.member_key,
               'name', coalesce(m.alias, p.display_name, 'Someone'),
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

revoke execute on function public.create_circle(text, text), public.join_circle(text, text), public.set_circle_alias(text)
  from public, anon;
grant execute on function public.create_circle(text, text), public.join_circle(text, text), public.set_circle_alias(text)
  to authenticated;

-- ------------------------------------------------------------------ export: my circle name
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
    'circle', (select jsonb_build_object('name', c.name, 'joined_at', m.joined_at, 'shares', m.shares, 'alias', m.alias)
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
