-- "If X, then I will Y" plans (implementation intentions) on tasks. Both parts are
-- stored together or not at all. Tasks are already owner-only through RLS, so no new
-- function or policy is needed.
alter table public.tasks
  add column if_cue text check (char_length(trim(if_cue)) between 1 and 120),
  add column then_action text check (char_length(trim(then_action)) between 1 and 120),
  add constraint tasks_if_then_pair check ((if_cue is null) = (then_action is null));
