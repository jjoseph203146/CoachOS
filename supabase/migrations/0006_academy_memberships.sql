-- ============================================================================
-- CoachOS — academies and memberships (multi-coach tenancy)
--
-- Until now a `coaches` row was BOTH the business and the one person who ran
-- it, and every data table's `coach_id` was that single tenant key. This
-- migration splits the two concepts:
--
--   academies             the business / tenant (name, default rate, timezone…)
--   academy_memberships   one row per person in an academy, with a role
--                         (renamed from `coaches`; auth_user_id lives here)
--
-- and re-points every data table's tenant column at the academy
-- (`coach_id` -> `academy_id`).
--
-- Existing data is preserved without rewriting a single data row: each
-- existing coach's id is reused as their academy's id, so every `coach_id`
-- value already equals the new `academy_id` value. Every existing coach
-- becomes the owner of their own academy.
--
-- This is deliberately ONE file. The functions, triggers and RLS policies
-- below all refer to the renamed table/column; splitting them across files
-- would leave the database broken if only the first part were applied.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────── academies ──

create type membership_role as enum ('owner', 'coach');

create table academies (
  id                 uuid primary key default gen_random_uuid(),
  business_name      text not null default '',
  -- Fallback rate used when a player has no rate of their own.
  default_rate_cents integer not null default 7000 check (default_rate_cents >= 0),
  attendance_window  attendance_window not null default '24 hours',
  theme              ui_theme not null default 'Light',
  -- IANA name; full validation happens in the application via Intl.
  timezone           text not null default 'UTC'
    constraint academies_timezone_shape
    check (timezone = 'UTC' or timezone ~ '^[A-Za-z_]+/[A-Za-z0-9_+\-/]+$'),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

comment on column academies.timezone is
  'IANA timezone name, e.g. America/Los_Angeles. All calendar decisions for this academy are made in this zone.';

create trigger academies_updated_at before update on academies
  for each row execute function set_updated_at();

-- Reuse each coach's id as their academy's id (see header).
insert into academies
  (id, business_name, default_rate_cents, attendance_window, theme, timezone, created_at)
select
  id, business_name, default_rate_cents, attendance_window, theme, timezone, created_at
from coaches;

-- ─────────────────────────────────────────────── coaches -> memberships ────

alter table coaches add column academy_id uuid;
alter table coaches add column role membership_role;

update coaches set academy_id = id, role = 'owner';

alter table coaches alter column academy_id set not null;
alter table coaches alter column role set not null;
alter table coaches
  add constraint academy_memberships_academy_id_fkey
  foreign key (academy_id) references academies (id) on delete cascade;

-- The business-level columns now live on `academies` only.
alter table coaches
  drop column business_name,
  drop column default_rate_cents,
  drop column attendance_window,
  drop column theme,
  drop column timezone;

alter table coaches rename to academy_memberships;

alter table academy_memberships
  rename constraint coaches_pkey to academy_memberships_pkey;
alter table academy_memberships
  rename constraint coaches_auth_user_id_key to academy_memberships_auth_user_id_key;
alter index coaches_auth_user_id_idx rename to academy_memberships_auth_user_id_idx;
alter trigger coaches_updated_at on academy_memberships
  rename to academy_memberships_updated_at;

create index academy_memberships_academy_idx on academy_memberships (academy_id);

-- ─────────────────────────────── re-point every data table at the academy ──
-- The values are unchanged (academy id == old coach id), so this is DDL only.

alter table players     rename column coach_id to academy_id;
alter table sessions    rename column coach_id to academy_id;
alter table enrollments rename column coach_id to academy_id;
alter table charges     rename column coach_id to academy_id;
alter table payments    rename column coach_id to academy_id;
alter table credits     rename column coach_id to academy_id;

alter table players     drop constraint players_coach_id_fkey;
alter table sessions    drop constraint sessions_coach_id_fkey;
alter table enrollments drop constraint enrollments_coach_id_fkey;
alter table charges     drop constraint charges_coach_id_fkey;
alter table payments    drop constraint payments_coach_id_fkey;
alter table credits     drop constraint credits_coach_id_fkey;

alter table players     add constraint players_academy_id_fkey
  foreign key (academy_id) references academies (id) on delete cascade;
alter table sessions    add constraint sessions_academy_id_fkey
  foreign key (academy_id) references academies (id) on delete cascade;
alter table enrollments add constraint enrollments_academy_id_fkey
  foreign key (academy_id) references academies (id) on delete cascade;
alter table charges     add constraint charges_academy_id_fkey
  foreign key (academy_id) references academies (id) on delete cascade;
alter table payments    add constraint payments_academy_id_fkey
  foreign key (academy_id) references academies (id) on delete cascade;
alter table credits     add constraint credits_academy_id_fkey
  foreign key (academy_id) references academies (id) on delete cascade;

alter index players_coach_idx          rename to players_academy_idx;
alter index players_coach_active_idx   rename to players_academy_active_idx;
alter index sessions_coach_date_idx    rename to sessions_academy_date_idx;
alter index sessions_coach_status_idx  rename to sessions_academy_status_idx;
alter index enrollments_coach_idx      rename to enrollments_academy_idx;
alter index charges_coach_idx          rename to charges_academy_idx;
alter index charges_coach_due_idx      rename to charges_academy_due_idx;
alter index payments_coach_idx         rename to payments_academy_idx;
alter index payments_coach_paid_on_idx rename to payments_academy_paid_on_idx;
alter index credits_coach_idx          rename to credits_academy_idx;

-- ───────────────────────────────── retire the coach-keyed policies/guards ──

drop policy players_all_own     on players;
drop policy sessions_all_own    on sessions;
drop policy enrollments_all_own on enrollments;
drop policy charges_all_own     on charges;
drop policy payments_all_own    on payments;
drop policy credits_all_own     on credits;
drop policy coaches_select_own  on academy_memberships;
drop policy coaches_insert_own  on academy_memberships;
drop policy coaches_update_own  on academy_memberships;

drop function current_coach_id();

drop trigger enrollments_same_coach on enrollments;
drop trigger charges_same_coach     on charges;
drop function guard_same_coach();

-- ─────────────────────────────────────────────────── identity helpers ──────

-- The academy the current authenticated user belongs to.
create or replace function current_academy_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select academy_id from academy_memberships where auth_user_id = auth.uid();
$$;

-- The current user's role within that academy.
create or replace function current_membership_role()
returns membership_role
language sql
stable
security definer
set search_path = public
as $$
  select role from academy_memberships where auth_user_id = auth.uid();
$$;

revoke all on function current_academy_id()      from public;
revoke all on function current_membership_role() from public;
grant execute on function current_academy_id()      to authenticated;
grant execute on function current_membership_role() to authenticated;

-- ────────────────────────────────────────────── integrity guards (renamed) ──
-- Same invariants as 0002, keyed on academy_id instead of coach_id.

create or replace function guard_charge_application()
returns trigger
language plpgsql
as $$
declare
  v_amount integer;
  v_voided timestamptz;
  v_academy uuid;
  v_applied integer;
begin
  select amount_cents, voided_at, academy_id
    into v_amount, v_voided, v_academy
    from charges
   where id = new.charge_id
   for update;

  if not found then
    raise exception 'Charge % does not exist', new.charge_id
      using errcode = 'foreign_key_violation';
  end if;

  if v_voided is not null then
    raise exception 'Charge % was written off and cannot be settled', new.charge_id
      using errcode = 'check_violation';
  end if;

  -- Defence in depth: the row must belong to the same academy as its charge.
  if new.academy_id is distinct from v_academy then
    raise exception 'Cross-academy financial write rejected'
      using errcode = 'insufficient_privilege';
  end if;

  v_applied := charge_applied_cents(new.charge_id);

  if v_applied + new.amount_cents > v_amount then
    raise exception
      'Applying % cents would exceed the remaining balance on charge %',
      new.amount_cents, new.charge_id
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create or replace function guard_same_academy()
returns trigger
language plpgsql
as $$
declare
  v_academy uuid;
begin
  if tg_table_name = 'enrollments' then
    select academy_id into v_academy from sessions where id = new.session_id;
    if v_academy is distinct from new.academy_id then
      raise exception 'Session belongs to a different academy'
        using errcode = 'insufficient_privilege';
    end if;
    select academy_id into v_academy from players where id = new.player_id;
    if v_academy is distinct from new.academy_id then
      raise exception 'Player belongs to a different academy'
        using errcode = 'insufficient_privilege';
    end if;

  elsif tg_table_name = 'charges' then
    select academy_id into v_academy from players where id = new.player_id;
    if v_academy is distinct from new.academy_id then
      raise exception 'Player belongs to a different academy'
        using errcode = 'insufficient_privilege';
    end if;
    if new.session_id is not null then
      select academy_id into v_academy from sessions where id = new.session_id;
      if v_academy is distinct from new.academy_id then
        raise exception 'Session belongs to a different academy'
          using errcode = 'insufficient_privilege';
      end if;
    end if;
  end if;

  return new;
end;
$$;

create trigger enrollments_same_academy
  before insert or update on enrollments
  for each row execute function guard_same_academy();

create trigger charges_same_academy
  before insert or update on charges
  for each row execute function guard_same_academy();

-- A membership's role, academy and identity are set once, at creation. There is
-- no application path that changes them, so refuse every attempt — this is what
-- stops a coach promoting themselves to owner with a raw UPDATE.
create or replace function guard_membership_immutable()
returns trigger
language plpgsql
as $$
begin
  if new.role is distinct from old.role
     or new.academy_id is distinct from old.academy_id
     or new.auth_user_id is distinct from old.auth_user_id then
    raise exception 'A membership''s role, academy and user cannot be changed'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

create trigger academy_memberships_immutable
  before update on academy_memberships
  for each row execute function guard_membership_immutable();

-- ───────────────────────────────────────────────────────────────── RLS ─────

alter table academies           enable row level security;
alter table academy_memberships enable row level security;
alter table academies           force row level security;
alter table academy_memberships force row level security;

-- academies: every member can read their academy; only the owner can change it.
-- There is no INSERT/DELETE policy: academies are created only by the signup
-- trigger / bootstrap RPC below, and are never deleted through the API.
create policy academies_select_member on academies
  for select using (id = current_academy_id());

create policy academies_update_owner on academies
  for update using (id = current_academy_id() and current_membership_role() = 'owner')
  with check (id = current_academy_id() and current_membership_role() = 'owner');

-- academy_memberships: members see their whole team; each member edits only
-- their own row (name/email/onboarding — the immutability trigger above blocks
-- role/academy/user changes). No INSERT/DELETE policy yet: rows are created by
-- the signup trigger / bootstrap RPC.
create policy memberships_select_team on academy_memberships
  for select using (academy_id = current_academy_id());

create policy memberships_update_self on academy_memberships
  for update using (auth_user_id = auth.uid())
  with check (auth_user_id = auth.uid());

-- Shared, academy-scoped data: every member can read and write.
create policy players_all_member on players
  for all using (academy_id = current_academy_id())
  with check (academy_id = current_academy_id());

create policy sessions_all_member on sessions
  for all using (academy_id = current_academy_id())
  with check (academy_id = current_academy_id());

create policy enrollments_all_member on enrollments
  for all using (academy_id = current_academy_id())
  with check (academy_id = current_academy_id());

-- Charges are financial history, not ordinary shared data. Every member can
-- READ them (paid/unpaid status shows on lesson and player screens), but a
-- coach's write access is limited to what their session workflows imply:
--   * INSERT  the charge a real booking creates (session-linked, non-manual,
--             the player enrolled, the session still scheduled)
--   * UPDATE  move an unsettled charge's due date with its session, or write it
--             off when that session is cancelled
-- Everything else — manual charges, changing an amount or note, crediting,
-- recording payments, writing off outside a cancellation — is owner-only. The
-- guard triggers below narrow the coach's UPDATE; there is NO delete policy
-- for anyone: charges are voided, never removed.
create policy charges_select_member on charges
  for select using (academy_id = current_academy_id());

create policy charges_insert_owner on charges
  for insert with check (
    academy_id = current_academy_id() and current_membership_role() = 'owner'
  );

create policy charges_insert_workflow on charges
  for insert with check (
    academy_id = current_academy_id()
    and session_id is not null
    and is_manual = false
    and voided_at is null
  );

create policy charges_update_member on charges
  for update using (academy_id = current_academy_id())
  with check (academy_id = current_academy_id());

-- Who is acting? NULL means there is no end-user context at all (a migration,
-- the seed script, a server-side job) and is treated as trusted; every
-- end-user request has a JWT and therefore a role.

create or replace function guard_charge_insert()
returns trigger
language plpgsql
as $$
declare
  v_role   membership_role := current_membership_role();
  v_status session_status;
begin
  if v_role is null or v_role = 'owner' then
    return new;
  end if;

  if new.is_manual or new.session_id is null then
    raise exception 'Only the academy owner can create a manual charge'
      using errcode = 'insufficient_privilege';
  end if;

  select status into v_status from sessions where id = new.session_id;
  if v_status is distinct from 'scheduled' then
    raise exception 'A charge can only be created for a scheduled session'
      using errcode = 'insufficient_privilege';
  end if;

  if not exists (
    select 1 from enrollments
     where session_id = new.session_id and player_id = new.player_id
  ) then
    raise exception 'A charge can only be created for a player enrolled in the session'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

create trigger charges_insert_guard
  before insert on charges
  for each row execute function guard_charge_insert();

create or replace function guard_charge_update()
returns trigger
language plpgsql
as $$
declare
  v_role   membership_role := current_membership_role();
  v_status session_status;
begin
  -- A charge's identity and origin never change, for anyone.
  if new.academy_id is distinct from old.academy_id
     or new.player_id is distinct from old.player_id
     or new.session_id is distinct from old.session_id
     or new.is_manual is distinct from old.is_manual
     or new.created_at is distinct from old.created_at then
    raise exception 'A charge''s academy, player, session and origin cannot be changed'
      using errcode = 'insufficient_privilege';
  end if;

  if v_role is null or v_role = 'owner' then
    return new;
  end if;

  -- A coach may not change what a charge says or is worth.
  if new.amount_cents is distinct from old.amount_cents
     or new.label is distinct from old.label
     or new.note is distinct from old.note then
    raise exception 'Only the academy owner can change the amount or details of a charge'
      using errcode = 'insufficient_privilege';
  end if;

  -- Settled or already-written-off charges are the owner's to touch.
  if old.voided_at is not null or charge_applied_cents(old.id) > 0 then
    raise exception 'Only the academy owner can change a settled or written-off charge'
      using errcode = 'insufficient_privilege';
  end if;

  -- The one write-off a coach may make: as the direct result of cancelling the
  -- charge's own session. Never un-void, never void for any other reason.
  if new.voided_at is distinct from old.voided_at
     or new.void_note is distinct from old.void_note then
    if new.voided_at is null then
      raise exception 'Only the academy owner can reinstate a written-off charge'
        using errcode = 'insufficient_privilege';
    end if;
    select status into v_status from sessions where id = new.session_id;
    if new.session_id is null or v_status is distinct from 'cancelled' then
      raise exception 'A coach can only write off a charge by cancelling its session'
        using errcode = 'insufficient_privilege';
    end if;
  end if;

  return new;
end;
$$;

create trigger charges_update_guard
  before update on charges
  for each row execute function guard_charge_update();

-- Money RECEIVED (payments) and reductions of what is owed (credits) are
-- owner-only to write. Members can still read them: a charge's paid/unpaid
-- status is derived from these rows and shows on lesson and player screens.
create policy payments_select_member on payments
  for select using (academy_id = current_academy_id());
create policy payments_write_owner on payments
  for all using (academy_id = current_academy_id() and current_membership_role() = 'owner')
  with check (academy_id = current_academy_id() and current_membership_role() = 'owner');

create policy credits_select_member on credits
  for select using (academy_id = current_academy_id());
create policy credits_write_owner on credits
  for all using (academy_id = current_academy_id() and current_membership_role() = 'owner')
  with check (academy_id = current_academy_id() and current_membership_role() = 'owner');

-- ─────────────────────────────────────────────────────────── grants ────────

revoke all on academies, academy_memberships from anon;
revoke all on academies, academy_memberships from authenticated;
grant select, update on academies, academy_memberships to authenticated;

-- Financial history is voided, never deleted (see the charges policies above).
revoke delete on charges from authenticated;

-- ─────────────────────────────────────────────────── signup bootstrap ──────

-- On signup, create a new academy with the new user as its owner.
create or replace function handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_academy uuid;
begin
  if exists (select 1 from academy_memberships where auth_user_id = new.id) then
    return new;
  end if;

  insert into academies default values returning id into v_academy;

  insert into academy_memberships (academy_id, auth_user_id, role, name, email)
  values (
    v_academy,
    new.id,
    'owner',
    coalesce(new.raw_user_meta_data ->> 'name', ''),
    coalesce(new.email, '')
  );
  return new;
end;
$$;

-- Application fallback for a signed-in user who somehow has no membership (the
-- trigger normally makes one). A security-definer RPC rather than an INSERT
-- policy, so no client can ever create academies or memberships directly.
-- Idempotent: returns the existing membership id when there already is one.
create or replace function bootstrap_academy_owner(p_name text, p_email text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_academy uuid;
  v_membership uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = 'insufficient_privilege';
  end if;

  select id into v_membership from academy_memberships where auth_user_id = auth.uid();
  if found then
    return v_membership;
  end if;

  insert into academies default values returning id into v_academy;

  insert into academy_memberships (academy_id, auth_user_id, role, name, email)
  values (v_academy, auth.uid(), 'owner', coalesce(p_name, ''), coalesce(p_email, ''))
  returning id into v_membership;

  return v_membership;
end;
$$;

revoke all on function bootstrap_academy_owner(text, text) from public;
grant execute on function bootstrap_academy_owner(text, text) to authenticated;
