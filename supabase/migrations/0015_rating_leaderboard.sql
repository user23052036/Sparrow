-- Opt-in reliability rating and monthly leaderboard (D25). The brief's "Amazon-style ratings" and
-- "leaderboards" were cut in D4 because public ratings of people are risky for this audience.
-- They are rebuilt private-by-default:
--  * a rating is visible to its owner only, and to their partner only if the owner switches that on
--  * it needs at least 7 reviewed days in the last 30; before that it says "not enough days yet"
--  * the leaderboard is opt-in with a made-up handle (never the real name), is hidden until at
--    least 10 people take part, shows only the top 10, and shows everyone else only a band
--    ("top quarter", "top half", "keep going"), never an exact low rank
--  * it ranks days with some progress this month (a partly done day counts), NOT support given,
--    so there is no reason to approve proofs just to climb
-- These are simple, documented formulas. They have not been validated as measures of anything.

alter table public.profiles
  add column share_rating boolean not null default false,
  add column leaderboard_optin boolean not null default false,
  add column leaderboard_handle text check (leaderboard_handle ~ '^[A-Za-z0-9_]{3,20}$'),
  add constraint profiles_handle_when_opted_in check (not leaderboard_optin or leaderboard_handle is not null);
create unique index profiles_handle_unique on public.profiles (lower(leaderboard_handle)) where leaderboard_handle is not null;

-- Rating of one person (internal). reliability: average completion over reviewed days in the last
-- 30, mapped 0%..100% to 1.0..5.0. support: days with a verdict or a decided end request in the last
-- 30, 15 or more days = 5.0, for people who have had a partner.
create function public._rating_of(uid uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  today date := public.user_today(uid);
  n int; avg_c numeric; helped int; had_partner boolean; rel numeric; sup numeric; shared boolean;
begin
  select count(*), avg(c.completion) into n, avg_c from (
    select d.date,
           case when count(*) filter (where i.status <> 'rescheduled') = 0 then 1
                else (count(*) filter (where i.status = 'done') + 0.5 * count(*) filter (where i.status = 'partial'))
                     / count(*) filter (where i.status <> 'rescheduled') end as completion
      from public.daily_plans d join public.plan_items i on i.daily_plan_id = d.id
     where d.user_id = uid and d.reviewed_at is not null and d.date > today - 30
     group by d.date) c;
  rel := case when n >= 7 then round(1 + 4 * avg_c, 1) else null end;

  select count(distinct x.d) into helped from (
    select (v.created_at at time zone coalesce((select timezone from public.profiles where id = uid), 'UTC'))::date as d
      from public.verifications v where v.verifier_id = uid and v.created_at > now() - interval '30 days'
    union
    select (r.decided_at at time zone coalesce((select timezone from public.profiles where id = uid), 'UTC'))::date
      from public.end_requests r where r.decided_by = uid and r.decided_at > now() - interval '30 days'
  ) x;
  select exists (select 1 from public.buddy_links b where (b.requester_id = uid or b.partner_id = uid) and b.partner_id is not null) into had_partner;
  sup := case when had_partner then round(1 + 4 * least(1, helped / 15.0), 1) else null end;

  select share_rating into shared from public.profiles where id = uid;
  return jsonb_build_object('reliability', rel, 'support', sup, 'days_counted', n, 'days_needed', 7, 'shared', coalesce(shared, false));
end;
$$;
revoke execute on function public._rating_of(uuid) from public, anon, authenticated;

create function public.my_rating() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  return public._rating_of(public.require_user());
end;
$$;

-- The partner's rating, only when they chose to share it.
create function public.partner_rating() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := public.require_user(); l public.buddy_links; pid uuid; r jsonb;
begin
  select * into l from public.buddy_links where status = 'active' and (requester_id = uid or partner_id = uid) limit 1;
  if l.id is null then return jsonb_build_object('shared', false); end if;
  pid := case when l.requester_id = uid then l.partner_id else l.requester_id end;
  r := public._rating_of(pid);
  if not (r ->> 'shared')::boolean then return jsonb_build_object('shared', false); end if;
  return r || jsonb_build_object('name', coalesce((select display_name from public.profiles where id = pid), 'Your partner'));
end;
$$;

create function public.join_leaderboard(p_handle text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.require_user(); h text := trim(coalesce(p_handle, ''));
begin
  if h !~ '^[A-Za-z0-9_]{3,20}$' then raise exception 'handles are 3 to 20 letters, numbers or underscores'; end if;
  if exists (select 1 from public.profiles where lower(leaderboard_handle) = lower(h) and id <> uid) then
    raise exception 'that handle is taken. Try another';
  end if;
  update public.profiles set leaderboard_handle = h, leaderboard_optin = true where id = uid;
  return public.monthly_leaderboard();
end;
$$;

create function public.leave_leaderboard() returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.profiles set leaderboard_optin = false, leaderboard_handle = null where id = public.require_user();
end;
$$;

create function public.monthly_leaderboard() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := public.require_user();
  opted boolean; handle text; month_start date; n int; me_rank int; my_days int; band text; top jsonb;
begin
  select leaderboard_optin, leaderboard_handle into opted, handle from public.profiles where id = uid;
  if not coalesce(opted, false) then return jsonb_build_object('state', 'not_joined'); end if;
  month_start := date_trunc('month', public.user_today(uid))::date;

  with s as (
    select p.id, p.leaderboard_handle as handle, count(*)::int as days, avg(c.completion) as avg_c
      from public.profiles p
      join (
        select d.user_id, d.date,
               case when count(*) filter (where i.status <> 'rescheduled') = 0 then 1
                    else (count(*) filter (where i.status = 'done') + 0.5 * count(*) filter (where i.status = 'partial'))
                         / count(*) filter (where i.status <> 'rescheduled') end as completion
          from public.daily_plans d join public.plan_items i on i.daily_plan_id = d.id
         where d.reviewed_at is not null and d.date >= month_start
         group by d.user_id, d.date
        having count(*) filter (where i.status in ('done', 'partial')) > 0
      ) c on c.user_id = p.id
     where p.leaderboard_optin
     group by p.id, p.leaderboard_handle
  ), r as (
    select s.*, rank() over (order by s.days desc, s.avg_c desc) as rnk from s
  )
  select (select count(*) from r),
         (select r.rnk from r where r.id = uid),
         (select r.days from r where r.id = uid),
         (select coalesce(jsonb_agg(jsonb_build_object('rank', t.rnk, 'handle', t.handle, 'days', t.days, 'me', t.id = uid) order by t.rnk, t.handle), '[]'::jsonb)
            from (select * from r where r.rnk <= 10 order by r.rnk, r.handle limit 25) t)
    into n, me_rank, my_days, top;
  if n < 10 then return jsonb_build_object('state', 'waiting', 'needed', 10, 'have', n); end if;

  band := case when me_rank is null then 'none'
               when me_rank <= 10 then 'top10'
               when me_rank <= ceil(n * 0.25) then 'top_quarter'
               when me_rank <= ceil(n * 0.5) then 'top_half'
               else 'keep_going' end;
  return jsonb_build_object('state', 'ready', 'participants', n, 'top', top, 'band', band, 'my_days', coalesce(my_days, 0), 'handle', handle);
end;
$$;
revoke execute on function public.my_rating(), public.partner_rating(), public.join_leaderboard(text), public.leave_leaderboard(), public.monthly_leaderboard() from public, anon;
grant execute on function public.my_rating(), public.partner_rating(), public.join_leaderboard(text), public.leave_leaderboard(), public.monthly_leaderboard() to authenticated;
