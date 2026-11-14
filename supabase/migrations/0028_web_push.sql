-- Web Push for partner requests (D38, ROADMAP T2.1).
-- A browser that switched notifications on stores its push address here. The `notify` Edge Function
-- sends to it, but only after claim_push() below agrees that the caller really caused the event,
-- once per event. Nothing about the event itself (task titles, reasons, proof text) is stored or sent.

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null unique check (endpoint ~ '^https://' and char_length(endpoint) <= 1000),
  p256dh text not null check (char_length(p256dh) between 20 and 200),
  auth text not null check (char_length(auth) between 8 and 100),
  created_at timestamptz not null default now()
);
create index on public.push_subscriptions (user_id);
alter table public.push_subscriptions enable row level security;
-- People see their own browsers (for the Settings switch); writes go through the functions below.
create policy push_subscriptions_select_own on public.push_subscriptions for select using (user_id = auth.uid());

-- Which events already had their notification, so a retry or a replay never sends twice.
create table public.push_sent (
  kind text not null,
  ref uuid not null,
  created_at timestamptz not null default now(),
  primary key (kind, ref)
);
alter table public.push_sent enable row level security; -- no policies: only the functions here touch it
revoke all on public.push_sent from anon, authenticated;

-- At most this many browsers per person; the oldest goes first.
create function public._push_limit() returns int language sql immutable as $$ select 10 $$;

create function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.require_user();
begin
  -- A browser belongs to whoever switched notifications on in it last.
  delete from public.push_subscriptions where endpoint = p_endpoint;
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values (uid, p_endpoint, p_p256dh, p_auth);
  delete from public.push_subscriptions
   where user_id = uid
     and id not in (select id from public.push_subscriptions where user_id = uid order by created_at desc limit public._push_limit());
end;
$$;

create function public.remove_push_subscription(p_endpoint text) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.require_user();
begin
  delete from public.push_subscriptions where endpoint = p_endpoint and user_id = uid;
end;
$$;

-- Who should hear about an event the caller just caused, or null. Kinds:
--   key_request   the caller asked their partner to end a locked session (end_requests id)
--   key_answer    the caller answered such a request (end_requests id)
--   proof_shared  the caller shared a proof with their partner (proofs id)
-- Returns the recipient once per event; a second call, someone else's event, or an event the
-- recipient may not see returns null. The Edge Function sends only to that person's browsers.
create function public.claim_push(p_kind text, p_ref uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.require_user(); target uuid;
begin
  if p_kind = 'key_request' then
    select public._partner_of(r.user_id) into target
      from public.end_requests r where r.id = p_ref and r.user_id = uid and r.status = 'pending';
    if target is not null and not public.is_buddy_of(uid, target) then target := null; end if;
  elsif p_kind = 'key_answer' then
    select r.user_id into target
      from public.end_requests r where r.id = p_ref and r.decided_by = uid and r.status in ('approved', 'denied');
  elsif p_kind = 'proof_shared' then
    select public._partner_of(p.user_id) into target
      from public.proofs p where p.id = p_ref and p.user_id = uid and p.visibility = 'buddy';
    if target is not null and not public.is_buddy_of(uid, target) then target := null; end if;
  else
    raise exception 'unknown kind of notification';
  end if;
  if target is null then return null; end if;
  insert into public.push_sent (kind, ref) values (p_kind, p_ref) on conflict do nothing;
  if not found then return null; end if;
  return target;
end;
$$;

revoke execute on function public._push_limit() from public, anon, authenticated;
revoke execute on function public.save_push_subscription(text, text, text), public.remove_push_subscription(text),
  public.claim_push(text, uuid) from public, anon;
grant execute on function public.save_push_subscription(text, text, text), public.remove_push_subscription(text),
  public.claim_push(text, uuid) to authenticated;
