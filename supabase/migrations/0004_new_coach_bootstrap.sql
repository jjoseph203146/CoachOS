-- ============================================================================
-- CoachOS — create a coach profile automatically on signup.
--
-- Without this, the first request after signup has an authenticated user but
-- no coach row, and current_coach_id() returns NULL (which RLS reads as "no
-- access to anything").
-- ============================================================================

create or replace function handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.coaches (auth_user_id, name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', ''),
    coalesce(new.email, '')
  )
  on conflict (auth_user_id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_auth_user();
