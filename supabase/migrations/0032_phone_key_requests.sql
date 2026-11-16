-- Partner requests on Android (ROADMAP T3.2, D46).
-- A key holder whose phone runs Sparrow's blocking engine hears about a request to end a locked session on that
-- phone too: device_sync() now also lists the requests waiting on this phone's owner, and the native service
-- posts a local notification with "Let them out" and "Keep going". The phone answers with its own narrow
-- credential (device id + secret, 0020), never with the person's sign-in.

-- The phone behind a device id and secret, or an error (the app then asks the person to sign in again).
create function public._device_by_secret(p_device_id uuid, p_secret text) returns public.devices
language plpgsql stable security definer set search_path = '' as $$
declare d public.devices;
begin
  select * into d from public.devices where id = p_device_id;
  if d.id is null or d.secret_hash is null or p_secret is null
     or d.secret_hash <> encode(sha256(convert_to(p_secret, 'UTF8')), 'hex') then
    raise exception 'this phone needs to sign in again' using errcode = '28000';
  end if;
  return d;
end;
$$;

-- Requests the person holds the key for, still waiting on a running session, outside their quiet hours (0031):
-- the same moments a notification would reach them anywhere else. Only ids: a lock screen is not private.
-- Runs on every phone's sync, so it starts from the holder's own links (is_buddy_of's rule, 0001), not from
-- every waiting request.
create index end_requests_pending_user on public.end_requests (user_id) where status = 'pending';

create function public._waiting_key_requests(p_holder uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  with askers as (
    select b.requester_id as id from public.buddy_links b where b.status = 'active' and b.partner_id = p_holder
    union
    select b.partner_id from public.buddy_links b where b.status = 'active' and b.mutual and b.requester_id = p_holder
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', r.id) order by r.created_at), '[]'::jsonb)
    from askers a
    join public.end_requests r on r.user_id = a.id and r.status = 'pending'
    join public.focus_sessions s on s.id = r.session_id
   where s.ended_at is null and s.ends_at > now()
     and public._holder_quiet_until(r.user_id, now()) is null;
$$;

-- 0021's function with one more field, `key_requests`.
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
    'domains', coalesce(to_jsonb(doms), '[]'::jsonb),
    'key_requests', public._waiting_key_requests(d.user_id));
end;
$$;

-- The phone's answer: the same rules as decide_end_request (0005), as the phone's owner.
create function public.device_decide_end_request(p_device_id uuid, p_secret text, p_request_id uuid, p_approve boolean)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare d public.devices := public._device_by_secret(p_device_id, p_secret); r public.end_requests;
begin
  select * into r from public.end_requests where id = p_request_id and status = 'pending' for update;
  if r.id is null or not public.is_buddy_of(r.user_id, d.user_id) then raise exception 'request not found'; end if;
  if p_approve then
    update public.focus_sessions
       set ended_at = now(), ended_early = true, locked = false,
           exit_reason = left('approved by partner: ' || r.reason, 300)
     where id = r.session_id and ended_at is null;
    insert into public.tamper_events (user_id, focus_session_id, kind, detail)
      values (r.user_id, r.session_id, 'early_exit', left('partner approved: ' || r.reason, 300));
  end if;
  update public.end_requests
     set status = case when p_approve then 'approved' else 'denied' end, decided_by = d.user_id, decided_at = now()
   where id = r.id returning * into r;
  return jsonb_build_object('id', r.id, 'status', r.status);
end;
$$;

-- Signing out on the phone: its secret stops working on the server too, not only on the phone (D29's narrow
-- credential can now also answer a key request, so it shouldn't outlive the sign-in).
create function public.forget_device_secret(p_device_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.require_user();
begin
  update public.devices set secret_hash = null where id = p_device_id and user_id = uid;
end;
$$;

-- For the notify function only (service_role): after a phone answered, who should hear about it, once.
-- Mirrors the key_answer rule for signed-in callers; the asker's own extensions wake up too (D44).
create function public.claim_device_push(p_device_id uuid, p_secret text, p_kind text, p_ref uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare d public.devices := public._device_by_secret(p_device_id, p_secret); target uuid;
begin
  if p_kind <> 'key_answer' then raise exception 'unknown kind of notification'; end if;
  select r.user_id into target
    from public.end_requests r where r.id = p_ref and r.decided_by = d.user_id and r.status in ('approved', 'denied');
  if target is null then return null; end if;
  insert into public.push_sent (kind, ref) values (p_kind, p_ref) on conflict do nothing;
  if not found then return null; end if;
  return jsonb_build_object('to', 'user', 'id', target);
end;
$$;

-- Also in this migration (found reviewing T3.1): every stored file must be in its author's own folder, not only
-- recordings (0018). A shared proof lets the partner read the file its row names (0003), so a row naming
-- someone else's file could otherwise open that file to the partner. Otherwise as in 0023.
create or replace function public.proofs_force_server_fields()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.user_id := auth.uid();
  new.server_created_at := now();
  if tg_op = 'INSERT' then
    new.flagged_similar := new.image_phash is not null and exists (
      select 1 from public.proofs p
      where p.user_id = new.user_id and p.image_phash is not null
        and bit_count(('x' || p.image_phash)::bit(64) # ('x' || new.image_phash)::bit(64)) <= 5);
    if new.storage_path is not null and split_part(new.storage_path, '/', 1) <> new.user_id::text then
      raise exception 'proof files are stored in your own folder';
    end if;
  end if;
  if tg_op = 'UPDATE' then
    -- only visibility may change after creation
    new.kind := old.kind; new.storage_path := old.storage_path; new.text_body := old.text_body;
    new.image_phash := old.image_phash; new.flagged_similar := old.flagged_similar;
    new.plan_item_id := old.plan_item_id; new.server_created_at := old.server_created_at;
    new.duration_s := old.duration_s; new.photo_age_hours := old.photo_age_hours;
  end if;
  return new;
end;
$$;

revoke execute on function public._device_by_secret(uuid, text), public._waiting_key_requests(uuid) from public, anon, authenticated;
revoke execute on function public.device_decide_end_request(uuid, text, uuid, boolean) from public;
grant execute on function public.device_decide_end_request(uuid, text, uuid, boolean) to anon, authenticated;
revoke execute on function public.forget_device_secret(uuid) from public, anon;
grant execute on function public.forget_device_secret(uuid) to authenticated;
revoke execute on function public.claim_device_push(uuid, text, text, uuid) from public, anon, authenticated;
grant execute on function public.claim_device_push(uuid, text, text, uuid) to service_role;
