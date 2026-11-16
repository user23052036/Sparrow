-- The public schema as the migrations leave it, for the "What Sparrow stores" page (ROADMAP T4.1, D47).
-- One JSON document: every table and view, whether row-level security is on, the policies that let rows be read,
-- each column with whether a signed-in person's role may read it at all (column grants, e.g. 0031), and the
-- server functions people can call that read data as the database itself, each with its exact signature, whether
-- anonymous callers may run it, and a fingerprint of its code: any change means checking the page again.
-- Ordered with collate "C" so every PostgreSQL writes the same file, whatever its locale.
select jsonb_pretty(jsonb_build_object(
  'tables', (
    select coalesce(jsonb_agg(t order by t ->> 'table' collate "C"), '[]'::jsonb) from (
      select jsonb_build_object(
        'table', c.relname,
        'kind', case when c.relkind in ('v', 'm') then 'view' else 'table' end,
        'rls', c.relrowsecurity,
        'readPolicies', (select coalesce(jsonb_agg(p.policyname::text order by p.policyname collate "C"), '[]'::jsonb)
                           from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname and p.cmd in ('SELECT', 'ALL')),
        'columns', (select jsonb_agg(jsonb_build_object(
                             'name', a.attname,
                             'readable', has_column_privilege('authenticated', c.oid, a.attname, 'SELECT'))
                           order by a.attnum)
                      from pg_attribute a where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped)
      ) as t
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm')
    ) x),
  'functions', (
    select coalesce(jsonb_agg(jsonb_build_object('signature', f.sig, 'anon', f.anon, 'hash', f.hash) order by f.sig collate "C"), '[]'::jsonb)
      from (
        select p.oid::regprocedure::text as sig,
               has_function_privilege('anon', p.oid, 'execute') as anon,
               md5(pg_get_functiondef(p.oid)) as hash
          from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.prosecdef
           and (has_function_privilege('authenticated', p.oid, 'execute') or has_function_privilege('anon', p.oid, 'execute'))
      ) f)
));
