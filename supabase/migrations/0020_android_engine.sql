-- Android blocking engine support (M5b-2 to M5b-4, D29).
--
-- The phone's AccessibilityService keeps running when the Sparrow app is swiped away, but it
-- cannot safely share the app's Supabase session (refresh tokens rotate, see D9). So each phone
-- gets its own narrow credential: a random device secret, stored hashed here. With it the phone
-- can do exactly one thing, device_sync(): report "I'm alive, protection is on/off, my screen is
-- asleep or awake", and read back whether a focus session is running and which apps to block.
-- That one call is the heartbeat (M5b-4) and the cross-device sync (M5b-3, by polling instead of
-- push, so no Firebase project is needed).
--
-- Screen-off: a phone in a pocket is not tampering. While the screen is off Android may delay
-- network calls for a long time, so the phone says "asleep" before it goes quiet and the server
-- does not count missing heartbeats from an asleep device. Switching protection off is still
-- recorded, asleep or not. Waking the phone (needed to reach Settings) clears "asleep".

alter table public.devices
  add column secret_hash text check (secret_hash ~ '^[0-9a-f]{64}$'),
  add column asleep boolean not null default false;

-- Owner-only: create (or rotate) the secret for one of my devices. Returned once, never stored in clear.
create function public.issue_device_secret(p_device_id uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.require_user(); secret text;
begin
  secret := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  update public.devices set secret_hash = encode(sha256(convert_to(secret, 'UTF8')), 'hex')
   where id = p_device_id and user_id = uid and platform = 'android';
  if not found then raise exception 'register this phone first'; end if;
  return secret;
end;
$$;
revoke execute on function public.issue_device_secret(uuid) from public, anon;
grant execute on function public.issue_device_secret(uuid) to authenticated;

-- Callable WITHOUT a user session (anon key + device id + secret).
create function public.device_sync(p_device_id uuid, p_secret text, p_protection boolean default true, p_asleep boolean default false)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare d public.devices; s public.focus_sessions; pkgs text[]; task text;
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
  select android_packages into pkgs from public.blocklists where user_id = d.user_id;
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
    'packages', coalesce(to_jsonb(pkgs), '[]'::jsonb));
end;
$$;
revoke execute on function public.device_sync(uuid, text, boolean, boolean) from public;
grant execute on function public.device_sync(uuid, text, boolean, boolean) to anon, authenticated;

-- Same as 0005, plus: an asleep device's silence is not "going quiet".
create or replace function public._record_heartbeat_events(p_uid uuid) returns int
language plpgsql security definer set search_path = '' as $$
declare s public.focus_sessions; n int := 0; r record;
begin
  select * into s from public.focus_sessions
   where user_id = p_uid and ended_at is null and ends_at > now() limit 1;
  if s.id is null then return 0; end if;
  for r in
    select d.id,
           case when not d.protection_enabled then 'protection_disabled' else 'heartbeat_lost' end as kind
      from public.devices d
     where d.user_id = p_uid and d.platform in ('extension', 'android')
       and d.last_heartbeat_at > now() - interval '24 hours'
       and (not d.protection_enabled
            or (not d.asleep
                and d.last_heartbeat_at < now() - interval '3 minutes'
                and now() > s.started_at + interval '3 minutes'))
  loop
    if not exists (select 1 from public.tamper_events t
                   where t.focus_session_id = s.id and t.device_id = r.id and t.kind = r.kind) then
      insert into public.tamper_events (user_id, device_id, focus_session_id, kind)
        values (p_uid, r.id, s.id, r.kind);
      n := n + 1;
    end if;
  end loop;
  return n;
end;
$$;
revoke execute on function public._record_heartbeat_events(uuid) from public, anon, authenticated;

-- The authenticated heartbeat (extension, app in the foreground) also wakes the device.
create or replace function public.heartbeat(p_device_id uuid, p_platform text, p_label text default null,
                                            p_protection boolean default true)
returns public.devices
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.require_user(); d public.devices;
begin
  if exists (select 1 from public.devices where id = p_device_id and user_id <> uid) then
    raise exception 'device belongs to another account';
  end if;
  insert into public.devices (id, user_id, platform, label, last_heartbeat_at, protection_enabled)
    values (p_device_id, uid, p_platform, left(p_label, 60), now(), coalesce(p_protection, true))
  on conflict (id) do update
    set last_heartbeat_at = now(),
        label = coalesce(excluded.label, public.devices.label),
        protection_enabled = excluded.protection_enabled,
        asleep = false
  returning * into d;
  return d;
end;
$$;

-- Apps, like sites, can be added but not removed during a running session.
create or replace function public.blocklist_no_shrink_during_focus()
returns trigger language plpgsql set search_path = '' as $$
begin
  if exists (select 1 from public.focus_sessions s
             where s.user_id = old.user_id and s.ended_at is null and s.ends_at > now())
     and not (old.domains <@ new.domains and old.android_packages <@ new.android_packages) then
    raise exception 'sites and apps can be removed after your focus session ends';
  end if;
  return new;
end;
$$;

-- Note: devices is readable by its owner only (0001), so the owner can see their own phone's
-- secret_hash. It is a SHA-256 of 256 random bits and cannot be turned back into the secret.
