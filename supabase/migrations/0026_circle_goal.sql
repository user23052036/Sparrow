-- Circle goals (D37): the brief's "group challenges", made cooperative. A circle can hold one
-- shared goal at a time: "together, move N planned things forward in the next seven days".
-- It follows the circle's rules (D28): the goal shows ONE number for the whole circle, never who
-- moved how many, so there is nobody to point at. Only members who share their counts are
-- counted. There are no points and no ranking, so padding a day earns nothing. Any member can
-- start a goal or let it go, and a goal that was reached stays reached.

create table public.circle_goals (
  id uuid primary key default gen_random_uuid(),
  circle_id uuid not null references public.circles (id) on delete cascade,
  target int not null check (target between 3 and 100),
  started_at timestamptz not null default now(),
  ends_at timestamptz not null,
  reached_at timestamptz,
  let_go_at timestamptz,
  started_by uuid references auth.users (id) on delete set null
);
create index on public.circle_goals (circle_id, started_at desc);
alter table public.circle_goals enable row level security;
-- Members may read their circle's goals; all writes go through the functions below.
create policy circle_goals_select_member on public.circle_goals for select
  using (exists (select 1 from public.circle_members m where m.circle_id = circle_goals.circle_id and m.user_id = auth.uid()));

-- Planned things moved forward (done or partly done) by sharing members inside the goal's window.
create function public._circle_goal_moved(g public.circle_goals) returns int
language sql stable security definer set search_path = '' as $$
  select count(*)::int
    from public.plan_items i join public.circle_members m on m.user_id = i.user_id
   where m.circle_id = g.circle_id and m.shares
     and i.status in ('done', 'partial')
     and i.completed_at >= g.started_at
     and i.completed_at < least(g.ends_at, coalesce(g.let_go_at, g.ends_at));
$$;
revoke execute on function public._circle_goal_moved(public.circle_goals) from public, anon, authenticated;

-- The goal the Circle page shows: the open one, or the last one for three days after it ended.
create function public.circle_goal() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.require_user(); cid uuid := public._circle_of(uid); g public.circle_goals; n int; moved int;
begin
  if cid is null then return jsonb_build_object('state', 'none', 'can_start', false); end if;
  select count(*) into n from public.circle_members where circle_id = cid;
  select * into g from public.circle_goals where circle_id = cid order by started_at desc limit 1;
  if g.id is null or coalesce(g.let_go_at, g.ends_at) < now() - interval '3 days' then
    return jsonb_build_object('state', 'none', 'can_start', n >= 2, 'suggested', least(greatest(n * 5, 3), 100));
  end if;
  moved := public._circle_goal_moved(g);
  if g.reached_at is null and moved >= g.target then
    update public.circle_goals set reached_at = now() where id = g.id and reached_at is null returning * into g;
  end if;
  return jsonb_build_object(
    'state', case when g.let_go_at is null and g.ends_at > now() then 'open' else 'ended' end,
    'target', g.target,
    'moved', moved,
    'reached', g.reached_at is not null,
    'let_go', g.let_go_at is not null,
    'ends_at', g.ends_at,
    'can_start', n >= 2 and not (g.let_go_at is null and g.ends_at > now()),
    'suggested', least(greatest(n * 5, 3), 100));
end;
$$;

create function public.start_circle_goal(p_target int default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.require_user(); cid uuid := public._circle_of(uid); n int; t int;
begin
  if cid is null then raise exception 'you are not in a circle'; end if;
  perform 1 from public.circles where id = cid for update; -- one open goal per circle
  select count(*) into n from public.circle_members where circle_id = cid;
  if n < 2 then raise exception 'a shared goal needs at least two people in the circle'; end if;
  if exists (select 1 from public.circle_goals where circle_id = cid and let_go_at is null and ends_at > now()) then
    raise exception 'your circle already has a shared goal';
  end if;
  t := coalesce(p_target, n * 5);
  if t < 3 or t > 100 then raise exception 'a shared goal is 3 to 100 things'; end if;
  insert into public.circle_goals (circle_id, target, ends_at, started_by)
    values (cid, t, now() + interval '7 days', uid);
  return public.circle_goal();
end;
$$;

-- Any member can let the open goal go; nobody is held to it.
create function public.let_go_circle_goal() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.require_user(); cid uuid := public._circle_of(uid);
begin
  if cid is null then raise exception 'you are not in a circle'; end if;
  update public.circle_goals set let_go_at = now()
   where circle_id = cid and let_go_at is null and ends_at > now();
  return public.circle_goal();
end;
$$;

revoke execute on function public.circle_goal(), public.start_circle_goal(int), public.let_go_circle_goal() from public, anon;
grant execute on function public.circle_goal(), public.start_circle_goal(int), public.let_go_circle_goal() to authenticated;
