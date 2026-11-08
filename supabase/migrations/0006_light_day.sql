-- M7: "keep this day light". The user can ask for a smaller day (after a low
-- mood check-in or a heavy stretch). The database then enforces it: at most two
-- tasks and no stake. It is the user's own switch; they can clear it any time
-- (profiles is editable by its owner), so it is a kindness, not a lock.
alter table public.profiles add column light_day date;

create or replace function public.commit_day(p_task_ids uuid[], p_mood int, p_stake int default 0)
returns public.daily_plans
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := public.require_user();
  plan public.daily_plans := public.get_today();
  gentle boolean;
  light date;
  n int := coalesce(cardinality(p_task_ids), 0);
begin
  if plan.committed_at is not null then raise exception 'today is already planned'; end if;
  select gentle_mode, light_day into gentle, light from public.profiles where id = uid;
  -- A day the user asked to keep light: at most two tasks and no stake.
  if light = plan.date and n > 2 then raise exception 'you asked for a lighter day: pick one or two tasks'; end if;
  if n < 1 or n > 5 then raise exception 'pick between one and five tasks'; end if;
  if p_mood is not null and (p_mood < 1 or p_mood > 5) then raise exception 'mood must be 1-5'; end if;
  if (select count(*) from public.tasks t
      where t.id = any (p_task_ids) and t.user_id = uid and not t.archived) <> n then
    raise exception 'unknown task';
  end if;

  p_stake := coalesce(p_stake, 0);
  if gentle or light = plan.date then p_stake := 0; end if;
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
