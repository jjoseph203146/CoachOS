-- ============================================================================
-- CoachOS — programs (recurring clinics/camps) and their pricing
--
--   programs               a recurring group offering. NO price column: a
--                          program has price OPTIONS, not one price.
--   program_price_options  e.g. "Weekly $150", "Drop-in $35". Editing or
--                          archiving one never touches an existing agreement
--                          or charge — those hold snapshots.
--   program_enrollments    the roster, and each participant's AGREEMENT: the
--                          price they agreed to, snapshotted from an option
--                          (or a deliberate custom amount, owner only).
--
-- Charges for a program participant copy the AGREED amount, basis and
-- standard into the same snapshot columns added in 0007. The database checks
-- that a program-linked charge equals its enrollment's agreement, so nobody —
-- including a coach — can invent a different amount at charge time.
--
-- Sessions gain program_id (a program's generated occurrences); session
-- enrollments gain `expected` (the planning list, distinct from attendance).
-- ============================================================================

create type program_audience   as enum ('youth', 'adult');
create type program_status     as enum ('active', 'ended');
create type roster_status      as enum ('active', 'ended');
create type agreement_source   as enum ('program_option', 'custom');

-- ─────────────────────────────────────────────────────────────── programs ──

create table programs (
  id            uuid primary key default gen_random_uuid(),
  academy_id    uuid not null references academies (id) on delete cascade,
  name          text not null check (length(btrim(name)) > 0),
  audience      program_audience not null default 'youth',
  -- 0 = Sunday … 6 = Saturday
  weekdays      smallint[] not null
    check (cardinality(weekdays) > 0 and weekdays <@ array[0,1,2,3,4,5,6]::smallint[]),
  start_min     integer not null check (start_min between 0 and 1439),
  duration_min  integer not null check (duration_min between 5 and 480),
  location      text not null default '',
  capacity      integer check (capacity is null or capacity >= 2),
  age_range     text not null default '',
  starts_on     date not null,
  ends_on       date,
  status        program_status not null default 'active',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint programs_dates_ordered check (ends_on is null or ends_on >= starts_on)
);

create index programs_academy_idx on programs (academy_id);

create trigger programs_updated_at before update on programs
  for each row execute function set_updated_at();

-- ───────────────────────────────────────────────────────── price options ────

create table program_price_options (
  id            uuid primary key default gen_random_uuid(),
  academy_id    uuid not null references academies (id) on delete cascade,
  program_id    uuid not null references programs (id) on delete cascade,
  label         text not null check (length(btrim(label)) > 0),
  basis         price_basis not null,
  amount_cents  integer not null check (amount_cents >= 0),
  position      integer not null default 0,
  -- Options are archived, not deleted, so agreements can still name them.
  archived_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index program_price_options_program_idx on program_price_options (program_id);

create trigger program_price_options_updated_at before update on program_price_options
  for each row execute function set_updated_at();

-- ───────────────────────────────────────────────── roster + agreements ─────

create table program_enrollments (
  id                    uuid primary key default gen_random_uuid(),
  academy_id            uuid not null references academies (id) on delete cascade,
  program_id            uuid not null references programs (id) on delete restrict,
  player_id             uuid not null references players (id) on delete restrict,
  status                roster_status not null default 'active',
  joined_on             date not null,
  ended_on              date,

  -- The agreement, snapshotted when it was made. price_option_id is a soft
  -- pointer for context only; the agreed_* values are the truth.
  price_option_id       uuid references program_price_options (id) on delete set null,
  agreed_label          text not null,
  agreed_basis          price_basis not null,
  agreed_amount_cents   integer not null check (agreed_amount_cents >= 0),
  standard_amount_cents integer check (standard_amount_cents is null or standard_amount_cents >= 0),
  agreement_source      agreement_source not null,
  agreement_note        text not null default '',

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create unique index program_enrollments_one_active
  on program_enrollments (program_id, player_id) where status = 'active';
create index program_enrollments_academy_idx on program_enrollments (academy_id);
create index program_enrollments_player_idx  on program_enrollments (player_id);

create trigger program_enrollments_updated_at before update on program_enrollments
  for each row execute function set_updated_at();

-- ───────────────────────────────── sessions, session enrollments, charges ──

alter table sessions
  add column program_id uuid references programs (id) on delete restrict;
create index sessions_program_idx on sessions (program_id) where program_id is not null;

-- A program's occurrences can have a large roster and no per-session capacity.
alter table sessions drop constraint sessions_capacity_shape;
alter table sessions drop constraint sessions_capacity_check;
alter table sessions
  add constraint sessions_capacity_min check (capacity is null or capacity >= 2),
  add constraint sessions_capacity_cap
    check (program_id is not null or capacity is null or capacity <= 12),
  add constraint sessions_capacity_shape check (
    (type = 'private' and capacity is null and program_id is null)
    or (type = 'group' and (capacity is not null or program_id is not null))
  );

-- The planning list for an occurrence, separate from actual attendance.
alter table enrollments add column expected boolean not null default true;

alter table charges
  add column program_id            uuid references programs (id) on delete restrict,
  add column program_enrollment_id uuid references program_enrollments (id) on delete restrict,
  add column period_start          date,
  add column period_end            date,
  add constraint charges_program_coherent
    check ((program_id is null) = (program_enrollment_id is null)),
  add constraint charges_period_ordered
    check (period_end is null or (period_start is not null and period_end >= period_start));

create index charges_program_enrollment_idx on charges (program_enrollment_id)
  where program_enrollment_id is not null;

-- ─────────────────────────────────────────────── same-academy invariants ────

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
      raise exception 'Session belongs to a different academy' using errcode = 'insufficient_privilege';
    end if;
    select academy_id into v_academy from players where id = new.player_id;
    if v_academy is distinct from new.academy_id then
      raise exception 'Player belongs to a different academy' using errcode = 'insufficient_privilege';
    end if;

  elsif tg_table_name = 'charges' then
    select academy_id into v_academy from players where id = new.player_id;
    if v_academy is distinct from new.academy_id then
      raise exception 'Player belongs to a different academy' using errcode = 'insufficient_privilege';
    end if;
    if new.session_id is not null then
      select academy_id into v_academy from sessions where id = new.session_id;
      if v_academy is distinct from new.academy_id then
        raise exception 'Session belongs to a different academy' using errcode = 'insufficient_privilege';
      end if;
    end if;
    if new.program_id is not null then
      select academy_id into v_academy from programs where id = new.program_id;
      if v_academy is distinct from new.academy_id then
        raise exception 'Program belongs to a different academy' using errcode = 'insufficient_privilege';
      end if;
    end if;

  elsif tg_table_name = 'program_enrollments' then
    select academy_id into v_academy from programs where id = new.program_id;
    if v_academy is distinct from new.academy_id then
      raise exception 'Program belongs to a different academy' using errcode = 'insufficient_privilege';
    end if;
    select academy_id into v_academy from players where id = new.player_id;
    if v_academy is distinct from new.academy_id then
      raise exception 'Player belongs to a different academy' using errcode = 'insufficient_privilege';
    end if;

  elsif tg_table_name = 'program_price_options' then
    select academy_id into v_academy from programs where id = new.program_id;
    if v_academy is distinct from new.academy_id then
      raise exception 'Program belongs to a different academy' using errcode = 'insufficient_privilege';
    end if;

  elsif tg_table_name = 'sessions' then
    if new.program_id is not null then
      select academy_id into v_academy from programs where id = new.program_id;
      if v_academy is distinct from new.academy_id then
        raise exception 'Program belongs to a different academy' using errcode = 'insufficient_privilege';
      end if;
    end if;
  end if;

  return new;
end;
$$;

create trigger program_enrollments_same_academy
  before insert or update on program_enrollments
  for each row execute function guard_same_academy();
create trigger program_price_options_same_academy
  before insert or update on program_price_options
  for each row execute function guard_same_academy();
create trigger sessions_same_academy
  before insert or update on sessions
  for each row execute function guard_same_academy();

-- ───────────────────────────────────── agreements: what may be written ─────

-- An agreement made from a price option must MATCH that option at that moment
-- (for any role). A custom agreement is a deliberate departure from the
-- standard and belongs to the owner.
create or replace function guard_program_enrollment_insert()
returns trigger
language plpgsql
as $$
declare
  v_role membership_role := current_membership_role();
  v_opt  program_price_options%rowtype;
begin
  if new.agreement_source = 'program_option' then
    select * into v_opt from program_price_options where id = new.price_option_id;
    if not found
       or v_opt.program_id is distinct from new.program_id
       or v_opt.archived_at is not null then
      raise exception 'Choose one of the program''s current price options'
        using errcode = 'check_violation';
    end if;
    if new.agreed_amount_cents is distinct from v_opt.amount_cents
       or new.agreed_basis is distinct from v_opt.basis
       or new.agreed_label is distinct from v_opt.label
       or new.standard_amount_cents is distinct from v_opt.amount_cents then
      raise exception 'The agreement must match the price option it was made from'
        using errcode = 'check_violation';
    end if;
  elsif v_role is not null and v_role <> 'owner' then
    raise exception 'Only the academy owner can agree a custom price'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

create trigger program_enrollments_insert_guard
  before insert on program_enrollments
  for each row execute function guard_program_enrollment_insert();

-- Roster identity never changes. A coach may end a participant's place; only
-- the owner may change the agreement, and only going forward (existing charges
-- are snapshots and are untouched).
create or replace function guard_program_enrollment_update()
returns trigger
language plpgsql
as $$
declare
  v_role membership_role := current_membership_role();
begin
  if new.academy_id is distinct from old.academy_id
     or new.program_id is distinct from old.program_id
     or new.player_id  is distinct from old.player_id
     or new.joined_on  is distinct from old.joined_on
     or new.created_at is distinct from old.created_at then
    raise exception 'A roster place''s program, player and start date cannot be changed'
      using errcode = 'insufficient_privilege';
  end if;

  if v_role is null or v_role = 'owner' then
    return new;
  end if;

  if new.price_option_id       is distinct from old.price_option_id
     or new.agreed_label        is distinct from old.agreed_label
     or new.agreed_basis        is distinct from old.agreed_basis
     or new.agreed_amount_cents is distinct from old.agreed_amount_cents
     or new.standard_amount_cents is distinct from old.standard_amount_cents
     or new.agreement_source    is distinct from old.agreement_source
     or new.agreement_note      is distinct from old.agreement_note then
    raise exception 'Only the academy owner can change an agreed price'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

create trigger program_enrollments_update_guard
  before update on program_enrollments
  for each row execute function guard_program_enrollment_update();

-- ───────────────────────────────────── charges: program-linked snapshots ────

create or replace function guard_charge_insert()
returns trigger
language plpgsql
as $$
declare
  v_role   membership_role := current_membership_role();
  v_status session_status;
  v_sess_program uuid;
  v_enr    program_enrollments%rowtype;
begin
  -- A program charge must be exactly what its enrollment's agreement says, for
  -- everyone: there is no way to charge a program participant a different
  -- amount than they agreed.
  if new.program_enrollment_id is not null then
    select * into v_enr from program_enrollments where id = new.program_enrollment_id;
    if not found
       or v_enr.academy_id is distinct from new.academy_id
       or v_enr.program_id is distinct from new.program_id
       or v_enr.player_id  is distinct from new.player_id then
      raise exception 'A program charge must match its enrollment'
        using errcode = 'check_violation';
    end if;
    if v_enr.status <> 'active' then
      raise exception 'That program place has ended'
        using errcode = 'check_violation';
    end if;
    if new.amount_cents is distinct from v_enr.agreed_amount_cents
       or new.price_basis is distinct from v_enr.agreed_basis
       or new.standard_amount_cents is distinct from v_enr.standard_amount_cents
       or new.price_source is distinct from
            (case when v_enr.agreement_source = 'program_option'
                  then 'program_option' else 'custom' end)::price_source then
      raise exception 'A program charge must equal the participant''s agreed price'
        using errcode = 'check_violation';
    end if;
  end if;

  if v_role is null or v_role = 'owner' then
    return new;
  end if;

  if new.is_manual or (new.session_id is null and new.program_enrollment_id is null) then
    raise exception 'Only the academy owner can create a manual charge'
      using errcode = 'insufficient_privilege';
  end if;

  if new.session_id is not null then
    select status, program_id into v_status, v_sess_program
      from sessions where id = new.session_id;
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
    -- A program occurrence is charged only through a program agreement.
    if v_sess_program is not null and new.program_enrollment_id is null then
      raise exception 'A program session can only be charged through a program enrollment'
        using errcode = 'insufficient_privilege';
    end if;
    if v_sess_program is distinct from new.program_id then
      raise exception 'The charge''s program must match its session''s program'
        using errcode = 'check_violation';
    end if;
  end if;

  return new;
end;
$$;

-- Program identity, like the rest of a charge's provenance, never changes.
create or replace function guard_charge_update()
returns trigger
language plpgsql
as $$
declare
  v_role   membership_role := current_membership_role();
  v_status session_status;
begin
  if new.academy_id is distinct from old.academy_id
     or new.player_id is distinct from old.player_id
     or new.session_id is distinct from old.session_id
     or new.is_manual is distinct from old.is_manual
     or new.program_id is distinct from old.program_id
     or new.program_enrollment_id is distinct from old.program_enrollment_id
     or new.period_start is distinct from old.period_start
     or new.period_end is distinct from old.period_end
     or new.created_at is distinct from old.created_at then
    raise exception 'A charge''s academy, player, session, program and origin cannot be changed'
      using errcode = 'insufficient_privilege';
  end if;

  if new.price_basis is distinct from old.price_basis
     or new.standard_amount_cents is distinct from old.standard_amount_cents then
    raise exception 'A charge''s price snapshot cannot be changed'
      using errcode = 'insufficient_privilege';
  end if;

  if new.price_source is distinct from old.price_source
     and not (new.price_source = 'custom' and new.amount_cents is distinct from old.amount_cents) then
    raise exception 'A charge''s price source can only change to custom when it is repriced'
      using errcode = 'insufficient_privilege';
  end if;

  if new.amount_cents is distinct from old.amount_cents
     and not new.is_manual
     and new.price_source <> 'custom' then
    raise exception 'A repriced charge must be marked custom'
      using errcode = 'check_violation';
  end if;

  if v_role is null or v_role = 'owner' then
    return new;
  end if;

  if new.amount_cents is distinct from old.amount_cents
     or new.label is distinct from old.label
     or new.note is distinct from old.note then
    raise exception 'Only the academy owner can change the amount or details of a charge'
      using errcode = 'insufficient_privilege';
  end if;

  if old.voided_at is not null or charge_applied_cents(old.id) > 0 then
    raise exception 'Only the academy owner can change a settled or written-off charge'
      using errcode = 'insufficient_privilege';
  end if;

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

-- Members may insert the charge a booking OR a program enrollment implies.
drop policy charges_insert_workflow on charges;
create policy charges_insert_workflow on charges
  for insert with check (
    academy_id = current_academy_id()
    and (session_id is not null or program_enrollment_id is not null)
    and is_manual = false
    and voided_at is null
  );

-- ───────────────────────────────────────────────────────────────── RLS ─────

alter table programs              enable row level security;
alter table program_price_options enable row level security;
alter table program_enrollments   enable row level security;
alter table programs              force row level security;
alter table program_price_options force row level security;
alter table program_enrollments   force row level security;

-- Programs and their price options are the owner's to define; everyone reads.
create policy programs_select_member on programs
  for select using (academy_id = current_academy_id());
create policy programs_insert_owner on programs
  for insert with check (academy_id = current_academy_id() and current_membership_role() = 'owner');
create policy programs_update_owner on programs
  for update using (academy_id = current_academy_id() and current_membership_role() = 'owner')
  with check (academy_id = current_academy_id() and current_membership_role() = 'owner');

create policy program_price_options_select_member on program_price_options
  for select using (academy_id = current_academy_id());
create policy program_price_options_insert_owner on program_price_options
  for insert with check (academy_id = current_academy_id() and current_membership_role() = 'owner');
create policy program_price_options_update_owner on program_price_options
  for update using (academy_id = current_academy_id() and current_membership_role() = 'owner')
  with check (academy_id = current_academy_id() and current_membership_role() = 'owner');

-- The roster is a coach workflow (the triggers above narrow what a coach may
-- write). No delete for anyone: a place is ended, its history stays.
create policy program_enrollments_select_member on program_enrollments
  for select using (academy_id = current_academy_id());
create policy program_enrollments_insert_member on program_enrollments
  for insert with check (academy_id = current_academy_id());
create policy program_enrollments_update_member on program_enrollments
  for update using (academy_id = current_academy_id())
  with check (academy_id = current_academy_id());

grant select, insert, update on programs, program_price_options, program_enrollments
  to authenticated;
revoke all on programs, program_price_options, program_enrollments from anon;
