-- M5b-5 (D30): website blocking on the phone.
-- The phone's local DNS filter needs the person's site list as well as the app list, so
-- device_sync() now also returns `domains`. Nothing else changes: same credential (device id +
-- secret), same heartbeat, and the list still cannot shrink during a session (0020).

create or replace function public.device_sync(p_device_id uuid, p_secret text, p_protection boolean default true, p_asleep boolean default false)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare d public.devices; s public.focus_sessions; pkgs text[]; doms text[]; task text;
begin
  select * into d from public.devices where id = p_device_id for update;
  if d.id is null or d.secret_hash is null or p_secret is null
     or d.secret_hash <> encode(sha256(convert_to(p_secret, 'UTF8')), 'hex') then
    raise exception 'this phone needs to sign in again' using errcode = '28000';
  end if;
  update public.devices
     set last_heartbeat_at = now(), protection_enabled = coalesce(p_protection, true), asleep = coalesce(p_asleep, false)
   where id = d.id;
  perform public._record_heartbeat_events(d.user_id);

  select * into s from public.focus_sessions
   where user_id = d.user_id and ended_at is null and ends_at > now()
   order by started_at desc limit 1;
  select android_packages, domains into pkgs, doms from public.blocklists where user_id = d.user_id;
  if s.plan_item_id is not null then
    select t.title into task from public.plan_items i join public.tasks t on t.id = i.task_id where i.id = s.plan_item_id;
  end if;
  return jsonb_build_object(
    'server_now', now(),
    'active', s.id is not null,
    'session_id', s.id,
    'ends_at', s.ends_at,
    'locked', coalesce(s.locked, false),
    'task', task,
    'packages', coalesce(to_jsonb(pkgs), '[]'::jsonb),
    'domains', coalesce(to_jsonb(doms), '[]'::jsonb));
end;
$$;
revoke execute on function public.device_sync(uuid, text, boolean, boolean) from public;
grant execute on function public.device_sync(uuid, text, boolean, boolean) to anon, authenticated;
