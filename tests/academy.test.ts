import { beforeEach, describe, expect, it } from 'vitest'
import { MockDataStore } from '@/lib/data/mock/store'
import { completeOnboarding, updateSettings } from '@/lib/services/settings'
import type { SettingsPatch } from '@/lib/services/settings'
import type { Coach } from '@/lib/domain/types'

/**
 * Academies and memberships.
 *
 * `Coach.id` is the ACADEMY id (the tenant every data query scopes by);
 * `Coach.membershipId` is one person's own row. These pin down that split and
 * the owner-only rule for business settings. The database enforces the same
 * rules independently through RLS (supabase/migrations/0006).
 */

const PATCH: SettingsPatch = {
  name: 'New Name',
  email: 'new@example.com',
  businessName: 'Renamed Academy',
  defaultRateCents: 9900,
  attendanceWindow: '48 hours',
  theme: 'Dark',
  timezone: 'America/New_York',
}

let store: MockDataStore
let owner: Coach
let teammate: Coach

beforeEach(() => {
  store = new MockDataStore()
  owner = store.loadSeed('established', 'auth-owner')
  teammate = store.addMember(owner.id, 'auth-coach', {
    name: 'Casey Coach',
    email: 'casey@example.com',
  })
})

describe('identity', () => {
  it('a new signup is the owner of a brand-new academy of their own', async () => {
    const fresh = await store.createCoach('auth-new', { name: 'Nia', email: 'nia@example.com' })

    expect(fresh.role).toBe('owner')
    expect(fresh.membershipId).not.toBe(fresh.id)
    expect(fresh.id).not.toBe(owner.id)
    expect((await store.getCoachByAuthId('auth-new'))?.membershipId).toBe(fresh.membershipId)
  })

  it('a teammate shares the academy id but has their own membership and role', async () => {
    expect(teammate.id).toBe(owner.id)
    expect(teammate.membershipId).not.toBe(owner.membershipId)
    expect(teammate.role).toBe('coach')
    expect(owner.role).toBe('owner')

    const resolved = await store.getCoachByAuthId('auth-coach')
    expect(resolved?.membershipId).toBe(teammate.membershipId)
  })

  it('teammates read and write the same roster', async () => {
    const before = (await store.listPlayers(owner.id)).length
    await store.createPlayer(teammate.id, {
      name: 'Added By Coach',
      phone: '',
      email: '',
      level: 'Beginner',
      defaultRateCents: null,
      notes: '',
    })

    const seenByOwner = await store.listPlayers(owner.id)
    expect(seenByOwner).toHaveLength(before + 1)
    expect(seenByOwner.some((p) => p.name === 'Added By Coach')).toBe(true)
  })
})

describe('settings are split between the person and the academy', () => {
  it('an owner updates their profile AND the shared business settings', async () => {
    const updated = await updateSettings(
      store,
      owner.membershipId,
      owner.id,
      owner.role,
      PATCH,
    )

    expect(updated.name).toBe('New Name')
    expect(updated.businessName).toBe('Renamed Academy')
    expect(updated.defaultRateCents).toBe(9900)
    expect(updated.timezone).toBe('America/New_York')
    // The update result keeps the caller's own identity.
    expect(updated.membershipId).toBe(owner.membershipId)
    expect(updated.role).toBe('owner')
  })

  it('business settings changed by the owner are seen by every teammate', async () => {
    await updateSettings(store, owner.membershipId, owner.id, owner.role, PATCH)

    const seenByTeammate = await store.getCoach(teammate.membershipId)
    expect(seenByTeammate?.businessName).toBe('Renamed Academy')
    expect(seenByTeammate?.timezone).toBe('America/New_York')
    // …without touching the teammate's own profile.
    expect(seenByTeammate?.name).toBe('Casey Coach')
  })

  it('a coach can change their own name and email but not the business settings', async () => {
    const updated = await updateSettings(
      store,
      teammate.membershipId,
      teammate.id,
      teammate.role,
      PATCH,
    )

    expect(updated.name).toBe('New Name')
    expect(updated.email).toBe('new@example.com')
    // Business fields are untouched.
    expect(updated.businessName).toBe(owner.businessName)
    expect(updated.defaultRateCents).toBe(owner.defaultRateCents)
    expect(updated.timezone).toBe(owner.timezone)

    const ownerView = await store.getCoach(owner.membershipId)
    expect(ownerView?.businessName).toBe(owner.businessName)
    expect(ownerView?.name).toBe(owner.name)
  })

  it('a coach completing onboarding records their name but cannot set business details', async () => {
    const done = await completeOnboarding(store, teammate.membershipId, teammate.id, teammate.role, {
      name: 'Casey C.',
      businessName: 'Hijacked Name',
      defaultRateCents: 1,
      timezone: 'Asia/Tokyo',
    })

    expect(done.name).toBe('Casey C.')
    expect(done.onboardedAt).not.toBeNull()
    expect(done.businessName).toBe(owner.businessName)
    expect(done.defaultRateCents).toBe(owner.defaultRateCents)
    expect(done.timezone).toBe(owner.timezone)
  })

  it('an owner completing onboarding sets the business details', async () => {
    const done = await completeOnboarding(store, owner.membershipId, owner.id, owner.role, {
      name: 'Jacob',
      businessName: 'Fresh Start Tennis',
      defaultRateCents: 8000,
      timezone: 'Europe/London',
    })

    expect(done.businessName).toBe('Fresh Start Tennis')
    expect(done.defaultRateCents).toBe(8000)
    expect(done.timezone).toBe('Europe/London')
  })
})
