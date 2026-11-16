-- Instant start on the laptop (ROADMAP T2.5, D44).
-- The Sparrow extension subscribes to Web Push in its service worker with userVisibleOnly: false (Chrome 121+).
-- Its address is stored here as a silent one: it never gets a notification, only a wake-up after which it asks
-- get_focus_state() at once. The 30-second poll (D10) stays as the fallback. The push carries no data at all.
-- Numbered 0036 because the roadmap gave T2.5 no number and 0032 to 0035 belong to later tasks (D44). Live
-- databases get this before 0032 to 0035, so those must not touch what this file defines (a test checks).

alter table public.push_subscriptions add column silent boolean not null default false;
-- Only a person's own extension wakes up silently; a guest's browser (0030) always shows what it gets.
alter table public.push_subscriptions add constraint push_subscriptions_silent_user check (not silent or user_id is not null);

-- An address belongs to whoever saved it last (as in 0028). The daily re-check of the same address by the same
-- person only refreshes its keys, so it never jumps the queue. Extensions and notifying browsers each keep
-- their own ten, so neither kind can push the other out.
create function public.save_extension_push(p_endpoint text, p_p256dh text, p_auth text) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.require_user();
begin
  update public.push_subscriptions set p256dh = p_p256dh, auth = p_auth
   where endpoint = p_endpoint and user_id = uid and silent;
  if found then return; end if;
  delete from public.push_subscriptions where endpoint = p_endpoint;
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, silent) values (uid, p_endpoint, p_p256dh, p_auth, true);
  delete from public.push_subscriptions
   where user_id = uid and silent
     and id not in (select id from public.push_subscriptions where user_id = uid and silent order by created_at desc limit public._push_limit());
end;
$$;

-- 0028's function, now trimming only notifying browsers.
create or replace function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.require_user();
begin
  delete from public.push_subscriptions where endpoint = p_endpoint;
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values (uid, p_endpoint, p_p256dh, p_auth);
  delete from public.push_subscriptions
   where user_id = uid and not silent
     and id not in (select id from public.push_subscriptions where user_id = uid and not silent order by created_at desc limit public._push_limit());
end;
$$;

-- 0031's function, unchanged except that the guest's browsers joining the account trim only notifying ones.
create or replace function public.convert_guest_key(p_key text) returns public.buddy_links
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.require_user(); g public.guest_keys := public._guest_by_secret(p_key); l public.buddy_links;
begin
  perform public._lock_profiles(uid, g.owner_id);
  select * into g from public.guest_keys where id = g.id for update;
  if g.id is null then raise exception 'this key link isn''t valid anymore' using errcode = '28000'; end if;
  if g.owner_id = uid then raise exception 'this is your own key link: send it to the friend who holds your key'; end if;
  if public._partner_of(uid) is not null then raise exception 'you already have an accountability partner'; end if;
  if public._guest_key_of(uid) is not null then raise exception 'a friend already holds your key through a link: take it back first'; end if;
  if public._partner_of(g.owner_id) is not null then raise exception 'they already have an accountability partner'; end if;
  update public.buddy_links set status = 'ended' where requester_id in (uid, g.owner_id) and status = 'pending';
  insert into public.buddy_links (requester_id, partner_id, status, mutual)
    values (g.owner_id, uid, 'active', true) returning * into l;
  update public.push_subscriptions set user_id = uid, guest_key_id = null where guest_key_id = g.id;
  delete from public.push_subscriptions
   where user_id = uid and not silent
     and id not in (select id from public.push_subscriptions where user_id = uid and not silent order by created_at desc limit public._push_limit());
  -- quiet hours the friend set as a guest stay, unless their account already has its own. A brand-new
  -- account (not through onboarding yet, so still on the default time zone) takes the guest's time zone too,
  -- so the hours keep meaning the same moments.
  update public.profiles
     set quiet_from = g.quiet_from, quiet_to = g.quiet_to,
         timezone = case when onboarded then timezone else g.quiet_tz end
   where id = uid and quiet_from is null and g.quiet_from is not null;
  delete from public.guest_keys where id = g.id;
  return l;
end;
$$;

-- claim_push (0031) with two more kinds, which only ever reach the caller's own extensions:
--   session_started  the caller started a focus session that is still running (focus_sessions id)
--   session_ended    the caller's session ended before its time (focus_sessions id)
-- A key_answer also wakes the asker's extensions (the notify function does that): an approval ends the session.
create or replace function public.claim_push(p_kind text, p_ref uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.require_user(); mine boolean := false; target uuid; guest uuid;
begin
  if p_kind in ('key_request', 'proof_shared') then
    if p_kind = 'key_request' then
      mine := exists (select 1 from public.end_requests r where r.id = p_ref and r.user_id = uid and r.status = 'pending');
    else
      mine := exists (select 1 from public.proofs p where p.id = p_ref and p.user_id = uid and p.visibility = 'buddy')
              and not exists (select 1 from public.push_sent ps join public.proofs p on p.id = ps.ref
                               where ps.kind = 'proof_shared' and p.user_id = uid and ps.created_at > now() - interval '10 minutes');
    end if;
    if mine and public._holder_quiet_until(uid, now()) is null then
      target := public._partner_of(uid);
      if target is not null and not public.is_buddy_of(uid, target) then target := null; end if;
      if target is null then guest := public._guest_key_of(uid); end if;
    end if;
  elsif p_kind = 'key_answer' then
    select r.user_id into target
      from public.end_requests r where r.id = p_ref and r.decided_by = uid and r.status in ('approved', 'denied');
  elsif p_kind = 'session_started' then
    select s.user_id into target
      from public.focus_sessions s where s.id = p_ref and s.user_id = uid and s.ended_at is null and s.ends_at > now();
  elsif p_kind = 'session_ended' then
    select s.user_id into target
      from public.focus_sessions s where s.id = p_ref and s.user_id = uid and s.ended_at is not null and s.ended_early;
  else
    raise exception 'unknown kind of notification';
  end if;
  if target is null and guest is null then return null; end if;
  insert into public.push_sent (kind, ref) values (p_kind, p_ref) on conflict do nothing;
  if not found then return null; end if;
  if guest is not null then return jsonb_build_object('to', 'guest', 'id', guest); end if;
  return jsonb_build_object('to', 'user', 'id', target);
end;
$$;

revoke execute on function public.save_extension_push(text, text, text) from public, anon;
grant execute on function public.save_extension_push(text, text, text) to authenticated;
