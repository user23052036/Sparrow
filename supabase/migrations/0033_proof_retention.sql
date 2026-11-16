-- Proof retention (ROADMAP T4.2, D48).
-- A person can choose to keep their proofs for 7, 30 or 90 days, or until they delete them (empty, the default:
-- nothing changes for anyone who doesn't choose). The five-minute job (0029) asks claim_expired_proofs() for proofs
-- past their time, removes their files through the Storage API first and only then the rows
-- (delete_expired_proofs), the same order as account deletion (D20): a step that doesn't finish leaves rows that are
-- tried again, never files that nobody can find.

alter table public.profiles add column proof_keep_days int check (proof_keep_days in (7, 30, 90));

-- Proofs past their owner's time, files first (photos and voice notes before written notes), oldest first.
create function public.claim_expired_proofs(p_limit int default 200) returns table (id uuid, storage_path text)
language sql stable security definer set search_path = '' as $$
  select p.id, p.storage_path
    from public.proofs p
    join public.profiles pr on pr.id = p.user_id
   where pr.proof_keep_days is not null
     and p.server_created_at < now() - make_interval(days => pr.proof_keep_days)
   order by (p.storage_path is null), p.server_created_at
   limit greatest(1, least(coalesce(p_limit, 200), 1000));
$$;

-- After their files are gone: the rows. Only the server calls this, with ids claim_expired_proofs() gave it; once a
-- file is gone its row goes too, even if its owner chose a longer time in the seconds between. Returns how many went.
create function public.delete_expired_proofs(p_ids uuid[]) returns int
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  delete from public.proofs where id = any (p_ids);
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke execute on function public.claim_expired_proofs(int), public.delete_expired_proofs(uuid[]) from public, anon, authenticated;
grant execute on function public.claim_expired_proofs(int), public.delete_expired_proofs(uuid[]) to service_role;
