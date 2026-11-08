-- Controls for the rating, and a fuller data export (D25).

create function public.set_share_rating(p_on boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.require_user();
begin
  update public.profiles set share_rating = coalesce(p_on, false) where id = uid;
  return public._rating_of(uid);
end;
$$;
revoke execute on function public.set_share_rating(boolean) from public, anon;
grant execute on function public.set_share_rating(boolean) to authenticated;

-- The export now also holds the person's own pledges, practice partner pledges they paid, and leaderboard settings.
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
    'devices', (select coalesce(jsonb_agg(to_jsonb(v) - 'push_token'), '[]') from public.devices v where v.user_id = uid),
    'kind_acts', (select coalesce(jsonb_agg(to_jsonb(k) order by k.created_at), '[]') from public.kind_acts k where k.user_id = uid),
    'pledges', (select coalesce(jsonb_agg(to_jsonb(p) order by p.created_at), '[]') from public.pledges p where p.user_id = uid),
    'partner_pledges_paid', (select coalesce(jsonb_agg(to_jsonb(p) order by p.created_at), '[]') from public.partner_pledges p where p.payer_id = uid),
    'feedback', (select coalesce(jsonb_agg(to_jsonb(f) order by f.id), '[]') from public.feedback f where f.user_id = uid),
    'verifications_given', (select coalesce(jsonb_agg(to_jsonb(v) order by v.created_at), '[]') from public.verifications v where v.verifier_id = uid),
    'partnership', (select to_jsonb(b) - 'invite_code' from public.buddy_links b
                     where b.status in ('pending', 'active') and (b.requester_id = uid or b.partner_id = uid) limit 1)
  );
end;
$$;
