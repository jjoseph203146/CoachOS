import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { config as loadEnv } from 'dotenv'
import { SupabaseDataStore } from '@/lib/data/supabase/store'
import { addDays, todayISO } from '@/lib/domain/dates'
import { loadFinance, recordPayment } from '@/lib/services/finance'
import { createSession } from '@/lib/services/sessions'
import type { Coach } from '@/lib/domain/types'

loadEnv({ path: '.env.test.local' })
loadEnv({ path: '.env.local' })

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const A_EMAIL = process.env.COACHOS_TEST_COACH_A_EMAIL
const A_PASSWORD = process.env.COACHOS_TEST_COACH_A_PASSWORD
const B_EMAIL = process.env.COACHOS_TEST_COACH_B_EMAIL
const B_PASSWORD = process.env.COACHOS_TEST_COACH_B_PASSWORD

const configured = !!(URL && ANON && A_EMAIL && A_PASSWORD && B_EMAIL && B_PASSWORD)

if (!configured) {
  console.warn(
    '[integration] skipped — see tests/integration/README.md to configure a test project',
  )
}

async function signIn(email: string, password: string): Promise<SupabaseClient> {
  const client = createClient(URL!, ANON!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { error } = await client.auth.signInWithPassword({ email, password })
  if (error) {
    throw new Error(
      `Could not sign in ${email}: ${error.message}. ` +
        'Check the fixture accounts exist and email confirmation is off.',
    )
  }
  return client
}

describe.skipIf(!configured)('Supabase adapter against a live database', () => {
  let clientA: SupabaseClient
  let clientB: SupabaseClient
  let storeA: SupabaseDataStore
  let storeB: SupabaseDataStore
  let coachA: Coach
  let coachB: Coach

  // Everything created here is tagged so cleanup can find it.
  const TAG = `itest-${Date.now()}`
  const created = { playerIds: [] as string[], sessionIds: [] as string[] }

  beforeAll(async () => {
    clientA = await signIn(A_EMAIL!, A_PASSWORD!)
    clientB = await signIn(B_EMAIL!, B_PASSWORD!)
    storeA = new SupabaseDataStore(clientA)
    storeB = new SupabaseDataStore(clientB)

    const {
      data: { user: userA },
    } = await clientA.auth.getUser()
    const {
      data: { user: userB },
    } = await clientB.auth.getUser()

    const a = await storeA.getCoachByAuthId(userA!.id)
    const b = await storeB.getCoachByAuthId(userB!.id)
    expect(a, 'coach A profile row missing — apply 0004_new_coach_bootstrap.sql').toBeTruthy()
    expect(b, 'coach B profile row missing — apply 0004_new_coach_bootstrap.sql').toBeTruthy()
    coachA = a!
    coachB = b!
    expect(coachA.id).not.toBe(coachB.id)
  })

  afterAll(async () => {
    // Best-effort teardown, children first.
    for (const sessionId of created.sessionIds) {
      await (clientA as any).from('charges').delete().eq('session_id', sessionId)
      await (clientA as any).from('enrollments').delete().eq('session_id', sessionId)
      await (clientA as any).from('sessions').delete().eq('id', sessionId)
    }
    for (const playerId of created.playerIds) {
      await (clientA as any).from('charges').delete().eq('player_id', playerId)
      await (clientA as any).from('players').delete().eq('id', playerId)
    }
    await clientA?.auth.signOut()
    await clientB?.auth.signOut()
  })

  it('round-trips a player through the real adapter', async () => {
    const player = await storeA.createPlayer(coachA.id, {
      name: `${TAG} Player`,
      phone: '(415) 555-0100',
      email: 'itest@example.com',
      level: 'Intermediate',
      defaultRateCents: 7500,
      notes: 'integration fixture',
    })
    created.playerIds.push(player.id)

    const fetched = await storeA.getPlayer(coachA.id, player.id)
    expect(fetched?.name).toBe(`${TAG} Player`)
    expect(fetched?.defaultRateCents).toBe(7500)
    expect(fetched?.archived).toBe(false)
  })

  it('creates a session with one charge per player', async () => {
    const player = await storeA.createPlayer(coachA.id, {
      name: `${TAG} Charged`,
      phone: '',
      email: '',
      level: 'Beginner',
      defaultRateCents: null,
      notes: '',
    })
    created.playerIds.push(player.id)

    const session = await createSession(storeA, coachA.id, {
      type: 'private',
      name: `${TAG} Session`,
      date: addDays(todayISO(), 45),
      startMin: 300,
      durationMin: 60,
      priceCents: 5000,
      isFree: false,
      location: 'Integration Court',
      capacity: null,
      playerIds: [player.id],
      allowConflict: true,
    })
    created.sessionIds.push(session.id)

    const finance = await loadFinance(storeA, coachA.id, todayISO())
    const charges = finance.forSession(session.id)
    expect(charges).toHaveLength(1)
    expect(charges[0].amountCents).toBe(5000)
    expect(finance.outstandingForSession(session.id)).toBe(5000)
  })

  describe('row-level security', () => {
    let playerId: string
    let sessionId: string
    let chargeId: string

    beforeAll(async () => {
      const player = await storeA.createPlayer(coachA.id, {
        name: `${TAG} Private`,
        phone: '',
        email: '',
        level: 'Advanced',
        defaultRateCents: 9000,
        notes: 'confidential',
      })
      playerId = player.id
      created.playerIds.push(playerId)

      const session = await createSession(storeA, coachA.id, {
        type: 'private',
        name: `${TAG} Private Session`,
        date: addDays(todayISO(), 46),
        startMin: 300,
        durationMin: 60,
        priceCents: 9000,
        isFree: false,
        location: '',
        capacity: null,
        playerIds: [playerId],
        allowConflict: true,
      })
      sessionId = session.id
      created.sessionIds.push(sessionId)

      const finance = await loadFinance(storeA, coachA.id, todayISO())
      chargeId = finance.forSession(sessionId)[0].charge.id
    })

    it('hides coach A’s rows from coach B entirely', async () => {
      expect(await storeB.getPlayer(coachB.id, playerId)).toBeNull()
      expect(await storeB.getSession(coachB.id, sessionId)).toBeNull()
      expect(await storeB.getCharge(coachB.id, chargeId)).toBeNull()

      const players = await storeB.listPlayers(coachB.id, { includeDeleted: true })
      expect(players.some((p) => p.id === playerId)).toBe(false)
    })

    it('blocks coach B even when they pass coach A’s own coach_id (IDOR)', async () => {
      // Policies key off auth.uid(), not the coach_id in the query, so
      // impersonating the id changes nothing.
      expect(await storeB.getPlayer(coachA.id, playerId)).toBeNull()
      expect(await storeB.getSession(coachA.id, sessionId)).toBeNull()

      const charges = await storeB.listCharges(coachA.id)
      expect(charges).toHaveLength(0)
    })

    it('rejects coach B writing to coach A’s rows', async () => {
      await expect(
        storeB.updatePlayer(coachB.id, playerId, { name: 'hijacked' }),
      ).rejects.toThrow()

      const untouched = await storeA.getPlayer(coachA.id, playerId)
      expect(untouched?.name).toBe(`${TAG} Private`)
    })

    it('rejects a cross-tenant charge insert', async () => {
      await expect(
        storeB.createCharge(coachB.id, {
          playerId, // belongs to coach A
          sessionId: null,
          amountCents: 100,
          dueDate: todayISO(),
          isManual: true,
          label: 'cross tenant',
          note: '',
        }),
      ).rejects.toThrow()
    })
  })

  describe('database financial invariants', () => {
    let chargeId: string

    beforeAll(async () => {
      const player = await storeA.createPlayer(coachA.id, {
        name: `${TAG} Money`,
        phone: '',
        email: '',
        level: 'Beginner',
        defaultRateCents: null,
        notes: '',
      })
      created.playerIds.push(player.id)

      const charge = await storeA.createCharge(coachA.id, {
        playerId: player.id,
        sessionId: null,
        amountCents: 5000,
        dueDate: todayISO(),
        isManual: true,
        label: `${TAG} manual`,
        note: '',
      })
      chargeId = charge.id
    })

    it('refuses a payment that would exceed the charge', async () => {
      await expect(
        storeA.recordPayment(coachA.id, {
          chargeId,
          amountCents: 5001,
          paidOn: todayISO(),
          note: '',
        }),
      ).rejects.toThrow()
    })

    it('refuses a second payment once the charge is settled', async () => {
      await recordPayment(storeA, coachA.id, {
        chargeId,
        amountCents: 5000,
        today: todayISO(),
      })

      // The application guard and the database trigger should both object.
      await expect(
        storeA.recordPayment(coachA.id, {
          chargeId,
          amountCents: 5000,
          paidOn: todayISO(),
          note: '',
        }),
      ).rejects.toThrow()

      const finance = await loadFinance(storeA, coachA.id, todayISO())
      expect(finance.byChargeId.get(chargeId)!.paidCents).toBe(5000)
    })

    it('refuses to void a charge that has money against it', async () => {
      await expect(
        storeA.updateCharge(coachA.id, chargeId, {
          voidedAt: new Date().toISOString(),
          voidNote: 'should fail',
        }),
      ).rejects.toThrow()
    })
  })
})
