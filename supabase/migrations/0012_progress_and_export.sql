-- Progress (D23): badges, a private mood trend and "days you helped" for the signed-in person,
-- all computed from existing tables on request. Nothing is stored, ranked, rated or shown to anyone else.
-- Also: export_my_data(), so people can download everything Sparrow holds about them.

create function public.my_progress(p_days int default 14) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := public.require_user();
  n int := least(greatest(coalesce(p_days, 14), 1), 60);
  best int := 0;
  helped int := 0;
  kinds int := 0;
  badges text[] := '{}';
  mood jsonb;
begin
  -- Longest run of consecutive reviewed days where something was done or partly done
  -- (any credit keeps a run alive: one miss never resets the day to zero).
  select coalesce(max(len), 0) into best from (
    select count(*) as len from (
      select d, d - (row_number() over (order by d))::int as grp from (
        select p.date as d from public.daily_plans p
         where p.user_id = uid and p.reviewed_at is not null
           and exists (select 1 from public.plan_items i where i.daily_plan_id = p.id and i.status in ('done', 'partial'))
      ) credited
    ) g group by grp
  ) runs;

  select count(*) into kinds from public.kind_acts where user_id = uid;

  select count(distinct d) into helped from (
    select (v.created_at at time zone coalesce((select timezone from public.profiles where id = uid), 'UTC'))::date as d
      from public.verifications v where v.verifier_id = uid
    union
    select (r.decided_at at time zone coalesce((select timezone from public.profiles where id = uid), 'UTC'))::date
      from public.end_requests r where r.decided_by = uid and r.decided_at is not null
  ) x;

  if exists (select 1 from public.daily_plans where user_id = uid and committed_at is not null) then badges := array_append(badges, 'first_plan'); end if;
  if exists (
    select 1 from public.daily_plans p where p.user_id = uid and p.reviewed_at is not null
       and (select count(*) from public.plan_items i where i.daily_plan_id = p.id and i.status <> 'rescheduled') > 0
       and not exists (select 1 from public.plan_items i where i.daily_plan_id = p.id and i.status not in ('done', 'rescheduled'))
  ) then badges := array_append(badges, 'first_full_day'); end if;
  if best >= 3 then badges := array_append(badges, 'run_3'); end if;
  if best >= 7 then badges := array_append(badges, 'run_7'); end if;
  if exists (select 1 from public.proofs where user_id = uid) then badges := array_append(badges, 'first_proof'); end if;
  if exists (select 1 from public.focus_sessions where user_id = uid and not ended_early and ends_at <= now()) then badges := array_append(badges, 'first_focus'); end if;
  if kinds > 0 then badges := array_append(badges, 'first_kind_act'); end if;
  if helped > 0 then badges := array_append(badges, 'helped_partner'); end if;

  select coalesce(jsonb_agg(jsonb_build_object('date', t.date, 'morning', t.mood_morning, 'evening', t.mood_evening) order by t.date), '[]'::jsonb)
    into mood
    from (select date, mood_morning, mood_evening from public.daily_plans
           where user_id = uid and (mood_morning is not null or mood_evening is not null)
           order by date desc limit n) t;

  return jsonb_build_object('badges', to_jsonb(badges), 'best_run', best, 'helping_days', helped,
                            'kind_acts', kinds, 'mood', mood, 'balance', public.points_balance());
end;
$$;

-- Every query below filters by the caller explicitly, so a partner's shared proofs (which RLS
-- lets you read) are never mixed into your export. Device push tokens and
-- storage paths of photos are left out; photos themselves are not part of this export.
create function public.export_my_data() returns jsonb
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
    'devices', (select coalesce(jsonb_agg(to_jsonb(v) - 'push_token'), '[]') from public.devices v where v.user_id = uid),
    'kind_acts', (select coalesce(jsonb_agg(to_jsonb(k) order by k.created_at), '[]') from public.kind_acts k where k.user_id = uid),
    'feedback', (select coalesce(jsonb_agg(to_jsonb(f) order by f.id), '[]') from public.feedback f where f.user_id = uid),
    'verifications_given', (select coalesce(jsonb_agg(to_jsonb(v) order by v.created_at), '[]') from public.verifications v where v.verifier_id = uid),
    'partnership', (select to_jsonb(b) - 'invite_code' from public.buddy_links b
                     where b.status in ('pending', 'active') and (b.requester_id = uid or b.partner_id = uid) limit 1)
  );
end;
$$;

-- Only signed-in people can call these (anonymous visitors have no data to show).
revoke execute on function public.my_progress(int), public.export_my_data() from public, anon;
grant execute on function public.my_progress(int), public.export_my_data() to authenticated;
