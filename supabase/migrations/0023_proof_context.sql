-- Proof context (D32): the rule-based, assistive-only part of the plan's "plausibility" idea.
-- No score and no verdict (D5: a photo or note cannot prove anything). proof_context() returns a
-- few plain facts about ONE proof, for its owner or for the partner it was shared with:
--   * how many days after the planned day it was added (server clock, owner's time zone),
--   * whether it was added within a few minutes of planning the day,
--   * whether the photo looked like an earlier one (already flagged since 0001),
--   * whether the photo's own date (EXIF, read in the browser before the image is re-encoded)
--     was more than a day older than the moment it was added.
-- photo_age_hours is reported by the person's own browser, so it is a hint and nothing more;
-- like the other proof fields it cannot be changed after the proof is saved.
-- Nothing here reveals other proofs, focus sessions, moods or anything that was not shared.

alter table public.proofs
  add column photo_age_hours int check (photo_age_hours between 0 and 876000),
  add constraint proofs_photo_age_kind check (photo_age_hours is null or kind = 'photo');

create or replace function public.proofs_force_server_fields()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.user_id := auth.uid();
  new.server_created_at := now();
  if tg_op = 'INSERT' then
    new.flagged_similar := new.image_phash is not null and exists (
      select 1 from public.proofs p
      where p.user_id = new.user_id and p.image_phash is not null
        and bit_count(('x' || p.image_phash)::bit(64) # ('x' || new.image_phash)::bit(64)) <= 5);
    -- a recording must live in the author's own folder
    if new.kind = 'voice' and split_part(new.storage_path, '/', 1) <> new.user_id::text then
      raise exception 'recordings are stored in your own folder';
    end if;
  end if;
  if tg_op = 'UPDATE' then
    -- only visibility may change after creation
    new.kind := old.kind; new.storage_path := old.storage_path; new.text_body := old.text_body;
    new.image_phash := old.image_phash; new.flagged_similar := old.flagged_similar;
    new.plan_item_id := old.plan_item_id; new.server_created_at := old.server_created_at;
    new.duration_s := old.duration_s; new.photo_age_hours := old.photo_age_hours;
  end if;
  return new;
end;
$$;

create function public.proof_context(p_proof_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := public.require_user(); p public.proofs; d public.daily_plans; tz text;
begin
  select * into p from public.proofs where id = p_proof_id;
  -- same answer for "doesn't exist" and "not yours to see", so ids can't be probed
  if p.id is null or not (p.user_id = uid or (p.visibility = 'buddy' and public.is_buddy_of(p.user_id, uid))) then
    raise exception 'that proof isn''t available';
  end if;
  select dp.* into d from public.plan_items i join public.daily_plans dp on dp.id = i.daily_plan_id
   where i.id = p.plan_item_id;
  select coalesce(timezone, 'UTC') into tz from public.profiles where id = p.user_id;
  return jsonb_build_object(
    'kind', p.kind,
    'days_after', greatest(0, (p.server_created_at at time zone tz)::date - d.date),
    'soon_after_planning', coalesce(d.committed_at is not null
                                    and p.server_created_at >= d.committed_at
                                    and p.server_created_at < d.committed_at + interval '5 minutes', false),
    'similar_photo', p.flagged_similar,
    'photo_age', case when p.kind <> 'photo' or p.photo_age_hours is null then null
                      when p.photo_age_hours > 24 then 'older' else 'fresh' end);
end;
$$;
revoke execute on function public.proof_context(uuid) from public, anon;
grant execute on function public.proof_context(uuid) to authenticated;
