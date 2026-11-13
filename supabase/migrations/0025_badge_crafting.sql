-- Badge crafting and collections (D36): the brief's "combine badges to craft limited editions",
-- digital only. A crafted badge is made from badges the person already holds (0012). Crafting is
-- a choice the person makes, so it is stored; the ingredients are never used up, so nothing that
-- was earned can be lost. Private like the rest of Progress (D23): no points, no ranking, and
-- nobody else sees it.

create table public.crafted_badges (
  user_id uuid not null references auth.users (id) on delete cascade,
  key text not null check (key in ('steady_hands', 'honest_work', 'warm_heart', 'full_nest')),
  crafted_at timestamptz not null default now(),
  primary key (user_id, key)
);
alter table public.crafted_badges enable row level security;
create policy crafted_badges_select_own on public.crafted_badges for select using (user_id = auth.uid());

-- What each crafted badge is made from. 'full_nest' needs the other three crafted first.
-- Mirrored by CRAFT_RECIPES in packages/shared/src/craft.ts (a test pins the two together).
create function public._craft_recipe(p_key text) returns text[]
language sql immutable set search_path = '' as $$
  select case p_key
    when 'steady_hands' then array['first_plan', 'first_full_day', 'run_3']
    when 'honest_work' then array['first_proof', 'first_focus']
    when 'warm_heart' then array['first_kind_act', 'helped_partner']
    when 'full_nest' then array['run_7', 'steady_hands', 'honest_work', 'warm_heart']
  end;
$$;
revoke execute on function public._craft_recipe(text) from public, anon, authenticated;

-- Everything the caller holds: earned badges (computed, 0012) plus crafted ones.
create function public._held_badges(uid uuid) returns text[]
language sql stable security definer set search_path = '' as $$
  select array(select jsonb_array_elements_text(public.my_progress(1) -> 'badges'))
      || array(select key from public.crafted_badges where user_id = uid);
$$;
revoke execute on function public._held_badges(uuid) from public, anon, authenticated;

create function public.my_collection() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := public.require_user(); held text[] := public._held_badges(uid);
begin
  return jsonb_build_object(
    'crafted', (select coalesce(jsonb_agg(key order by crafted_at, key), '[]'::jsonb) from public.crafted_badges where user_id = uid),
    'ready', (select coalesce(jsonb_agg(k order by ord), '[]'::jsonb)
                from unnest(array['steady_hands', 'honest_work', 'warm_heart', 'full_nest']) with ordinality as t(k, ord)
               where not (k = any (held)) and public._craft_recipe(k) <@ held));
end;
$$;

create function public.craft_badge(p_key text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.require_user(); recipe text[] := public._craft_recipe(p_key);
begin
  if recipe is null then raise exception 'that badge can''t be crafted'; end if;
  if not (recipe <@ public._held_badges(uid)) then
    raise exception 'you don''t have every badge this one is made from yet';
  end if;
  insert into public.crafted_badges (user_id, key) values (uid, p_key) on conflict do nothing;
  return public.my_collection();
end;
$$;

revoke execute on function public.my_collection(), public.craft_badge(text) from public, anon;
grant execute on function public.my_collection(), public.craft_badge(text) to authenticated;
