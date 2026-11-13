-- Focus links (D35): the brief's "wearables and smart-home triggers", without any outside service.
-- A focus link is a secret key that can do exactly one thing: start a focus session of the length
-- its owner chose. Opening the link (an NFC tag on the desk, a home-screen shortcut, a watch or
-- phone automation, a smart-speaker routine that opens a web address) starts the session, and
-- every connected device then blocks as usual (the extension and the phone pick it up within
-- about 30 seconds, D10 and D29).
--
-- What a key can never do: end a session, lock one, read anything about the person (no tasks,
-- no name, no list of sites), or start a second session while one is running. So a key that
-- leaks can, at worst, start focus time, and the owner can remove the link at any moment.
-- Keys are stored hashed (like device secrets, 0020) and shown once.

create table public.focus_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  label text not null check (char_length(label) between 1 and 40),
  minutes int not null check (minutes between 5 and 120),
  key_hash text not null unique check (key_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  use_count int not null default 0
);
create index on public.focus_links (user_id);
alter table public.focus_links enable row level security;
-- The owner can list their links (the hash cannot be turned back into the key). No write
-- policies: links are made, used and removed only through the functions below.
create policy focus_links_select_own on public.focus_links for select using (user_id = auth.uid());

-- Sessions started by a link remember which one, so the owner can tell them apart.
alter table public.focus_sessions
  add column started_by_link uuid references public.focus_links (id) on delete set null;

create function public.create_focus_link(p_label text, p_minutes int default 25) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.require_user(); secret text; l public.focus_links;
        lbl text := nullif(trim(regexp_replace(coalesce(p_label, ''), '\s+', ' ', 'g')), '');
begin
  if lbl is null or char_length(lbl) > 40 then raise exception 'give the link a short name (up to 40 letters)'; end if;
  if p_minutes is null or p_minutes < 5 or p_minutes > 120 then raise exception 'a focus link starts 5 to 120 minutes'; end if;
  -- serialise per person so two quick taps can't go past the limit
  perform 1 from public.profiles where id = uid for update;
  if (select count(*) from public.focus_links where user_id = uid) >= 5 then
    raise exception 'you can have up to five focus links; remove one first';
  end if;
  secret := 'spt_' || replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  insert into public.focus_links (user_id, label, minutes, key_hash)
    values (uid, lbl, p_minutes, encode(sha256(convert_to(secret, 'UTF8')), 'hex'))
    returning * into l;
  -- the key is returned once and never stored in clear
  return jsonb_build_object('id', l.id, 'label', l.label, 'minutes', l.minutes, 'key', secret);
end;
$$;

create function public.remove_focus_link(p_id uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.require_user();
begin
  delete from public.focus_links where id = p_id and user_id = uid;
  return found;
end;
$$;

-- Callable WITHOUT a user session (anon key + the link's key). Answers only: did a session start,
-- is one running, when does it end, how long is it.
create function public.use_focus_link(p_key text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare l public.focus_links; s public.focus_sessions;
begin
  if p_key is null or p_key !~ '^spt_[0-9a-f]{64}$' then
    raise exception 'this focus link isn''t valid anymore' using errcode = '28000';
  end if;
  select * into l from public.focus_links
   where key_hash = encode(sha256(convert_to(p_key, 'UTF8')), 'hex') for update;
  if l.id is null then
    raise exception 'this focus link isn''t valid anymore' using errcode = '28000';
  end if;
  select * into s from public.focus_sessions
   where user_id = l.user_id and ended_at is null and ends_at > now()
   order by started_at desc limit 1;
  if s.id is not null then
    -- never a second session, and nothing about the running one beyond when it ends
    return jsonb_build_object('started', false, 'running', true, 'ends_at', s.ends_at, 'minutes', s.planned_minutes);
  end if;
  insert into public.focus_sessions (user_id, planned_minutes, ends_at, started_by_link)
    values (l.user_id, l.minutes, now() + make_interval(mins => l.minutes), l.id)
    returning * into s;
  update public.focus_links set last_used_at = now(), use_count = use_count + 1 where id = l.id;
  return jsonb_build_object('started', true, 'running', true, 'ends_at', s.ends_at, 'minutes', s.planned_minutes);
end;
$$;

revoke execute on function public.create_focus_link(text, int), public.remove_focus_link(uuid) from public, anon;
grant execute on function public.create_focus_link(text, int), public.remove_focus_link(uuid) to authenticated;
revoke execute on function public.use_focus_link(text) from public;
grant execute on function public.use_focus_link(text) to anon, authenticated;
