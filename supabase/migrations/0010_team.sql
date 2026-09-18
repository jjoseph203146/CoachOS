-- ============================================================================
-- CoachOS — team: invitations, removal, and who worked a session
--
-- The owner invites a coach by email. There is no email service in this
-- application, so an invitation is a link the owner shares; the invited person
-- signs up with that email and is put in the inviter's academy AS A COACH
-- instead of getting an academy of their own. A membership's role is set only
-- at creation and never changed (0006), so nobody can be promoted through
-- this: invitations can only ever create coaches.
--
-- A person belongs to one academy (auth_user_id is unique on memberships), so
-- an existing CoachOS account cannot be invited into a second academy.
-- ============================================================================

-- ─────────────────────────────────────────────────────────── invitations ───

create table academy_invites (
  id           uuid primary key default gen_random_uuid(),
  academy_id   uuid not null references academies (id) on delete cascade,
  email        text not null check (email = lower(btrim(email)) and length(email) > 3),
  role         membership_role not null default 'coach' check (role = 'coach'),
  -- The shared secret in the invitation link.
  -- 64 hex characters from the core CSPRNG (no dependency on pgcrypto).
  token        text not null unique
    default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  invited_by   uuid references academy_memberships (id) on delete set null,
  expires_at   timestamptz not null default now() + interval '14 days',
  accepted_at  timestamptz,
  revoked_at   timestamptz,
  created_at   timestamptz not null default now()
);

create index academy_invites_academy_idx on academy_invites (academy_id);
-- One open invitation per address per academy.
create unique index academy_invites_one_open
  on academy_invites (academy_id, email)
  where accepted_at is null and revoked_at is null;
-- Signup looks invitations up by email.
create index academy_invites_email_idx on academy_invites (email)
  where accepted_at is null and revoked_at is null;

alter table academy_invites enable row level security;
alter table academy_invites force row level security;

-- Invitations carry people's email addresses and a join secret: owner only.
create policy invites_select_owner on academy_invites
  for select using (academy_id = current_academy_id() and current_membership_role() = 'owner');
create policy invites_insert_owner on academy_invites
  for insert with check (academy_id = current_academy_id() and current_membership_role() = 'owner');
-- Revoking is an update (revoked_at); there is no delete.
create policy invites_update_owner on academy_invites
  for update using (academy_id = current_academy_id() and current_membership_role() = 'owner')
  with check (academy_id = current_academy_id() and current_membership_role() = 'owner');

-- Column-level privileges do the heavy lifting: an owner can create invitations
-- and revoke them, and can change NOTHING else about one. In particular
-- accepted_at can be written only by the SECURITY DEFINER signup functions
-- below, never by any client.
revoke all on academy_invites from anon, authenticated;
grant select, insert on academy_invites to authenticated;
grant update (revoked_at) on academy_invites to authenticated;

-- Defence in depth on top of the column privileges: an invitation's identity,
-- target and secret never change, and a revoked one stays revoked.
-- (`invited_by` is attribution and is nulled when that person is removed, so it
-- is deliberately not protected.)
create or replace function guard_invite_update()
returns trigger
language plpgsql
as $$
begin
  if new.academy_id is distinct from old.academy_id
     or new.email is distinct from old.email
     or new.role is distinct from old.role
     or new.token is distinct from old.token
     or new.expires_at is distinct from old.expires_at
     or new.created_at is distinct from old.created_at then
    raise exception 'An invitation cannot be edited; revoke it and send a new one'
      using errcode = 'insufficient_privilege';
  end if;
  -- A revoked invitation stays revoked.
  if old.revoked_at is not null and new.revoked_at is null then
    raise exception 'A revoked invitation cannot be reopened; send a new one'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

create trigger academy_invites_update_guard
  before update on academy_invites
  for each row execute function guard_invite_update();

-- What the (signed-out) invitation page may show for a token: enough to say who
-- is inviting and which address to sign up with, and nothing else.
create or replace function get_invite_preview(p_token text)
returns table (business_name text, email text, state text)
language sql
stable
security definer
set search_path = public
as $$
  select
    a.business_name,
    i.email,
    case
      when i.accepted_at is not null then 'accepted'
      when i.revoked_at  is not null then 'revoked'
      when i.expires_at  <  now()    then 'expired'
      else 'open'
    end
  from academy_invites i
  join academies a on a.id = i.academy_id
  where i.token = p_token;
$$;

revoke all on function get_invite_preview(text) from public;
grant execute on function get_invite_preview(text) to anon, authenticated;

-- ────────────────────────────────────────── signup: join, or start a new one ─

-- An open, unexpired invitation for this address.
create or replace function open_invite_for(p_email text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from academy_invites
   where email = lower(btrim(p_email))
     and accepted_at is null and revoked_at is null and expires_at > now()
   order by created_at
   limit 1;
$$;

revoke all on function open_invite_for(text) from public;

create or replace function handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_academy uuid;
  v_invite  academy_invites%rowtype;
  v_name    text := coalesce(new.raw_user_meta_data ->> 'name', '');
  v_email   text := coalesce(new.email, '');
begin
  if exists (select 1 from academy_memberships where auth_user_id = new.id) then
    return new;
  end if;

  select * into v_invite from academy_invites where id = open_invite_for(v_email);
  if found then
    insert into academy_memberships (academy_id, auth_user_id, role, name, email)
    values (v_invite.academy_id, new.id, 'coach', v_name, v_email);
    update academy_invites set accepted_at = now() where id = v_invite.id;
    return new;
  end if;

  insert into academies default values returning id into v_academy;
  insert into academy_memberships (academy_id, auth_user_id, role, name, email)
  values (v_academy, new.id, 'owner', v_name, v_email);
  return new;
end;
$$;

-- The application fallback for a signed-in user with no membership (see 0006).
-- It must honour an invitation too, or an invited person whose signup trigger
-- somehow didn't run would be stranded as the owner of an empty academy.
create or replace function bootstrap_academy_owner(p_name text, p_email text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_academy    uuid;
  v_membership uuid;
  v_invite     academy_invites%rowtype;
  v_email      text := coalesce(nullif(p_email, ''), (select email from auth.users where id = auth.uid()), '');
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = 'insufficient_privilege';
  end if;

  select id into v_membership from academy_memberships where auth_user_id = auth.uid();
  if found then
    return v_membership;
  end if;

  select * into v_invite from academy_invites where id = open_invite_for(v_email);
  if found then
    update academy_invites set accepted_at = now() where id = v_invite.id;
    insert into academy_memberships (academy_id, auth_user_id, role, name, email)
    values (v_invite.academy_id, auth.uid(), 'coach', coalesce(p_name, ''), v_email)
    returning id into v_membership;
    return v_membership;
  end if;

  insert into academies default values returning id into v_academy;
  insert into academy_memberships (academy_id, auth_user_id, role, name, email)
  values (v_academy, auth.uid(), 'owner', coalesce(p_name, ''), v_email)
  returning id into v_membership;
  return v_membership;
end;
$$;

-- ─────────────────────────────────────────────────────── removing a coach ──

-- The owner can remove a coach. Never an owner, never themself: an academy must
-- always have its owner.
create policy memberships_delete_owner on academy_memberships
  for delete using (
    academy_id = current_academy_id()
    and current_membership_role() = 'owner'
    and role = 'coach'
    and id <> current_membership_id()
  );

grant delete on academy_memberships to authenticated;

create or replace function guard_membership_delete()
returns trigger
language plpgsql
as $$
begin
  if old.role = 'owner' and current_membership_role() is not null then
    raise exception 'An academy''s owner cannot be removed'
      using errcode = 'insufficient_privilege';
  end if;
  return old;
end;
$$;

create trigger academy_memberships_delete_guard
  before delete on academy_memberships
  for each row execute function guard_membership_delete();

-- ──────────────────────────────────────────────── who worked a session ─────

create table session_coaches (
  session_id     uuid not null references sessions (id) on delete cascade,
  membership_id  uuid not null references academy_memberships (id) on delete cascade,
  academy_id     uuid not null references academies (id) on delete cascade,
  created_at     timestamptz not null default now(),
  primary key (session_id, membership_id)
);

create index session_coaches_academy_idx on session_coaches (academy_id);

create or replace function guard_session_coach_same_academy()
returns trigger
language plpgsql
as $$
declare
  v_academy uuid;
begin
  select academy_id into v_academy from sessions where id = new.session_id;
  if v_academy is distinct from new.academy_id then
    raise exception 'Session belongs to a different academy' using errcode = 'insufficient_privilege';
  end if;
  select academy_id into v_academy from academy_memberships where id = new.membership_id;
  if v_academy is distinct from new.academy_id then
    raise exception 'Coach belongs to a different academy' using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

create trigger session_coaches_same_academy
  before insert or update on session_coaches
  for each row execute function guard_session_coach_same_academy();

alter table session_coaches enable row level security;
alter table session_coaches force row level security;

-- Recording who was on court is part of taking attendance: any member.
create policy session_coaches_all_member on session_coaches
  for all using (academy_id = current_academy_id())
  with check (academy_id = current_academy_id());

grant select, insert, update, delete on session_coaches to authenticated;
revoke all on session_coaches from anon;
