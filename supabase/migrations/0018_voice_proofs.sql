-- Voice-note proofs (D27): a short recording ("I just finished the walk, it was cold") is often
-- easier than a photo, and harder to reuse than a typed note. Same rules as photos: recorded in
-- the app, stored privately under proofs/<user_id>/, server timestamp, shared one at a time.
-- Capped at 60 seconds (enforced here) and 1 MB (enforced by the bucket and the client).

alter table public.proofs drop constraint proofs_kind_check;
alter table public.proofs add constraint proofs_kind_check check (kind in ('photo', 'text', 'voice'));
alter table public.proofs add column duration_s int check (duration_s between 1 and 60);
alter table public.proofs drop constraint proofs_check;
alter table public.proofs add constraint proofs_check check (
  (kind = 'photo' and storage_path is not null)
  or (kind = 'text' and text_body is not null)
  or (kind = 'voice' and storage_path is not null and duration_s is not null and image_phash is null));

-- Audio types the browsers' MediaRecorder produces (Chrome/Edge/Firefox: webm or ogg; Safari: mp4).
update storage.buckets
   set allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'audio/webm', 'audio/ogg', 'audio/mp4']
 where id = 'proofs';

-- duration_s is fixed after creation like the other proof fields.
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
    new.duration_s := old.duration_s;
  end if;
  return new;
end;
$$;
