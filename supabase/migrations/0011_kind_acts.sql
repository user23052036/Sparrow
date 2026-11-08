-- Kind act (D22): the brief's "turn a miss into a prosocial action", without any money (D1).
-- After a reviewed day that had something that didn't happen, the person can log one small
-- kind thing they did for someone. It earns a few points (less than finishing a task, so
-- nobody gains by missing on purpose) and is allowed once per day. Nothing is shared.
create table public.kind_acts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  plan_id uuid not null references public.daily_plans (id) on delete cascade,
  note text check (char_length(trim(note)) between 1 and 200),
  created_at timestamptz not null default now(),
  unique (plan_id)
);
alter table public.kind_acts enable row level security;
create policy kind_acts_select_own on public.kind_acts for select using (user_id = auth.uid());
-- no insert/update/delete policies: rows are written only by log_kind_act()

-- Rules mirrored in packages/shared/src/scoring.ts (KIND_ACT_POINTS).
create function public.log_kind_act(p_plan_id uuid, p_note text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.require_user(); plan public.daily_plans; ins uuid; pts constant int := 5;
begin
  select * into plan from public.daily_plans where id = p_plan_id and user_id = uid for update;
  if plan.id is null then raise exception 'plan not found'; end if;
  if plan.reviewed_at is null then raise exception 'look back at the day first'; end if;
  if not exists (select 1 from public.plan_items where daily_plan_id = plan.id and status = 'missed') then
    raise exception 'a kind act is for a day when something didn''t happen';
  end if;
  insert into public.kind_acts (user_id, plan_id, note)
    values (uid, plan.id, nullif(left(trim(coalesce(p_note, '')), 200), ''))
    on conflict (plan_id) do nothing
    returning id into ins;
  if ins is null then
    return jsonb_build_object('points', 0, 'already', true);
  end if;
  insert into public.points_ledger (user_id, delta, reason, ref_id) values (uid, pts, 'kind_act', plan.id);
  return jsonb_build_object('points', pts, 'already', false);
end;
$$;
