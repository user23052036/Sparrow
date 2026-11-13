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
  ('bbbbbbbb-0000-0000-0000-000000000002', 'b@test'),
  ('cccccccc-0000-0000-0000-000000000003', 'c@test');

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
select pg_temp.expect_error($q$insert into buddy_links (requester_id) values (auth.uid())$q$, 'links cannot be written directly');
update profiles set display_name = 'Asha';
select create_buddy_invite();
select pg_temp.check((select count(*) from buddy_links) = 1, 'A created an invite');
select pg_temp.check((select (create_buddy_invite()).invite_code) = (select invite_code from buddy_links), 'creating an invite twice returns the same one');
select pg_temp.check((partner_overview() ->> 'state') = 'pending', 'overview shows the pending invite');
select pg_temp.check(partner_badge() = 0, 'no badge without a partner');
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

-- ------------------------------------------------------------ partner flow
select invite_code as code from buddy_links where status = 'pending' \gset

select pg_temp.as_user('cccccccc-0000-0000-0000-000000000003');
select pg_temp.check((select count(*) from buddy_links) = 0, 'C cannot see A''s invite row');
select pg_temp.check((preview_buddy_invite(:'code') ->> 'valid')::boolean, 'C can preview a valid invite');
select pg_temp.check((preview_buddy_invite(:'code') ->> 'from') = 'Asha', 'preview shows the inviter''s name only');
select pg_temp.check(not (preview_buddy_invite('nonsense') ->> 'valid')::boolean, 'bad code is not valid');
reset role;

select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');
select pg_temp.check(not (preview_buddy_invite(:'code') ->> 'valid')::boolean, 'own invite cannot be previewed as valid');
select pg_temp.expect_error($q$select accept_buddy_invite((select invite_code from buddy_links))$q$, 'cannot accept your own invite');
reset role;

select pg_temp.as_user('bbbbbbbb-0000-0000-0000-000000000002');
select pg_temp.expect_error($q$select accept_buddy_invite('0000000000000000')$q$, 'unknown code is rejected');
select accept_buddy_invite(:'code');
select pg_temp.check((select status from buddy_links) = 'active', 'B accepted: partnership is active');
select pg_temp.check((select mutual from buddy_links), 'partnership is mutual');
select pg_temp.expect_error($q$select create_buddy_invite()$q$, 'B cannot start another invite while partnered');
reset role;

select pg_temp.as_user('cccccccc-0000-0000-0000-000000000003');
select pg_temp.expect_error(format('select accept_buddy_invite(%L)', :'code'), 'a used invite code cannot be accepted by a third person');
select pg_temp.check(not (preview_buddy_invite(:'code') ->> 'valid')::boolean, 'used invite is no longer valid');
select pg_temp.check((partner_overview() ->> 'state') = 'none', 'C has no partner');
reset role;

-- A shares one text proof
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');
update proofs set visibility = 'buddy' where kind = 'text';
reset role;

select pg_temp.as_user('bbbbbbbb-0000-0000-0000-000000000002');
select pg_temp.check((select count(*) from proofs) = 1, 'partner sees only the shared proof');
select pg_temp.check((select count(*) from tamper_events) = 1, 'partner sees A''s focus events (sharing is on by default)');
select pg_temp.check((partner_overview() -> 'partner' ->> 'name') = 'Asha', 'overview names the partner');
select pg_temp.check((partner_overview() -> 'activity' -> 'today' ->> 'committed')::boolean, 'overview shows A''s committed day');
select pg_temp.check(jsonb_array_length(partner_overview() -> 'activity' -> 'today' -> 'items') = 3, 'overview lists A''s three tasks');
select pg_temp.check(jsonb_array_length(partner_overview() -> 'proofs') = 1, 'overview lists the shared proof');
select pg_temp.check(partner_badge() = 1, 'badge counts the unreviewed shared proof');
-- verification
select verify_proof((select id from proofs), 'question', 'Which part did you finish?');
select pg_temp.check(partner_badge() = 0, 'badge clears after reviewing');
select pg_temp.check((partner_overview() -> 'proofs' -> 0 ->> 'verdict') = 'question', 'overview shows my verdict');
select verify_proof((select id from proofs), 'approve', null);
select pg_temp.check((select count(*) from verifications) = 1, 'a second verdict replaces the first');
select pg_temp.expect_error($q$select verify_proof(gen_random_uuid(), 'approve', null)$q$, 'cannot verify an unknown proof');
select pg_temp.expect_error($q$select verify_proof((select id from proofs), 'maybe', null)$q$, 'bad verdict is rejected');
reset role;

select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');
select pg_temp.check((select verdict from verifications) = 'approve', 'owner sees the partner''s verdict');
select pg_temp.expect_error($q$select verify_proof((select id from proofs where kind = 'text'), 'approve', null)$q$, 'cannot verify your own proof');
-- private photo proofs stay private
select pg_temp.check((select count(*) from proofs where visibility = 'private') = 2, 'A still has two private proofs');
reset role;

select pg_temp.as_user('cccccccc-0000-0000-0000-000000000003');
select pg_temp.expect_error($q$select verify_proof((select id from proofs), 'approve', null)$q$, 'a stranger cannot verify');
reset role;

-- turning sharing off hides activity but not explicitly shared proofs or key requests
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');
select set_my_sharing(false);
reset role;
select pg_temp.as_user('bbbbbbbb-0000-0000-0000-000000000002');
select pg_temp.check((partner_overview() -> 'activity') = 'null'::jsonb, 'activity is hidden when A stops sharing');
select pg_temp.check((select count(*) from tamper_events) = 0, 'focus events are hidden when A stops sharing');
select pg_temp.check(jsonb_array_length(partner_overview() -> 'proofs') = 1, 'explicitly shared proofs stay visible');
reset role;
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');
select set_my_sharing(true);
reset role;

-- ------------------------------------------------------------ partner key (locked sessions)
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');
select pg_temp.expect_error($q$select start_focus_session(130, null, null, true)$q$, 'locked sessions are capped at 120 minutes');
select start_focus_session(30, null, null, true);
select pg_temp.check((get_focus_state() ->> 'locked')::boolean, 'focus state reports the lock');
select pg_temp.expect_error($q$select end_focus_session((select id from focus_sessions where ended_at is null), 'I just want to stop')$q$, 'A cannot end a locked session alone');
select pg_temp.expect_error($q$select request_end_session((select id from focus_sessions where ended_at is null), 'x')$q$, 'a request needs a real reason');
select request_end_session((select id from focus_sessions where ended_at is null), 'I need a break');
select request_end_session((select id from focus_sessions where ended_at is null), 'I need a break');
select pg_temp.check((select count(*) from end_requests where status = 'pending') = 1, 'asking twice keeps one pending request');
reset role;
select id as reqid from end_requests where status = 'pending' \gset

select pg_temp.as_user('cccccccc-0000-0000-0000-000000000003');
select pg_temp.expect_error(format('select decide_end_request(%L, true)', :'reqid'), 'a stranger cannot approve');
reset role;

select pg_temp.as_user('bbbbbbbb-0000-0000-0000-000000000002');
select pg_temp.check(jsonb_array_length(partner_overview() -> 'pending_end_requests') = 1, 'partner sees the end request');
select pg_temp.check(partner_badge() = 1, 'badge counts the end request');
select pg_temp.check((partner_overview() -> 'activity' -> 'active_session' ->> 'locked')::boolean, 'partner sees the locked session');
select decide_end_request(:'reqid', false);
reset role;

select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');
select pg_temp.check((select status from end_requests) = 'denied', 'A sees the request was declined');
select pg_temp.check((get_focus_state() ->> 'active')::boolean, 'session keeps running after a decline');
select request_end_session((select id from focus_sessions where ended_at is null), 'Really need to stop');
reset role;
select id as reqid2 from end_requests where status = 'pending' \gset

select pg_temp.as_user('bbbbbbbb-0000-0000-0000-000000000002');
select decide_end_request(:'reqid2', true);
select pg_temp.expect_error(format('select decide_end_request(%L, true)', :'reqid2'), 'a decided request cannot be decided again');
reset role;

select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');
select pg_temp.check(not (get_focus_state() ->> 'active')::boolean, 'approval ends the session');
select pg_temp.check((select count(*) from tamper_events where detail like 'partner approved:%') = 1, 'approval is recorded as an early exit');
-- a new locked session is released if the partnership ends
select start_focus_session(30, null, null, true);
select pg_temp.check((select count(*) from focus_sessions where ended_at is null and locked) = 1, 'new locked session is running');
reset role;

select pg_temp.as_user('bbbbbbbb-0000-0000-0000-000000000002');
select end_buddy_link((select id from buddy_links));
select pg_temp.check((select count(*) from proofs) = 0, 'after the partnership ends B sees nothing of A');
select pg_temp.check((partner_overview() ->> 'state') = 'none', 'B is no longer partnered');
select pg_temp.expect_error($q$select start_focus_session(30, null, null, true)$q$, 'locking needs a partner');
reset role;

select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');
select pg_temp.check((select count(*) from focus_sessions where ended_at is null and locked) = 0, 'ending the partnership releases the lock');
select end_focus_session((select id from focus_sessions where ended_at is null), 'ending my own session');
select pg_temp.check((select count(*) from buddy_links where status = 'ended') = 1, 'ended partnership is recorded');
-- people can pair again after ending
select create_buddy_invite();
select pg_temp.check((partner_overview() ->> 'state') = 'pending', 'A can invite someone new');
reset role;

-- function permissions
set role anon;
select pg_temp.expect_error($q$select partner_overview()$q$, 'anonymous visitors cannot call partner functions');
select pg_temp.expect_error($q$select start_focus_session(25)$q$, 'anonymous visitors cannot start sessions');
reset role;
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');
select pg_temp.expect_error($q$select _partner_of('bbbbbbbb-0000-0000-0000-000000000002')$q$, 'internal helpers are not callable from the browser');
select pg_temp.expect_error($q$select _record_heartbeat_events('bbbbbbbb-0000-0000-0000-000000000002')$q$, 'internal heartbeat helper is not callable from the browser');
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


-- ------------------------------------------------- M7: lighter days (0006)
insert into auth.users values ('eeeeeeee-0000-0000-0000-000000000005', 'e@test');
select pg_temp.as_user('eeeeeeee-0000-0000-0000-000000000005');
insert into tasks (title) values ('One'), ('Two'), ('Three'), ('Four');
select pg_temp.check((select light_day from profiles) is null, 'light_day is off by default');
select pg_temp.check(count(*) = 1, 'E sees only own profile (light_day is private)') from profiles;
update profiles set light_day = (get_today()).date;
select pg_temp.expect_error($q$select commit_day(array(select id from tasks order by title limit 3), 1, 0)$q$,
  'a light day allows at most two tasks');
update profiles set gentle_mode = false;
select pg_temp.check(
  (commit_day(array(select id from tasks order by title limit 2), 1, 20)).stake_amount = 0,
  'a light day forces the stake to 0 and accepts two tasks');
reset role;
-- another user cannot set E's light day
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');
update profiles set light_day = null where id = 'eeeeeeee-0000-0000-0000-000000000005';
reset role;
select pg_temp.check((select light_day from profiles where id = 'eeeeeeee-0000-0000-0000-000000000005') is not null,
  'another user cannot clear E''s light day');

-- ------------------------------------------- M5b-1: device push tokens (0007)
select pg_temp.as_user('eeeeeeee-0000-0000-0000-000000000005');
select heartbeat('dddddddd-0000-0000-0000-0000000000e1', 'android', 'Pixel', true);
select set_push_token('dddddddd-0000-0000-0000-0000000000e1', 'fcm-token-abc');
select pg_temp.check((select push_token from devices where id = 'dddddddd-0000-0000-0000-0000000000e1') = 'fcm-token-abc',
  'owner can store an FCM token for their own device');
reset role;
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');
select pg_temp.expect_error($q$select set_push_token('dddddddd-0000-0000-0000-0000000000e1', 'hijack')$q$,
  'another user cannot overwrite a device token');
select pg_temp.check((select count(*) from devices where id = 'dddddddd-0000-0000-0000-0000000000e1') = 0,
  'another user cannot see the device or its token');
reset role;
set role anon;
select pg_temp.expect_error($q$select set_push_token('dddddddd-0000-0000-0000-0000000000e1', 'x')$q$, 'anonymous visitors cannot set tokens');
reset role;

-- ------------------------------------------------- M8: feedback, scheduled checks, metrics (0008)
select pg_temp.as_user('eeeeeeee-0000-0000-0000-000000000005');
insert into feedback (message, helpful, page) values ('Lovely and calm', 5, '/today');
select pg_temp.check((select count(*) from feedback) = 1, 'a user can leave and read their own feedback');
select pg_temp.expect_error($q$insert into feedback (user_id, message) values ('aaaaaaaa-0000-0000-0000-000000000001', 'as someone else')$q$,
  'feedback cannot be written as another user');
select pg_temp.expect_error($q$insert into feedback (message) values ('   ')$q$, 'blank feedback is refused');
select pg_temp.expect_error($q$insert into feedback (message, helpful) values ('x', 9)$q$, 'helpfulness is 1 to 5');
update feedback set message = 'edited';
select pg_temp.check((select message from feedback) = 'Lovely and calm', 'feedback cannot be edited');
select pg_temp.expect_error($q$select beta_metrics(30)$q$, 'users cannot call beta_metrics');
select pg_temp.expect_error($q$select check_all_heartbeats()$q$, 'users cannot call the scheduled heartbeat job');
reset role;
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');
select pg_temp.check((select count(*) from feedback) = 0, 'other users cannot read E''s feedback');
reset role;
set role anon;
select pg_temp.expect_error($q$select beta_metrics(30)$q$, 'anonymous visitors cannot call beta_metrics');
reset role;
select pg_temp.check((select (beta_metrics(30) ->> 'active_users')::int) >= 1, 'beta_metrics runs for the owner and counts active users');
select pg_temp.check(jsonb_typeof(beta_metrics(30) -> 'retention') = 'object', 'beta_metrics reports retention');
select pg_temp.check(check_all_heartbeats() >= 0, 'scheduled heartbeat check runs');
-- a quiet blocking device during a running session is recorded by the scheduled job, with nobody logged in
insert into auth.users values ('ffffffff-0000-0000-0000-000000000006', 'f@test');
insert into devices (id, user_id, platform, last_heartbeat_at) values ('dddddddd-0000-0000-0000-0000000000f1', 'ffffffff-0000-0000-0000-000000000006', 'extension', now() - interval '10 minutes');
insert into focus_sessions (user_id, planned_minutes, started_at, ends_at) values ('ffffffff-0000-0000-0000-000000000006', 25, now() - interval '9 minutes', now() + interval '16 minutes');
select pg_temp.check(check_all_heartbeats() >= 1, 'scheduled job records a lost heartbeat');
select pg_temp.check((select count(*) from tamper_events where user_id = 'ffffffff-0000-0000-0000-000000000006' and kind = 'heartbeat_lost') = 1,
  'the lost heartbeat is stored once');
select check_all_heartbeats();
select pg_temp.check((select count(*) from tamper_events where user_id = 'ffffffff-0000-0000-0000-000000000006' and kind = 'heartbeat_lost') = 1,
  'running the job again does not duplicate it');

-- ------------------------------------------------- D20: account deletion (0009)
insert into auth.users values
  ('99999999-0000-0000-0000-0000000000a1', 'g@test'),
  ('99999999-0000-0000-0000-0000000000a2', 'h@test');
insert into profiles (id, display_name) values ('99999999-0000-0000-0000-0000000000a1', 'Gus') on conflict (id) do nothing;
insert into profiles (id, display_name) values ('99999999-0000-0000-0000-0000000000a2', 'Hana') on conflict (id) do nothing;
insert into tasks (user_id, title) values ('99999999-0000-0000-0000-0000000000a1', 'Gus task');
insert into feedback (user_id, message) values ('99999999-0000-0000-0000-0000000000a1', 'bye');
insert into devices (id, user_id, platform) values ('dddddddd-0000-0000-0000-0000000000a1', '99999999-0000-0000-0000-0000000000a1', 'extension');
insert into buddy_links (requester_id, partner_id, status, mutual)
  values ('99999999-0000-0000-0000-0000000000a1', '99999999-0000-0000-0000-0000000000a2', 'active', true);
insert into focus_sessions (user_id, planned_minutes, ends_at, locked)
  values ('99999999-0000-0000-0000-0000000000a2', 60, now() + interval '50 minutes', true);
select pg_temp.check((select locked from focus_sessions where user_id = '99999999-0000-0000-0000-0000000000a2'), 'H has a locked session while partnered');
delete from auth.users where id = '99999999-0000-0000-0000-0000000000a1';
select pg_temp.check(not exists (select 1 from profiles where id = '99999999-0000-0000-0000-0000000000a1'), 'deleting an account removes the profile');
select pg_temp.check(not exists (select 1 from tasks where user_id = '99999999-0000-0000-0000-0000000000a1'), 'deleting an account removes tasks');
select pg_temp.check(not exists (select 1 from feedback where user_id = '99999999-0000-0000-0000-0000000000a1'), 'deleting an account removes feedback');
select pg_temp.check(not exists (select 1 from devices where user_id = '99999999-0000-0000-0000-0000000000a1'), 'deleting an account removes devices');
select pg_temp.check(not exists (select 1 from buddy_links where requester_id = '99999999-0000-0000-0000-0000000000a1'), 'deleting an account ends the partnership row');
select pg_temp.check(not (select locked from focus_sessions where user_id = '99999999-0000-0000-0000-0000000000a2'), 'the partner''s locked session is released');
select pg_temp.check(exists (select 1 from profiles where id = '99999999-0000-0000-0000-0000000000a2'), 'the partner''s own data is untouched');

-- ------------------------------------------------- if-then plans (0010)
insert into auth.users values ('88888888-0000-0000-0000-000000000001', 'i@test');
select pg_temp.expect_error($q$insert into tasks (user_id, title, if_cue) values ('88888888-0000-0000-0000-000000000001', 'half plan', 'I sit down')$q$,
  'an if-then plan needs both parts');
select pg_temp.expect_error($q$insert into tasks (user_id, title, if_cue, then_action) values ('88888888-0000-0000-0000-000000000001', 'blank', '   ', 'x')$q$,
  'an if-then plan cannot be blank');
insert into tasks (user_id, title, if_cue, then_action) values ('88888888-0000-0000-0000-000000000001', 'full plan', 'I sit down', 'open the doc');
select pg_temp.check((select then_action from tasks where title = 'full plan') = 'open the doc', 'a full if-then plan is stored');
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-000000000001');
select pg_temp.check((select count(*) from tasks where title = 'full plan') = 0, 'another user cannot see someone else''s if-then plan');
reset role;

-- ------------------------------------------------- kind acts (0011)
insert into auth.users values ('77777777-0000-0000-0000-000000000001', 'k@test'), ('77777777-0000-0000-0000-000000000002', 'l@test');
insert into daily_plans (id, user_id, date, committed_at, reviewed_at) values
  ('77777777-1111-0000-0000-000000000001', '77777777-0000-0000-0000-000000000001', current_date - 1, now(), now()),
  ('77777777-1111-0000-0000-000000000002', '77777777-0000-0000-0000-000000000001', current_date - 2, now(), now()),
  ('77777777-1111-0000-0000-000000000003', '77777777-0000-0000-0000-000000000001', current_date - 3, now(), null);
insert into tasks (id, user_id, title) values ('77777777-2222-0000-0000-000000000001', '77777777-0000-0000-0000-000000000001', 'k task');
insert into plan_items (daily_plan_id, user_id, task_id, status) values
  ('77777777-1111-0000-0000-000000000001', '77777777-0000-0000-0000-000000000001', '77777777-2222-0000-0000-000000000001', 'missed'),
  ('77777777-1111-0000-0000-000000000002', '77777777-0000-0000-0000-000000000001', '77777777-2222-0000-0000-000000000001', 'done'),
  ('77777777-1111-0000-0000-000000000003', '77777777-0000-0000-0000-000000000001', '77777777-2222-0000-0000-000000000001', 'missed');
select pg_temp.as_user('77777777-0000-0000-0000-000000000002');
select pg_temp.expect_error($q$select log_kind_act('77777777-1111-0000-0000-000000000001', 'x')$q$, 'another user cannot log a kind act on my day');
reset role;
select pg_temp.as_user('77777777-0000-0000-0000-000000000001');
select pg_temp.expect_error($q$select log_kind_act('77777777-1111-0000-0000-000000000002')$q$, 'no kind act when nothing was missed');
select pg_temp.expect_error($q$select log_kind_act('77777777-1111-0000-0000-000000000003')$q$, 'no kind act before the day is reviewed');
select pg_temp.check((log_kind_act('77777777-1111-0000-0000-000000000001', '  Called my aunt ') ->> 'points')::int = 5, 'a kind act on a missed day earns 5 points');
select pg_temp.check((select note from kind_acts) = 'Called my aunt', 'the note is trimmed and stored');
select pg_temp.check((log_kind_act('77777777-1111-0000-0000-000000000001') ->> 'points')::int = 0, 'a second kind act for the same day earns nothing');
select pg_temp.check((select sum(delta) from points_ledger where reason = 'kind_act') = 5, 'points were added once');
select pg_temp.expect_error($q$insert into kind_acts (user_id, plan_id) values ('77777777-0000-0000-0000-000000000001', '77777777-1111-0000-0000-000000000002')$q$, 'clients cannot write kind acts directly');
reset role;
select pg_temp.as_user('77777777-0000-0000-0000-000000000002');
select pg_temp.check((select count(*) from kind_acts) = 0, 'other users cannot read my kind acts');
reset role;

-- ------------------------------------------------- progress and export (0012)
insert into auth.users values ('66666666-0000-0000-0000-000000000001', 'm@test'), ('66666666-0000-0000-0000-000000000002', 'n@test');
insert into profiles (id, display_name, timezone) values ('66666666-0000-0000-0000-000000000001', 'Mia', 'UTC') on conflict (id) do nothing;
insert into tasks (id, user_id, title) values
  ('66666666-2222-0000-0000-000000000001', '66666666-0000-0000-0000-000000000001', 'm task'),
  ('66666666-2222-0000-0000-000000000002', '66666666-0000-0000-0000-000000000002', 'n task');
-- Mia: three consecutive credited days (the middle one partly done, one with a miss), then a gap, then one more
insert into daily_plans (id, user_id, date, committed_at, reviewed_at, mood_morning, mood_evening) values
  ('66666666-1111-0000-0000-000000000001', '66666666-0000-0000-0000-000000000001', current_date - 10, now(), now(), 4, 5),
  ('66666666-1111-0000-0000-000000000002', '66666666-0000-0000-0000-000000000001', current_date - 9,  now(), now(), 3, 3),
  ('66666666-1111-0000-0000-000000000003', '66666666-0000-0000-0000-000000000001', current_date - 8,  now(), now(), 2, null),
  ('66666666-1111-0000-0000-000000000004', '66666666-0000-0000-0000-000000000001', current_date - 5,  now(), now(), null, null),
  ('66666666-1111-0000-0000-000000000005', '66666666-0000-0000-0000-000000000002', current_date - 1,  now(), now(), null, null);
insert into plan_items (daily_plan_id, user_id, task_id, status) values
  ('66666666-1111-0000-0000-000000000001', '66666666-0000-0000-0000-000000000001', '66666666-2222-0000-0000-000000000001', 'done'),
  ('66666666-1111-0000-0000-000000000002', '66666666-0000-0000-0000-000000000001', '66666666-2222-0000-0000-000000000001', 'partial'),
  ('66666666-1111-0000-0000-000000000003', '66666666-0000-0000-0000-000000000001', '66666666-2222-0000-0000-000000000001', 'done'),
  ('66666666-1111-0000-0000-000000000004', '66666666-0000-0000-0000-000000000001', '66666666-2222-0000-0000-000000000001', 'missed'),
  ('66666666-1111-0000-0000-000000000005', '66666666-0000-0000-0000-000000000002', '66666666-2222-0000-0000-000000000002', 'done');
select pg_temp.as_user('66666666-0000-0000-0000-000000000001');
select pg_temp.check((my_progress() ->> 'best_run')::int = 3, 'best run counts partly done days and stops at a gap');
select pg_temp.check(my_progress() -> 'badges' @> '["first_plan","first_full_day","run_3"]'::jsonb, 'first plan, first full day and a 3-day run are earned');
select pg_temp.check(not (my_progress() -> 'badges' @> '["run_7"]'::jsonb), 'no 7-day badge yet');
select pg_temp.check(not (my_progress() -> 'badges' @> '["first_proof"]'::jsonb), 'no proof badge without a proof');
select pg_temp.check(jsonb_array_length(my_progress() -> 'mood') = 3, 'mood trend lists only days with a mood');
select pg_temp.check(jsonb_array_length(my_progress(2) -> 'mood') = 2, 'mood trend honours the day limit');
select pg_temp.check((my_progress() ->> 'helping_days')::int = 0, 'no helping days yet');
reset role;
-- Mia helps Nia on two separate days: a verdict and a decided end request
-- a trigger stamps the proof owner from the session user, so act as Nia while inserting her proof
select set_config('request.jwt.claim.sub', '66666666-0000-0000-0000-000000000002', false);
insert into proofs (id, plan_item_id, user_id, kind, text_body, visibility)
  select '66666666-3333-0000-0000-000000000001', i.id, '66666666-0000-0000-0000-000000000002', 'text', 'done it', 'buddy'
    from plan_items i where i.user_id = '66666666-0000-0000-0000-000000000002';
select set_config('request.jwt.claim.sub', '66666666-0000-0000-0000-000000000001', false);
insert into verifications (proof_id, verifier_id, verdict, created_at) values ('66666666-3333-0000-0000-000000000001', '66666666-0000-0000-0000-000000000001', 'approve', now());
insert into focus_sessions (id, user_id, planned_minutes, ends_at, locked) values ('66666666-4444-0000-0000-000000000001', '66666666-0000-0000-0000-000000000002', 30, now() + interval '20 minutes', true);
insert into end_requests (session_id, user_id, reason, status, decided_by, decided_at)
  values ('66666666-4444-0000-0000-000000000001', '66666666-0000-0000-0000-000000000002', 'need a break', 'approved', '66666666-0000-0000-0000-000000000001', now() - interval '1 day');
select pg_temp.as_user('66666666-0000-0000-0000-000000000001');
select pg_temp.check((my_progress() ->> 'helping_days')::int = 2, 'helping days count distinct days of verdicts and decisions');
select pg_temp.check(my_progress() -> 'badges' @> '["helped_partner"]'::jsonb, 'helping a partner earns the badge');
reset role;
select pg_temp.as_user('66666666-0000-0000-0000-000000000002');
select pg_temp.check((my_progress() ->> 'helping_days')::int = 0, 'being helped does not count as helping');
select pg_temp.check(jsonb_array_length(my_progress() -> 'mood') = 0, 'another user sees none of Mia''s mood entries');
reset role;
-- export: only the caller's rows, no tokens or storage paths, and not a partner's shared proofs
insert into devices (id, user_id, platform, push_token) values ('dddddddd-0000-0000-0000-0000000000b1', '66666666-0000-0000-0000-000000000001', 'android', 'SECRET-TOKEN');
insert into buddy_links (requester_id, partner_id, status, mutual) values ('66666666-0000-0000-0000-000000000002', '66666666-0000-0000-0000-000000000001', 'active', true);
select pg_temp.as_user('66666666-0000-0000-0000-000000000001');
select pg_temp.check(jsonb_array_length(export_my_data() -> 'tasks') = 1, 'export holds only my tasks');
select pg_temp.check(jsonb_array_length(export_my_data() -> 'proofs') = 0, 'export leaves out a partner''s shared proofs even though I can read them');
select pg_temp.check(position('SECRET-TOKEN' in export_my_data()::text) = 0, 'export never contains device push tokens');
select pg_temp.check(position('invite_code' in export_my_data()::text) = 0, 'export leaves out the invite code');
select pg_temp.check(export_my_data() #>> '{profile,display_name}' = 'Mia', 'export includes my profile');
reset role;
select set_config('request.jwt.claim.sub', '', false);
set role anon;
select pg_temp.expect_error($q$select export_my_data()$q$, 'anonymous visitors cannot export');
select pg_temp.expect_error($q$select my_progress()$q$, 'anonymous visitors cannot read progress');
reset role;

-- ------------------------------------------------- charity pledges, practice mode (0013)
insert into auth.users values ('55555555-0000-0000-0000-000000000001', 'p@test'), ('55555555-0000-0000-0000-000000000002', 'q@test');
insert into profiles (id) values ('55555555-0000-0000-0000-000000000001') on conflict (id) do nothing;
insert into profiles (id) values ('55555555-0000-0000-0000-000000000002') on conflict (id) do nothing;
insert into charities (id, name, active) values
  ('55555555-9999-0000-0000-000000000001', 'Test Charity One', true),
  ('55555555-9999-0000-0000-000000000002', 'Retired Charity', false);
select set_config('request.jwt.claim.sub', '55555555-0000-0000-0000-000000000001', false);
insert into tasks (user_id, title) values ('55555555-0000-0000-0000-000000000001', 'P1'), ('55555555-0000-0000-0000-000000000001', 'P2');
select pg_temp.as_user('55555555-0000-0000-0000-000000000001');
select pg_temp.check((select count(*) from charities) = 1, 'people see only active charities');
select pg_temp.check(pledge_limit() = 20, 'the first pledge limit is 20');
select commit_day(array(select id from tasks order by title), 3, 0);
select pg_temp.expect_error($q$select set_pledge(10, '55555555-9999-0000-0000-000000000001', true)$q$, 'no pledge while Gentle Mode is on');
update profiles set gentle_mode = false;
select pg_temp.expect_error($q$select set_pledge(10, '55555555-9999-0000-0000-000000000001', false)$q$, 'a pledge needs the person to confirm');
select pg_temp.expect_error($q$select set_pledge(0, '55555555-9999-0000-0000-000000000001', true)$q$, 'a pledge must be at least 1');
select pg_temp.expect_error($q$select set_pledge(21, '55555555-9999-0000-0000-000000000001', true)$q$, 'the first pledge cannot be above 20');
select pg_temp.expect_error($q$select set_pledge(10, '55555555-9999-0000-0000-000000000002', true)$q$, 'a retired charity cannot be chosen');
select pg_temp.expect_error($q$select set_pledge(10, gen_random_uuid(), true)$q$, 'an unknown charity cannot be chosen');
select pg_temp.check((set_pledge(20, '55555555-9999-0000-0000-000000000001', true)).mode = 'practice', 'a pledge is stored in practice mode');
select pg_temp.expect_error($q$select set_pledge(5, '55555555-9999-0000-0000-000000000001', true)$q$, 'only one pledge per day');
select pg_temp.expect_error($q$insert into pledges (user_id, plan_id, charity_id, amount) select auth.uid(), id, '55555555-9999-0000-0000-000000000001', 5 from daily_plans$q$, 'clients cannot write pledges directly');
select set_item_status((select i.id from plan_items i join tasks t on t.id = i.task_id where t.title = 'P1'), 'done');
-- P1 done, P2 missed: half done, so half of 20 stays "owed"
select review_day((select id from daily_plans), '{}', 3);
select pg_temp.check((select owed from pledges) = 10 and (select status from pledges) = 'owed', 'half a day done: 10 of 20 is owed (practice)');
reset role;
update daily_plans set date = current_date - 1 where user_id = '55555555-0000-0000-0000-000000000001';

-- day 2: the limit rises gradually (twice the biggest recent pledge), a full day clears it
select pg_temp.as_user('55555555-0000-0000-0000-000000000001');
select pg_temp.check(pledge_limit() = 40, 'the limit doubles after a 20 pledge');
select commit_day(array(select id from tasks order by title), 4, 0);
select pg_temp.expect_error($q$select set_pledge(41, '55555555-9999-0000-0000-000000000001', true)$q$, 'cannot jump past the gradual limit');
select set_pledge(40, '55555555-9999-0000-0000-000000000001', true);
select review_day((select id from daily_plans where reviewed_at is null), (select jsonb_object_agg(id::text, 'done') from plan_items where status = 'pending'), 4);
select pg_temp.check((select status from pledges where amount = 40) = 'cleared' and (select owed from pledges where amount = 40) = 0, 'a full day clears the pledge');
reset role;
update daily_plans set date = current_date - 2 where user_id = '55555555-0000-0000-0000-000000000001' and date = current_date;

-- day 3: a heavy morning means no pledge
select pg_temp.as_user('55555555-0000-0000-0000-000000000001');
select commit_day(array(select id from tasks order by title), 2, 0);
select pg_temp.expect_error($q$select set_pledge(10, '55555555-9999-0000-0000-000000000001', true)$q$, 'no pledge after a heavy morning');
reset role;
update daily_plans set date = current_date - 3 where user_id = '55555555-0000-0000-0000-000000000001' and date = current_date;

-- day 4: not once the day's tasks have started
select pg_temp.as_user('55555555-0000-0000-0000-000000000001');
select commit_day(array(select id from tasks order by title), 4, 0);
select set_item_status((select id from plan_items where daily_plan_id = (select id from daily_plans where date = current_date) limit 1), 'done');
select pg_temp.expect_error($q$select set_pledge(10, '55555555-9999-0000-0000-000000000001', true)$q$, 'no pledge once a task has been started');
reset role;
update daily_plans set date = current_date - 4 where user_id = '55555555-0000-0000-0000-000000000001' and date = current_date;

-- day 5: a lighter day means no pledge
select pg_temp.as_user('55555555-0000-0000-0000-000000000001');
update profiles set light_day = current_date;
select commit_day(array(select id from tasks order by title), 4, 0);
select pg_temp.expect_error($q$select set_pledge(10, '55555555-9999-0000-0000-000000000001', true)$q$, 'no pledge on a lighter day');
reset role;

-- privacy and the practice-only guarantee
select pg_temp.as_user('55555555-0000-0000-0000-000000000002');
select pg_temp.check((select count(*) from pledges) = 0, 'other people cannot read my pledges');
select pg_temp.expect_error($q$select pledge_metrics(30)$q$, 'people cannot call pledge_metrics');
reset role;
select pg_temp.expect_error($q$insert into pledges (user_id, plan_id, charity_id, amount, mode) select user_id, id, '55555555-9999-0000-0000-000000000001', 5, 'live' from daily_plans where date = current_date and user_id = '55555555-0000-0000-0000-000000000001'$q$, 'a live-money pledge cannot exist yet');
select pg_temp.check((pledge_metrics(30) ->> 'mode') = 'practice' and (pledge_metrics(30) ->> 'practice_total_pledged')::int = 60, 'pledge_metrics reports practice totals to the owner');
select pg_temp.check((pledge_metrics(30) ->> 'practice_total_owed')::int = 10, 'pledge_metrics reports the practice amount owed');

-- ------------------------------------------------- partner penalty and nudges (0014)
insert into auth.users values
  ('44444444-0000-0000-0000-000000000001', 'r@test'), ('44444444-0000-0000-0000-000000000002', 's@test'),
  ('44444444-0000-0000-0000-000000000003', 't@test'), ('44444444-0000-0000-0000-000000000004', 'u@test');
insert into profiles (id) values ('44444444-0000-0000-0000-000000000001'), ('44444444-0000-0000-0000-000000000002'),
  ('44444444-0000-0000-0000-000000000003'), ('44444444-0000-0000-0000-000000000004') on conflict (id) do nothing;
update profiles set gentle_mode = false where id in ('44444444-0000-0000-0000-000000000001', '44444444-0000-0000-0000-000000000002');
insert into buddy_links (id, requester_id, partner_id, status, mutual) values
  ('44444444-7777-0000-0000-000000000001', '44444444-0000-0000-0000-000000000001', '44444444-0000-0000-0000-000000000002', 'active', true);
select set_config('request.jwt.claim.sub', '44444444-0000-0000-0000-000000000001', false);
insert into tasks (user_id, title) values ('44444444-0000-0000-0000-000000000001', 'R1'), ('44444444-0000-0000-0000-000000000001', 'R2');

-- nothing happens until BOTH opt in
select pg_temp.as_user('44444444-0000-0000-0000-000000000001');
select commit_day(array(select id from tasks where title like 'R%' order by title), 3, 0);
select set_pledge(20, '55555555-9999-0000-0000-000000000001', true);
select review_day((select id from daily_plans where user_id = auth.uid() and reviewed_at is null), '{}', 3);
reset role;
select pg_temp.check((select count(*) from partner_pledges) = 0, 'no partner penalty when nobody opted in');
update daily_plans set date = current_date - 1 where user_id = '44444444-0000-0000-0000-000000000001';

select pg_temp.as_user('44444444-0000-0000-0000-000000000001');
select pg_temp.check((select (set_penalty_optin(true) ->> 'on')::boolean) = false, 'one person opting in is not enough');
reset role;
select pg_temp.as_user('44444444-0000-0000-0000-000000000002');
select pg_temp.check((penalty_status() ->> 'theirs')::boolean, 'the partner can see that the other person opted in');
select pg_temp.check((set_penalty_optin(true) ->> 'on')::boolean, 'both opted in: the partner penalty is on');
reset role;
select pg_temp.as_user('44444444-0000-0000-0000-000000000001');
select commit_day(array(select id from tasks where title like 'R%' order by title), 3, 0);
select set_pledge(20, '55555555-9999-0000-0000-000000000001', true);
select review_day((select id from daily_plans where user_id = auth.uid() and reviewed_at is null),
  (select jsonb_build_object(i.id::text, 'done') from plan_items i join tasks t on t.id = i.task_id where t.title = 'R1' and i.daily_plan_id = (select id from daily_plans where user_id = auth.uid() and reviewed_at is null)), 3);
select pg_temp.check((select count(*) from partner_pledges) = 0, 'the person whose day it was cannot see the partner pledge');
reset role;
select pg_temp.check((select amount from partner_pledges) = 3 and (select payer_id from partner_pledges) = '44444444-0000-0000-0000-000000000002', 'half a 20 pledge: owes 10, the partner owes a quarter, rounded up (3)');
select pg_temp.as_user('44444444-0000-0000-0000-000000000002');
select pg_temp.check((select count(*) from partner_pledges) = 1, 'the partner can read their own practice pledge');
select pg_temp.check((penalty_status() ->> 'practice_total_30d')::int = 3, 'the partner sees their practice total');
select pg_temp.expect_error($q$insert into partner_pledges (plan_id, payer_id, for_user_id, charity_id, amount) values (gen_random_uuid(), auth.uid(), auth.uid(), '55555555-9999-0000-0000-000000000001', 1)$q$, 'clients cannot write partner pledges');
reset role;
select pg_temp.expect_error($q$insert into partner_pledges (plan_id, payer_id, for_user_id, charity_id, amount, mode) values (gen_random_uuid(), '44444444-0000-0000-0000-000000000002', '44444444-0000-0000-0000-000000000001', '55555555-9999-0000-0000-000000000001', 1, 'live')$q$, 'a live partner pledge cannot exist yet');
update daily_plans set date = current_date - 2 where user_id = '44444444-0000-0000-0000-000000000001' and date = current_date;

-- a full day costs the partner nothing; a partner in Gentle Mode or opted out is skipped
select pg_temp.as_user('44444444-0000-0000-0000-000000000001');
select commit_day(array(select id from tasks where title like 'R%' order by title), 3, 0);
select set_pledge(40, '55555555-9999-0000-0000-000000000001', true);
select review_day((select id from daily_plans where user_id = auth.uid() and reviewed_at is null), (select jsonb_object_agg(id::text, 'done') from plan_items where status = 'pending'), 3);
reset role;
select pg_temp.check((select count(*) from partner_pledges) = 1, 'a full day creates no partner pledge');
update daily_plans set date = current_date - 3 where user_id = '44444444-0000-0000-0000-000000000001' and date = current_date;
update profiles set gentle_mode = true where id = '44444444-0000-0000-0000-000000000002';
select pg_temp.as_user('44444444-0000-0000-0000-000000000001');
select commit_day(array(select id from tasks where title like 'R%' order by title), 3, 0);
select set_pledge(40, '55555555-9999-0000-0000-000000000001', true);
select review_day((select id from daily_plans where user_id = auth.uid() and reviewed_at is null), '{}', 3);
reset role;
select pg_temp.check((select count(*) from partner_pledges) = 1, 'a partner in Gentle Mode is never charged');
update daily_plans set date = current_date - 4 where user_id = '44444444-0000-0000-0000-000000000001' and date = current_date;
update profiles set gentle_mode = false where id = '44444444-0000-0000-0000-000000000002';
select pg_temp.as_user('44444444-0000-0000-0000-000000000002');
select set_penalty_optin(false);
reset role;
select pg_temp.as_user('44444444-0000-0000-0000-000000000001');
select commit_day(array(select id from tasks where title like 'R%' order by title), 3, 0);
select set_pledge(40, '55555555-9999-0000-0000-000000000001', true);
select review_day((select id from daily_plans where user_id = auth.uid() and reviewed_at is null), '{}', 3);
reset role;
select pg_temp.check((select count(*) from partner_pledges) = 1, 'opting out takes effect immediately');
select pg_temp.as_user('44444444-0000-0000-0000-000000000003');
select pg_temp.expect_error($q$select set_penalty_optin(true)$q$, 'no opt-in without a partner');
select pg_temp.check((penalty_status() ->> 'state') = 'none', 'no partner means no penalty status');
reset role;

-- nudges: T has been having hard days; U is T's partner
insert into buddy_links (requester_id, partner_id, status, mutual) values ('44444444-0000-0000-0000-000000000003', '44444444-0000-0000-0000-000000000004', 'active', true);
insert into tasks (id, user_id, title) values ('44444444-2222-0000-0000-000000000003', '44444444-0000-0000-0000-000000000003', 'T task');
insert into daily_plans (id, user_id, date, committed_at, reviewed_at) values
  ('44444444-1111-0000-0000-000000000010', '44444444-0000-0000-0000-000000000003', (now() at time zone 'UTC')::date, now(), now()),
  ('44444444-1111-0000-0000-000000000011', '44444444-0000-0000-0000-000000000003', (now() at time zone 'UTC')::date - 1, now(), now()),
  ('44444444-1111-0000-0000-000000000012', '44444444-0000-0000-0000-000000000003', (now() at time zone 'UTC')::date - 2, now(), now());
insert into plan_items (daily_plan_id, user_id, task_id, status)
  select id, '44444444-0000-0000-0000-000000000003', '44444444-2222-0000-0000-000000000003', 'missed' from daily_plans where user_id = '44444444-0000-0000-0000-000000000003';
select pg_temp.as_user('44444444-0000-0000-0000-000000000004');
select pg_temp.check((partner_support_nudge() ->> 'level')::int = 2 and (partner_support_nudge() ->> 'days')::int = 3, 'three hard days in a row: the partner gets the stronger, still gentle, nudge');
reset role;
delete from daily_plans where id = '44444444-1111-0000-0000-000000000012';
select pg_temp.as_user('44444444-0000-0000-0000-000000000004');
select pg_temp.check((partner_support_nudge() ->> 'level')::int = 1, 'two hard days: a light nudge');
reset role;
update buddy_links set requester_shares = false where requester_id = '44444444-0000-0000-0000-000000000003';
select pg_temp.as_user('44444444-0000-0000-0000-000000000004');
select pg_temp.check((partner_support_nudge() ->> 'level')::int = 0, 'no nudge when the person does not share their activity');
reset role;
select pg_temp.as_user('44444444-0000-0000-0000-000000000003');
select pg_temp.check((partner_support_nudge() ->> 'level')::int = 0, 'the person having hard days is never nudged about themselves');
reset role;

-- ------------------------------------------------- rating and leaderboard (0015)
-- W: 8 reviewed days, 4 done and 4 missed (average 0.5), a partner X, and support on 3 different days
insert into auth.users values ('22222222-0000-0000-0000-000000000001', 'w@test'), ('22222222-0000-0000-0000-000000000002', 'x@test');
insert into profiles (id) values ('22222222-0000-0000-0000-000000000001'), ('22222222-0000-0000-0000-000000000002') on conflict (id) do nothing;
insert into tasks (id, user_id, title) values ('22222222-2222-0000-0000-000000000001', '22222222-0000-0000-0000-000000000001', 'W task'), ('22222222-2222-0000-0000-000000000002', '22222222-0000-0000-0000-000000000002', 'X task');
insert into daily_plans (id, user_id, date, committed_at, reviewed_at)
  select ('22222222-1111-0000-0000-' || lpad(g::text, 12, '0'))::uuid, '22222222-0000-0000-0000-000000000001', (now() at time zone 'UTC')::date - g, now(), now() from generate_series(1, 8) g;
insert into plan_items (daily_plan_id, user_id, task_id, status)
  select id, '22222222-0000-0000-0000-000000000001', '22222222-2222-0000-0000-000000000001', case when (now() at time zone 'UTC')::date - date <= 4 then 'done' else 'missed' end
    from daily_plans where user_id = '22222222-0000-0000-0000-000000000001';
select pg_temp.as_user('22222222-0000-0000-0000-000000000001');
select pg_temp.check((my_rating() ->> 'reliability')::numeric = 3.0, 'half the days done: reliability is 3.0 of 5');
select pg_temp.check((my_rating() -> 'support') = 'null'::jsonb, 'no partner yet: no support rating');
reset role;
insert into buddy_links (requester_id, partner_id, status, mutual) values ('22222222-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000002', 'active', true);
select set_config('request.jwt.claim.sub', '22222222-0000-0000-0000-000000000002', false);
insert into daily_plans (id, user_id, date, committed_at) values ('22222222-1111-0000-0000-0000000000a1', '22222222-0000-0000-0000-000000000002', (now() at time zone 'UTC')::date, now());
insert into plan_items (id, daily_plan_id, user_id, task_id) values ('22222222-5555-0000-0000-000000000001', '22222222-1111-0000-0000-0000000000a1', '22222222-0000-0000-0000-000000000002', '22222222-2222-0000-0000-000000000002');
insert into proofs (id, plan_item_id, user_id, kind, text_body, visibility) values
  ('22222222-3333-0000-0000-000000000001', '22222222-5555-0000-0000-000000000001', '22222222-0000-0000-0000-000000000002', 'text', 'a', 'buddy'),
  ('22222222-3333-0000-0000-000000000002', '22222222-5555-0000-0000-000000000001', '22222222-0000-0000-0000-000000000002', 'text', 'b', 'buddy'),
  ('22222222-3333-0000-0000-000000000003', '22222222-5555-0000-0000-000000000001', '22222222-0000-0000-0000-000000000002', 'text', 'c', 'buddy');
select set_config('request.jwt.claim.sub', '22222222-0000-0000-0000-000000000001', false);
insert into verifications (proof_id, verifier_id, verdict, created_at) values
  ('22222222-3333-0000-0000-000000000001', '22222222-0000-0000-0000-000000000001', 'approve', now()),
  ('22222222-3333-0000-0000-000000000002', '22222222-0000-0000-0000-000000000001', 'approve', now() - interval '1 day'),
  ('22222222-3333-0000-0000-000000000003', '22222222-0000-0000-0000-000000000001', 'approve', now() - interval '2 days');
select pg_temp.as_user('22222222-0000-0000-0000-000000000001');
select pg_temp.check((my_rating() ->> 'support')::numeric = 1.8, '3 days of support in 30: support rating 1.8');
select pg_temp.check((my_rating() ->> 'shared')::boolean = false, 'ratings are not shared by default');
reset role;
select pg_temp.as_user('22222222-0000-0000-0000-000000000002');
select pg_temp.check((partner_rating() ->> 'shared')::boolean = false and not (partner_rating() ? 'reliability'), 'the partner sees no rating unless it is shared');
select pg_temp.check((my_rating() -> 'reliability') = 'null'::jsonb and (my_rating() ->> 'days_counted')::int = 0, 'too few days: no reliability yet');
reset role;
select pg_temp.as_user('22222222-0000-0000-0000-000000000001');
update profiles set share_rating = true;
reset role;
select pg_temp.as_user('22222222-0000-0000-0000-000000000002');
select pg_temp.check((partner_rating() ->> 'reliability')::numeric = 3.0 and (partner_rating() ->> 'name') is not null, 'once shared, the partner sees the rating');
reset role;
set role anon;
select pg_temp.expect_error($q$select my_rating()$q$, 'anonymous visitors cannot read ratings');
select pg_temp.expect_error($q$select monthly_leaderboard()$q$, 'anonymous visitors cannot read the leaderboard');
reset role;

-- leaderboard: 20 people with one reviewed day today; 12 done, 8 missed
insert into auth.users select ('33333333-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid, 'l' || i || '@test' from generate_series(1, 20) i;
insert into profiles (id) select ('33333333-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid from generate_series(1, 20) i on conflict (id) do nothing;
insert into tasks (id, user_id, title) select ('33333333-2222-0000-0000-' || lpad(i::text, 12, '0'))::uuid, ('33333333-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid, 'L task' from generate_series(1, 20) i;
insert into daily_plans (id, user_id, date, committed_at, reviewed_at)
  select ('33333333-1111-0000-0000-' || lpad(i::text, 12, '0'))::uuid, ('33333333-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid, (now() at time zone 'UTC')::date, now(), now() from generate_series(1, 20) i;
insert into plan_items (daily_plan_id, user_id, task_id, status)
  select ('33333333-1111-0000-0000-' || lpad(i::text, 12, '0'))::uuid, ('33333333-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid,
         ('33333333-2222-0000-0000-' || lpad(i::text, 12, '0'))::uuid, case when i <= 12 then 'done' else 'missed' end from generate_series(1, 20) i;
-- the 8 "missed" people did nothing that counts, so make 4 of them partly done to have a ranked tail
update plan_items set status = 'partial' where user_id in (select ('33333333-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid from generate_series(13, 16) i);
select pg_temp.as_user('33333333-0000-0000-0000-000000000001');
select pg_temp.check((monthly_leaderboard() ->> 'state') = 'not_joined', 'the leaderboard is hidden until you join');
select pg_temp.expect_error($q$select join_leaderboard('x')$q$, 'a handle must be 3 to 20 letters, numbers or underscores');
select pg_temp.expect_error($q$select join_leaderboard('has space')$q$, 'a handle cannot contain spaces');
reset role;
-- nine people join: not enough to show anything
update profiles set leaderboard_optin = true, leaderboard_handle = 'ghost_' || right(id::text, 2) where id::text like '33333333-0000-0000-0000-0000000000%' and right(id::text, 2)::int between 1 and 9;
select pg_temp.as_user('33333333-0000-0000-0000-000000000001');
select pg_temp.check((monthly_leaderboard() ->> 'state') = 'waiting' and (monthly_leaderboard() ->> 'have')::int = 9, 'with 9 people the leaderboard stays hidden');
reset role;
select pg_temp.as_user('33333333-0000-0000-0000-000000000010');
select pg_temp.expect_error($q$select join_leaderboard('Ghost_01')$q$, 'a taken handle is refused, case-insensitively');
select join_leaderboard('fresh_10');
reset role;
select pg_temp.as_user('33333333-0000-0000-0000-000000000001');
select pg_temp.check((monthly_leaderboard() ->> 'state') = 'ready', 'with 10 people the board shows');
select pg_temp.check((monthly_leaderboard() ->> 'band') in ('top10', 'top_quarter', 'top_half', 'keep_going'), 'I get a band, not an exact low rank');
select pg_temp.check(jsonb_array_length(monthly_leaderboard() -> 'top') <= 10, 'at most the top 10 are listed');
select pg_temp.check(not (monthly_leaderboard()::text ~ '33333333-0000'), 'no user ids appear on the board');
select leave_leaderboard();
select pg_temp.check((monthly_leaderboard() ->> 'state') = 'not_joined', 'leaving removes me from the board');
select pg_temp.check((select leaderboard_handle from profiles where id = auth.uid()) is null, 'leaving frees my handle');
reset role;

-- ------------------------------------------------- rating switch and fuller export (0016)
select pg_temp.as_user('22222222-0000-0000-0000-000000000001');
select pg_temp.check((set_share_rating(false) ->> 'shared')::boolean = false, 'sharing can be switched off again');
select pg_temp.check(export_my_data() ? 'partner_pledges_paid', 'export includes the practice partner pledges the person paid');
select pg_temp.check(export_my_data() ? 'pledges', 'export includes pledges');
reset role;
set role anon;
select pg_temp.expect_error($q$select set_share_rating(true)$q$, 'anonymous visitors cannot change ratings');
reset role;

-- ------------------------------------------------- micro-task stake (0017)
insert into auth.users values ('a1a1a1a1-0000-0000-0000-000000000001', 'm1@test'), ('a1a1a1a1-0000-0000-0000-000000000002', 'm2@test');
select set_config('request.jwt.claim.sub', 'a1a1a1a1-0000-0000-0000-000000000001', false);
insert into tasks (user_id, title) values ('a1a1a1a1-0000-0000-0000-000000000001', 'M1 write'), ('a1a1a1a1-0000-0000-0000-000000000001', 'M2 walk');
select pg_temp.as_user('a1a1a1a1-0000-0000-0000-000000000001');
select pg_temp.check((commit_day(array(select id from tasks order by title), 3, 0, true)).stake_type = 'none', 'Gentle Mode turns a micro-task stake off');
reset role;
delete from plan_items where user_id = 'a1a1a1a1-0000-0000-0000-000000000001';
update daily_plans set committed_at = null where user_id = 'a1a1a1a1-0000-0000-0000-000000000001';
update profiles set gentle_mode = false where id = 'a1a1a1a1-0000-0000-0000-000000000001';
select pg_temp.as_user('a1a1a1a1-0000-0000-0000-000000000001');
select pg_temp.check((commit_day(array(select id from tasks order by title), 3, 0, true)).stake_type = 'micro_task', 'a micro-task stake is stored');
select pg_temp.check((select stake_amount from daily_plans where date = current_date) = 0, 'a micro-task stake costs no points');
select pg_temp.expect_error($q$insert into makeup_steps (user_id, from_plan_id, due_on, title) select auth.uid(), id, current_date, 'x' from daily_plans$q$, 'clients cannot write make-up steps');
select set_item_status((select i.id from plan_items i join tasks t on t.id = i.task_id where t.title = 'M1 write'), 'done');
select review_day((select id from daily_plans where date = current_date), '{}', 3);
select pg_temp.check((select count(*) from makeup_steps) = 1, 'a missed task on a micro-task day adds exactly one make-up step');
select pg_temp.check((select title from makeup_steps) = '5 minutes on: M2 walk' and (select due_on from makeup_steps) = current_date + 1, 'the make-up step names the missed task and is due tomorrow');
select pg_temp.expect_error($q$select settle_makeup_step((select id from makeup_steps), 'done')$q$, 'a make-up step cannot be done before its day');
select pg_temp.expect_error($q$select settle_makeup_step((select id from makeup_steps), 'paid')$q$, 'only done or let go');
reset role;
select pg_temp.as_user('a1a1a1a1-0000-0000-0000-000000000002');
select pg_temp.check((select count(*) from makeup_steps) = 0, 'other people cannot see my make-up steps');
select pg_temp.expect_error($q$select settle_makeup_step((select id from makeup_steps limit 1), 'let_go')$q$, 'other people cannot settle my make-up step');
reset role;
update makeup_steps set due_on = current_date where user_id = 'a1a1a1a1-0000-0000-0000-000000000001';
select pg_temp.as_user('a1a1a1a1-0000-0000-0000-000000000001');
select pg_temp.check((settle_makeup_step((select id from makeup_steps), 'done')).status = 'done', 'a due make-up step can be marked done');
select pg_temp.check((settle_makeup_step((select id from makeup_steps), 'let_go')).status = 'done', 'a settled step stays settled');
select pg_temp.check(export_my_data() ? 'makeup_steps', 'export includes make-up steps');
reset role;
-- a full day adds nothing; points and micro stakes cannot be combined; a lighter day turns it off
update daily_plans set date = current_date - 1 where user_id = 'a1a1a1a1-0000-0000-0000-000000000001';
select pg_temp.as_user('a1a1a1a1-0000-0000-0000-000000000001');
select pg_temp.expect_error($q$select commit_day(array(select id from tasks order by title), 3, 5, true)$q$, 'points and a make-up step cannot both be staked');
select commit_day(array(select id from tasks order by title), 3, 0, true);
select review_day((select id from daily_plans where date = current_date), (select jsonb_object_agg(id::text, 'done') from plan_items where status = 'pending'), 3);
select pg_temp.check((select count(*) from makeup_steps) = 1, 'a full day adds no make-up step');
reset role;
update daily_plans set date = current_date - 2 where user_id = 'a1a1a1a1-0000-0000-0000-000000000001' and date = current_date;
select pg_temp.as_user('a1a1a1a1-0000-0000-0000-000000000001');
update profiles set light_day = current_date;
select pg_temp.check((commit_day(array(select id from tasks order by title limit 1), 3, 0, true)).stake_type = 'none', 'a lighter day turns a micro-task stake off');
reset role;

-- ------------------------------------------------- voice proofs (0018)
select pg_temp.as_user('a1a1a1a1-0000-0000-0000-000000000001');
insert into proofs (plan_item_id, kind, storage_path, duration_s)
  values ((select id from plan_items limit 1), 'voice', 'a1a1a1a1-0000-0000-0000-000000000001/a.webm', 12);
select pg_temp.check((select count(*) from proofs where kind = 'voice') = 1, 'a voice proof can be saved');
select pg_temp.check((select visibility from proofs where kind = 'voice') = 'private', 'voice proofs are private by default');
select pg_temp.expect_error($q$insert into proofs (plan_item_id, kind, storage_path, duration_s) values ((select id from plan_items limit 1), 'voice', 'a1a1a1a1-0000-0000-0000-000000000001/b.webm', 61)$q$, 'recordings are at most 60 seconds');
select pg_temp.expect_error($q$insert into proofs (plan_item_id, kind, storage_path) values ((select id from plan_items limit 1), 'voice', 'a1a1a1a1-0000-0000-0000-000000000001/c.webm')$q$, 'a recording needs a duration');
select pg_temp.expect_error($q$insert into proofs (plan_item_id, kind, storage_path, duration_s) values ((select id from plan_items limit 1), 'voice', 'a1a1a1a1-0000-0000-0000-000000000002/d.webm', 5)$q$, 'a recording must be in my own folder');
update proofs set duration_s = 1 where kind = 'voice';
select pg_temp.check((select duration_s from proofs where kind = 'voice') = 12, 'the duration cannot be changed afterwards');
reset role;
select pg_temp.check((select 'audio/webm' = any (allowed_mime_types) from storage.buckets where id = 'proofs'), 'the proofs bucket accepts audio');
select pg_temp.as_user('a1a1a1a1-0000-0000-0000-000000000002');
select pg_temp.check((select count(*) from proofs where kind = 'voice') = 0, 'other people cannot see my voice proofs');
reset role;

-- ------------------------------------------------- circles (0019)
insert into auth.users values
  ('c1c1c1c1-0000-0000-0000-000000000001', 'c1@test'), ('c1c1c1c1-0000-0000-0000-000000000002', 'c2@test'),
  ('c1c1c1c1-0000-0000-0000-000000000003', 'c3@test'), ('c1c1c1c1-0000-0000-0000-000000000004', 'c4@test'),
  ('c1c1c1c1-0000-0000-0000-000000000005', 'c5@test');
update profiles set display_name = 'Circle ' || right(id::text, 1) where id::text like 'c1c1c1c1-%';
select set_config('request.jwt.claim.sub', 'c1c1c1c1-0000-0000-0000-000000000002', false);
insert into tasks (user_id, title) values ('c1c1c1c1-0000-0000-0000-000000000002', 'Secret title one'), ('c1c1c1c1-0000-0000-0000-000000000002', 'Secret title two');
select pg_temp.as_user('c1c1c1c1-0000-0000-0000-000000000001');
select pg_temp.check((circle_overview() ->> 'state') = 'none', 'no circle at first');
select pg_temp.expect_error($q$select create_circle('   ')$q$, 'a circle needs a name');
select create_circle('Morning birds');
select pg_temp.expect_error($q$select create_circle('Another')$q$, 'one circle per person');
select pg_temp.expect_error($q$insert into circle_members (circle_id, user_id) select id, 'c1c1c1c1-0000-0000-0000-000000000005' from circles$q$, 'clients cannot add members directly');
reset role;
select set_config('test.circle_code', (select invite_code from circles where name = 'Morning birds'), false);
select pg_temp.as_user('c1c1c1c1-0000-0000-0000-000000000002');
select pg_temp.check((select count(*) from circles) = 0, 'outsiders cannot read circles');
select pg_temp.check((preview_circle_invite(current_setting('test.circle_code')) ->> 'valid')::boolean, 'the invite previews as valid');
select join_circle(current_setting('test.circle_code'));
select commit_day(array(select id from tasks order by title), 3, 0);
select set_item_status((select id from plan_items order by id limit 1), 'done');
select start_focus_session(25);
reset role;
select pg_temp.as_user('c1c1c1c1-0000-0000-0000-000000000003');
select join_circle(current_setting('test.circle_code'));
reset role;
select pg_temp.as_user('c1c1c1c1-0000-0000-0000-000000000004');
select join_circle(current_setting('test.circle_code'));
reset role;
select pg_temp.as_user('c1c1c1c1-0000-0000-0000-000000000005');
select pg_temp.check(not (preview_circle_invite(current_setting('test.circle_code')) ->> 'valid')::boolean, 'a full circle previews as full');
select pg_temp.expect_error($q$select join_circle(current_setting('test.circle_code'))$q$, 'a circle holds at most four people');
reset role;

select pg_temp.as_user('c1c1c1c1-0000-0000-0000-000000000001');
select pg_temp.check((circle_overview() -> 'circle' ->> 'size')::int = 4, 'the circle has four members');
select pg_temp.check((select (m -> 'today' ->> 'done')::int = 1 and (m -> 'today' ->> 'planned')::int = 2 and (m ->> 'focus_minutes')::int = 25
                        from jsonb_array_elements(circle_overview() -> 'members') m where m ->> 'name' = 'Circle 2'), 'members see counts and focus minutes of those who share');
select pg_temp.check(not (circle_overview()::text ~ 'Secret title'), 'task titles are never shown to the circle');
select pg_temp.check(not (circle_overview()::text ~ 'c1c1c1c1-0000'), 'no user ids are handed to the circle');
select pg_temp.check((select count(*) from circle_members) = 1, 'I can read only my own membership row');
select pg_temp.check((select count(*) from proofs) = 0 and (select count(*) from tamper_events) = 0, 'a circle gives no access to proofs or focus events');
select pg_temp.check((send_cheer((select (m ->> 'key')::uuid from jsonb_array_elements(circle_overview() -> 'members') m where m ->> 'name' = 'Circle 2')) ->> 'sent')::boolean, 'a cheer can be sent');
select pg_temp.check(not (send_cheer((select (m ->> 'key')::uuid from jsonb_array_elements(circle_overview() -> 'members') m where m ->> 'name' = 'Circle 2')) ->> 'sent')::boolean, 'one cheer per person per day');
select pg_temp.expect_error($q$select send_cheer((select (m ->> 'key')::uuid from jsonb_array_elements(circle_overview() -> 'members') m where (m ->> 'me')::boolean))$q$, 'no cheering yourself');
select pg_temp.expect_error($q$select send_cheer(gen_random_uuid())$q$, 'cannot cheer someone outside the circle');
reset role;
select pg_temp.as_user('c1c1c1c1-0000-0000-0000-000000000002');
select pg_temp.check(circle_overview() -> 'cheers_today' ? 'Circle 1', 'the cheered person sees who cheered them');
select set_circle_sharing(false);
reset role;
select pg_temp.as_user('c1c1c1c1-0000-0000-0000-000000000001');
select pg_temp.check((select m -> 'today' = 'null'::jsonb and m -> 'focus_minutes' = 'null'::jsonb
                        from jsonb_array_elements(circle_overview() -> 'members') m where m ->> 'name' = 'Circle 2'), 'switching sharing off hides the counts');
reset role;
select pg_temp.as_user('c1c1c1c1-0000-0000-0000-000000000004');
select pg_temp.check((leave_circle() ->> 'state') = 'none', 'anyone can leave');
select pg_temp.check((preview_circle_invite(current_setting('test.circle_code')) ->> 'valid') = 'false', 'leaving makes the old link stop working');
reset role;
select pg_temp.as_user('c1c1c1c1-0000-0000-0000-000000000001');
select pg_temp.check((circle_overview() -> 'circle' ->> 'size')::int = 3, 'the circle has three left');
select pg_temp.check(export_my_data() ? 'circle' and export_my_data() ? 'cheers_sent', 'export includes circle membership and cheers sent');
reset role;
-- deleting an account removes the membership; the last person leaving removes the circle
delete from auth.users where id = 'c1c1c1c1-0000-0000-0000-000000000003';
select pg_temp.check((select count(*) from circle_members where circle_id = (select id from circles where name = 'Morning birds')) = 2, 'a deleted account leaves the circle');
select pg_temp.as_user('c1c1c1c1-0000-0000-0000-000000000001');
select leave_circle();
reset role;
select pg_temp.as_user('c1c1c1c1-0000-0000-0000-000000000002');
select leave_circle();
reset role;
select pg_temp.check((select count(*) from circles where name = 'Morning birds') = 0, 'an empty circle is removed');
set role anon;
select pg_temp.expect_error($q$select circle_overview()$q$, 'anonymous visitors cannot read circles');
reset role;

-- ------------------------------------------------- Android engine: device secret and sync (0020)
insert into auth.users values ('d1d1d1d1-0000-0000-0000-000000000001', 'phone@test'), ('d1d1d1d1-0000-0000-0000-000000000002', 'other@test');
select pg_temp.as_user('d1d1d1d1-0000-0000-0000-000000000001');
insert into tasks (title) values ('Phone task');
select heartbeat('d1d1d1d1-aaaa-0000-0000-000000000001', 'android', 'Pixel', true);
select heartbeat('d1d1d1d1-aaaa-0000-0000-000000000002', 'extension', 'Chrome', true);
select pg_temp.expect_error($q$select issue_device_secret('d1d1d1d1-aaaa-0000-0000-000000000002')$q$, 'only a phone gets a device secret');
select set_config('test.secret', issue_device_secret('d1d1d1d1-aaaa-0000-0000-000000000001'), false);
select pg_temp.check(length(current_setting('test.secret')) = 64, 'the device secret is long and random');
select pg_temp.check((select secret_hash from devices where platform = 'android') <> current_setting('test.secret'), 'only a hash of the secret is stored');
update blocklists set android_packages = '{com.instagram.android,com.zhiliaoapp.musically}', domains = '{reddit.com,youtube.com}';
reset role;
select pg_temp.as_user('d1d1d1d1-0000-0000-0000-000000000002');
select pg_temp.expect_error($q$select issue_device_secret('d1d1d1d1-aaaa-0000-0000-000000000001')$q$, 'nobody else can issue a secret for my phone');
reset role;

-- the phone syncs with no user session at all
set role anon;
select set_config('request.jwt.claim.sub', '', false);
select pg_temp.expect_error($q$select device_sync('d1d1d1d1-aaaa-0000-0000-000000000001', 'wrong', true, false)$q$, 'a wrong secret is refused');
select pg_temp.expect_error($q$select device_sync('d1d1d1d1-aaaa-0000-0000-000000000002', current_setting('test.secret'), true, false)$q$, 'a secret works only for its own device');
select pg_temp.check(not (device_sync('d1d1d1d1-aaaa-0000-0000-000000000001', current_setting('test.secret'), true, false) ->> 'active')::boolean, 'no session: nothing to block');
select pg_temp.check(jsonb_typeof(device_sync('d1d1d1d1-aaaa-0000-0000-000000000001', current_setting('test.secret'), true, false) -> 'domains') = 'array', 'the site list is always an array');
select pg_temp.expect_error($q$select get_focus_state()$q$, 'the anon key alone still cannot read focus state');
reset role;

select pg_temp.as_user('d1d1d1d1-0000-0000-0000-000000000001');
select commit_day(array(select id from tasks), 3, 0);
select start_focus_session(25, null, (select id from plan_items limit 1));
select pg_temp.expect_error($q$update blocklists set android_packages = '{com.instagram.android}'$q$, 'apps cannot be removed during a session');
reset role;
set role anon;
select pg_temp.check((device_sync('d1d1d1d1-aaaa-0000-0000-000000000001', current_setting('test.secret'), true, false) -> 'packages') ? 'com.instagram.android', 'a session started elsewhere reaches the phone with its app list');
select pg_temp.check((device_sync('d1d1d1d1-aaaa-0000-0000-000000000001', current_setting('test.secret'), true, false) ->> 'task') = 'Phone task', 'the phone learns the task to show on the blocked screen');
select pg_temp.check((device_sync('d1d1d1d1-aaaa-0000-0000-000000000001', current_setting('test.secret'), true, false) -> 'domains') ? 'reddit.com', 'the phone also gets the site list for web blocking (0021)');
reset role;
-- an asleep phone that goes quiet is not "going quiet"; an awake one is
update focus_sessions set started_at = now() - interval '10 minutes' where user_id = 'd1d1d1d1-0000-0000-0000-000000000001';
set role anon;
select device_sync('d1d1d1d1-aaaa-0000-0000-000000000001', current_setting('test.secret'), true, true);
reset role;
update devices set last_heartbeat_at = now() - interval '10 minutes' where user_id = 'd1d1d1d1-0000-0000-0000-000000000001';
select public._record_heartbeat_events('d1d1d1d1-0000-0000-0000-000000000001');
select pg_temp.check((select count(*) from tamper_events where device_id = 'd1d1d1d1-aaaa-0000-0000-000000000001') = 0, 'an asleep phone in a pocket is not logged');
select pg_temp.check((select count(*) from tamper_events where device_id = 'd1d1d1d1-aaaa-0000-0000-000000000002') = 1, 'a quiet extension during the same session still is');
update devices set asleep = false where id = 'd1d1d1d1-aaaa-0000-0000-000000000001';
select public._record_heartbeat_events('d1d1d1d1-0000-0000-0000-000000000001');
select pg_temp.check((select kind from tamper_events where device_id = 'd1d1d1d1-aaaa-0000-0000-000000000001') = 'heartbeat_lost', 'an awake phone that goes quiet is logged');
-- switching protection off is recorded even while asleep
set role anon;
select device_sync('d1d1d1d1-aaaa-0000-0000-000000000001', current_setting('test.secret'), false, true);
reset role;
select pg_temp.check((select count(*) from tamper_events where device_id = 'd1d1d1d1-aaaa-0000-0000-000000000001' and kind = 'protection_disabled') = 1, 'turning blocking off on the phone is recorded');
-- a foreground heartbeat wakes the device again; a new secret replaces the old one
select pg_temp.as_user('d1d1d1d1-0000-0000-0000-000000000001');
select heartbeat('d1d1d1d1-aaaa-0000-0000-000000000001', 'android', null, true);
select pg_temp.check(not (select asleep from devices where platform = 'android'), 'the app in the foreground wakes the device');
select pg_temp.check(not (export_my_data()::text ~ 'secret_hash'), 'the export leaves out the device secret hash');
select set_config('test.secret2', issue_device_secret('d1d1d1d1-aaaa-0000-0000-000000000001'), false);
reset role;
set role anon;
select pg_temp.expect_error($q$select device_sync('d1d1d1d1-aaaa-0000-0000-000000000001', current_setting('test.secret'), true, false)$q$, 'a rotated secret stops the old one');
select pg_temp.check((device_sync('d1d1d1d1-aaaa-0000-0000-000000000001', current_setting('test.secret2'), true, false) ->> 'active')::boolean, 'the new secret works');
reset role;

-- ------------------------------------------------- circle names (0022)
insert into auth.users values
  ('e1e1e1e1-0000-0000-0000-000000000001', 'e1@test'), ('e1e1e1e1-0000-0000-0000-000000000002', 'e2@test'),
  ('e1e1e1e1-0000-0000-0000-000000000003', 'e3@test');
update profiles set display_name = 'Real ' || right(id::text, 1) where id::text like 'e1e1e1e1-%';
select pg_temp.as_user('e1e1e1e1-0000-0000-0000-000000000001');
select pg_temp.expect_error($q$select create_circle('Quiet hours', 'x')$q$, 'a circle name needs at least two characters');
select pg_temp.expect_error($q$select create_circle('Quiet hours', 'drop;table')$q$, 'a circle name allows only simple characters');
select create_circle('Quiet hours', '  Night   Owl ');
update circle_members set alias = 'Sneaky';
select pg_temp.check((circle_overview() ->> 'my_alias') = 'Night Owl', 'the creator can use a made-up name from the start (spaces tidied), and clients cannot write it directly');
select set_config('test.alias_code', (select invite_code from circles where name = 'Quiet hours'), false);
reset role;
select pg_temp.as_user('e1e1e1e1-0000-0000-0000-000000000002');
select pg_temp.expect_error($q$select join_circle(current_setting('test.alias_code'), 'night owl')$q$, 'a name already used in the circle cannot be taken');
select join_circle(current_setting('test.alias_code'), 'Heron');
select pg_temp.check(not (circle_overview()::text ~ 'Real 1'), 'the circle never sees the profile name of someone with a circle name');
select pg_temp.check(exists (select 1 from jsonb_array_elements(circle_overview() -> 'members') m where m ->> 'name' = 'Night Owl' and not (m ->> 'me')::boolean), 'members are shown by their circle name');
select pg_temp.check((select count(*) from circle_members) = 1, 'I still read only my own membership row, so nobody else''s alias column');
select send_cheer((select (m ->> 'key')::uuid from jsonb_array_elements(circle_overview() -> 'members') m where m ->> 'name' = 'Night Owl'));
reset role;
select pg_temp.as_user('e1e1e1e1-0000-0000-0000-000000000001');
select pg_temp.check(circle_overview() -> 'cheers_today' ? 'Heron' and not (circle_overview()::text ~ 'Real 2'), 'a cheer is signed with the circle name');
select pg_temp.expect_error($q$select set_circle_alias('HERON')$q$, 'changing to a taken name is refused');
select pg_temp.check(set_circle_alias('') = 'Real 1', 'clearing the circle name goes back to the profile name');
select pg_temp.check(circle_overview() ->> 'my_alias' is null, 'the alias is cleared');
select pg_temp.check(set_circle_alias('Wren-2') = 'Wren-2', 'the circle name can be changed later');
select pg_temp.check((export_my_data() -> 'circle' ->> 'alias') = 'Wren-2', 'export includes my circle name');
reset role;
select pg_temp.as_user('e1e1e1e1-0000-0000-0000-000000000003');
select join_circle(current_setting('test.alias_code'));
select pg_temp.check(exists (select 1 from jsonb_array_elements(circle_overview() -> 'members') m where m ->> 'name' = 'Real 3' and (m ->> 'me')::boolean), 'joining without a circle name still uses the profile name');
reset role;
set role anon;
select set_config('request.jwt.claim.sub', '', false);
select pg_temp.expect_error($q$select set_circle_alias('Ghost')$q$, 'anonymous visitors cannot set a circle name');
reset role;

-- ------------------------------------------------- proof context (0023)
insert into auth.users values
  ('f1f1f1f1-0000-0000-0000-000000000001', 'f1@test'), ('f1f1f1f1-0000-0000-0000-000000000002', 'f2@test'),
  ('f1f1f1f1-0000-0000-0000-000000000003', 'f3@test');
select pg_temp.as_user('f1f1f1f1-0000-0000-0000-000000000001');
insert into tasks (title) values ('Context task');
select commit_day(array(select id from tasks), 3, 0);
insert into proofs (id, plan_item_id, kind, storage_path, image_phash, photo_age_hours, visibility)
  values ('f1f1f1f1-9999-0000-0000-000000000001', (select id from plan_items), 'photo', auth.uid() || '/old.jpg', '0f0f0f0f0f0f0f0f', 72, 'buddy');
insert into proofs (id, plan_item_id, kind, storage_path, image_phash, photo_age_hours)
  values ('f1f1f1f1-9999-0000-0000-000000000002', (select id from plan_items), 'photo', auth.uid() || '/new.jpg', 'f0f0f0f0f0f0f0f0', 1);
insert into proofs (id, plan_item_id, kind, text_body, visibility)
  values ('f1f1f1f1-9999-0000-0000-000000000003', (select id from plan_items), 'text', 'Did it', 'buddy');
select pg_temp.expect_error($q$insert into proofs (plan_item_id, kind, text_body, photo_age_hours) values ((select id from plan_items), 'text', 'x', 3)$q$, 'only a photo has a photo age');
select pg_temp.expect_error($q$insert into proofs (plan_item_id, kind, storage_path, photo_age_hours) values ((select id from plan_items), 'photo', 'p.jpg', -5)$q$, 'a photo age cannot be negative');
update proofs set photo_age_hours = 0 where id = 'f1f1f1f1-9999-0000-0000-000000000001';
select pg_temp.check((select photo_age_hours from proofs where id = 'f1f1f1f1-9999-0000-0000-000000000001') = 72, 'the photo age cannot be changed after saving');
select pg_temp.check((proof_context('f1f1f1f1-9999-0000-0000-000000000001') ->> 'photo_age') = 'older', 'a photo dated days earlier is noted as older');
select pg_temp.check((proof_context('f1f1f1f1-9999-0000-0000-000000000002') ->> 'photo_age') = 'fresh', 'a photo dated today is noted as fresh');
select pg_temp.check(proof_context('f1f1f1f1-9999-0000-0000-000000000003') ->> 'photo_age' is null, 'a note has no photo age');
select pg_temp.check((proof_context('f1f1f1f1-9999-0000-0000-000000000003') ->> 'days_after')::int = 0, 'added on the planned day');
select pg_temp.check((proof_context('f1f1f1f1-9999-0000-0000-000000000003') ->> 'soon_after_planning')::boolean, 'added within minutes of planning is noted');
select pg_temp.check(not (proof_context('f1f1f1f1-9999-0000-0000-000000000001')::text ~ 'old.jpg|0f0f0f0f|f1f1f1f1'), 'the context holds no path, hash or ids');
select create_buddy_invite();
select set_config('test.ctx_code', (select invite_code from buddy_links where status = 'pending'), false);
reset role;
-- the day was planned two days ago, and a while before the proofs
update daily_plans set date = date - 2, committed_at = committed_at - interval '2 days' where user_id = 'f1f1f1f1-0000-0000-0000-000000000001';
select pg_temp.as_user('f1f1f1f1-0000-0000-0000-000000000002');
select pg_temp.expect_error($q$select proof_context('f1f1f1f1-9999-0000-0000-000000000001')$q$, 'a stranger gets no context, even for a shared proof');
select accept_buddy_invite(current_setting('test.ctx_code'));
select pg_temp.check((proof_context('f1f1f1f1-9999-0000-0000-000000000001') ->> 'days_after')::int = 2, 'the partner sees how many days after the planned day it was added');
select pg_temp.check(not (proof_context('f1f1f1f1-9999-0000-0000-000000000001') ->> 'soon_after_planning')::boolean, 'not soon after planning anymore');
select pg_temp.check((proof_context('f1f1f1f1-9999-0000-0000-000000000001') ->> 'photo_age') = 'older', 'the partner sees the photo-date note for a shared photo');
select pg_temp.expect_error($q$select proof_context('f1f1f1f1-9999-0000-0000-000000000002')$q$, 'the partner gets no context for a private proof');
select pg_temp.expect_error($q$select proof_context(gen_random_uuid())$q$, 'an unknown id gives the same answer');
reset role;
select pg_temp.as_user('f1f1f1f1-0000-0000-0000-000000000003');
select pg_temp.expect_error($q$select proof_context('f1f1f1f1-9999-0000-0000-000000000001')$q$, 'someone outside the partnership gets nothing');
reset role;
set role anon;
select set_config('request.jwt.claim.sub', '', false);
select pg_temp.expect_error($q$select proof_context('f1f1f1f1-9999-0000-0000-000000000001')$q$, 'anonymous visitors get nothing');
reset role;

-- ------------------------------------------------- focus links (0024)
insert into auth.users values
  ('24242424-0000-0000-0000-000000000001', 'l1@test'), ('24242424-0000-0000-0000-000000000002', 'l2@test');
select pg_temp.as_user('24242424-0000-0000-0000-000000000001');
insert into tasks (title) values ('Link owner secret task');
update blocklists set domains = '{secret-site.example}';
select pg_temp.expect_error($q$select create_focus_link('   ', 25)$q$, 'a focus link needs a name');
select pg_temp.expect_error($q$select create_focus_link('Desk tag', 3)$q$, 'a focus link starts at least 5 minutes');
select pg_temp.expect_error($q$select create_focus_link('Desk tag', 121)$q$, 'a focus link starts at most 120 minutes');
select set_config('test.link_key', create_focus_link('  Desk   tag ', 25) ->> 'key', false);
select pg_temp.check(current_setting('test.link_key') ~ '^spt_[0-9a-f]{64}$', 'the key has the documented shape');
select pg_temp.check((select label from focus_links) = 'Desk tag', 'the name is tidied');
select pg_temp.check(not exists (select 1 from focus_links where key_hash = current_setting('test.link_key')), 'the key is stored hashed, never in clear');
select pg_temp.expect_error($q$insert into focus_links (user_id, label, minutes, key_hash) values (auth.uid(), 'x', 25, repeat('a', 64))$q$, 'clients cannot make links directly');
update focus_links set minutes = 120, label = 'Changed';
select pg_temp.check((select minutes from focus_links) = 25, 'clients cannot change a link directly');
delete from focus_links;
select pg_temp.check((select count(*) from focus_links) = 1, 'clients cannot remove a link directly');
reset role;
-- no session at all: just the anon role and the key
set role anon;
select set_config('request.jwt.claim.sub', '', false);
select pg_temp.expect_error($q$select use_focus_link('spt_' || repeat('0', 64))$q$, 'an unknown key starts nothing');
select pg_temp.expect_error($q$select use_focus_link('not a key')$q$, 'a malformed key starts nothing');
select pg_temp.expect_error($q$select use_focus_link(null)$q$, 'a missing key starts nothing');
select pg_temp.expect_error($q$select create_focus_link('Ghost', 25)$q$, 'anonymous visitors cannot make links');
select set_config('test.link_out', use_focus_link(current_setting('test.link_key'))::text, false);
select pg_temp.check((current_setting('test.link_out')::jsonb ->> 'started')::boolean, 'the key starts a session without signing in');
select pg_temp.check((current_setting('test.link_out')::jsonb ->> 'minutes')::int = 25, 'for the length the owner chose');
select pg_temp.check(not (current_setting('test.link_out') ~ 'secret|24242424|Desk'), 'the answer holds no task, site, name or id');
select set_config('test.link_out', use_focus_link(current_setting('test.link_key'))::text, false);
select pg_temp.check(not (current_setting('test.link_out')::jsonb ->> 'started')::boolean and (current_setting('test.link_out')::jsonb ->> 'running')::boolean,
  'opening it again while a session runs starts no second one');
reset role;
select pg_temp.check((select count(*) from focus_sessions where user_id = '24242424-0000-0000-0000-000000000001') = 1, 'exactly one session exists');
select pg_temp.check((select not locked and started_by_link is not null from focus_sessions where user_id = '24242424-0000-0000-0000-000000000001'),
  'a link session is never locked and remembers its link');
select pg_temp.check((select use_count = 1 and last_used_at is not null from focus_links), 'only a real start is counted');
select pg_temp.as_user('24242424-0000-0000-0000-000000000001');
select pg_temp.check((get_focus_state() ->> 'active')::boolean, 'the owner''s devices see the session');
select end_focus_session((select id from focus_sessions), 'stretching instead');
select pg_temp.check(not (export_my_data()::text ~ 'key_hash') and jsonb_array_length(export_my_data() -> 'focus_links') = 1, 'the export lists the link without its key hash');
select create_focus_link('Two', 5); select create_focus_link('Three', 5); select create_focus_link('Four', 5); select create_focus_link('Five', 120);
select pg_temp.expect_error($q$select create_focus_link('Six', 25)$q$, 'at most five links per person');
reset role;
select pg_temp.as_user('24242424-0000-0000-0000-000000000002');
select pg_temp.check((select count(*) from focus_links) = 0, 'someone else sees none of my links');
select pg_temp.check(not remove_focus_link((select id from focus_links limit 1)), 'removing nothing answers false');
reset role;
select set_config('test.link_id', (select id::text from focus_links where label = 'Desk tag'), false);
select pg_temp.as_user('24242424-0000-0000-0000-000000000002');
select pg_temp.check(not remove_focus_link(current_setting('test.link_id')::uuid), 'someone else cannot remove my link');
reset role;
select pg_temp.as_user('24242424-0000-0000-0000-000000000001');
select pg_temp.check(remove_focus_link(current_setting('test.link_id')::uuid), 'the owner can remove a link');
select pg_temp.check((select started_by_link is null from focus_sessions), 'the session history stays when its link is removed');
reset role;
set role anon;
select set_config('request.jwt.claim.sub', '', false);
select pg_temp.expect_error($q$select use_focus_link(current_setting('test.link_key'))$q$, 'a removed link stops working at once');
reset role;

-- ------------------------------------------------- badge crafting (0025)
insert into auth.users values
  ('25252525-0000-0000-0000-000000000001', 'k1@test'), ('25252525-0000-0000-0000-000000000002', 'k2@test');
select pg_temp.as_user('25252525-0000-0000-0000-000000000001');
select pg_temp.check(my_collection() = '{"crafted": [], "ready": []}'::jsonb, 'a new person has nothing crafted and nothing ready');
select pg_temp.expect_error($q$select craft_badge('honest_work')$q$, 'crafting needs every ingredient');
select pg_temp.expect_error($q$select craft_badge('first_plan')$q$, 'an earned badge is not a crafted one');
select pg_temp.expect_error($q$select craft_badge(null)$q$, 'a missing key is refused');
insert into tasks (id, title) values ('25252525-2222-0000-0000-000000000001', 'Craft task');
select commit_day(array(select id from tasks), 3, 0);
insert into proofs (plan_item_id, kind, text_body) values ((select id from plan_items), 'text', 'Did it');
select pg_temp.check(my_collection() -> 'ready' = '[]'::jsonb, 'one ingredient of two is not enough');
select start_focus_session(5);
reset role;
update focus_sessions set started_at = now() - interval '1 hour', ends_at = now() - interval '30 minutes' where user_id = '25252525-0000-0000-0000-000000000001';
select pg_temp.as_user('25252525-0000-0000-0000-000000000001');
select pg_temp.check(my_collection() -> 'ready' = '["honest_work"]'::jsonb, 'with both ingredients the badge is ready to craft');
select pg_temp.expect_error($q$insert into crafted_badges (user_id, key) values (auth.uid(), 'full_nest')$q$, 'clients cannot craft directly');
select pg_temp.check(craft_badge('honest_work') = '{"crafted": ["honest_work"], "ready": []}'::jsonb, 'crafting stores the badge and it is no longer listed as ready');
select craft_badge('honest_work');
select pg_temp.check((select count(*) from crafted_badges) = 1, 'crafting twice keeps one');
select pg_temp.check(my_progress() -> 'badges' @> '["first_proof","first_focus"]'::jsonb, 'the ingredients are not used up');
select pg_temp.expect_error($q$select craft_badge('full_nest')$q$, 'the collection badge needs the other crafted ones');
delete from crafted_badges;
select pg_temp.check((select count(*) from crafted_badges) = 1, 'clients cannot remove a crafted badge directly');
select pg_temp.check((export_my_data() -> 'crafted_badges' -> 0 ->> 'key') = 'honest_work', 'the export lists crafted badges');
reset role;
-- give the rest: a seven-day run of full days, a kind act and a day of helping
delete from daily_plans where user_id = '25252525-0000-0000-0000-000000000001';
insert into daily_plans (id, user_id, date, committed_at, reviewed_at)
  select ('25252525-1111-0000-0000-00000000000' || n)::uuid, '25252525-0000-0000-0000-000000000001', current_date - n, now(), now() from generate_series(1, 7) n;
insert into plan_items (daily_plan_id, user_id, task_id, status)
  select ('25252525-1111-0000-0000-00000000000' || n)::uuid, '25252525-0000-0000-0000-000000000001', '25252525-2222-0000-0000-000000000001', 'done' from generate_series(1, 7) n;
insert into proofs (plan_item_id, user_id, kind, text_body)
  values ((select id from plan_items where daily_plan_id = '25252525-1111-0000-0000-000000000001'), '25252525-0000-0000-0000-000000000001', 'text', 'Again');
insert into kind_acts (user_id, plan_id, note) values ('25252525-0000-0000-0000-000000000001', '25252525-1111-0000-0000-000000000001', 'Made tea for a neighbour');
select pg_temp.as_user('25252525-0000-0000-0000-000000000001');
select pg_temp.check(my_collection() -> 'ready' = '["steady_hands"]'::jsonb, 'a run of full days makes the next badge ready, but not the one that needs helping');
select craft_badge('steady_hands');
select pg_temp.expect_error($q$select craft_badge('warm_heart')$q$, 'warm heart waits for a day of helping');
reset role;
select pg_temp.as_user('25252525-0000-0000-0000-000000000002');
select pg_temp.check((select count(*) from crafted_badges) = 0 and my_collection() -> 'crafted' = '[]'::jsonb, 'someone else sees none of my crafted badges');
reset role;
set role anon;
select set_config('request.jwt.claim.sub', '', false);
select pg_temp.expect_error($q$select my_collection()$q$, 'anonymous visitors have no collection');
select pg_temp.expect_error($q$select craft_badge('honest_work')$q$, 'anonymous visitors cannot craft');
reset role;

-- ------------------------------------------------- circle goals (0026)
insert into auth.users values
  ('26262626-0000-0000-0000-000000000001', 'g1@test'), ('26262626-0000-0000-0000-000000000002', 'g2@test'),
  ('26262626-0000-0000-0000-000000000003', 'g3@test'), ('26262626-0000-0000-0000-000000000004', 'g4@test');
select pg_temp.as_user('26262626-0000-0000-0000-000000000001');
select pg_temp.check(circle_goal() = '{"state": "none", "can_start": false}'::jsonb, 'no circle, no goal');
select pg_temp.expect_error($q$select start_circle_goal(10)$q$, 'a goal needs a circle');
select create_circle('Goal getters');
select pg_temp.expect_error($q$select start_circle_goal(10)$q$, 'a goal needs at least two people');
select set_config('test.goal_code', (select invite_code from circles where name = 'Goal getters'), false);
insert into tasks (title) values ('G1 a'), ('G1 b'), ('G1 c');
select commit_day(array(select id from tasks), 3, 0);
select set_item_status((select i.id from plan_items i join tasks t on t.id = i.task_id where t.title = 'G1 a'), 'done');
reset role;
select pg_temp.as_user('26262626-0000-0000-0000-000000000002');
select join_circle(current_setting('test.goal_code'));
insert into tasks (title) values ('G2 a'), ('G2 b');
select commit_day(array(select id from tasks), 3, 0);
select pg_temp.check((circle_goal() ->> 'can_start')::boolean and (circle_goal() ->> 'suggested')::int = 10, 'two people can start a goal; five each is suggested');
select pg_temp.expect_error($q$select start_circle_goal(2)$q$, 'a goal is at least 3 things');
select pg_temp.expect_error($q$select start_circle_goal(101)$q$, 'a goal is at most 100 things');
select pg_temp.expect_error($q$insert into circle_goals (circle_id, target, ends_at) select id, 3, now() + interval '1 day' from circles$q$, 'clients cannot make a goal directly');
select pg_temp.check((start_circle_goal(3) ->> 'state') = 'open', 'any member can start the goal');
select pg_temp.expect_error($q$select start_circle_goal(5)$q$, 'one open goal per circle');
select pg_temp.check((circle_goal() ->> 'moved')::int = 0, 'things moved before the goal started are not counted');
select set_item_status((select i.id from plan_items i join tasks t on t.id = i.task_id where t.title = 'G2 a'), 'done');
select set_item_status((select i.id from plan_items i join tasks t on t.id = i.task_id where t.title = 'G2 b'), 'partial');
select pg_temp.check((circle_goal() ->> 'moved')::int = 2 and not (circle_goal() ->> 'reached')::boolean, 'done and partly done both move the goal');
select pg_temp.check(not (circle_goal()::text ~ 'G2|G1|26262626'), 'the goal holds one number: no titles, names or ids');
update circle_goals set target = 1, reached_at = now();
select pg_temp.check((select target = 3 and reached_at is null from circle_goals), 'clients cannot change a goal directly');
reset role;
select pg_temp.as_user('26262626-0000-0000-0000-000000000001');
select set_circle_sharing(false);
select set_item_status((select i.id from plan_items i join tasks t on t.id = i.task_id where t.title = 'G1 b'), 'done');
select pg_temp.check((circle_goal() ->> 'moved')::int = 2, 'a member who keeps their day private is not counted');
select set_circle_sharing(true);
select pg_temp.check((circle_goal() ->> 'moved')::int = 3 and (circle_goal() ->> 'reached')::boolean, 'sharing again counts it, and the goal is reached');
select set_item_status((select i.id from plan_items i join tasks t on t.id = i.task_id where t.title = 'G1 b'), 'pending');
select pg_temp.check((circle_goal() ->> 'moved')::int = 2 and (circle_goal() ->> 'reached')::boolean, 'a goal that was reached stays reached');
select pg_temp.check((export_my_data() -> 'circle_goals_started') = '[]'::jsonb, 'the export lists only goals I started');
reset role;
select pg_temp.as_user('26262626-0000-0000-0000-000000000003');
select pg_temp.check((select count(*) from circle_goals) = 0 and (circle_goal() ->> 'state') = 'none', 'someone outside the circle sees no goal');
select pg_temp.expect_error($q$select let_go_circle_goal()$q$, 'someone outside the circle cannot let it go');
reset role;
select pg_temp.as_user('26262626-0000-0000-0000-000000000002');
select pg_temp.check((select count(*) from circle_goals) = 1, 'a member can read the circle''s goal row');
select pg_temp.check(jsonb_array_length(export_my_data() -> 'circle_goals_started') = 1, 'the starter''s export lists the goal');
select pg_temp.check((let_go_circle_goal() ->> 'state') = 'ended' and (circle_goal() ->> 'let_go')::boolean, 'any member can let the goal go');
select pg_temp.check((circle_goal() ->> 'can_start')::boolean, 'a new goal can start after the last one ended');
select pg_temp.check((start_circle_goal() ->> 'target')::int = 10, 'without a number the suggestion is used');
reset role;
-- time passes: the open goal runs out, and after three more days it leaves the page
update circle_goals set started_at = started_at - interval '8 days', ends_at = ends_at - interval '8 days';
select pg_temp.as_user('26262626-0000-0000-0000-000000000001');
select pg_temp.check((circle_goal() ->> 'state') = 'ended' and not (circle_goal() ->> 'reached')::boolean and (circle_goal() ->> 'moved')::int = 0,
  'a goal that ran out is shown as ended, counting only its own week');
reset role;
update circle_goals set started_at = started_at - interval '3 days', ends_at = ends_at - interval '3 days';
select pg_temp.as_user('26262626-0000-0000-0000-000000000001');
select pg_temp.check((circle_goal() ->> 'state') = 'none' and (circle_goal() ->> 'can_start')::boolean, 'three days later the page offers a fresh start');
select start_circle_goal(4);
select leave_circle();
reset role;
select pg_temp.as_user('26262626-0000-0000-0000-000000000002');
select pg_temp.check((circle_goal() ->> 'state') = 'open' and not (circle_goal() ->> 'can_start')::boolean, 'the goal stays with the circle when its starter leaves');
select leave_circle();
reset role;
select pg_temp.check((select count(*) from circle_goals g join circles c on c.id = g.circle_id where c.name = 'Goal getters') = 0
  and not exists (select 1 from circles where name = 'Goal getters'), 'an empty circle takes its goals with it');
set role anon;
select set_config('request.jwt.claim.sub', '', false);
select pg_temp.expect_error($q$select circle_goal()$q$, 'anonymous visitors see no goal');
select pg_temp.expect_error($q$select start_circle_goal(5)$q$, 'anonymous visitors cannot start a goal');
reset role;
