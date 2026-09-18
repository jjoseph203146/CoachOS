-- ============================================================================
-- Test harness only. NOT a migration and never applied to a real project.
--
-- Stands in for the parts of Supabase the migrations rely on (the `auth`
-- schema, auth.uid(), and the anon/authenticated roles) so the whole chain can
-- be exercised on a plain Postgres. Run by scripts/test-sql.sh.
-- ============================================================================
create role anon nologin;
create role authenticated nologin;

create schema auth;
create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb default '{}'::jsonb
);
create function auth.uid() returns uuid language sql stable as
$$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

grant usage on schema public to anon, authenticated;
grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
