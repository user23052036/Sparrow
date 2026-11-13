-- Export: add what 0024 to 0026 store about a person. A focus link's key hash is left out,
-- like the device secret hash; a circle goal is listed only when the person started it.
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
    'circle_goals_started', (select coalesce(jsonb_agg(jsonb_build_object('target', g.target, 'started_at', g.started_at) order by g.started_at), '[]')
                               from public.circle_goals g where g.started_by = uid),
    'focus_links', (select coalesce(jsonb_agg(to_jsonb(l) - 'key_hash' order by l.created_at), '[]') from public.focus_links l where l.user_id = uid),
    'crafted_badges', (select coalesce(jsonb_agg(to_jsonb(b) - 'user_id' order by b.crafted_at), '[]') from public.crafted_badges b where b.user_id = uid),
    'feedback', (select coalesce(jsonb_agg(to_jsonb(f) order by f.id), '[]') from public.feedback f where f.user_id = uid),
    'verifications_given', (select coalesce(jsonb_agg(to_jsonb(v) order by v.created_at), '[]') from public.verifications v where v.verifier_id = uid),
    'partnership', (select to_jsonb(b) - 'invite_code' from public.buddy_links b
                     where b.status in ('pending', 'active') and (b.requester_id = uid or b.partner_id = uid) limit 1)
  );
end;
$$;
