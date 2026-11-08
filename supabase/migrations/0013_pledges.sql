-- Charity pledges in PRACTICE MODE (D25). The brief's "set aside a small amount; if you miss,
-- it goes to charity" rule, built so every rule can be tried and measured while NO MONEY MOVES.
-- `pledges.mode` can only be 'practice' (check constraint). Charging real money is a separate,
-- later step that needs a payment provider, a legal review and a new migration (docs/PAYMENTS.md).
--
-- Safeguards enforced here, not in the UI:
--  * only with Gentle Mode off, never on a lighter day, never after a Heavy/Low morning mood
--  * small caps, and raising the amount is gradual (cooling-off): see pledge_limit()
--  * set once, before anything is done that day, after the person confirms they understand
--  * settled by the server when the day is reviewed, in proportion to what was done
--    (partly done counts: one miss never costs the whole pledge)

create table public.charities (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 2 and 80),
  blurb text check (char_length(blurb) <= 280),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.charities enable row level security;
-- Signed-in people can read active charities. Only the project owner adds or retires them.
create policy charities_select on public.charities for select to authenticated using (active);

create table public.pledges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  plan_id uuid not null unique references public.daily_plans (id) on delete cascade,
  charity_id uuid not null references public.charities (id),
  amount int not null check (amount between 1 and 100),
  currency text not null default 'INR' check (currency = 'INR'),
  mode text not null default 'practice' check (mode = 'practice'),
  status text not null default 'set' check (status in ('set', 'cleared', 'owed')),
  owed int not null default 0 check (owed >= 0),
  created_at timestamptz not null default now(),
  settled_at timestamptz
);
create index on public.pledges (user_id, created_at);
alter table public.pledges enable row level security;
create policy pledges_select_own on public.pledges for select using (user_id = auth.uid());
-- no insert/update/delete policies: pledges are written only by set_pledge() and the settlement trigger

-- How much may be pledged today. Starts small and rises with use (twice the largest pledge of the
-- last 14 days), capped at 100. Mirrored in packages/shared/src/pledge.ts.
create function public._pledge_limit(uid uuid) returns int
language sql stable security definer set search_path = '' as $$
  select case
           when m.biggest is null then 20
           else least(100, greatest(20, 2 * m.biggest))
         end
    from (select max(amount) as biggest from public.pledges
           where user_id = uid and created_at > now() - interval '14 days') m;
$$;
revoke execute on function public._pledge_limit(uuid) from public, anon, authenticated;

create function public.pledge_limit() returns int
language plpgsql stable security definer set search_path = '' as $$
begin
  return public._pledge_limit(public.require_user());
end;
$$;

create function public.set_pledge(p_amount int, p_charity_id uuid, p_understood boolean default false)
returns public.pledges
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.require_user();
  plan public.daily_plans := public.get_today();
  gentle boolean; light date; lim int; pl public.pledges;
begin
  if not coalesce(p_understood, false) then raise exception 'please confirm you understand how a pledge works'; end if;
  if plan.committed_at is null then raise exception 'plan your day first'; end if;
  if plan.reviewed_at is not null then raise exception 'today is already closed'; end if;
  if exists (select 1 from public.plan_items where daily_plan_id = plan.id and status <> 'pending') then
    raise exception 'a pledge has to be set before you start the day''s tasks';
  end if;
  if exists (select 1 from public.pledges where plan_id = plan.id) then raise exception 'you already set a pledge today'; end if;
  select gentle_mode, light_day into gentle, light from public.profiles where id = uid;
  if gentle then raise exception 'pledges are off while Gentle Mode is on'; end if;
  if light = plan.date then raise exception 'you asked for a lighter day, so no pledge today'; end if;
  if plan.mood_morning is not null and plan.mood_morning <= 2 then raise exception 'let''s keep today light: no pledge on a heavy morning'; end if;
  if p_amount is null or p_amount < 1 then raise exception 'choose an amount of at least 1'; end if;
  lim := public._pledge_limit(uid);
  if p_amount > lim then raise exception 'you can raise your pledge gradually: up to % today', lim; end if;
  if not exists (select 1 from public.charities where id = p_charity_id and active) then raise exception 'choose a charity from the list'; end if;
  insert into public.pledges (user_id, plan_id, charity_id, amount) values (uid, plan.id, p_charity_id, p_amount) returning * into pl;
  return pl;
end;
$$;

-- Settlement happens in a trigger so review_day() stays as it is: when a plan becomes reviewed,
-- its pledge is cleared in proportion to the day's completion (same rule as the points stake).
create function public._settle_pledge() returns trigger
language plpgsql security definer set search_path = '' as $$
declare n_count int; n_done int; n_partial int; completion numeric; pl public.pledges; keep int;
begin
  select * into pl from public.pledges where plan_id = new.id and status = 'set' for update;
  if pl.id is null then return new; end if;
  select count(*) filter (where status <> 'rescheduled'), count(*) filter (where status = 'done'), count(*) filter (where status = 'partial')
    into n_count, n_done, n_partial from public.plan_items where daily_plan_id = new.id;
  completion := case when n_count = 0 then 1 else (n_done + 0.5 * n_partial) / n_count end;
  keep := floor(pl.amount * completion);
  update public.pledges
     set owed = pl.amount - keep, status = case when pl.amount - keep = 0 then 'cleared' else 'owed' end, settled_at = now()
   where id = pl.id;
  return new;
end;
$$;
revoke execute on function public._settle_pledge() from public, anon, authenticated;
create trigger daily_plans_settle_pledge after update of reviewed_at on public.daily_plans
  for each row when (old.reviewed_at is null and new.reviewed_at is not null)
  execute function public._settle_pledge();

-- Founder-only numbers from the brief: conversion to stakes, average pledge, practice donation total.
create function public.pledge_metrics(p_days int default 30) returns jsonb
language sql stable security definer set search_path = '' as $$
  with w as (select (now() - make_interval(days => greatest(p_days, 1)))::date as since),
  plans as (select p.id, p.user_id from public.daily_plans p, w where p.committed_at is not null and p.date >= w.since),
  pl as (select pl.* from public.pledges pl join plans on plans.id = pl.plan_id)
  select jsonb_build_object(
    'planned_days', (select count(*) from plans),
    'pledged_days', (select count(*) from pl),
    'conversion_to_pledge', (select case when count(*) = 0 then null else round((select count(*) from pl)::numeric / count(*), 3) end from plans),
    'avg_pledge', (select round(avg(amount), 1) from pl),
    'practice_total_pledged', (select coalesce(sum(amount), 0) from pl),
    'practice_total_owed', (select coalesce(sum(owed), 0) from pl),
    'mode', 'practice');
$$;
revoke execute on function public.pledge_metrics(int) from public, anon, authenticated;
