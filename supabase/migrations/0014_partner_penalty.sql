-- Partner penalty and support nudges (D25), in PRACTICE MODE like pledges: no money moves.
-- The brief's "the monitoring partner also pays a smaller amount when you miss" is the idea D3
-- cut, because it can give a partner a reason to approve fake proofs and can put blame on
-- someone who is trying to help. It is rebuilt here with these safeguards, all enforced below:
--  * both people must opt in, either can opt out at any time, and it only ever applies going forward
--  * it can only follow a *pledged* day that was settled as owed (so never on a lighter day,
--    after a heavy morning, or while the person is in Gentle Mode)
--  * the amount is small: a quarter of what the person owes, at most 10
--  * the partner is skipped if they are in Gentle Mode or on their own lighter day
--  * the outcome is the person's own self-marked day; a partner's verdict never changes it, so
--    approving or questioning a proof can't change whether the partner "pays"
--  * the person whose day it was is never shown that their partner "owes" anything
-- Escalating nudges are gentle, in-app, and only for partners who chose to share activity.

alter table public.buddy_links
  add column requester_penalty_ok boolean not null default false,
  add column partner_penalty_ok boolean not null default false;

create table public.partner_pledges (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null unique references public.daily_plans (id) on delete cascade,
  payer_id uuid not null references auth.users (id) on delete cascade,
  for_user_id uuid not null references auth.users (id) on delete cascade,
  charity_id uuid not null references public.charities (id),
  amount int not null check (amount between 1 and 10),
  currency text not null default 'INR' check (currency = 'INR'),
  mode text not null default 'practice' check (mode = 'practice'),
  created_at timestamptz not null default now()
);
create index on public.partner_pledges (payer_id, created_at);
alter table public.partner_pledges enable row level security;
-- only the payer can read these rows; the person whose day it was cannot
create policy partner_pledges_select_payer on public.partner_pledges for select using (payer_id = auth.uid());

create function public.set_penalty_optin(p_on boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.require_user(); l public.buddy_links;
begin
  select * into l from public.buddy_links
   where status = 'active' and (requester_id = uid or partner_id = uid) for update;
  if l.id is null then raise exception 'you don''t have a partner yet'; end if;
  if l.requester_id = uid then
    update public.buddy_links set requester_penalty_ok = coalesce(p_on, false) where id = l.id returning * into l;
  else
    update public.buddy_links set partner_penalty_ok = coalesce(p_on, false) where id = l.id returning * into l;
  end if;
  return public.penalty_status();
end;
$$;

create function public.penalty_status() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := public.require_user(); l public.buddy_links; mine boolean; theirs boolean; total int;
begin
  select * into l from public.buddy_links
   where status = 'active' and (requester_id = uid or partner_id = uid) limit 1;
  if l.id is null then return jsonb_build_object('state', 'none'); end if;
  mine := case when l.requester_id = uid then l.requester_penalty_ok else l.partner_penalty_ok end;
  theirs := case when l.requester_id = uid then l.partner_penalty_ok else l.requester_penalty_ok end;
  select coalesce(sum(amount), 0) into total from public.partner_pledges
   where payer_id = uid and created_at > now() - interval '30 days';
  return jsonb_build_object('state', 'active', 'mine', mine, 'theirs', theirs, 'on', mine and theirs, 'practice_total_30d', total);
end;
$$;

-- Replaces the 0013 trigger function: same pledge settlement, plus the partner's small pledge.
create or replace function public._settle_pledge() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  n_count int; n_done int; n_partial int; completion numeric; pl public.pledges; keep int; owed_now int;
  l public.buddy_links; other uuid; other_gentle boolean; other_light date;
begin
  select * into pl from public.pledges where plan_id = new.id and status = 'set' for update;
  if pl.id is null then return new; end if;
  select count(*) filter (where status <> 'rescheduled'), count(*) filter (where status = 'done'), count(*) filter (where status = 'partial')
    into n_count, n_done, n_partial from public.plan_items where daily_plan_id = new.id;
  completion := case when n_count = 0 then 1 else (n_done + 0.5 * n_partial) / n_count end;
  keep := floor(pl.amount * completion);
  owed_now := pl.amount - keep;
  update public.pledges set owed = owed_now, status = case when owed_now = 0 then 'cleared' else 'owed' end, settled_at = now() where id = pl.id;

  if owed_now > 0 then
    select * into l from public.buddy_links
     where status = 'active' and (requester_id = new.user_id or partner_id = new.user_id) limit 1;
    if l.id is not null and l.requester_penalty_ok and l.partner_penalty_ok then
      other := case when l.requester_id = new.user_id then l.partner_id else l.requester_id end;
      select gentle_mode, light_day into other_gentle, other_light from public.profiles where id = other;
      if other_gentle is false and other_light is distinct from new.date then
        insert into public.partner_pledges (plan_id, payer_id, for_user_id, charity_id, amount)
          values (new.id, other, new.user_id, pl.charity_id, least(10, greatest(1, ceil(owed_now * 0.25)::int)))
          on conflict (plan_id) do nothing;
      end if;
    end if;
  end if;
  return new;
end;
$$;

-- Gentle, escalating nudge for the partner: how many of the other person's most recent reviewed
-- days in a row were hard (under 34% done), only when they share their activity.
-- level 0 = nothing, 1 = two hard days, 2 = three or more. Mirrors HEAVY_DAY_BELOW in safety.ts.
create function public.partner_support_nudge() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := public.require_user(); l public.buddy_links; pid uuid; shares boolean; nm text;
  prev date; n int := 0; r record; today date;
begin
  select * into l from public.buddy_links
   where status = 'active' and (requester_id = uid or partner_id = uid) limit 1;
  if l.id is null then return jsonb_build_object('level', 0, 'days', 0); end if;
  pid := case when l.requester_id = uid then l.partner_id else l.requester_id end;
  shares := case when l.requester_id = uid then l.partner_shares else l.requester_shares end;
  if not shares then return jsonb_build_object('level', 0, 'days', 0); end if;
  select coalesce(display_name, 'Your partner') into nm from public.profiles where id = pid;
  today := public.user_today(pid);
  for r in
    select d.date,
           case when count(*) filter (where i.status <> 'rescheduled') = 0 then 1
                else (count(*) filter (where i.status = 'done') + 0.5 * count(*) filter (where i.status = 'partial'))
                     / count(*) filter (where i.status <> 'rescheduled') end as completion
      from public.daily_plans d join public.plan_items i on i.daily_plan_id = d.id
     where d.user_id = pid and d.reviewed_at is not null
     group by d.date order by d.date desc limit 7
  loop
    if prev is null and r.date < today - 2 then exit; end if;          -- stale: not a current stretch
    if prev is not null and prev - r.date <> 1 then exit; end if;      -- a gap ends the stretch
    if r.completion >= 0.34 then exit; end if;
    n := n + 1;
    prev := r.date;
  end loop;
  return jsonb_build_object('level', case when n >= 3 then 2 when n >= 2 then 1 else 0 end, 'days', n, 'name', nm);
end;
$$;
