-- ============================================================================
-- CoachOS — charges are historical price snapshots
--
-- A charge records what was AGREED at the moment it was created. It must never
-- be re-derived from a live price: changing a player's rate, the academy's
-- default rate, a session's price or (later) a program's price options must
-- never change a charge that already exists.
--
-- `amount_cents` was already captured at creation. This migration adds the
-- provenance that makes the snapshot self-explanatory and auditable, without
-- pointing at any live row:
--
--   price_source          where the amount came from
--   price_basis           what the amount is per (session, week, month…)
--   standard_amount_cents what the standard price was at that moment, so a
--                         discount or premium is visible: amount != standard
--
-- Deliberately NO foreign key to a price/option row: those rows may be edited
-- or archived later, and the charge must stay exactly as it was.
--
-- Programs (a later migration) add their own price options and per-participant
-- agreements; a program charge snapshots the participant's AGREED price into
-- these same columns.
-- ============================================================================

create type price_source as enum (
  'academy_default',  -- the academy's default rate
  'player_default',   -- the player's own default rate
  'session_price',    -- the price set on the session/booking itself
  'program_option',   -- a program's standard price option
  'custom',           -- deliberately differs from the standard for this booking
  'manual'            -- an ad-hoc charge entered by the owner
);

create type price_basis as enum (
  'per_session', 'drop_in', 'weekly', 'monthly', 'full_program', 'custom'
);

alter table charges
  add column price_source price_source,
  add column price_basis price_basis,
  add column standard_amount_cents integer
    check (standard_amount_cents is null or standard_amount_cents >= 0);

-- Existing charges: the honest description of where their amount came from.
-- A session-linked charge took its amount from the session's price; whether
-- that equalled a default at the time is unknowable now, so it is not claimed.
update charges
   set price_source = case when is_manual then 'manual' else 'session_price' end::price_source,
       price_basis  = case when is_manual then null else 'per_session' end::price_basis;

alter table charges alter column price_source set not null;

-- Manual charges are exactly the ones whose source is 'manual'.
alter table charges
  add constraint charges_source_matches_origin
  check ((is_manual and price_source = 'manual') or (not is_manual and price_source <> 'manual'));

comment on column charges.standard_amount_cents is
  'The standard price at the moment the charge was created. NULL when there was no standard (manual charges, per-session group prices).';

-- ─────────────────────────────────────────── snapshots are immutable ───────
-- Extends the update guard from 0006: the snapshot columns never change. The
-- single sanctioned exception is an owner repricing an unpaid charge, which
-- must relabel its source as 'custom' so the record stays truthful (the
-- amount no longer equals the standard, and standard_amount_cents shows it).

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

  -- Neither does its price snapshot.
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

  -- The record must stay truthful: an amount that no longer matches its
  -- original basis is 'custom'. (Manual charges have no standard to depart from
  -- and stay 'manual'.)
  if new.amount_cents is distinct from old.amount_cents
     and not new.is_manual
     and new.price_source <> 'custom' then
    raise exception 'A repriced charge must be marked custom'
      using errcode = 'check_violation';
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
