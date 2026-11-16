-- Guest partner (D39, ROADMAP T2.3): a friend can hold the key without an account.
-- The owner makes a key link (/key#spg_…). Whoever opens it can do exactly these things:
--   see the owner's pending key requests and the proofs the owner shared in the last three days
--   (written proofs in full; for a photo or voice note only that there is one),
--   let them out or encourage them to keep going, and switch notifications on or off for that browser.
-- Nothing else: no tasks, no day, no focus history, no sites, no verdicts on proofs.
-- The key is stored hashed (like focus links, 0024, and device secrets, 0020) and shown once. The owner can
-- take it back at any time; making a new link replaces the old one. The friend becomes a full partner by
-- signing up and opening the same link (convert_guest_key).
-- A person has one key holder at a time: an account partner (0005) or one guest, never both.

create table public.guest_keys (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  key_hash text not null unique check (key_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz
);
alter table public.guest_keys enable row level security;
-- The owner can see their guest (the hash cannot be turned back into the key). No write policies.
create policy guest_keys_select_own on public.guest_keys for select using (owner_id = auth.uid());

-- Which guest answered a key request (decided_by stays null: a guest has no account).
alter table public.end_requests
  add column decided_by_guest uuid references public.guest_keys (id) on delete set null;

-- A guest's browser can get notifications too. A row belongs to an account or to a guest, never both.
alter table public.push_subscriptions
  alter column user_id drop not null,
  add column guest_key_id uuid references public.guest_keys (id) on delete cascade,
  add constraint push_subscriptions_one_owner check (num_nonnulls(user_id, guest_key_id) = 1);
create index on public.push_subscriptions (guest_key_id);

-- ------------------------------------------------------------ helpers (internal)
create function public._guest_key_of(uid uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select id from public.guest_keys where owner_id = uid;
$$;

-- The guest behind a key, or the same error for anything that isn't one (malformed, unknown, taken back).
create function public._guest_by_secret(p_key text) returns public.guest_keys
language plpgsql stable security definer set search_path = '' as $$
declare g public.guest_keys;
begin
  if p_key is null or p_key !~ '^spg_[0-9a-f]{64}$' then
    raise exception 'this key link isn''t valid anymore' using errcode = '28000';
  end if;
  select * into g from public.guest_keys where key_hash = encode(sha256(convert_to(p_key, 'UTF8')), 'hex');
  if g.id is null then
    raise exception 'this key link isn''t valid anymore' using errcode = '28000';
  end if;
  return g;
end;
$$;

-- ------------------------------------------------------------ the owner's side
create function public.create_guest_key(p_name text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.require_user(); secret text; g public.guest_keys;
        nm text := nullif(trim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g')), '');
begin
  if nm is null or char_length(nm) > 40 then raise exception 'give your friend a short name (up to 40 letters)'; end if;
  -- serialise per person so an invite and a guest can't both slip in
  perform 1 from public.profiles where id = uid for update;
  if public._partner_of(uid) is not null then raise exception 'you already have an accountability partner'; end if;
  -- the guest takes the place of an invite that was still waiting
  update public.buddy_links set status = 'ended' where requester_id = uid and status = 'pending';
  secret := 'spg_' || replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  insert into public.guest_keys (owner_id, name, key_hash)
    values (uid, nm, encode(sha256(convert_to(secret, 'UTF8')), 'hex'))
  on conflict (owner_id) do update
    set name = excluded.name, key_hash = excluded.key_hash, created_at = now(), last_seen_at = null
  returning * into g;
  -- a new link replaces the old one, so browsers that opened the old one stop hearing anything
  delete from public.push_subscriptions where guest_key_id = g.id;
  -- the key is returned once and never stored in clear
  return jsonb_build_object('id', g.id, 'name', g.name, 'key', secret);
end;
$$;

-- Takes the key back. A locked session is released so nobody stays trapped (as end_buddy_link does).
create function public.remove_guest_key() returns boolean
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.require_user();
begin
  delete from public.guest_keys where owner_id = uid;
  if not found then return false; end if;
  update public.focus_sessions set locked = false where user_id = uid and ended_at is null and locked;
  return true;
end;
$$;

-- ------------------------------------------------------------ the guest's side (anon key + the key)
create function public.guest_overview(p_key text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare g public.guest_keys := public._guest_by_secret(p_key); nm text; reqs jsonb; proofs jsonb;
begin
  update public.guest_keys set last_seen_at = now() where id = g.id;
  select coalesce(display_name, 'Your friend') into nm from public.profiles where id = g.owner_id;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', r.id, 'reason', r.reason, 'created_at', r.created_at, 'session_ends_at', s.ends_at)
           order by r.created_at), '[]'::jsonb)
    into reqs
    from public.end_requests r join public.focus_sessions s on s.id = r.session_id
   where r.user_id = g.owner_id and r.status = 'pending' and s.ended_at is null and s.ends_at > now();

  -- written proofs in full; photos and voice notes stay in private storage that needs an account
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', p.id, 'kind', p.kind, 'text', case when p.kind = 'text' then p.text_body end,
           'task', t.title, 'created_at', p.server_created_at)
           order by p.server_created_at desc), '[]'::jsonb)
    into proofs
    from public.proofs p
    join public.plan_items i on i.id = p.plan_item_id
    join public.tasks t on t.id = i.task_id
   where p.user_id = g.owner_id and p.visibility = 'buddy' and p.server_created_at > now() - interval '3 days';

  return jsonb_build_object('name', nm, 'guest', g.name, 'pending_end_requests', reqs, 'proofs', proofs);
end;
$$;

-- The guest's answer to a key request; the same effect as decide_end_request (0005).
create function public.guest_decide(p_key text, p_request_id uuid, p_approve boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare g public.guest_keys := public._guest_by_secret(p_key); r public.end_requests;
begin
  select * into r from public.end_requests
   where id = p_request_id and user_id = g.owner_id and status = 'pending' for update;
  if r.id is null then raise exception 'request not found'; end if;
  if p_approve then
    update public.focus_sessions
       set ended_at = now(), ended_early = true, locked = false,
           exit_reason = left('approved by partner: ' || r.reason, 300)
     where id = r.session_id and ended_at is null;
    insert into public.tamper_events (user_id, focus_session_id, kind, detail)
      values (r.user_id, r.session_id, 'early_exit', left('partner approved: ' || r.reason, 300));
  end if;
  update public.end_requests
     set status = case when p_approve then 'approved' else 'denied' end, decided_by_guest = g.id, decided_at = now()
   where id = r.id returning * into r;
  return jsonb_build_object('id', r.id, 'status', r.status);
end;
$$;

-- Same rules as save_push_subscription (0028): a browser belongs to whoever switched it on last, ten at most.
create function public.save_guest_push(p_key text, p_endpoint text, p_p256dh text, p_auth text) returns void
language plpgsql security definer set search_path = '' as $$
declare g public.guest_keys := public._guest_by_secret(p_key);
begin
  delete from public.push_subscriptions where endpoint = p_endpoint;
  insert into public.push_subscriptions (guest_key_id, endpoint, p256dh, auth) values (g.id, p_endpoint, p_p256dh, p_auth);
  delete from public.push_subscriptions
   where guest_key_id = g.id
     and id not in (select id from public.push_subscriptions where guest_key_id = g.id order by created_at desc limit public._push_limit());
end;
$$;

create function public.remove_guest_push(p_key text, p_endpoint text) returns void
language plpgsql security definer set search_path = '' as $$
declare g public.guest_keys := public._guest_by_secret(p_key);
begin
  delete from public.push_subscriptions where endpoint = p_endpoint and guest_key_id = g.id;
end;
$$;

-- Signed in and holding the link: the guest becomes a full partner, keeping the browsers that had
-- notifications on. A locked session stays locked; its key now sits with the new account.
create function public.convert_guest_key(p_key text) returns public.buddy_links
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.require_user(); g public.guest_keys := public._guest_by_secret(p_key); l public.buddy_links;
begin
  select * into g from public.guest_keys where id = g.id for update;
  if g.owner_id = uid then raise exception 'this is your own key link: send it to the friend who holds your key'; end if;
  if public._partner_of(uid) is not null then raise exception 'you already have an accountability partner'; end if;
  if public._guest_key_of(uid) is not null then raise exception 'a friend already holds your key through a link: take it back first'; end if;
  if public._partner_of(g.owner_id) is not null then raise exception 'they already have an accountability partner'; end if;
  update public.buddy_links set status = 'ended' where requester_id in (uid, g.owner_id) and status = 'pending';
  insert into public.buddy_links (requester_id, partner_id, status, mutual)
    values (g.owner_id, uid, 'active', true) returning * into l;
  update public.push_subscriptions set user_id = uid, guest_key_id = null where guest_key_id = g.id;
  delete from public.push_subscriptions
   where user_id = uid
     and id not in (select id from public.push_subscriptions where user_id = uid order by created_at desc limit public._push_limit());
  delete from public.guest_keys where id = g.id;
  return l;
end;
$$;

-- ------------------------------------------------------------ one key holder at a time
create or replace function public.create_buddy_invite() returns public.buddy_links
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.require_user(); l public.buddy_links;
begin
  perform 1 from public.profiles where id = uid for update;
  if public._partner_of(uid) is not null then raise exception 'you already have an accountability partner'; end if;
  if public._guest_key_of(uid) is not null then raise exception 'a friend already holds your key through a link: take it back first'; end if;
  select * into l from public.buddy_links where requester_id = uid and status = 'pending' limit 1;
  if l.id is not null then return l; end if;
  insert into public.buddy_links (requester_id) values (uid) returning * into l;
  return l;
end;
$$;

create or replace function public.preview_buddy_invite(p_code text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := public.require_user(); l public.buddy_links; nm text;
begin
  select * into l from public.buddy_links where invite_code = lower(trim(p_code)) and status = 'pending';
  if l.id is null then
    return jsonb_build_object('valid', false, 'reason', 'This invite link isn''t valid anymore. Ask for a new one.');
  end if;
  if l.requester_id = uid then
    return jsonb_build_object('valid', false, 'reason', 'This is your own invite link. Send it to your partner.');
  end if;
  if public._partner_of(uid) is not null then
    return jsonb_build_object('valid', false, 'reason', 'You already have an accountability partner.');
  end if;
  if public._guest_key_of(uid) is not null then
    return jsonb_build_object('valid', false, 'reason', 'A friend already holds your key through a link. Take it back in Partner first.');
  end if;
  select coalesce(display_name, 'Someone') into nm from public.profiles where id = l.requester_id;
  return jsonb_build_object('valid', true, 'from', nm);
end;
$$;

create or replace function public.accept_buddy_invite(p_code text) returns public.buddy_links
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.require_user(); l public.buddy_links;
begin
  select * into l from public.buddy_links where invite_code = lower(trim(p_code)) and status = 'pending' for update;
  if l.id is null then raise exception 'this invite link isn''t valid anymore'; end if;
  if l.requester_id = uid then raise exception 'you can''t accept your own invite'; end if;
  if public._partner_of(uid) is not null then raise exception 'you already have an accountability partner'; end if;
  if public._guest_key_of(uid) is not null or public._guest_key_of(l.requester_id) is not null then
    raise exception 'a friend already holds the key through a link: take it back first';
  end if;
  -- drop any invite of my own that was still waiting
  update public.buddy_links set status = 'ended' where requester_id = uid and status = 'pending';
  update public.buddy_links set partner_id = uid, status = 'active', mutual = true where id = l.id returning * into l;
  return l;
end;
$$;

-- A guest can hold the key to a locked session, like an account partner.
create or replace function public.start_focus_session(p_minutes int, p_device_id uuid default null,
                                                      p_item_id uuid default null, p_locked boolean default false)
returns public.focus_sessions
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.require_user(); s public.focus_sessions;
begin
  if p_minutes < 5 or p_minutes > 240 then raise exception 'sessions are 5 to 240 minutes'; end if;
  if coalesce(p_locked, false) then
    if public._partner_of(uid) is null and public._guest_key_of(uid) is null then
      raise exception 'locking a session needs an accountability partner';
    end if;
    if p_minutes > 120 then raise exception 'locked sessions can be up to 120 minutes'; end if;
  end if;
  if exists (select 1 from public.focus_sessions
             where user_id = uid and ended_at is null and ends_at > now()) then
    raise exception 'a focus session is already running';
  end if;
  if p_device_id is not null and not exists (select 1 from public.devices where id = p_device_id and user_id = uid) then
    p_device_id := null;
  end if;
  if p_item_id is not null and not exists (select 1 from public.plan_items where id = p_item_id and user_id = uid) then
    p_item_id := null;
  end if;
  insert into public.focus_sessions (user_id, planned_minutes, ends_at, started_from_device_id, plan_item_id, locked)
    values (uid, p_minutes, now() + make_interval(mins => p_minutes), p_device_id, p_item_id, coalesce(p_locked, false))
    returning * into s;
  return s;
end;
$$;

-- The Partner page gets a fourth state, "guest". The account-partner overview of 0005 is kept as it was,
-- under an internal name.
alter function public.partner_overview() rename to _partner_overview_accounts;
create function public.partner_overview() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.require_user(); g public.guest_keys;
begin
  select * into g from public.guest_keys where owner_id = uid;
  if g.id is not null and public._partner_of(uid) is null then
    return jsonb_build_object('state', 'guest',
      'guest', jsonb_build_object('name', g.name, 'created_at', g.created_at, 'last_seen_at', g.last_seen_at));
  end if;
  return public._partner_overview_accounts();
end;
$$;

-- ------------------------------------------------------------ notifications to and from a guest
-- claim_push (0028) now says who the recipient is: {"to": "user" | "guest", "id": …}, or null.
-- A key request or a shared proof goes to the account partner, or else to the guest.
drop function public.claim_push(text, uuid);
create function public.claim_push(p_kind text, p_ref uuid) returns jsonb
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
    if mine then
      target := public._partner_of(uid);
      if target is not null and not public.is_buddy_of(uid, target) then target := null; end if;
      if target is null then guest := public._guest_key_of(uid); end if;
    end if;
  elsif p_kind = 'key_answer' then
    select r.user_id into target
      from public.end_requests r where r.id = p_ref and r.decided_by = uid and r.status in ('approved', 'denied');
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

-- The notify function's question for a guest's answer. Only the server calls it (with the guest's key):
-- the owner's account id never reaches the guest's browser.
create function public.claim_guest_push(p_key text, p_kind text, p_ref uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare g public.guest_keys := public._guest_by_secret(p_key); target uuid;
begin
  if p_kind is distinct from 'key_answer' then raise exception 'unknown kind of notification'; end if;
  select r.user_id into target
    from public.end_requests r where r.id = p_ref and r.decided_by_guest = g.id and r.status in ('approved', 'denied');
  if target is null then return null; end if;
  insert into public.push_sent (kind, ref) values (p_kind, p_ref) on conflict do nothing;
  if not found then return null; end if;
  return jsonb_build_object('to', 'user', 'id', target);
end;
$$;

-- ------------------------------------------------------------ export: the guest, without the key hash
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
                     where b.status in ('pending', 'active') and (b.requester_id = uid or b.partner_id = uid) limit 1),
    'guest_key_holder', (select to_jsonb(g) - 'key_hash' from public.guest_keys g where g.owner_id = uid)
  );
end;
$$;

-- ------------------------------------------------------------ permissions
revoke execute on function public._guest_key_of(uuid), public._guest_by_secret(text), public._partner_overview_accounts()
  from public, anon, authenticated;
revoke execute on function public.create_guest_key(text), public.remove_guest_key(), public.convert_guest_key(text),
  public.partner_overview(), public.claim_push(text, uuid)
  from public, anon;
grant execute on function public.create_guest_key(text), public.remove_guest_key(), public.convert_guest_key(text),
  public.partner_overview(), public.claim_push(text, uuid)
  to authenticated;
-- The guest's functions work without a user session: the key is the whole permission.
revoke execute on function public.guest_overview(text), public.guest_decide(text, uuid, boolean),
  public.save_guest_push(text, text, text, text), public.remove_guest_push(text, text)
  from public;
grant execute on function public.guest_overview(text), public.guest_decide(text, uuid, boolean),
  public.save_guest_push(text, text, text, text), public.remove_guest_push(text, text)
  to anon, authenticated;
revoke execute on function public.claim_guest_push(text, text, uuid) from public, anon, authenticated;
grant execute on function public.claim_guest_push(text, text, uuid) to service_role;
