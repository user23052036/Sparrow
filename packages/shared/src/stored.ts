/**
 * "What Sparrow stores" (ROADMAP T4.1, DECISIONS D47): a plain description of every table and column the migrations
 * create. The page reads these together with schema.json, which supabase/tests/snapshot.sh writes from the migrations
 * (and CI checks). stored.test.ts fails when a table or column has no description here, so a new column can't ship
 * without one. "who" is who can read the rows; the page adds which columns no signed-in person can read at all.
 */
export interface StoredTable {
  /** A short name for the table. */
  title: string;
  /** What it holds, in a sentence. */
  what: string;
  /** Who can read its rows, and what reaches anyone else (only as described). */
  who: string;
  columns: Record<string, string>;
}

const ME = "Only you.";

/**
 * Server functions a signed-in person (and, with anon: true, anyone with the public key) can call that read data as
 * the database itself (SECURITY DEFINER), by exact signature, with a fingerprint of their code (md5 of
 * pg_get_functiondef). Each was checked against the "who" sentences above. schema.json lists them from the
 * migrations, and stored.test.ts fails when one is added, changed (a new fingerprint), newly opened to anonymous
 * callers or removed, until someone checks the sentences again and updates this list.
 */
export const REVIEWED_FUNCTIONS: Record<string, { hash: string; anon: boolean }> = {
  "accept_buddy_invite(text)": { hash: "bc7c574db1e403e696fc92fbd30d66b4", anon: false },
  "check_my_heartbeats()": { hash: "d1e69586816b5808f0be26b897d3f306", anon: false },
  "circle_goal()": { hash: "3f0fde6e21567544de3545f3ef589e49", anon: false },
  "circle_overview()": { hash: "e093955c1dca8aefe03bbc1780bdfb57", anon: false },
  "claim_push(text,uuid)": { hash: "6e292b9a714970676f60efdc10ed24f4", anon: false },
  "commit_day(uuid[],integer,integer,boolean)": { hash: "4570e44328bf99d2cc91f5a969aa36f7", anon: false },
  "convert_guest_key(text)": { hash: "94afe5f227b9ebb3ae4fd603cdfb10fc", anon: false },
  "craft_badge(text)": { hash: "fa6dc8b010b1957024903f0c51d42c3e", anon: false },
  "create_buddy_invite()": { hash: "e1a83b3919e441c732bf51576fb67b22", anon: false },
  "create_circle(text,text)": { hash: "802ac84f24159403087832290ec952bb", anon: false },
  "create_focus_link(text,integer)": { hash: "d5f6dc40a088de15faaefa7f13d8ba38", anon: false },
  "create_guest_key(text)": { hash: "8332ae5068212f693731bef61b91da07", anon: false },
  "decide_end_request(uuid,boolean)": { hash: "742fc4395435c06322e1394f2fde2d75", anon: false },
  "device_decide_end_request(uuid,text,uuid,boolean)": { hash: "9e7e649011223eda4338b5826602290c", anon: true },
  "device_sync(uuid,text,boolean,boolean)": { hash: "5f0391375a1953f138cad74441f663ec", anon: true },
  "end_buddy_link(uuid)": { hash: "37644ce34a6c1bf45eabfd455b85f258", anon: false },
  "end_focus_session(uuid,text)": { hash: "dbe695579d1126f0deac52d8d862bbc8", anon: false },
  "export_my_data()": { hash: "f36b8494b771869a0bdeadc7e5d0aedb", anon: false },
  "forget_device_secret(uuid)": { hash: "d268a20d5bc85bf8b17716ff2e0a76c5", anon: false },
  "get_focus_state()": { hash: "5148411f790b60917cbaec9ba5e2d195", anon: false },
  "get_today()": { hash: "a83a5e3dbddd84ab3bd5c20b9baa69b1", anon: false },
  "guest_decide(text,uuid,boolean)": { hash: "55a0a4137124b5a419581383a754a3de", anon: true },
  "guest_overview(text)": { hash: "c461bc1c974ef50ace06c20a1d78eb3c", anon: true },
  "guest_push_is_on(text,text)": { hash: "6378acfb04fa59dfdf7977cdb24e2045", anon: true },
  "guest_set_quiet(text,time without time zone,time without time zone,text)": { hash: "7b3ba686ac64220d6631065e34f9df82", anon: true },
  "heartbeat(uuid,text,text,boolean)": { hash: "6f53e5725e6719a1862e1a6de7a227a1", anon: false },
  "is_buddy_of(uuid,uuid)": { hash: "28c41bf99a46295b466438c35d6f56bc", anon: false },
  "issue_device_secret(uuid)": { hash: "8a7f64a345193084a506f07bf3e48d29", anon: false },
  "join_circle(text,text)": { hash: "18c9ed403cce21b0f3ab54a06409b67d", anon: false },
  "join_leaderboard(text)": { hash: "70e21ba078a17704a4e776c6a76c3742", anon: false },
  "key_request_status(uuid)": { hash: "beb1507902fd3191cdf52965ab8e35ca", anon: false },
  "leave_circle()": { hash: "37664738338126db9ae5d26bc77469af", anon: false },
  "leave_leaderboard()": { hash: "07229bc24e0d3000c481994d7143cf6b", anon: false },
  "let_go_circle_goal()": { hash: "bab84c9433bff46235015ef5d716e6e0", anon: false },
  "log_kind_act(uuid,text)": { hash: "d6840f37b464f4ee4ddace974d934cbb", anon: true },
  "monthly_leaderboard()": { hash: "1d364c22ae9bf685921730677690db38", anon: false },
  "my_collection()": { hash: "3c14630f673a02d192aa133f94862aea", anon: false },
  "my_progress(integer)": { hash: "2f1aa62b09478c319a79c1784c3cd047", anon: false },
  "my_rating()": { hash: "ee6ba236dc10db5947dde4da49166fb1", anon: false },
  "partner_badge()": { hash: "4470a80c960651ea86868ee9e4a1712a", anon: false },
  "partner_overview()": { hash: "a01e1c8cb55bf65d3acdbcef4bab4348", anon: false },
  "partner_rating()": { hash: "9187eeed9dba87aa5affc557d653bf19", anon: false },
  "partner_support_nudge()": { hash: "cde307e2b92dd44efc0168cf51cd4436", anon: true },
  "penalty_status()": { hash: "f8082c8302c3dd34a65169e421dc8592", anon: true },
  "pledge_limit()": { hash: "799069261ee89750181df6115fdea925", anon: true },
  "points_balance()": { hash: "de677060308014533d1c0e3960fa29e8", anon: false },
  "preview_buddy_invite(text)": { hash: "9a34de0af4fb42c5b18eabbdb3fadbeb", anon: false },
  "preview_circle_invite(text)": { hash: "138be78abaf32dcd069a46bb41340959", anon: false },
  "proof_context(uuid)": { hash: "aaf7f6613a531c713895c8c6c025eab5", anon: false },
  "recent_completion(integer)": { hash: "8f1d31775afb1a701e618ff139a3940d", anon: false },
  "remove_focus_link(uuid)": { hash: "09a5398b72bfbd8cfe4dde8f2fdfcd44", anon: false },
  "remove_guest_key()": { hash: "807a0955ba096f95ee9101cd2d0b6385", anon: false },
  "remove_guest_push(text,text)": { hash: "be1ff90b8e3360d1c18f47b6c7916f39", anon: true },
  "remove_push_subscription(text)": { hash: "f9744686ee0951d3e00012fcbd6df1c3", anon: false },
  "request_end_session(uuid,text)": { hash: "bfa0da21ac08fb5b17999396e266e810", anon: false },
  "review_day(uuid,jsonb,integer)": { hash: "7a7516281a7c9f48e324f8531c0bf884", anon: false },
  "save_extension_push(text,text,text)": { hash: "07269a1cd28bf558bd0df68d3a33c814", anon: false },
  "save_guest_push(text,text,text,text)": { hash: "ffdd41915cf8b3d6ea2c86600aa3352d", anon: true },
  "save_push_subscription(text,text,text)": { hash: "10b540a208a202ed1a3a1df687802916", anon: false },
  "send_cheer(uuid)": { hash: "bfc4eeb8adced3a7bdbf25994079a36a", anon: false },
  "set_circle_alias(text)": { hash: "18aa1fdb5f2a2d47aca3ec3f6a92d2b2", anon: false },
  "set_circle_sharing(boolean)": { hash: "0bc6be6683f3a87c864d81e95cb0098c", anon: false },
  "set_item_status(uuid,text)": { hash: "05b886e938ff456ba2b36fb9e9c067dc", anon: false },
  "set_my_sharing(boolean)": { hash: "1aa5afae5a93a691c12e13eb3ec2eb9d", anon: false },
  "set_penalty_optin(boolean)": { hash: "49cf5ae231ad6e1ab4ea272f6c9a5d89", anon: true },
  "set_pledge(integer,uuid,boolean)": { hash: "4e840e68b73c0cb57605203295f2af93", anon: true },
  "set_push_token(uuid,text)": { hash: "ca76d0392bafed15d438804e8921e1c9", anon: false },
  "set_quiet_hours(time without time zone,time without time zone)": { hash: "0a6e24d172a63174f2e424e11c2ad8fb", anon: false },
  "set_share_rating(boolean)": { hash: "8540ec4376e2a4b8d5d8eb055ae1be65", anon: false },
  "settle_makeup_step(uuid,text)": { hash: "b385a55f0aeba8ebfb20276a53f46b33", anon: false },
  "start_circle_goal(integer)": { hash: "23ff0f7a2815086f5c54e5acbd3ebd23", anon: false },
  "start_focus_session(integer,uuid,uuid,boolean)": { hash: "b337a51626bb32d1cfff719f4149f8a5", anon: false },
  "unreviewed_days()": { hash: "d6e7b893be1757414bd2f2cb737d81c0", anon: false },
  "use_focus_link(text)": { hash: "ee0256a76b77184539a618b5156521f4", anon: true },
  "verify_proof(uuid,text,text)": { hash: "9a820a76edc9b58a23d74b84b27e7b3b", anon: false },
};

export const STORED: Record<string, StoredTable> = {
  profiles: {
    title: "Your profile",
    what: "Your name and how Sparrow should behave for you.",
    who: "You. Your name reaches your partner, your circle (unless you use a made-up name there), a friend holding your key through a link, and anyone you give an invite code to. If you join the leaderboard, other people on it see your made-up name there. Someone who asks you for the key sees when your quiet hours end, while they are on.",
    columns: {
      id: "Your account's id.",
      display_name: "The name you chose.",
      timezone: "Your time zone, so days and reminders follow your clock.",
      gentle_mode: "Whether Gentle Mode is on.",
      onboarded: "Whether you finished the first steps.",
      created_at: "When you signed up.",
      light_day: "A day you asked to be lighter, if any.",
      share_rating: "Whether you show a rating to your partner (practice mode).",
      leaderboard_optin: "Whether you joined the leaderboard (off unless you switch it on).",
      leaderboard_handle: "The made-up name you use there, if any.",
      remind_morning: "Your morning reminder time, if you set one.",
      remind_evening: "Your evening reminder time, if you set one.",
      quiet_from: "When your quiet hours start, if you hold someone's key.",
      quiet_to: "When your quiet hours end.",
      proof_keep_days: "How many days your proofs are kept (7, 30 or 90), or empty to keep them until you delete them.",
    },
  },
  tasks: {
    title: "Tasks",
    what: "The things you want to do.",
    who: "You. Your partner sees the title of a task you share a proof for, and today's planned titles if you share your activity. A friend holding your key through a link sees the titles of tasks you shared proofs for.",
    columns: {
      id: "The task's id.",
      user_id: "Whose task it is.",
      title: "What you called it.",
      notes: "Your notes, if any.",
      proof_required: "Whether you want to add proof when it's done.",
      archived: "Whether you put it away.",
      created_at: "When you added it.",
      if_cue: "The 'if' of an if-then plan, if you wrote one.",
      then_action: "The 'then' of that plan.",
    },
  },
  task_steps: {
    title: "Task steps",
    what: "Small steps a task is split into.",
    who: ME,
    columns: {
      id: "The step's id.",
      task_id: "Which task it belongs to.",
      user_id: "Whose step it is.",
      title: "What the step is.",
      est_minutes: "About how long you think it takes.",
      position: "Its place in the list.",
      done_on: "The day you did it, if you did.",
    },
  },
  daily_plans: {
    title: "Days",
    what: "Each day you plan: when you committed to it, how it went and how you felt.",
    who: "You. If you share your activity, your partner sees whether today is planned and closed and a streak of closed days, and may get a gentle note when recent days were hard. If you share the practice rating, your partner sees a rating worked out from your days. A circle sees whether today is planned and closed, unless you switch sharing off. If you join the leaderboard, others on it see how many days moved forward this month. The people running the beta see anonymous totals, such as the average morning mood across everyone.",
    columns: {
      id: "The day's id.",
      user_id: "Whose day it is.",
      date: "The date, on your clock.",
      committed_at: "When you committed to the plan.",
      stake_type: "What you staked, if anything (points or a make-up step).",
      stake_amount: "How much, for a points stake.",
      mood_morning: "How you felt in the morning, if you said.",
      mood_evening: "How you felt in the evening, if you said.",
      reviewed_at: "When you looked back at the day.",
      points_earned: "Points the day brought.",
    },
  },
  plan_items: {
    title: "Planned things",
    what: "The tasks you picked for a day, and how each went.",
    who: "You. If you share your activity, your partner sees today's planned things and how each went. A circle sees how many were planned, done and partly done today, unless you switch sharing off. The practice rating and the leaderboard (only if you turn them on) are worked out from them.",
    columns: {
      id: "The item's id.",
      daily_plan_id: "Which day.",
      user_id: "Whose it is.",
      task_id: "Which task.",
      status: "Done, partly, didn't happen or moved.",
      completed_at: "When you marked it done.",
    },
  },
  proofs: {
    title: "Proofs",
    what: "Photos, voice notes and written notes you add to show what you did.",
    who: "Only you, unless you share one with your partner; then they see that one. A friend holding your key through a link sees shared written ones in full, and only that a photo or voice note exists.",
    columns: {
      id: "The proof's id.",
      plan_item_id: "Which planned thing it is for.",
      user_id: "Whose proof it is.",
      kind: "Photo, voice or written.",
      storage_path: "Where the photo or recording is kept (a private file under your own folder).",
      text_body: "A written note's words.",
      image_phash: "A short fingerprint of a photo, to notice the same photo used twice. Not the photo.",
      flagged_similar: "Whether the photo looked like one you used before.",
      visibility: "Private or shared with your partner.",
      server_created_at: "When it was saved, by the server's clock.",
      duration_s: "How long a voice note is, in seconds.",
      photo_age_hours: "How many hours passed between the photo's own date and adding it, if the photo had a date.",
    },
  },
  verifications: {
    title: "Partner's notes on proofs",
    what: "What your partner said about a proof you shared.",
    who: "You and the partner who wrote it.",
    columns: {
      id: "The note's id.",
      proof_id: "Which proof (empty once that proof was removed).",
      verifier_id: "Who wrote it.",
      verdict: "Looks good, or a question.",
      comment: "Their words, if any (cleared when the proof is removed).",
      created_at: "When they wrote it.",
    },
  },
  points_ledger: {
    title: "Points",
    what: "Each time points were added or set aside, and why.",
    who: ME,
    columns: {
      id: "The entry's number.",
      user_id: "Whose points.",
      delta: "How many points, up or down.",
      reason: "Why (for example a finished day).",
      ref_id: "What it was for, if it points at something.",
      created_at: "When.",
    },
  },
  focus_sessions: {
    title: "Focus sessions",
    what: "Each focus session: when it started and ended, and whether it was locked.",
    who: "You. If you share your activity, your partner sees running sessions and focus minutes; a circle sees today's focus minutes unless you switch sharing off. While you ask for the key, the person holding it sees when that session ends. Someone using one of your focus links learns whether a session is running and when it ends.",
    columns: {
      id: "The session's id.",
      user_id: "Whose session.",
      started_at: "When it started.",
      planned_minutes: "How long it was meant to be.",
      ends_at: "When it was meant to end.",
      ended_at: "When it ended.",
      ended_early: "Whether it ended before its time.",
      exit_reason: "What you said you'd do instead, when you ended early.",
      started_from_device_id: "Which device started it, if known.",
      plan_item_id: "The planned thing you focused on, if any.",
      locked: "Whether only your partner could end it early.",
      started_by_link: "Whether a focus link started it.",
    },
  },
  blocklists: {
    title: "Your lists",
    what: "The sites and apps you want kept away during focus.",
    who: "Only you, and your own devices while they block.",
    columns: {
      user_id: "Whose list.",
      domains: "Websites on the list.",
      android_packages: "Phone apps on the list.",
      updated_at: "When you last changed it.",
    },
  },
  devices: {
    title: "Your devices",
    what: "The laptops and phones that block for you, and when they last checked in.",
    who: "Only you. Your partner sees that blocking was switched off or a device went quiet during a session only if you share your activity.",
    columns: {
      id: "The device's id.",
      user_id: "Whose device.",
      platform: "Extension or phone.",
      label: "Its name, like 'Chrome on Mac'.",
      last_heartbeat_at: "When it last checked in.",
      protection_enabled: "Whether blocking was on at that moment.",
      created_at: "When it first checked in.",
      push_token: "Not used yet: empty unless a phone saves one.",
      secret_hash: "A fingerprint of the phone's own sign-in, not the sign-in itself.",
      asleep: "Whether the phone said its screen was off.",
    },
  },
  tamper_events: {
    title: "Notes about blocking",
    what: "Moments blocking was switched off, a device went quiet, or a session ended early.",
    who: "You, and your partner if you share your activity.",
    columns: {
      id: "The note's id.",
      user_id: "Whose it is.",
      device_id: "Which device, if any.",
      focus_session_id: "Which session.",
      kind: "What happened.",
      detail: "A few words about it (for an early end, what you said you'd do).",
      created_at: "When.",
    },
  },
  buddy_links: {
    title: "Accountability partner",
    what: "You and the person who holds your key, and what you share with each other.",
    who: "The two of you. A signed-in person who knows two account ids can ask whether those two are partners (to be closed in T4.4).",
    columns: {
      id: "The link's id.",
      requester_id: "Who invited.",
      partner_id: "Who accepted.",
      invite_code: "The invite code, while it waits.",
      status: "Waiting, active or ended.",
      mutual: "Whether you hold each other's key.",
      created_at: "When the invite was made.",
      requester_shares: "Whether the inviter shares their activity.",
      partner_shares: "Whether the partner shares theirs.",
      requester_penalty_ok: "Whether the inviter agreed to a practice penalty.",
      partner_penalty_ok: "Whether the partner agreed to one.",
    },
  },
  end_requests: {
    title: "Requests for the key",
    what: "Your requests to end a locked session early, with your reason and the answer.",
    who: "You. The person holding your key sees each request and its reason through their own page, not this table.",
    columns: {
      id: "The request's id.",
      session_id: "Which session.",
      user_id: "Who asked.",
      reason: "Your reason.",
      status: "Waiting, let out or keep going.",
      decided_by: "The partner who answered, if one did.",
      decided_at: "When they answered.",
      created_at: "When you asked.",
      decided_by_guest: "The friend with a key link who answered, if one did.",
    },
  },
  guest_keys: {
    title: "A friend's key link",
    what: "A friend who holds your key through a link, without an account.",
    who: "You can read the name and dates. Your friend's quiet hours and time zone are theirs: you can't read them, and only see when their quiet hours end, while they are on, if you ask for the key.",
    columns: {
      id: "The link's id.",
      owner_id: "Whose key it is.",
      name: "The name you gave your friend.",
      key_hash: "A fingerprint of the link, not the link.",
      created_at: "When you made it.",
      last_seen_at: "When your friend last opened it.",
      quiet_from: "Your friend's quiet hours start, if they set them.",
      quiet_to: "Their quiet hours end.",
      quiet_tz: "The time zone their browser reported, for those hours. Only Sparrow's server reads it, to work out when the hours end.",
    },
  },
  focus_links: {
    title: "Focus links",
    what: "Links that can only start a focus session for you.",
    who: ME,
    columns: {
      id: "The link's id.",
      user_id: "Whose link.",
      label: "Its name.",
      minutes: "How long a session it starts.",
      key_hash: "A fingerprint of the link, not the link.",
      created_at: "When you made it.",
      last_used_at: "When it last started a session.",
      use_count: "How many times it has.",
    },
  },
  focus_link_uses: {
    title: "Focus link uses",
    what: "Each time one of your focus links answered, for a day, so a link that leaks can't be used without limit.",
    who: "No one reads this through the app; only Sparrow's server uses it.",
    columns: {
      id: "The entry's number.",
      link_id: "Which link.",
      user_id: "Whose link.",
      started: "Whether that use started a session.",
      at: "When.",
    },
  },
  push_subscriptions: {
    title: "Notification addresses",
    what: "The push address a browser, a friend's key-link page or the Sparrow extension gave for notifications.",
    who: "Only you see your own; a friend's key-link address is theirs.",
    columns: {
      id: "The address's id.",
      user_id: "Whose it is.",
      endpoint: "The push service's address for that browser.",
      p256dh: "The browser's public key, so only it can read what is sent.",
      auth: "A browser secret for the same purpose.",
      created_at: "When it was switched on.",
      guest_key_id: "The key link it belongs to, for a friend without an account.",
      silent: "Whether it is the extension's, which only wakes up and never shows anything.",
    },
  },
  push_sent: {
    title: "Notifications already sent",
    what: "Which events already had their notification, so none goes out twice.",
    who: "No one reads this through the app; only Sparrow's server uses it.",
    columns: {
      kind: "What kind of event.",
      ref: "Which event.",
      created_at: "When it was sent.",
    },
  },
  reminder_sent: {
    title: "Reminders already sent",
    what: "Which morning or evening reminder went out on which day, so none goes out twice.",
    who: "No one reads this through the app; only Sparrow's server uses it.",
    columns: {
      user_id: "Whose reminder.",
      local_date: "The day, on their clock.",
      slot: "Morning or evening.",
      sent_at: "When it was sent.",
    },
  },
  reminder_job: {
    title: "The reminder job",
    what: "Where the five-minute reminder job sends its call, and its own secret.",
    who: "No one reads this through the app; only Sparrow's server uses it.",
    columns: {
      id: "Always 1.",
      function_url: "The address of the reminder function.",
      secret: "The job's secret, so only it can call that function.",
    },
  },
  kind_acts: {
    title: "Kind acts",
    what: "Small kind things you did after a heavy day.",
    who: ME,
    columns: {
      id: "The act's id.",
      user_id: "Whose it is.",
      plan_id: "Which day.",
      note: "What you did, if you wrote it.",
      created_at: "When.",
    },
  },
  makeup_steps: {
    title: "Make-up steps",
    what: "A five-minute step for tomorrow, when you staked one.",
    who: ME,
    columns: {
      id: "The step's id.",
      user_id: "Whose it is.",
      from_plan_id: "The day it came from.",
      due_on: "The day it is for.",
      title: "What the step is.",
      status: "Waiting, done or let go.",
      settled_at: "When you did it or let it go.",
      created_at: "When it was made.",
    },
  },
  pledges: {
    title: "Pledges (practice)",
    what: "Practice pledges to a cause: no real money moves.",
    who: "You. If you and your partner both turned the practice partner penalty on, your partner learns that a pledged day ended owing, and a small practice amount, through their own partner pledge.",
    columns: {
      id: "The pledge's id.",
      user_id: "Whose it is.",
      plan_id: "Which day.",
      charity_id: "Which cause.",
      amount: "How much, in practice.",
      currency: "Which currency, in practice.",
      mode: "How it works.",
      status: "Open or settled.",
      owed: "What the day's outcome would mean, in practice.",
      created_at: "When you made it.",
      settled_at: "When it was settled.",
    },
  },
  partner_pledges: {
    title: "Partner pledges (practice)",
    what: "A practice pledge a partner makes on your day: no real money moves.",
    who: "The partner who made it.",
    columns: {
      id: "The pledge's id.",
      plan_id: "Which day.",
      payer_id: "The partner who pledged.",
      for_user_id: "Whose day it is.",
      charity_id: "Which cause.",
      amount: "How much, in practice.",
      currency: "Which currency, in practice.",
      mode: "How it works.",
      created_at: "When it was made.",
    },
  },
  charities: {
    title: "Causes",
    what: "The causes practice pledges can name.",
    who: "Anyone signed in (it's a public list).",
    columns: {
      id: "The cause's id.",
      name: "Its name.",
      blurb: "A line about it.",
      active: "Whether it can be picked.",
      created_at: "When it was added.",
    },
  },
  circles: {
    title: "Circles",
    what: "Small groups of 2 to 4 people who cheer each other on.",
    who: "The circle's members. Anyone signed in who has the invite code sees its name and how many are in it.",
    columns: {
      id: "The circle's id.",
      name: "Its name.",
      invite_code: "The code to join it.",
      created_by: "Who started it.",
      created_at: "When.",
    },
  },
  circle_members: {
    title: "Circle members",
    what: "Who is in which circle and what they share.",
    who: "Each person reads their own membership; members see each other's chosen name through the circle page.",
    columns: {
      circle_id: "Which circle.",
      user_id: "Who.",
      member_key: "A random id the circle page uses for each member instead of their account id.",
      shares: "Whether they share their day's numbers with the circle.",
      joined_at: "When they joined.",
      alias: "The made-up name they chose for this circle, if any.",
    },
  },
  circle_cheers: {
    title: "Cheers",
    what: "A cheer one circle member sent another.",
    who: "The one who sent it and the one who got it.",
    columns: {
      id: "The cheer's id.",
      circle_id: "Which circle.",
      from_id: "Who sent it.",
      to_id: "Who got it.",
      day: "The day.",
      created_at: "When.",
    },
  },
  circle_goals: {
    title: "Circle goals",
    what: "One shared number a circle aims for together.",
    who: "The circle's members.",
    columns: {
      id: "The goal's id.",
      circle_id: "Which circle.",
      target: "The number to reach.",
      started_at: "When it started.",
      ends_at: "When it ends.",
      reached_at: "When it was reached, if it was.",
      let_go_at: "When the circle let it go, if it did.",
      started_by: "Who started it.",
    },
  },
  crafted_badges: {
    title: "Crafted badges",
    what: "Badges you made from the ones you earned.",
    who: ME,
    columns: {
      user_id: "Whose badge.",
      key: "Which badge.",
      crafted_at: "When you made it.",
    },
  },
  feedback: {
    title: "Feedback",
    what: "Feedback you chose to send.",
    who: "Only you, and the people running the beta.",
    columns: {
      id: "The message's id.",
      user_id: "Who sent it.",
      message: "Your words.",
      helpful: "Whether the page helped, if you said.",
      page: "Which page you sent it from.",
      created_at: "When.",
    },
  },
};

/** One table in schema.json (supabase/tests/snapshot.sql). */
export interface SchemaTable {
  table: string;
  kind?: "table" | "view";
  rls: boolean;
  readPolicies: string[];
  columns: { name: string; readable: boolean }[];
}

/** schema.json as a whole: tables and views, and the server functions people can call. */
export interface Schema {
  tables: SchemaTable[];
  functions: { signature: string; anon: boolean; hash: string }[];
}

export interface StoredRow extends Omit<StoredTable, "columns"> {
  table: string;
  /** hidden: the column grants keep it from every signed-in person, whatever the rows' rules say. */
  columns: { name: string; about: string; hidden: boolean }[];
}

/**
 * The page's rows: every table the migrations make, in the order of STORED (yours first), with each column's
 * description. Throws when something has no description, so the build stops instead of hiding it.
 */
export function storedTables(schema: SchemaTable[]): StoredRow[] {
  const byName = new Map(schema.map((t) => [t.table, t]));
  const missing = schema.filter((t) => !STORED[t.table]).map((t) => t.table);
  if (missing.length) throw new Error(`no description in stored.ts for: ${missing.join(", ")}`);
  return Object.entries(STORED)
    .filter(([name]) => byName.has(name))
    .map(([name, d]) => ({
      table: name,
      title: d.title,
      what: d.what,
      who: d.who,
      columns: byName.get(name)!.columns.map((c) => {
        const about = d.columns[c.name];
        if (!about) throw new Error(`no description in stored.ts for ${name}.${c.name}`);
        return { name: c.name, about, hidden: !c.readable };
      }),
    }));
}
