import { beforeEach, describe, expect, it } from 'vitest'
import { MockDataStore } from '@/lib/data/mock/store'
import { addDays, todayISO } from '@/lib/domain/dates'
import { loadFinance, recordCredit, recordPayment } from '@/lib/services/finance'
import { getPlayer, setPlayerArchived, updatePlayer } from '@/lib/services/players'
import {
  addPlayerToSession,
  cancelSession,
  createSession,
  getSession,
  saveAttendance,
} from '@/lib/services/sessions'
import { DomainError } from '@/lib/services/errors'

/**
 * Tenant isolation.
 *
 * These exercise the application layer. The database enforces the same rules
 * independently through row-level security (supabase/migrations/0003), so a
 * bug here still cannot leak another coach's data in production.
 */

const TODAY = todayISO()

let store: MockDataStore
let coachA: string
let coachB: string
let bPlayerId: string
let bSessionId: string
let bChargeId: string

beforeEach(async () => {
  store = new MockDataStore()
  const a = store.loadSeed('established', 'auth-a')
  coachA = a.id

  const b = await store.createCoach('auth-b', {
    name: 'Rival Coach',
    email: 'rival@example.com',
  })
  coachB = b.id

  const player = await store.createPlayer(coachB, {
    name: 'Bianca Secret',
    phone: '',
    email: '',
    level: 'Advanced',
    defaultRateCents: 11000,
    notes: 'Confidential',
  })
  bPlayerId = player.id

  const session = await createSession(store, coachB, {
    type: 'private',
    name: 'Coach B Session',
    date: addDays(TODAY, 5),
    startMin: 600,
    durationMin: 60,
    priceCents: 11000,
    isFree: false,
    location: 'Private Court',
    capacity: null,
    playerIds: [bPlayerId],
  })
  bSessionId = session.id

  const finance = await loadFinance(store, coachB, TODAY)
  bChargeId = finance.forSession(bSessionId)[0].charge.id
})

describe('reads are scoped to the owning coach', () => {
  it('coach A cannot list coach B’s players, sessions or financial records', async () => {
    const players = await store.listPlayers(coachA, { includeDeleted: true })
    expect(players.some((p) => p.id === bPlayerId)).toBe(false)

    const sessions = await store.listSessions(coachA)
    expect(sessions.some((s) => s.id === bSessionId)).toBe(false)

    const charges = await store.listCharges(coachA)
    expect(charges.some((c) => c.id === bChargeId)).toBe(false)

    const enrollments = await store.listEnrollments(coachA)
    expect(enrollments.some((e) => e.sessionId === bSessionId)).toBe(false)
  })

  it('coach A cannot fetch coach B’s records by guessing an id (IDOR)', async () => {
    expect(await store.getPlayer(coachA, bPlayerId)).toBeNull()
    expect(await store.getSession(coachA, bSessionId)).toBeNull()
    expect(await store.getCharge(coachA, bChargeId)).toBeNull()

    await expect(getPlayer(store, coachA, bPlayerId)).rejects.toThrow(DomainError)
    await expect(getSession(store, coachA, bSessionId)).rejects.toThrow(DomainError)
  })

  it('coach A’s financial totals never include coach B’s money', async () => {
    const financeA = await loadFinance(store, coachA, TODAY)
    const financeB = await loadFinance(store, coachB, TODAY)

    expect(financeA.views.some((v) => v.charge.id === bChargeId)).toBe(false)
    expect(financeA.outstandingFor(bPlayerId)).toBe(0)
    expect(financeA.outstandingForSession(bSessionId)).toBe(0)
    expect(financeB.outstandingForSession(bSessionId)).toBe(11000)
  })
})

describe('writes are scoped to the owning coach', () => {
  it('coach A cannot mutate coach B’s player', async () => {
    await expect(
      updatePlayer(store, coachA, bPlayerId, { name: 'Hijacked' }),
    ).rejects.toThrow(DomainError)
    await expect(setPlayerArchived(store, coachA, bPlayerId, true)).rejects.toThrow(
      DomainError,
    )

    const untouched = await store.getPlayer(coachB, bPlayerId)
    expect(untouched!.name).toBe('Bianca Secret')
    expect(untouched!.archived).toBe(false)
  })

  it('coach A cannot cancel or edit coach B’s session', async () => {
    await expect(cancelSession(store, coachA, bSessionId, 'void', TODAY)).rejects.toThrow(
      DomainError,
    )
    const untouched = await store.getSession(coachB, bSessionId)
    expect(untouched!.status).toBe('scheduled')
  })

  it('coach A cannot mark coach B’s attendance', async () => {
    await expect(
      saveAttendance(store, coachA, bSessionId, [
        { playerId: bPlayerId, attendance: 'present' },
      ]),
    ).rejects.toThrow(DomainError)
  })

  it('coach A cannot record a payment or credit against coach B’s charge', async () => {
    await expect(
      recordPayment(store, coachA, { chargeId: bChargeId, amountCents: 11000 , today: TODAY }),
    ).rejects.toThrow(DomainError)
    await expect(
      recordCredit(store, coachA, { chargeId: bChargeId, amountCents: 1000 , today: TODAY }),
    ).rejects.toThrow(DomainError)

    const finance = await loadFinance(store, coachB, TODAY)
    expect(finance.byChargeId.get(bChargeId)!.outstandingCents).toBe(11000)
  })

  it('coach A cannot enroll their own player into coach B’s session', async () => {
    await expect(
      addPlayerToSession(store, coachA, bSessionId, 'p1'),
    ).rejects.toThrow(DomainError)
  })

  it('coach A cannot schedule a session containing coach B’s player', async () => {
    await expect(
      createSession(store, coachA, {
        type: 'private',
        name: 'Cross-tenant attempt',
        date: addDays(TODAY, 60),
        startMin: 300,
        durationMin: 60,
        priceCents: 5000,
        isFree: false,
        location: '',
        capacity: null,
        playerIds: [bPlayerId],
        allowConflict: true,
      }),
    ).rejects.toThrow(DomainError)
  })
})
