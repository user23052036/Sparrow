-- M5b-1: Android devices register an FCM push token so a session started on
-- another device can wake the phone (used by M5b-3). The token is private to
-- the owner: devices has an owner-only select policy, and the only write path
-- is this function, which checks the device belongs to the caller.
alter table public.devices add column push_token text check (char_length(push_token) <= 4096);

create function public.set_push_token(p_device_id uuid, p_token text)
returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public.require_user();
begin
  update public.devices set push_token = nullif(trim(p_token), '')
   where id = p_device_id and user_id = uid;
  if not found then raise exception 'device not found'; end if;
end;
$$;

-- Blocklist hygiene: Android package names look like com.example.app.
alter table public.blocklists add constraint android_packages_limit check (cardinality(android_packages) <= 300);

revoke execute on function public.set_push_token(uuid, text) from public, anon;
grant execute on function public.set_push_token(uuid, text) to authenticated;
