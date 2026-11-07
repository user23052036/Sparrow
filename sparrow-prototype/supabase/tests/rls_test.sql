-- Run with: supabase/tests/run.sh   (plain Postgres + stub)
\set ON_ERROR_STOP on
\set QUIET on

create or replace function pg_temp.as_user(u uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', u::text, false);
  execute 'set role authenticated';
end $$;
create or replace function pg_temp.check(cond boolean, msg text) returns void language plpgsql as $$
begin if not cond then raise exception 'FAIL: %', msg; end if; raise notice 'ok  %', msg; end $$;
create or replace function pg_temp.expect_error(q text, msg text) returns void language plpgsql as $$
begin
  begin execute q; exception when others then raise notice 'ok  % (error: %)', msg, sqlerrm; return; end;
  raise exception 'FAIL: expected error: %', msg;
end $$;

insert into auth.users values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'a@test'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'b@test');

-- ---------------------------------------------------------------- user A
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');
select pg_temp.check((select count(*) from profiles) = 1, 'A sees only own profile');
select pg_temp.check((select gentle_mode from profiles) = true, 'gentle mode is the default');
insert into tasks (title) values ('Write 200 words'), ('Walk 10 minutes'), ('Reply to one email');
select pg_temp.check((select count(*) from tasks) = 3, 'A created 3 tasks');
select pg_temp.expect_error($q$insert into points_ledger (user_id, delta, reason) values (auth.uid(), 1000, 'cheat')$q$,
  'A cannot write points directly');
select pg_temp.expect_error($q$insert into daily_plans (user_id, date) values (auth.uid(), current_date + 1)$q$,
  'A cannot create plans directly');
select pg_temp.expect_error($q$insert into focus_sessions (user_id, planned_minutes, ends_at) values (auth.uid(), 25, now())$q$,
  'A cannot create focus sessions directly');

select commit_day(array(select id from tasks order by title), 2, 30);
select pg_temp.check((select stake_amount from daily_plans) = 0, 'gentle mode forces stake to 0');
select pg_temp.expect_error($q$select commit_day(array(select id from tasks), 3, 0)$q$, 'cannot commit twice');

select set_item_status((select i.id from plan_items i join tasks t on t.id = i.task_id where t.title like 'Write%'), 'done');
select pg_temp.check((select count(*) from plan_items where status = 'done') = 1, 'item marked done');

-- review: Write=done(10), Walk=partial(5), Reply=pending->missed(0) => 15, no bonus
select pg_temp.check(
  (review_day((select id from daily_plans),
    jsonb_build_object((select i.id from plan_items i join tasks t on t.id=i.task_id where t.title like 'Walk%')::text, 'partial'),
    4) ->> 'total')::int = 15, 'review scores done=10 partial=5 missed=0');
select pg_temp.check(points_balance() = 15, 'balance is 15');
select pg_temp.check((select status from plan_items i join tasks t on t.id=i.task_id where t.title like 'Reply%') = 'missed',
  'pending items become missed at review');
select pg_temp.expect_error($q$select review_day((select id from daily_plans), '{}', null)$q$, 'cannot review twice');
select pg_temp.expect_error($q$select set_item_status((select id from plan_items limit 1), 'done')$q$,
  'cannot change items after review');

-- focus sessions
update blocklists set domains = '{youtube.com,reddit.com}';
select start_focus_session(25);
update blocklists set domains = '{youtube.com,reddit.com,x.com}';
select pg_temp.check((select cardinality(domains) from blocklists) = 3, 'can add sites during a session');
select pg_temp.expect_error($q$update blocklists set domains = '{youtube.com}'$q$, 'cannot remove sites during a session');
select pg_temp.check((get_focus_state() -> 'domains') ? 'x.com', 'focus state includes blocklist');
select pg_temp.check((get_focus_state() ->> 'active')::boolean, 'focus state reports active session');
select pg_temp.expect_error($q$select start_focus_session(25)$q$, 'only one session at a time');
select pg_temp.expect_error($q$select end_focus_session((select id from focus_sessions), null)$q$,
  'ending early requires a reason');
select end_focus_session((select id from focus_sessions), 'going for a walk');
select pg_temp.check((select ended_early from focus_sessions), 'session marked ended early');
select pg_temp.check((select count(*) from tamper_events where kind = 'early_exit') = 1, 'early exit logged');
select pg_temp.check(not (get_focus_state() ->> 'active')::boolean, 'no active session after ending');

-- devices
select heartbeat('dddddddd-0000-0000-0000-00000000000a', 'extension', 'Laptop Chrome', true);
select pg_temp.check((select count(*) from devices) = 1, 'heartbeat registers device');

-- proofs
insert into proofs (plan_item_id, kind, text_body, server_created_at, user_id)
  values ((select id from plan_items limit 1), 'text', 'did it', '2000-01-01', 'bbbbbbbb-0000-0000-0000-000000000002');
select pg_temp.check((select server_created_at > now() - interval '1 minute' from proofs), 'server sets proof timestamp');
select pg_temp.check((select count(*) from proofs) = 1, 'user_id forced to the author');
insert into proofs (plan_item_id, kind, storage_path, image_phash)
  values ((select id from plan_items limit 1), 'photo', 'aaaaaaaa-0000-0000-0000-000000000001/1.jpg', 'ffffffffffffff00');
insert into proofs (plan_item_id, kind, storage_path, image_phash)
  values ((select id from plan_items limit 1), 'photo', 'aaaaaaaa-0000-0000-0000-000000000001/2.jpg', 'ffffffffffffff01');
select pg_temp.check((select flagged_similar from proofs where storage_path like '%2.jpg'), 'near-duplicate photo is flagged');
select pg_temp.check(not (select flagged_similar from proofs where storage_path like '%1.jpg'), 'first photo not flagged');
insert into buddy_links (requester_id) values (auth.uid());
reset role;

-- ---------------------------------------------------------------- user B
select pg_temp.as_user('bbbbbbbb-0000-0000-0000-000000000002');
select pg_temp.check((select count(*) from tasks) = 0, 'B cannot see A''s tasks');
select pg_temp.check((select count(*) from daily_plans) = 0, 'B cannot see A''s plans');
select pg_temp.check((select count(*) from proofs) = 0, 'B cannot see A''s private proofs');
select pg_temp.check((select count(*) from focus_sessions) = 0, 'B cannot see A''s sessions');
select pg_temp.check((select count(*) from tamper_events) = 0, 'B cannot see A''s tamper events');
select pg_temp.check(points_balance() = 0, 'B has own (zero) balance');
update tasks set title = 'hacked';
reset role;
select pg_temp.check((select count(*) from tasks where title = 'hacked') = 0, 'B cannot edit A''s tasks');
select pg_temp.as_user('bbbbbbbb-0000-0000-0000-000000000002');
select pg_temp.expect_error($q$select heartbeat('dddddddd-0000-0000-0000-00000000000a', 'extension', 'stolen', true)$q$,
  'B cannot hijack A''s device id');
reset role;
select pg_temp.as_user('bbbbbbbb-0000-0000-0000-000000000002');
select pg_temp.expect_error($q$select review_day((select id from daily_plans where user_id='aaaaaaaa-0000-0000-0000-000000000001'), '{}', null)$q$,
  'B cannot review A''s day');
reset role;

-- B accepts A's buddy invite (acceptance UI is M6; simulated as admin here)
update buddy_links set partner_id = 'bbbbbbbb-0000-0000-0000-000000000002', status = 'active';
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');
update proofs set visibility = 'buddy' where kind = 'text';
reset role;
select pg_temp.as_user('bbbbbbbb-0000-0000-0000-000000000002');
select pg_temp.check((select count(*) from proofs) = 1, 'buddy sees only the shared proof');
select pg_temp.check((select count(*) from tamper_events) = 0, 'buddy cannot see tamper events unless shared');
reset role;

-- stakes once gentle mode is off
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');
update profiles set gentle_mode = false;
reset role;
-- move A's existing plan to yesterday so a new "today" exists
update daily_plans set date = date - 1;
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');
select pg_temp.expect_error($q$select commit_day(array(select id from tasks limit 1), 3, 40)$q$, 'cannot stake more than balance');
select commit_day(array(select id from tasks order by title limit 2), 3, 10);
select pg_temp.check(points_balance() = 5, 'stake of 10 is set aside (15 - 10)');
select pg_temp.check(
  (review_day((select id from daily_plans where reviewed_at is null),
     (select jsonb_object_agg(id::text, 'done') from plan_items where status = 'pending')) ->> 'total')::int = 40,
  'full day: 2x10 + bonus 10 + stake refund 10 = 40');
select pg_temp.check(points_balance() = 45, 'balance after full day is 45');
reset role;

