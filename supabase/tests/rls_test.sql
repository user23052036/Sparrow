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
