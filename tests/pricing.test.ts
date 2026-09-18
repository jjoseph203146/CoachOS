import { beforeEach, describe, expect, it } from 'vitest'
import { MockDataStore, createTestStore } from '@/lib/data/mock/store'
import { addDays, todayISO } from '@/lib/domain/dates'
import { manualSnapshot, privateLessonSnapshot, standardRateFor } from '@/lib/domain/pricing'
import { createManualCharge } from '@/lib/services/finance'
import {
  addPlayerToSession,
  cancelSession,
  createSession,
  removePlayerFromSession,
  updateSession,
} from '@/lib/services/sessions'
import { DomainError } from '@/lib/services/errors'

/**
 * Charges are historical price snapshots.
 *
 * A charge records what was agreed at the moment it was created — the amount,
 * where it came from, and what the standard was — and is never re-derived from
 * a live price. Changing a player's rate, the academy default or a session's
 * price later must not touch a charge that already exists. Only an OWNER may
 * change an existing charge's amount, and doing so is recorded as 'custom'.
 */

const TODAY = todayISO()

let store: MockDataStore
let coachId: string

beforeEach(() => {
  const created = createTestStore('established')
  store = created.store
  coachId = created.coachId
})

/** Book a private lesson for a seeded player and return its single charge. */
async function bookPrivate(playerId: string, priceCents: number, day = 30) {
  const session = await createSession(store, coachId, {
    type: 'private',
    name: 'Lesson',
    date: addDays(TODAY, day),
    startMin: 600,
    durationMin: 60,
    priceCents,
    isFree: false,
    location: '',
    capacity: null,
    playerIds: [playerId],
    allowConflict: true,
  })
  const charges = (await store.listCharges(coachId)).filter((c) => c.sessionId === session.id)
  expect(charges).toHaveLength(1)
  return { session, charge: charges[0] }
}

describe('pricing rules (pure)', () => {
  it('prefers the player’s own rate, falling back to the academy default', () => {
    expect(standardRateFor({ defaultRateCents: 9000 }, { defaultRateCents: 7000 })).toEqual({
      cents: 9000,
      source: 'player_default',
    })
    expect(standardRateFor({ defaultRateCents: null }, { defaultRateCents: 7000 })).toEqual({
      cents: 7000,
      source: 'academy_default',
    })
  })

  it('records a price equal to the standard as that default, anything else as custom', () => {
    const standard = { cents: 9000, source: 'player_default' as const }
    expect(privateLessonSnapshot(9000, standard).priceSource).toBe('player_default')

    const discounted = privateLessonSnapshot(6500, standard)
    expect(discounted.priceSource).toBe('custom')
    // The standard stays on the record so the discount is visible.
    expect(discounted.standardAmountCents).toBe(9000)
  })

  it('manual charges say so and claim no standard', () => {
    expect(manualSnapshot()).toEqual({
      priceSource: 'manual',
      priceBasis: null,
      standardAmountCents: null,
    })
  })
})

describe('a charge snapshots where its price came from', () => {
  it('private lesson at the player’s rate is a player-default charge', async () => {
    // Seed player p1 has a 7500 rate.
    const { charge } = await bookPrivate('p1', 7500)
    expect(charge.amountCents).toBe(7500)
    expect(charge.priceSource).toBe('player_default')
    expect(charge.priceBasis).toBe('per_session')
    expect(charge.standardAmountCents).toBe(7500)
  })

  it('private lesson for a player with no rate falls back to the academy default', async () => {
    const player = await store.createPlayer(coachId, {
      name: 'No Rate',
      phone: '',
      email: '',
      level: 'Beginner',
      defaultRateCents: null,
      notes: '',
    })
    const { charge } = await bookPrivate(player.id, 7000) // seeded academy default
    expect(charge.priceSource).toBe('academy_default')
    expect(charge.standardAmountCents).toBe(7000)
  })

  it('overriding the price for one booking is recorded as custom, with the standard kept', async () => {
    const { charge } = await bookPrivate('p1', 5000) // p1's standard is 7500
    expect(charge.amountCents).toBe(5000)
    expect(charge.priceSource).toBe('custom')
    expect(charge.standardAmountCents).toBe(7500)
  })

  it('group and added-player charges take the session price, with no standard to compare', async () => {
    const session = await createSession(store, coachId, {
      type: 'group',
      name: 'Group',
      date: addDays(TODAY, 31),
      startMin: 600,
      durationMin: 60,
      priceCents: 3500,
      isFree: false,
      location: '',
      capacity: 6,
      playerIds: ['p1'],
      allowConflict: true,
    })
    await addPlayerToSession(store, coachId, session.id, 'p2')

    const charges = (await store.listCharges(coachId)).filter((c) => c.sessionId === session.id)
    expect(charges).toHaveLength(2)
    for (const charge of charges) {
      expect(charge.priceSource).toBe('session_price')
      expect(charge.priceBasis).toBe('per_session')
      expect(charge.standardAmountCents).toBeNull()
    }
  })

  it('a manual charge is marked manual', async () => {
    await createManualCharge(store, coachId, {
      playerId: 'p1',
      amountCents: 2500,
      dueDate: TODAY,
      label: 'Racquet restring',
    })
    const charge = (await store.listCharges(coachId)).find((c) => c.label === 'Racquet restring')!
    expect(charge.isManual).toBe(true)
    expect(charge.priceSource).toBe('manual')
    expect(charge.priceBasis).toBeNull()
  })
})

describe('changing a standard price never rewrites an existing charge', () => {
  it('a later change to the player’s rate and the academy default leaves the charge alone', async () => {
    const { charge } = await bookPrivate('p1', 7500)

    await store.updatePlayer(coachId, 'p1', { defaultRateCents: 12000 })
    await store.updateAcademySettings(coachId, { defaultRateCents: 15000 })

    const after = (await store.listCharges(coachId)).find((c) => c.id === charge.id)!
    expect(after.amountCents).toBe(7500)
    expect(after.priceSource).toBe('player_default')
    expect(after.standardAmountCents).toBe(7500)

    // The NEXT booking uses the new rate — the change is prospective only.
    const { charge: next } = await bookPrivate('p1', 12000, 32)
    expect(next.amountCents).toBe(12000)
    expect(next.standardAmountCents).toBe(12000)
    expect(next.priceSource).toBe('player_default')
  })

  it('editing a session’s price and keeping charges leaves existing charges at the old price', async () => {
    const session = await createSession(store, coachId, {
      type: 'group',
      name: 'Group',
      date: addDays(TODAY, 33),
      startMin: 600,
      durationMin: 60,
      priceCents: 3500,
      isFree: false,
      location: '',
      capacity: 6,
      playerIds: ['p1'],
      allowConflict: true,
    })

    await updateSession(
      store,
      coachId,
      session.id,
      {
        name: 'Group',
        date: session.date,
        startMin: 600,
        durationMin: 60,
        priceCents: 5000,
        location: '',
        capacity: 6,
        priceChangeDecision: 'keep',
      },
      TODAY,
      'owner',
    )

    // Existing charge is untouched; a player added afterwards pays the new price.
    await addPlayerToSession(store, coachId, session.id, 'p2')
    const byPlayer = new Map(
      (await store.listCharges(coachId))
        .filter((c) => c.sessionId === session.id)
        .map((c) => [c.playerId, c.amountCents]),
    )
    expect(byPlayer.get('p1')).toBe(3500)
    expect(byPlayer.get('p2')).toBe(5000)
  })
})

describe('only the owner may change what an existing charge is worth', () => {
  async function groupWithOneCharge() {
    const session = await createSession(store, coachId, {
      type: 'group',
      name: 'Group',
      date: addDays(TODAY, 34),
      startMin: 600,
      durationMin: 60,
      priceCents: 3500,
      isFree: false,
      location: '',
      capacity: 6,
      playerIds: ['p1'],
      allowConflict: true,
    })
    const args = {
      name: 'Group',
      date: session.date,
      startMin: 600,
      durationMin: 60,
      priceCents: 4200,
      location: '',
      capacity: 6,
    }
    return { session, args }
  }

  it('an owner can reprice unpaid charges, which relabels them custom and keeps the snapshot', async () => {
    const { session, args } = await groupWithOneCharge()
    await updateSession(store, coachId, session.id, { ...args, priceChangeDecision: 'update' }, TODAY, 'owner')

    const charge = (await store.listCharges(coachId)).find((c) => c.sessionId === session.id)!
    expect(charge.amountCents).toBe(4200)
    expect(charge.priceSource).toBe('custom')
    expect(charge.priceBasis).toBe('per_session')
  })

  it('a coach cannot reprice existing charges, and nothing is changed by the attempt', async () => {
    const { session, args } = await groupWithOneCharge()

    await expect(
      updateSession(store, coachId, session.id, { ...args, priceChangeDecision: 'update' }, TODAY, 'coach'),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })

    const charge = (await store.listCharges(coachId)).find((c) => c.sessionId === session.id)!
    expect(charge.amountCents).toBe(3500)
    expect(charge.priceSource).toBe('session_price')
  })

  it('a coach can still edit a session and choose to keep existing charges', async () => {
    const { session, args } = await groupWithOneCharge()
    const result = await updateSession(
      store, coachId, session.id, { ...args, priceChangeDecision: 'keep' }, TODAY, 'coach',
    )
    expect(result.requiresPriceDecision).toBe(false)
    const charge = (await store.listCharges(coachId)).find((c) => c.sessionId === session.id)!
    expect(charge.amountCents).toBe(3500)
  })

  it('a coach cannot credit a charge when removing a player, but can remove and keep it', async () => {
    const { session } = await groupWithOneCharge()
    const creditsBefore = (await store.listCredits(coachId)).length

    await expect(
      removePlayerFromSession(store, coachId, session.id, 'p1', 'credit', TODAY, 'coach'),
    ).rejects.toBeInstanceOf(DomainError)
    // The failed attempt removed nothing.
    expect(await store.listEnrollmentsForSession(coachId, session.id)).toHaveLength(1)

    await removePlayerFromSession(store, coachId, session.id, 'p1', 'keep', TODAY, 'coach')
    expect(await store.listEnrollmentsForSession(coachId, session.id)).toHaveLength(0)
    expect((await store.listCredits(coachId)).length).toBe(creditsBefore)
  })

  it('cancelling a session is a coach workflow and may write off its unpaid charges', async () => {
    const { session } = await groupWithOneCharge()
    await cancelSession(store, coachId, session.id, 'void', TODAY)

    const charge = (await store.listCharges(coachId)).find((c) => c.sessionId === session.id)!
    expect(charge.voidedAt).not.toBeNull()
    // Voiding never rewrites the amount or its snapshot.
    expect(charge.amountCents).toBe(3500)
    expect(charge.priceSource).toBe('session_price')
  })
})
