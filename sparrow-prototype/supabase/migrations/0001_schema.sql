-- Sparrow schema. Every table has Row-Level Security.
-- Writes that must not be forged (points, plan commitment, focus sessions,
-- timestamps) have NO insert/update policy and go through SECURITY DEFINER
-- functions in 0002_functions.sql.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (char_length(display_name) <= 60),
  timezone text not null default 'UTC',
  gentle_mode boolean not null default true,
  onboarded boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  notes text check (char_length(notes) <= 1000),
  proof_required boolean not null default false,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);
create index on public.tasks (user_id) where not archived;

create table public.task_steps (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  est_minutes int not null default 5 check (est_minutes between 1 and 120),
  position int not null default 0,
  done_on date
);
create index on public.task_steps (task_id, position);

create table public.daily_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  date date not null,
  committed_at timestamptz,
  stake_type text not null default 'none' check (stake_type in ('none', 'points')),
  stake_amount int not null default 0 check (stake_amount between 0 and 50),
  mood_morning int check (mood_morning between 1 and 5),
  mood_evening int check (mood_evening between 1 and 5),
  reviewed_at timestamptz,
  points_earned int,
  unique (user_id, date)
);

create table public.plan_items (
  id uuid primary key default gen_random_uuid(),
  daily_plan_id uuid not null references public.daily_plans (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  task_id uuid not null references public.tasks (id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'done', 'partial', 'missed', 'rescheduled')),
  completed_at timestamptz,
  unique (daily_plan_id, task_id)
);

create table public.proofs (
  id uuid primary key default gen_random_uuid(),
  plan_item_id uuid not null references public.plan_items (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('photo', 'text')),
  storage_path text,
  text_body text check (char_length(text_body) <= 2000),
  image_phash text check (image_phash ~ '^[0-9a-f]{16}$'),
  flagged_similar boolean not null default false,
  visibility text not null default 'private' check (visibility in ('private', 'buddy')),
  server_created_at timestamptz not null default now(),
  check ((kind = 'photo' and storage_path is not null) or (kind = 'text' and text_body is not null))
);

create table public.points_ledger (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  delta int not null,
  reason text not null,
  ref_id uuid,
  created_at timestamptz not null default now()
);
create index on public.points_ledger (user_id);

create table public.devices (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  platform text not null check (platform in ('web', 'extension', 'android')),
  label text check (char_length(label) <= 60),
  last_heartbeat_at timestamptz,
  protection_enabled boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.blocklists (
  user_id uuid primary key references auth.users (id) on delete cascade,
  domains text[] not null default '{}' check (cardinality(domains) <= 200),
  android_packages text[] not null default '{}',
  updated_at timestamptz not null default now()
);

create table public.focus_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  started_at timestamptz not null default now(),
  planned_minutes int not null check (planned_minutes between 5 and 240),
  ends_at timestamptz not null,
  ended_at timestamptz,
  ended_early boolean not null default false,
  exit_reason text check (char_length(exit_reason) <= 300),
  started_from_device_id uuid references public.devices (id) on delete set null,
  plan_item_id uuid references public.plan_items (id) on delete set null
);
create index on public.focus_sessions (user_id, ends_at desc);

create table public.tamper_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  device_id uuid references public.devices (id) on delete set null,
  focus_session_id uuid references public.focus_sessions (id) on delete cascade,
  kind text not null check (kind in ('heartbeat_lost', 'protection_disabled', 'early_exit')),
  detail text,
  created_at timestamptz not null default now()
);

-- Buddy tables: schema now, UI arrives in milestone M6.
create table public.buddy_links (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users (id) on delete cascade,
  partner_id uuid references auth.users (id) on delete cascade,
  invite_code text unique not null default substr(replace(gen_random_uuid()::text, '-', ''), 1, 16),
  status text not null default 'pending' check (status in ('pending', 'active', 'ended')),
  mutual boolean not null default false,
  share_tamper_events boolean not null default false,
  created_at timestamptz not null default now(),
  check (partner_id is null or partner_id <> requester_id)
);

create table public.verifications (
  id uuid primary key default gen_random_uuid(),
  proof_id uuid not null references public.proofs (id) on delete cascade,
  verifier_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  verdict text not null check (verdict in ('approve', 'question')),
  comment text check (char_length(comment) <= 500),
  created_at timestamptz not null default now(),
  unique (proof_id, verifier_id)
);

-- ---------------------------------------------------------------- RLS
alter table public.profiles       enable row level security;
alter table public.tasks          enable row level security;
alter table public.task_steps     enable row level security;
alter table public.daily_plans    enable row level security;
alter table public.plan_items     enable row level security;
alter table public.proofs         enable row level security;
alter table public.points_ledger  enable row level security;
alter table public.devices        enable row level security;
alter table public.blocklists     enable row level security;
alter table public.focus_sessions enable row level security;
alter table public.tamper_events  enable row level security;
alter table public.buddy_links    enable row level security;
alter table public.verifications  enable row level security;

-- Is `viewer` (default: current user) an active buddy of `owner`?
create function public.is_buddy_of(owner uuid, viewer uuid default auth.uid())
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.buddy_links b
    where b.status = 'active'
      and ((b.requester_id = owner and b.partner_id = viewer)
        or (b.mutual and b.partner_id = owner and b.requester_id = viewer))
  );
$$;

-- profiles: own row only. (onboarded/gentle_mode editable by the user.)
create policy profiles_select on public.profiles for select using (id = auth.uid());
create policy profiles_update on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());

-- tasks / steps: full CRUD on own rows.
create policy tasks_all on public.tasks for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy steps_all on public.task_steps for all using (user_id = auth.uid())
  with check (user_id = auth.uid()
    and exists (select 1 from public.tasks t where t.id = task_id and t.user_id = auth.uid()));

-- plans / items: read only; writes via functions.
create policy plans_select on public.daily_plans for select using (user_id = auth.uid());
create policy items_select on public.plan_items for select using (user_id = auth.uid());

-- proofs: owner reads/inserts/deletes/changes visibility; buddy reads shared ones.
create policy proofs_select_own on public.proofs for select using (user_id = auth.uid());
create policy proofs_select_buddy on public.proofs for select
  using (visibility = 'buddy' and public.is_buddy_of(user_id));
create policy proofs_insert on public.proofs for insert with check (
  user_id = auth.uid()
  and exists (select 1 from public.plan_items i where i.id = plan_item_id and i.user_id = auth.uid()));
create policy proofs_update on public.proofs for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy proofs_delete on public.proofs for delete using (user_id = auth.uid());

-- points: read own; writes only via functions.
create policy points_select on public.points_ledger for select using (user_id = auth.uid());

-- devices: read own; writes via heartbeat().
create policy devices_select on public.devices for select using (user_id = auth.uid());
create policy devices_delete on public.devices for delete using (user_id = auth.uid());

-- blocklist: full control of own row.
create policy blocklist_all on public.blocklists for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- focus sessions: read own; writes via functions.
create policy focus_select on public.focus_sessions for select using (user_id = auth.uid());

-- tamper events: owner reads; buddy reads only if owner opted in.
create policy tamper_select_own on public.tamper_events for select using (user_id = auth.uid());
create policy tamper_select_buddy on public.tamper_events for select using (
  exists (select 1 from public.buddy_links b
          where b.status = 'active' and b.share_tamper_events
            and b.requester_id = tamper_events.user_id and b.partner_id = auth.uid()));

-- buddy links: either side can read; requester creates; either side can end.
create policy buddy_select on public.buddy_links for select
  using (requester_id = auth.uid() or partner_id = auth.uid());
create policy buddy_insert on public.buddy_links for insert
  with check (requester_id = auth.uid() and status = 'pending' and partner_id is null);
create policy buddy_update on public.buddy_links for update
  using (requester_id = auth.uid() or partner_id = auth.uid());

-- verifications: verifier writes on proofs they can see; owner reads.
create policy verif_select on public.verifications for select using (
  verifier_id = auth.uid()
  or exists (select 1 from public.proofs p where p.id = proof_id and p.user_id = auth.uid()));
create policy verif_insert on public.verifications for insert with check (
  verifier_id = auth.uid()
  and exists (select 1 from public.proofs p where p.id = proof_id
              and p.visibility = 'buddy' and public.is_buddy_of(p.user_id)));

-- ------------------------------------------------- profile on sign-up
create function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id) values (new.id) on conflict do nothing;
  insert into public.blocklists (user_id) values (new.id) on conflict do nothing;
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Proof rows: server owns user_id and timestamp.
create function public.proofs_force_server_fields()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.user_id := auth.uid();
  new.server_created_at := now();
  if tg_op = 'INSERT' then
    new.flagged_similar := new.image_phash is not null and exists (
      select 1 from public.proofs p
      where p.user_id = new.user_id and p.image_phash is not null
        and bit_count(('x' || p.image_phash)::bit(64) # ('x' || new.image_phash)::bit(64)) <= 5);
  end if;
  if tg_op = 'UPDATE' then
    -- only visibility may change after creation
    new.kind := old.kind; new.storage_path := old.storage_path; new.text_body := old.text_body;
    new.image_phash := old.image_phash; new.flagged_similar := old.flagged_similar;
    new.plan_item_id := old.plan_item_id; new.server_created_at := old.server_created_at;
  end if;
  return new;
end;
$$;
create trigger proofs_server_fields before insert or update on public.proofs
  for each row execute function public.proofs_force_server_fields();
