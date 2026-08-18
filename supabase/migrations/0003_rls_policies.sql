-- ============================================================================
-- CoachOS — row level security
--
-- Every coach-owned table is readable and writable ONLY by the coach that owns
-- it. Authorization lives here, in the database, not in the frontend and not
-- in the application's query builders. A leaked or guessed row id from another
-- tenant returns nothing.
-- ============================================================================

alter table coaches     enable row level security;
alter table players     enable row level security;
alter table sessions    enable row level security;
alter table enrollments enable row level security;
alter table charges     enable row level security;
alter table payments    enable row level security;
alter table credits     enable row level security;

-- Force RLS even for the table owner, so a misconfigured connection cannot
-- bypass these policies. (The service_role key still bypasses RLS by design;
-- this application never uses it.)
alter table coaches     force row level security;
alter table players     force row level security;
alter table sessions    force row level security;
alter table enrollments force row level security;
alter table charges     force row level security;
alter table payments    force row level security;
alter table credits     force row level security;

-- The coach row belonging to the current authenticated user.
create or replace function current_coach_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from coaches where auth_user_id = auth.uid();
$$;

revoke all on function current_coach_id() from public;
grant execute on function current_coach_id() to authenticated;

-- ---------------------------------------------------------------- coaches --

create policy coaches_select_own on coaches
  for select using (auth_user_id = auth.uid());

create policy coaches_insert_own on coaches
  for insert with check (auth_user_id = auth.uid());

create policy coaches_update_own on coaches
  for update using (auth_user_id = auth.uid())
  with check (auth_user_id = auth.uid());

-- Deleting a coach profile is not an application operation; omit the policy so
-- it is denied by default.

-- ------------------------------------------------- coach-owned data tables --
-- Each table gets the same shape: you may touch a row only when its coach_id
-- resolves to your own coach record.

create policy players_all_own on players
  for all using (coach_id = current_coach_id())
  with check (coach_id = current_coach_id());

create policy sessions_all_own on sessions
  for all using (coach_id = current_coach_id())
  with check (coach_id = current_coach_id());

create policy enrollments_all_own on enrollments
  for all using (coach_id = current_coach_id())
  with check (coach_id = current_coach_id());

create policy charges_all_own on charges
  for all using (coach_id = current_coach_id())
  with check (coach_id = current_coach_id());

create policy payments_all_own on payments
  for all using (coach_id = current_coach_id())
  with check (coach_id = current_coach_id());

create policy credits_all_own on credits
  for all using (coach_id = current_coach_id())
  with check (coach_id = current_coach_id());

-- Anonymous visitors get nothing at all.
revoke all on all tables in schema public from anon;

grant select, insert, update, delete on
  coaches, players, sessions, enrollments, charges, payments, credits
to authenticated;
