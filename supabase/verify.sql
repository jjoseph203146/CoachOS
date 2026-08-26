-- ============================================================================
-- CoachOS — database verification
--
-- Run this in the Supabase SQL editor to confirm your database matches what the
-- application expects. Read-only: it changes nothing.
--
-- Every row should read OK. Anything marked MISSING tells you which migration
-- to re-run (they are all safe to re-run).
-- ============================================================================

with checks as (
  -- ---- tables (0001) ----
  select
    '0001' as migration,
    'table: ' || t.name as item,
    case when to_regclass('public.' || t.name) is not null then 'OK' else 'MISSING' end as status
  from (values
    ('coaches'), ('players'), ('sessions'),
    ('enrollments'), ('charges'), ('payments'), ('credits')
  ) as t(name)

  union all

  -- ---- enums (0001) ----
  select
    '0001',
    'enum: ' || e.name,
    case when exists (select 1 from pg_type where typname = e.name) then 'OK' else 'MISSING' end
  from (values
    ('session_type'), ('session_status'), ('attendance_status'),
    ('player_level'), ('attendance_window'), ('ui_theme')
  ) as e(name)

  union all

  -- ---- money is integer cents, never floating point (0001) ----
  select
    '0001',
    'integer money: ' || c.table_name || '.' || c.column_name,
    case when c.data_type = 'integer' then 'OK' else 'WRONG TYPE: ' || c.data_type end
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.column_name in ('amount_cents', 'price_cents', 'default_rate_cents')

  union all

  -- ---- financial integrity triggers (0002) ----
  select
    '0002',
    'trigger: ' || t.name,
    case when exists (
      select 1 from pg_trigger where tgname = t.name and not tgisinternal
    ) then 'OK' else 'MISSING' end
  from (values
    ('payments_guard'), ('credits_guard'), ('charges_void_guard'),
    ('charges_amount_guard'), ('enrollments_same_coach'), ('charges_same_coach')
  ) as t(name)

  union all

  -- ---- row level security is ON and FORCED (0003) ----
  select
    '0003',
    'RLS enabled: ' || c.relname,
    case
      when c.relrowsecurity and c.relforcerowsecurity then 'OK'
      when c.relrowsecurity then 'ENABLED BUT NOT FORCED'
      else 'MISSING — TENANTS ARE NOT ISOLATED'
    end
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname in (
      'coaches', 'players', 'sessions', 'enrollments',
      'charges', 'payments', 'credits'
    )

  union all

  -- ---- one policy per coach-owned table (0003) ----
  select
    '0003',
    'policy: ' || p.name,
    case when exists (
      select 1 from pg_policies
      where schemaname = 'public' and policyname = p.name
    ) then 'OK' else 'MISSING' end
  from (values
    ('coaches_select_own'), ('coaches_insert_own'), ('coaches_update_own'),
    ('players_all_own'), ('sessions_all_own'), ('enrollments_all_own'),
    ('charges_all_own'), ('payments_all_own'), ('credits_all_own')
  ) as p(name)

  union all

  select
    '0003',
    'function: current_coach_id',
    case when exists (
      select 1 from pg_proc where proname = 'current_coach_id'
    ) then 'OK' else 'MISSING' end

  union all

  -- ---- signup bootstrap (0004) ----
  select
    '0004',
    'trigger: on_auth_user_created',
    case when exists (
      select 1 from pg_trigger where tgname = 'on_auth_user_created' and not tgisinternal
    ) then 'OK' else 'MISSING' end

  union all

  -- ---- per-coach timezone (0005) ----
  select
    '0005',
    'column: coaches.timezone',
    case when exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'coaches' and column_name = 'timezone'
    ) then 'OK' else 'MISSING' end

  union all

  select
    '0005',
    'constraint: coaches_timezone_shape',
    case when exists (
      select 1 from pg_constraint where conname = 'coaches_timezone_shape'
    ) then 'OK' else 'MISSING' end
)
select migration, status, item
from checks
-- Problems float to the top.
order by (status = 'OK'), migration, item;
