-- The public schema as the migrations leave it, for the "What Sparrow stores" page (ROADMAP T4.1).
-- One JSON document: every table, whether row-level security is on, the policies that let rows be read,
-- and each column with whether a signed-in person's role may read it at all (column grants, e.g. 0031).
select jsonb_pretty(coalesce(jsonb_agg(t order by t ->> 'table'), '[]'::jsonb)) from (
  select jsonb_build_object(
    'table', c.relname,
    'rls', c.relrowsecurity,
    'readPolicies', (select coalesce(jsonb_agg(p.policyname::text order by p.policyname), '[]'::jsonb)
                       from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname and p.cmd in ('SELECT', 'ALL')),
    'columns', (select jsonb_agg(jsonb_build_object(
                         'name', a.attname,
                         'readable', has_column_privilege('authenticated', c.oid, a.attname, 'SELECT'))
                       order by a.attnum)
                  from pg_attribute a where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped)
  ) as t
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r'
) x;
