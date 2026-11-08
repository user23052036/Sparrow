-- Account deletion (D20). Every table already cascades from auth.users, so removing the
-- user row removes their data. One gap: the partnership row is deleted too, and a partner's
-- *locked* focus session would have nobody left to release it. This trigger releases such
-- locks whenever a partnership row disappears, so deleting an account never traps anyone.
-- Proof photos live in Storage and cannot be removed with SQL: the `delete-account` Edge
-- Function removes them first (supabase/functions/delete-account).

create function public._release_locks_on_link_delete() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.focus_sessions set locked = false
   where user_id in (old.requester_id, old.partner_id) and ended_at is null and locked;
  return old;
end;
$$;
revoke execute on function public._release_locks_on_link_delete() from public, anon, authenticated;

create trigger buddy_links_release_locks before delete on public.buddy_links
  for each row execute function public._release_locks_on_link_delete();
