-- ============================================================================
-- CoachOS — per-coach timezone
--
-- The application server runs in UTC. Without a per-coach zone, "today",
-- "has this session ended?" and every overdue calculation are wrong for any
-- coach not on UTC — an evening session rolls into tomorrow mid-session.
--
-- Existing rows default to UTC, which is the previous (incorrect but stable)
-- behaviour; coaches set their real zone at onboarding or in Settings.
--
-- Safe to re-run: every statement is guarded.
-- ============================================================================

alter table coaches
  add column if not exists timezone text not null default 'UTC';

comment on column coaches.timezone is
  'IANA timezone name, e.g. America/Los_Angeles. All calendar decisions for this coach are made in this zone.';

-- Cheap sanity guard: an IANA name, not free text. Full validation happens in
-- the application via Intl, which knows the current tz database.
do $$
begin
  alter table coaches
    add constraint coaches_timezone_shape
    check (timezone = 'UTC' or timezone ~ '^[A-Za-z_]+/[A-Za-z0-9_+\-/]+$');
exception
  when duplicate_object then null;
end $$;
