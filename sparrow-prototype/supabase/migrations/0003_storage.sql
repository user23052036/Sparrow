-- Private bucket for proof photos. Path convention: <user_id>/<uuid>.jpg
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('proofs', 'proofs', false, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy proofs_obj_select_own on storage.objects for select
  using (bucket_id = 'proofs' and (storage.foldername(name))[1] = auth.uid()::text);
create policy proofs_obj_insert_own on storage.objects for insert
  with check (bucket_id = 'proofs' and (storage.foldername(name))[1] = auth.uid()::text);
create policy proofs_obj_delete_own on storage.objects for delete
  using (bucket_id = 'proofs' and (storage.foldername(name))[1] = auth.uid()::text);
create policy proofs_obj_select_buddy on storage.objects for select
  using (bucket_id = 'proofs' and exists (
    select 1 from public.proofs p
     where p.storage_path = name and p.visibility = 'buddy' and public.is_buddy_of(p.user_id)));
