-- ============================================================================
-- CoachOS — financial integrity
--
-- These constraints are the last line of defence for money. They hold even if
-- the application has a bug, a request is replayed, or two devices submit the
-- same "Mark Paid" at the same moment.
--
-- Safe to re-run: every statement is guarded.
-- ============================================================================

-- Total applied (payments + credits) against one charge, computed inside the
-- database. Used by the guard triggers below.
create or replace function charge_applied_cents(p_charge_id uuid)
returns integer
language sql
stable
as $$
  select
    coalesce((select sum(amount_cents) from payments where charge_id = p_charge_id), 0)
    + coalesce((select sum(amount_cents) from credits  where charge_id = p_charge_id), 0);
$$;

-- Reject any payment/credit that would push a charge past its amount, or that
-- targets a written-off charge. Row locking on the parent charge serialises
-- concurrent inserts, so a double-submitted payment is rejected rather than
-- silently doubling the recorded revenue.
create or replace function guard_charge_application()
returns trigger
language plpgsql
as $$
declare
  v_amount integer;
  v_voided timestamptz;
  v_coach  uuid;
  v_applied integer;
begin
  select amount_cents, voided_at, coach_id
    into v_amount, v_voided, v_coach
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

  -- Defence in depth: the row must belong to the same coach as its charge.
  if new.coach_id is distinct from v_coach then
    raise exception 'Cross-coach financial write rejected'
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

drop trigger if exists payments_guard on payments;
create trigger payments_guard
  before insert or update on payments
  for each row execute function guard_charge_application();

drop trigger if exists credits_guard on credits;
create trigger credits_guard
  before insert or update on credits
  for each row execute function guard_charge_application();

-- A charge may not be voided while money has already been collected against
-- it — that money really was received and must stay in revenue.
create or replace function guard_charge_void()
returns trigger
language plpgsql
as $$
declare
  v_paid integer;
begin
  if new.voided_at is not null and old.voided_at is null then
    select coalesce(sum(amount_cents), 0) into v_paid
      from payments where charge_id = new.id;
    if v_paid > 0 then
      raise exception 'Charge % has payments recorded and cannot be voided', new.id
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists charges_void_guard on charges;
create trigger charges_void_guard
  before update on charges
  for each row execute function guard_charge_void();

-- Repricing a charge must never drop it below what has already been applied.
create or replace function guard_charge_amount()
returns trigger
language plpgsql
as $$
declare
  v_applied integer;
begin
  if new.amount_cents is distinct from old.amount_cents then
    v_applied := charge_applied_cents(new.id);
    if new.amount_cents < v_applied then
      raise exception
        'Charge % already has % cents applied; it cannot be repriced to %',
        new.id, v_applied, new.amount_cents
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists charges_amount_guard on charges;
create trigger charges_amount_guard
  before update on charges
  for each row execute function guard_charge_amount();

-- Enrollments, charges and payments must all belong to the same coach as the
-- parent record they point at. This closes the door on an IDOR that supplied a
-- valid id from another tenant.
create or replace function guard_same_coach()
returns trigger
language plpgsql
as $$
declare
  v_coach uuid;
begin
  if tg_table_name = 'enrollments' then
    select coach_id into v_coach from sessions where id = new.session_id;
    if v_coach is distinct from new.coach_id then
      raise exception 'Session belongs to a different coach'
        using errcode = 'insufficient_privilege';
    end if;
    select coach_id into v_coach from players where id = new.player_id;
    if v_coach is distinct from new.coach_id then
      raise exception 'Player belongs to a different coach'
        using errcode = 'insufficient_privilege';
    end if;

  elsif tg_table_name = 'charges' then
    select coach_id into v_coach from players where id = new.player_id;
    if v_coach is distinct from new.coach_id then
      raise exception 'Player belongs to a different coach'
        using errcode = 'insufficient_privilege';
    end if;
    if new.session_id is not null then
      select coach_id into v_coach from sessions where id = new.session_id;
      if v_coach is distinct from new.coach_id then
        raise exception 'Session belongs to a different coach'
          using errcode = 'insufficient_privilege';
      end if;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists enrollments_same_coach on enrollments;
create trigger enrollments_same_coach
  before insert or update on enrollments
  for each row execute function guard_same_coach();

drop trigger if exists charges_same_coach on charges;
create trigger charges_same_coach
  before insert or update on charges
  for each row execute function guard_same_coach();
