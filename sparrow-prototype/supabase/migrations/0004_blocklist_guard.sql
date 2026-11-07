-- During a running focus session the blocklist may grow but not shrink, so a
-- session can't be quietly emptied from another tab or device.
create function public.blocklist_no_shrink_during_focus()
returns trigger language plpgsql set search_path = '' as $$
begin
  if exists (select 1 from public.focus_sessions s
             where s.user_id = old.user_id and s.ended_at is null and s.ends_at > now())
     and not (old.domains <@ new.domains) then
    raise exception 'sites can be removed after your focus session ends';
  end if;
  return new;
end;
$$;
create trigger blocklists_no_shrink before update on public.blocklists
  for each row execute function public.blocklist_no_shrink_during_focus();
