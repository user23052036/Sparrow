-- Micro-task stake (D26): a stake that costs effort, not points or money.
-- In the morning a person can choose "if something doesn't happen today, I'll do one extra
-- five-minute step tomorrow". When the day is reviewed with at least one missed task, the server
-- adds ONE make-up step for the next day (never more than one per day, so it cannot snowball).
-- The make-up step can be done, or let go on purpose. Letting go is allowed and recorded only for
-- the person themselves: this is a nudge they chose, not a debt.
-- Same safeguards as the points stake: off in Gentle Mode and on a lighter day.

alter table public.daily_plans drop constraint daily_plans_stake_type_check;
alter table public.daily_plans add constraint daily_plans_stake_type_check
  check (stake_type in ('none', 'points', 'micro_task'));

create table public.makeup_steps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  from_plan_id uuid not null unique references public.daily_plans (id) on delete cascade,
  due_on date not null,
  title text not null check (char_length(title) between 1 and 120),
  status text not null default 'owed' check (status in ('owed', 'done', 'let_go')),
  settled_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.makeup_steps (user_id, status);
alter table public.makeup_steps enable row level security;
create policy makeup_select_own on public.makeup_steps for select using (user_id = auth.uid());
-- no insert/update/delete policies: written only by the trigger and the functions below

-- commit_day gains p_micro. The old three-argument version is replaced (named-argument calls
-- without p_micro keep working through the default).
drop function public.commit_day(uuid[], int, int);
create function public.commit_day(p_task_ids uuid[], p_mood int, p_stake int default 0, p_micro boolean default false)
returns public.daily_plans
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.require_user();
  plan public.daily_plans := public.get_today();
  gentle boolean;
  light date;
  n int := coalesce(cardinality(p_task_ids), 0);
  micro boolean := coalesce(p_micro, false);
begin
  if plan.committed_at is not null then raise exception 'today is already planned'; end if;
  select gentle_mode, light_day into gentle, light from public.profiles where id = uid;
  if light = plan.date and n > 2 then raise exception 'you asked for a lighter day: pick one or two tasks'; end if;
  if n < 1 or n > 5 then raise exception 'pick between one and five tasks'; end if;
  if p_mood is not null and (p_mood < 1 or p_mood > 5) then raise exception 'mood must be 1-5'; end if;
  if (select count(*) from public.tasks t
      where t.id = any (p_task_ids) and t.user_id = uid and not t.archived) <> n then
    raise exception 'unknown task';
  end if;

  p_stake := coalesce(p_stake, 0);
  if gentle or light = plan.date then p_stake := 0; micro := false; end if;
  if p_stake < 0 or p_stake > 50 then raise exception 'stake must be 0-50 points'; end if;
  if p_stake > 0 and micro then raise exception 'choose one kind of stake: points or a make-up step'; end if;
  if p_stake > public.points_balance() then raise exception 'not enough points for that stake'; end if;

  insert into public.plan_items (daily_plan_id, user_id, task_id)
    select plan.id, uid, unnest(p_task_ids);

  update public.daily_plans
     set committed_at = now(), mood_morning = p_mood,
         stake_type = case when p_stake > 0 then 'points' when micro then 'micro_task' else 'none' end,
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
revoke execute on function public.commit_day(uuid[], int, int, boolean) from public, anon;
grant execute on function public.commit_day(uuid[], int, int, boolean) to authenticated;

-- When a micro-task day is reviewed with something missed, add one make-up step for the next day.
-- The step's title names the first missed task so it is concrete ("5 minutes on: Write 200 words").
create function public._settle_micro_stake() returns trigger
language plpgsql security definer set search_path = '' as $$
declare missed_title text;
begin
  if new.stake_type <> 'micro_task' then return new; end if;
  select t.title into missed_title
    from public.plan_items i join public.tasks t on t.id = i.task_id
   where i.daily_plan_id = new.id and i.status = 'missed'
   order by t.created_at limit 1;
  if missed_title is null then return new; end if;
  insert into public.makeup_steps (user_id, from_plan_id, due_on, title)
    values (new.user_id, new.id, new.date + 1, left('5 minutes on: ' || missed_title, 120))
    on conflict (from_plan_id) do nothing;
  return new;
end;
$$;
revoke execute on function public._settle_micro_stake() from public, anon, authenticated;
create trigger daily_plans_settle_micro after update of reviewed_at on public.daily_plans
  for each row when (old.reviewed_at is null and new.reviewed_at is not null)
  execute function public._settle_micro_stake();

-- Settle a make-up step: 'done' or 'let_go'. Only steps that are due (today or earlier, in the
-- person's time zone) can be marked done, so it can't be cleared before the day it belongs to.
create function public.settle_makeup_step(p_id uuid, p_outcome text) returns public.makeup_steps
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.require_user(); m public.makeup_steps;
begin
  if p_outcome not in ('done', 'let_go') then raise exception 'choose done or let go'; end if;
  select * into m from public.makeup_steps where id = p_id and user_id = uid for update;
  if m.id is null then raise exception 'make-up step not found'; end if;
  if m.status <> 'owed' then return m; end if;
  if p_outcome = 'done' and m.due_on > public.user_today(uid) then
    raise exception 'this step is for %', to_char(m.due_on, 'FMDay');
  end if;
  update public.makeup_steps set status = p_outcome, settled_at = now() where id = m.id returning * into m;
  return m;
end;
$$;
revoke execute on function public.settle_makeup_step(uuid, text) from public, anon;
grant execute on function public.settle_makeup_step(uuid, text) to authenticated;
