/**
 * Team service — who is in the academy, invitations, and removal.
 *
 * Only the owner manages the team. An invitation can only ever create a
 * coach (the database refuses any other role), and an owner can be removed by
 * nobody. There is no email service: an invitation is a link the owner shares.
 */

import type { DataStore } from '@/lib/data/store'
import type { Invite, InvitePreview, MembershipRole } from '@/lib/domain/types'
import { DomainError } from './errors'

function requireOwner(role: MembershipRole, what: string) {
  if (role !== 'owner') {
    throw new DomainError('FORBIDDEN', `Only the academy owner can ${what}.`)
  }
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export interface TeamMember {
  membershipId: string
  name: string
  email: string
  role: MembershipRole
  isYou: boolean
}

export interface OpenInvite {
  id: string
  email: string
  token: string
  expiresAt: string
}

export interface TeamView {
  members: TeamMember[]
  /** Invitations that can still be used: not accepted, revoked or expired. */
  invites: OpenInvite[]
}

const isOpen = (invite: Invite, now: number) =>
  !invite.acceptedAt && !invite.revokedAt && new Date(invite.expiresAt).getTime() > now

export async function loadTeam(
  store: DataStore,
  coachId: string,
  role: MembershipRole,
  myMembershipId: string,
  now = Date.now(),
): Promise<TeamView> {
  const memberships = await store.listMemberships(coachId)
  // Invitations carry addresses and a join secret, so only the owner reads them.
  const invites = role === 'owner' ? await store.listInvites(coachId) : []
  return {
    members: memberships
      .map((m) => ({
        membershipId: m.id,
        name: m.name || m.email || 'Unnamed',
        email: m.email,
        role: m.role,
        isYou: m.id === myMembershipId,
      }))
      // Owner first, then by name.
      .sort((a, b) =>
        a.role === b.role ? a.name.localeCompare(b.name) : a.role === 'owner' ? -1 : 1,
      ),
    invites: invites
      .filter((i) => isOpen(i, now))
      .map((i) => ({ id: i.id, email: i.email, token: i.token, expiresAt: i.expiresAt })),
  }
}

export async function inviteCoach(
  store: DataStore,
  coachId: string,
  role: MembershipRole,
  myMembershipId: string,
  emailInput: string,
  now = Date.now(),
): Promise<Invite> {
  requireOwner(role, 'invite a coach')
  const email = emailInput.trim().toLowerCase()
  if (!EMAIL.test(email)) throw new DomainError('INVALID', 'Enter a valid email address.')

  const [members, invites] = await Promise.all([
    store.listMemberships(coachId),
    store.listInvites(coachId),
  ])
  if (members.some((m) => m.email.trim().toLowerCase() === email)) {
    throw new DomainError('CONFLICT', 'That person is already on your team.')
  }
  if (invites.some((i) => i.email === email && isOpen(i, now))) {
    throw new DomainError(
      'CONFLICT',
      'There is already an open invitation for that address. Revoke it to send a new link.',
    )
  }
  return store.createInvite(coachId, { email, invitedBy: myMembershipId })
}

export async function revokeInvite(
  store: DataStore,
  coachId: string,
  role: MembershipRole,
  inviteId: string,
): Promise<void> {
  requireOwner(role, 'revoke an invitation')
  const invite = (await store.listInvites(coachId)).find((i) => i.id === inviteId)
  if (!invite) throw new DomainError('NOT_FOUND', 'That invitation could not be found.')
  if (invite.acceptedAt) {
    throw new DomainError('CONFLICT', 'That invitation was already accepted.')
  }
  await store.revokeInvite(coachId, inviteId)
}

/** Remove a coach. Their history stays; sessions they ran are kept, with the runner cleared. */
export async function removeMember(
  store: DataStore,
  coachId: string,
  role: MembershipRole,
  myMembershipId: string,
  targetMembershipId: string,
): Promise<void> {
  requireOwner(role, 'remove a team member')
  if (targetMembershipId === myMembershipId) {
    throw new DomainError('FORBIDDEN', 'You can’t remove yourself.')
  }
  const target = (await store.listMemberships(coachId)).find((m) => m.id === targetMembershipId)
  if (!target) throw new DomainError('NOT_FOUND', 'That team member could not be found.')
  if (target.role === 'owner') {
    throw new DomainError('FORBIDDEN', 'An academy’s owner can’t be removed.')
  }
  await store.removeMembership(coachId, targetMembershipId)
}

/** The signed-out invitation page. Says nothing beyond what the link is for. */
export async function previewInvite(
  store: DataStore,
  token: string,
): Promise<InvitePreview | null> {
  if (!/^[A-Za-z0-9]{16,128}$/.test(token)) return null
  return store.getInvitePreview(token)
}

/** Record who was on court for a session (any member; part of taking attendance). */
export async function setSessionCoaches(
  store: DataStore,
  coachId: string,
  sessionId: string,
  membershipIds: string[],
): Promise<void> {
  const session = await store.getSession(coachId, sessionId)
  if (!session) throw new DomainError('NOT_FOUND', 'That session could not be found.')
  const team = new Set((await store.listMemberships(coachId)).map((m) => m.id))
  for (const id of membershipIds) {
    if (!team.has(id)) throw new DomainError('FORBIDDEN', 'That coach isn’t on your team.')
  }
  await store.setSessionCoaches(coachId, sessionId, membershipIds)
}
