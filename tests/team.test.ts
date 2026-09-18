import { beforeEach, describe, expect, it } from 'vitest'
import { createTestStore, type MockDataStore } from '@/lib/data/mock/store'
import type { Coach } from '@/lib/domain/types'
import {
  inviteCoach,
  loadTeam,
  previewInvite,
  removeMember,
  revokeInvite,
  setSessionCoaches,
} from '@/lib/services/team'

/**
 * The team: invitations create coaches and nothing else, only the owner manages
 * the team, and removing someone never removes history. (The database enforces
 * the same rules independently — migration 0010.)
 */

let store: MockDataStore
let owner: Coach
let coachId: string

beforeEach(() => {
  const created = createTestStore('established')
  store = created.store
  coachId = created.coachId
  owner = store.loadSeed('established', 'auth-owner')
  coachId = owner.id
})

const invite = (email: string, role: 'owner' | 'coach' = 'owner') =>
  inviteCoach(store, coachId, role, owner.membershipId, email)

describe('inviting', () => {
  it('an owner can invite by email; the address is normalised and the link has a secret', async () => {
    const created = await invite('  Dave@Example.COM ')
    expect(created.email).toBe('dave@example.com')
    expect(created.token.length).toBeGreaterThanOrEqual(16)
    expect(created.acceptedAt).toBeNull()
    expect(new Date(created.expiresAt).getTime()).toBeGreaterThan(Date.now())
  })

  it('a coach cannot invite, revoke or remove', async () => {
    const teammate = store.addMember(coachId, 'auth-coach', { name: 'Casey', email: 'casey@x.com' })
    await expect(
      inviteCoach(store, coachId, 'coach', teammate.membershipId, 'a@b.co'),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })

    const created = await invite('dave@example.com')
    await expect(
      revokeInvite(store, coachId, 'coach', created.id),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    await expect(
      removeMember(store, coachId, 'coach', teammate.membershipId, owner.membershipId),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  it('rejects bad addresses, existing members and duplicate open invitations', async () => {
    await expect(invite('not-an-email')).rejects.toMatchObject({ code: 'INVALID' })
    await expect(invite(owner.email)).rejects.toMatchObject({ code: 'CONFLICT' })

    await invite('dave@example.com')
    await expect(invite('DAVE@example.com')).rejects.toMatchObject({ code: 'CONFLICT' })
  })

  it('lets you re-invite an address once the earlier invitation is revoked', async () => {
    const first = await invite('dave@example.com')
    await revokeInvite(store, coachId, 'owner', first.id)
    await expect(invite('dave@example.com')).resolves.toBeTruthy()
  })
})

describe('joining through an invitation', () => {
  it('signing up with the invited address joins the inviter’s academy as a coach', async () => {
    const created = await invite('dave@example.com')
    const joined = await store.createCoach('auth-dave', { name: 'Dave', email: 'Dave@Example.com' })

    expect(joined.role).toBe('coach')
    expect(joined.id).toBe(coachId) // same academy, not a new one
    expect(joined.membershipId).not.toBe(owner.membershipId)
    const stored = (await store.listInvites(coachId)).find((i) => i.id === created.id)!
    expect(stored.acceptedAt).not.toBeNull()
  })

  it('anyone else who signs up starts their own academy as its owner', async () => {
    await invite('dave@example.com')
    const stranger = await store.createCoach('auth-x', { name: 'X', email: 'x@example.com' })
    expect(stranger.role).toBe('owner')
    expect(stranger.id).not.toBe(coachId)
  })

  it('a revoked, expired or already-used invitation does not admit anyone', async () => {
    const revoked = await invite('revoked@example.com')
    await revokeInvite(store, coachId, 'owner', revoked.id)
    expect((await store.createCoach('a1', { name: 'R', email: 'revoked@example.com' })).id).not.toBe(coachId)

    await invite('used@example.com')
    await store.createCoach('a2', { name: 'U', email: 'used@example.com' })
    expect((await store.createCoach('a3', { name: 'U2', email: 'used@example.com' })).id).not.toBe(coachId)
  })

  it('shows a signed-out visitor only what the link is for', async () => {
    const created = await invite('dave@example.com')
    const preview = await previewInvite(store, created.token)
    expect(preview).toEqual({
      businessName: owner.businessName,
      email: 'dave@example.com',
      state: 'open',
    })
    expect(await previewInvite(store, 'not-a-real-token-value')).toBeNull()
    expect(await previewInvite(store, '../etc/passwd')).toBeNull()

    await revokeInvite(store, coachId, 'owner', created.id)
    expect((await previewInvite(store, created.token))?.state).toBe('revoked')
  })
})

describe('the team list', () => {
  it('lists the owner first, marks you, and shows open invitations only to the owner', async () => {
    const teammate = store.addMember(coachId, 'auth-coach', { name: 'Casey', email: 'casey@x.com' })
    await invite('dave@example.com')

    const asOwner = await loadTeam(store, coachId, 'owner', owner.membershipId)
    expect(asOwner.members.map((m) => [m.name, m.role, m.isYou])).toEqual([
      [owner.name, 'owner', true],
      ['Casey', 'coach', false],
    ])
    expect(asOwner.invites.map((i) => i.email)).toEqual(['dave@example.com'])

    const asCoach = await loadTeam(store, coachId, 'coach', teammate.membershipId)
    expect(asCoach.invites).toEqual([])
    expect(asCoach.members.find((m) => m.isYou)?.name).toBe('Casey')
  })

  it('hides invitations that were used, revoked or have expired', async () => {
    const a = await invite('a@example.com')
    await revokeInvite(store, coachId, 'owner', a.id)
    await invite('b@example.com')
    const later = Date.now() + 15 * 86400000
    expect((await loadTeam(store, coachId, 'owner', owner.membershipId, later)).invites).toEqual([])
    expect((await loadTeam(store, coachId, 'owner', owner.membershipId)).invites).toHaveLength(1)
  })
})

describe('removing a coach', () => {
  it('removes them, keeps their sessions, and clears what pointed at them', async () => {
    const dave = store.addMember(coachId, 'auth-dave', { name: 'Dave', email: 'dave@x.com' })
    await store.replaceAvailability(coachId, dave.membershipId, [
      { weekday: 1, startMin: 540, endMin: 900 },
    ])
    // Dave runs a session.
    const created = await store.createSession(coachId, {
      type: 'private', name: 'Dave lesson', date: '2030-01-01', startMin: 600, durationMin: 60,
      priceCents: 0, isFree: true, location: '', capacity: null, coachMembershipId: dave.membershipId,
    })

    await removeMember(store, coachId, 'owner', owner.membershipId, dave.membershipId)

    expect((await store.listMemberships(coachId)).map((m) => m.id)).not.toContain(dave.membershipId)
    expect((await store.listAvailability(coachId)).some((w) => w.membershipId === dave.membershipId)).toBe(false)
    const kept = (await store.getSession(coachId, created.id))!
    expect(kept.coachMembershipId).toBeNull()
    expect(kept.name).toBe('Dave lesson')
  })

  it('never removes an owner or yourself', async () => {
    await expect(
      removeMember(store, coachId, 'owner', owner.membershipId, owner.membershipId),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    await expect(
      removeMember(store, coachId, 'owner', owner.membershipId, 'member-nope'),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })
})

describe('who worked a session', () => {
  it('records members of the academy, and rejects strangers', async () => {
    const dave = store.addMember(coachId, 'auth-dave', { name: 'Dave', email: 'dave@x.com' })
    const [session] = await store.listSessions(coachId)

    await setSessionCoaches(store, coachId, session.id, [owner.membershipId, dave.membershipId])
    expect(await store.listSessionCoaches(coachId, session.id)).toEqual([
      owner.membershipId,
      dave.membershipId,
    ])

    await setSessionCoaches(store, coachId, session.id, [dave.membershipId])
    expect(await store.listSessionCoaches(coachId, session.id)).toEqual([dave.membershipId])

    await expect(
      setSessionCoaches(store, coachId, session.id, ['someone-elses-member']),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })
})
