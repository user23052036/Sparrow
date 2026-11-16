-- Attempt limits on focus links (ROADMAP T4.3, D49).
-- A focus link's key is 256 random bits, so guessing one is not the risk. A key that leaks is: whoever has it could
-- start the owner's sessions over and over, or keep asking when the running one ends. So each link answers at most
-- 20 times an hour, and links start at most 8 sessions a day for one person. Past either limit the link is refused
-- with HTTP 429 (PostgREST's PT429) and a kind sentence; removing the link (0024) still stops it at once.

create function public._focus_link_uses_per_hour() returns int language sql immutable as $$ select 20 $$;
create function public._focus_link_starts_per_day() returns int language sql immutable as $$ select 8 $$;

-- Each answered use of a link, kept a day. Nobody reads it through the app; use_focus_link() counts it.
create table public.focus_link_uses (
  id bigint generated always as identity primary key,
  link_id uuid not null references public.focus_links (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  started boolean not null,
  at timestamptz not null default now()
);
create index on public.focus_link_uses (link_id, at);
create index on public.focus_link_uses (user_id, at) where started;
alter table public.focus_link_uses enable row level security;
revoke all on public.focus_link_uses from anon, authenticated;

-- 0024's function with the two limits. A refused call is not counted (its transaction is rolled back).
create or replace function public.use_focus_link(p_key text) returns jsonb
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
  delete from public.focus_link_uses where user_id = l.user_id and at < now() - interval '1 day';
  if (select count(*) from public.focus_link_uses where link_id = l.id and at > now() - interval '1 hour')
     >= public._focus_link_uses_per_hour() then
    raise exception 'this focus link was used many times in the last hour; try again a little later' using errcode = 'PT429';
  end if;
  select * into s from public.focus_sessions
   where user_id = l.user_id and ended_at is null and ends_at > now()
   order by started_at desc limit 1;
  if s.id is not null then
    -- never a second session, and nothing about the running one beyond when it ends
    insert into public.focus_link_uses (link_id, user_id, started) values (l.id, l.user_id, false);
    return jsonb_build_object('started', false, 'running', true, 'ends_at', s.ends_at, 'minutes', s.planned_minutes);
  end if;
  if (select count(*) from public.focus_link_uses where user_id = l.user_id and started and at > now() - interval '1 day')
     >= public._focus_link_starts_per_day() then
    raise exception 'focus links started many sessions today; start the next one in Sparrow' using errcode = 'PT429';
  end if;
  insert into public.focus_sessions (user_id, planned_minutes, ends_at, started_by_link)
    values (l.user_id, l.minutes, now() + make_interval(mins => l.minutes), l.id)
    returning * into s;
  update public.focus_links set last_used_at = now(), use_count = use_count + 1 where id = l.id;
  insert into public.focus_link_uses (link_id, user_id, started) values (l.id, l.user_id, true);
  return jsonb_build_object('started', true, 'running', true, 'ends_at', s.ends_at, 'minutes', s.planned_minutes);
end;
$$;

revoke execute on function public._focus_link_uses_per_hour(), public._focus_link_starts_per_day() from public, anon, authenticated;
