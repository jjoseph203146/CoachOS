import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestStore, type MockDataStore } from '@/lib/data/mock/store'
import { SupabaseDataStore } from '@/lib/data/supabase/store'
import type { EnrollInProgramInput, NewProgramInput } from '@/lib/data/store'
import { todayISO } from '@/lib/domain/dates'
import { createProgram, enrollParticipant, type CreateProgramArgs } from '@/lib/services/programs'

/**
 * The two multi-write program workflows — create a program, enroll a
 * participant — must be all-or-nothing: programs, roster places and charges can
 * never be deleted, so a partial failure can't be cleaned up afterwards.
 *
 * The database side is proven by supabase/tests/atomic_program_workflows.test.sql
 * (run `scripts/test-sql.sh`). These tests prove the application side: the mock
 * store mirrors the same all-or-nothing behavior, the services only use the
 * atomic store methods, and the Supabase adapter makes exactly one RPC.
 */

const TODAY = todayISO()

let store: MockDataStore
let coachId: string

beforeEach(() => {
  const created = createTestStore('established')
  store = created.store
  coachId = created.coachId
})

/** Every table a workflow could leave a partial row in. */
async function counts(s: MockDataStore = store) {
  return {
    programs: (await s.listPrograms(coachId)).length,
    options: (await s.listPriceOptions(coachId)).length,
    sessions: (await s.listSessions(coachId)).length,
    places: (await s.listProgramEnrollments(coachId)).length,
    attendance: (await s.listEnrollments(coachId)).length,
    charges: (await s.listCharges(coachId)).length,
  }
}

const programInput = (overrides: Partial<NewProgramInput> = {}): NewProgramInput => ({
  name: 'Summer Camp',
  audience: 'youth',
  weekdays: [1, 3],
  startMin: 600,
  durationMin: 90,
  location: 'Main Courts',
  capacity: null,
  ageRange: '6–12',
  startsOn: TODAY,
  endsOn: null,
  ...overrides,
})

const weekly = { label: 'Weekly', basis: 'weekly', amountCents: 15000 } as const
const dropIn = { label: 'Drop-in', basis: 'drop_in', amountCents: 3500 } as const
const DATES = ['2030-01-07', '2030-01-09', '2030-01-14']

describe('createProgramWithOptions (mock store)', () => {
  it('creates the program, its options in order, and its occurrences together', async () => {
    const before = await counts()
    const program = await store.createProgramWithOptions(
      coachId,
      programInput(),
      [weekly, dropIn],
      DATES,
    )
    const after = await counts()
    expect(after.programs).toBe(before.programs + 1)
    expect(after.options).toBe(before.options + 2)
    expect(after.sessions).toBe(before.sessions + 3)

    const options = (await store.listPriceOptions(coachId))
      .filter((o) => o.programId === program.id)
      .sort((a, b) => a.position - b.position)
    expect(options.map((o) => [o.label, o.position])).toEqual([
      ['Weekly', 0],
      ['Drop-in', 1],
    ])
    const sessions = (await store.listSessions(coachId)).filter((s) => s.programId === program.id)
    expect(sessions.map((s) => s.date).sort()).toEqual(DATES)
    expect(sessions.every((s) => s.type === 'group' && s.priceCents === 0)).toBe(true)
  })

  const failures: Array<[string, () => Promise<unknown>]> = [
    [
      'a later option is invalid (after the program and first option were written)',
      () =>
        store.createProgramWithOptions(coachId, programInput(), [weekly, { ...dropIn, amountCents: -1 }], DATES),
    ],
    [
      'a later option has a blank label',
      () => store.createProgramWithOptions(coachId, programInput(), [weekly, { ...dropIn, label: ' ' }], DATES),
    ],
    [
      'an occurrence date is invalid (after program and options were written)',
      () => store.createProgramWithOptions(coachId, programInput(), [weekly], ['2030-01-07', '']),
    ],
    ['there are no price options', () => store.createProgramWithOptions(coachId, programInput(), [], DATES)],
    [
      'the program meets on no day',
      () => store.createProgramWithOptions(coachId, programInput({ weekdays: [] }), [weekly], DATES),
    ],
    [
      'the end date is before the start date',
      () =>
        store.createProgramWithOptions(
          coachId,
          programInput({ startsOn: '2030-02-01', endsOn: '2030-01-01' }),
          [weekly],
          DATES,
        ),
    ],
  ]

  it.each(failures)('leaves nothing behind when %s', async (_name, run) => {
    const before = await counts()
    await expect(run()).rejects.toThrow()
    expect(await counts()).toEqual(before)
  })
})

describe('enrollInProgram (mock store)', () => {
  let programId: string
  let otherProgramId: string
  let playerId: string
  let optionId: string
  let sessionIds: string[]

  const enrollment = (overrides: Partial<EnrollInProgramInput['enrollment']> = {}) => ({
    programId,
    playerId,
    joinedOn: TODAY,
    priceOptionId: optionId,
    agreedLabel: 'Weekly',
    agreedBasis: 'weekly' as const,
    agreedAmountCents: 15000,
    standardAmountCents: 15000 as number | null,
    agreementSource: 'program_option' as const,
    agreementNote: '',
    ...overrides,
  })
  const charge = (overrides: Partial<NonNullable<EnrollInProgramInput['charge']>> = {}) => ({
    playerId,
    sessionId: null,
    amountCents: 15000,
    priceSource: 'program_option' as const,
    priceBasis: 'weekly' as const,
    standardAmountCents: 15000 as number | null,
    programId,
    periodStart: TODAY,
    periodEnd: TODAY,
    dueDate: TODAY,
    isManual: false,
    label: 'Summer Camp — Weekly',
    note: '',
    ...overrides,
  })

  beforeEach(async () => {
    const program = await store.createProgramWithOptions(coachId, programInput(), [weekly, dropIn], DATES)
    const other = await store.createProgramWithOptions(
      coachId,
      programInput({ name: 'Clinic' }),
      [weekly],
      ['2030-03-04'],
    )
    programId = program.id
    otherProgramId = other.id
    playerId = (await store.listPlayers(coachId))[0].id
    optionId = (await store.listPriceOptions(coachId)).find(
      (o) => o.programId === programId && o.label === 'Weekly',
    )!.id
    sessionIds = (await store.listSessions(coachId))
      .filter((s) => s.programId === programId)
      .map((s) => s.id)
  })

  it('writes the place, the occurrences and the first charge together', async () => {
    const before = await counts()
    const result = await store.enrollInProgram(coachId, {
      enrollment: enrollment(),
      sessionIds,
      charge: charge(),
    })
    const after = await counts()
    expect(after.places).toBe(before.places + 1)
    expect(after.attendance).toBe(before.attendance + sessionIds.length)
    expect(after.charges).toBe(before.charges + 1)
    expect(result.charge).toMatchObject({
      amountCents: 15000,
      programId,
      programEnrollmentId: result.enrollment.id,
    })
    expect(result.enrollment).toMatchObject({ status: 'active', agreedAmountCents: 15000 })
  })

  it('allows an enrollment with no charge yet', async () => {
    const result = await store.enrollInProgram(coachId, {
      enrollment: enrollment(),
      sessionIds: [],
      charge: null,
    })
    expect(result.charge).toBeNull()
    expect((await counts()).places).toBe(1)
  })

  const failures: Array<[string, () => EnrollInProgramInput]> = [
    [
      'the charge does not equal the agreement (the LAST step fails)',
      () => ({ enrollment: enrollment(), sessionIds, charge: charge({ amountCents: 100 }) }),
    ],
    [
      'the charge is priced from a different source than the agreement',
      () => ({ enrollment: enrollment(), sessionIds, charge: charge({ priceSource: 'custom' }) }),
    ],
    [
      'an occurrence belongs to another program (after earlier ones were added)',
      () => ({
        enrollment: enrollment(),
        sessionIds: [sessionIds[0], 'session-of-nowhere'],
        charge: charge(),
      }),
    ],
    [
      'the agreement does not match its price option',
      () => ({ enrollment: enrollment({ agreedAmountCents: 1 }), sessionIds, charge: charge() }),
    ],
    [
      'the price option belongs to a different program',
      () => ({
        enrollment: enrollment({ programId: otherProgramId }),
        sessionIds: [],
        charge: null,
      }),
    ],
    [
      'the player is not in this academy',
      () => ({ enrollment: enrollment({ playerId: 'someone-else' }), sessionIds, charge: charge() }),
    ],
  ]

  it.each(failures)('leaves nothing behind when %s', async (_name, build) => {
    const before = await counts()
    await expect(store.enrollInProgram(coachId, build())).rejects.toThrow()
    expect(await counts()).toEqual(before)
  })

  it('leaves nothing behind when the participant already has an active place', async () => {
    await store.enrollInProgram(coachId, { enrollment: enrollment(), sessionIds, charge: charge() })
    const before = await counts()
    await expect(
      store.enrollInProgram(coachId, { enrollment: enrollment(), sessionIds, charge: charge() }),
    ).rejects.toThrow()
    expect(await counts()).toEqual(before)
  })
})

/**
 * Wraps a store so we can see which methods a SERVICE calls on it. Calls the
 * mock makes on itself internally are not seen, which is the point: this is
 * about what the service asks the store to do.
 */
function recording(target: MockDataStore) {
  const calls: string[] = []
  const proxy = new Proxy(target, {
    get(obj, prop, receiver) {
      const value = Reflect.get(obj, prop, receiver)
      if (typeof value !== 'function') return value
      return (...fnArgs: unknown[]) => {
        calls.push(String(prop))
        return value.apply(obj, fnArgs)
      }
    },
  })
  return { store: proxy, calls }
}

const WRITES = ['createPriceOption', 'createSession', 'addEnrollment', 'addEnrollments', 'createCharge', 'createCharges']

describe('the services use only the atomic paths', () => {
  const args = (overrides: Partial<CreateProgramArgs> = {}): CreateProgramArgs => ({
    name: 'Camp',
    audience: 'youth',
    weekdays: [0, 1, 2, 3, 4, 5, 6],
    startMin: 600,
    durationMin: 90,
    location: '',
    capacity: null,
    ageRange: '',
    startsOn: TODAY,
    endsOn: null,
    options: [
      { label: 'Weekly', basis: 'weekly', amountCents: 15000 },
      { label: 'Drop-in', basis: 'drop_in', amountCents: 3500 },
    ],
    ...overrides,
  })

  it('createProgram makes one atomic call and no piecemeal writes', async () => {
    const spy = recording(store)
    const program = await createProgram(spy.store, coachId, 'owner', args(), TODAY)
    expect(spy.calls.filter((c) => c === 'createProgramWithOptions')).toHaveLength(1)
    expect(spy.calls.filter((c) => WRITES.includes(c))).toEqual([])
    // 8 weeks of a daily program, all scheduled by that one call.
    expect((await store.listSessions(coachId)).filter((s) => s.programId === program.id)).toHaveLength(57)
  })

  it('createProgram leaves nothing behind when an option is rejected', async () => {
    const before = await counts()
    await expect(
      createProgram(
        store,
        coachId,
        'owner',
        args({
          options: [
            { label: 'Weekly', basis: 'weekly', amountCents: 15000 },
            { label: 'Bad', basis: 'drop_in', amountCents: -5 },
          ],
        }),
        TODAY,
      ),
    ).rejects.toThrow()
    expect(await counts()).toEqual(before)
  })

  it('enrollParticipant makes one atomic call, and leaves nothing behind if its last write fails', async () => {
    const program = await createProgram(store, coachId, 'owner', args(), TODAY)
    const option = (await store.listPriceOptions(coachId)).find(
      (o) => o.programId === program.id && o.label === 'Weekly',
    )!
    const playerId = (await store.listPlayers(coachId))[0].id
    const request = {
      programId: program.id,
      playerId,
      priceOptionId: option.id,
      customAmountCents: null,
      note: '',
    }

    // The very last write of the workflow fails.
    const before = await counts()
    const failing = vi.spyOn(store, 'createCharge').mockRejectedValueOnce(new Error('boom'))
    await expect(enrollParticipant(store, coachId, 'owner', request, TODAY)).rejects.toThrow('boom')
    failing.mockRestore()
    expect(await counts()).toEqual(before)

    // And when it works it is one atomic call, not a sequence of writes.
    const spy = recording(store)
    const result = await enrollParticipant(spy.store, coachId, 'owner', request, TODAY)
    expect(spy.calls.filter((c) => c === 'enrollInProgram')).toHaveLength(1)
    expect(spy.calls.filter((c) => WRITES.includes(c) || c === 'createProgramEnrollment')).toEqual([])
    expect(result.charged).toBe(true)
    const after = await counts()
    expect(after.places).toBe(before.places + 1)
    expect(after.charges).toBe(before.charges + 1)
  })
})

describe('SupabaseDataStore: one RPC per workflow', () => {
  type Call = { fn: string; args: any }

  /** A recording stand-in for the Supabase client. Reads return canned rows; any write is recorded. */
  function fakeClient(opts: {
    rpc: (fn: string) => { data: unknown; error: { message: string } | null }
    rows?: Record<string, unknown>
  }) {
    const rpcCalls: Call[] = []
    const writes: string[] = []
    const client = {
      rpc: async (fn: string, args: any) => {
        rpcCalls.push({ fn, args })
        return opts.rpc(fn)
      },
      from: (table: string) => {
        const q: any = {
          select: () => q,
          eq: () => q,
          single: async () => ({ data: opts.rows?.[table] ?? null, error: null }),
          maybeSingle: async () => ({ data: opts.rows?.[table] ?? null, error: null }),
        }
        for (const w of ['insert', 'update', 'upsert', 'delete']) {
          q[w] = () => {
            writes.push(`${w} ${table}`)
            return q
          }
        }
        return q
      },
    }
    return { client: client as any, rpcCalls, writes }
  }

  const programRow = {
    id: 'p1',
    academy_id: 'a1',
    name: 'Camp',
    audience: 'youth',
    weekdays: [1, 3],
    start_min: 600,
    duration_min: 90,
    location: '',
    capacity: null,
    age_range: '',
    starts_on: '2030-01-07',
    ends_on: null,
    status: 'active',
    created_at: '2030-01-01T00:00:00Z',
  }

  it('createProgramWithOptions sends the whole program in one create_program call', async () => {
    const { client, rpcCalls, writes } = fakeClient({
      rpc: () => ({ data: 'p1', error: null }),
      rows: { programs: programRow },
    })
    const program = await new SupabaseDataStore(client).createProgramWithOptions(
      'a1',
      programInput(),
      [weekly, dropIn],
      DATES,
    )
    expect(program.id).toBe('p1')
    expect(rpcCalls).toHaveLength(1)
    expect(rpcCalls[0].fn).toBe('create_program')
    expect(rpcCalls[0].args.p_program).toMatchObject({ name: 'Summer Camp', weekdays: [1, 3], start_min: 600 })
    expect(rpcCalls[0].args.p_options).toEqual([
      { label: 'Weekly', basis: 'weekly', amount_cents: 15000 },
      { label: 'Drop-in', basis: 'drop_in', amount_cents: 3500 },
    ])
    expect(rpcCalls[0].args.p_dates).toEqual(DATES)
    // Nothing is written outside the function.
    expect(writes).toEqual([])
  })

  it('createProgramWithOptions surfaces the database error and writes nothing else', async () => {
    const { client, writes } = fakeClient({
      rpc: () => ({ data: null, error: { message: 'new row violates check constraint' } }),
    })
    await expect(
      new SupabaseDataStore(client).createProgramWithOptions('a1', programInput(), [weekly], DATES),
    ).rejects.toThrow('new row violates check constraint')
    expect(writes).toEqual([])
  })

  const enrollRequest: EnrollInProgramInput = {
    enrollment: {
      programId: 'p1',
      playerId: 'pl1',
      joinedOn: '2030-01-07',
      priceOptionId: 'o1',
      agreedLabel: 'Weekly',
      agreedBasis: 'weekly',
      agreedAmountCents: 15000,
      standardAmountCents: 15000,
      agreementSource: 'program_option',
      agreementNote: '',
    },
    sessionIds: ['s1', 's2'],
    charge: {
      playerId: 'pl1',
      sessionId: null,
      amountCents: 15000,
      priceSource: 'program_option',
      priceBasis: 'weekly',
      standardAmountCents: 15000,
      programId: 'p1',
      periodStart: '2030-01-07',
      periodEnd: '2030-01-13',
      dueDate: '2030-01-07',
      isManual: false,
      label: 'Camp — Weekly',
      note: '',
    },
  }

  it('enrollInProgram sends place, occurrences and charge in one enroll_participant call', async () => {
    const { client, rpcCalls, writes } = fakeClient({
      rpc: () => ({ data: { enrollment_id: 'e1', charge_id: 'c1' }, error: null }),
      rows: {
        program_enrollments: {
          id: 'e1',
          academy_id: 'a1',
          program_id: 'p1',
          player_id: 'pl1',
          status: 'active',
          joined_on: '2030-01-07',
          agreed_label: 'Weekly',
          agreed_basis: 'weekly',
          agreed_amount_cents: 15000,
          agreement_source: 'program_option',
          created_at: '2030-01-07T00:00:00Z',
        },
        charges: { id: 'c1', academy_id: 'a1', player_id: 'pl1', amount_cents: 15000, price_source: 'program_option', due_date: '2030-01-07' },
      },
    })
    const result = await new SupabaseDataStore(client).enrollInProgram('a1', enrollRequest)
    expect(result.enrollment.id).toBe('e1')
    expect(result.charge?.id).toBe('c1')
    expect(rpcCalls).toHaveLength(1)
    expect(rpcCalls[0].fn).toBe('enroll_participant')
    expect(rpcCalls[0].args.p_session_ids).toEqual(['s1', 's2'])
    expect(rpcCalls[0].args.p_enrollment).toMatchObject({
      program_id: 'p1',
      price_option_id: 'o1',
      agreed_amount_cents: 15000,
      agreement_source: 'program_option',
    })
    expect(rpcCalls[0].args.p_charge).toMatchObject({
      amount_cents: 15000,
      price_source: 'program_option',
      period_end: '2030-01-13',
    })
    expect(writes).toEqual([])
  })

  it('enrollInProgram passes a null charge through and reads none back', async () => {
    const { client, rpcCalls } = fakeClient({
      rpc: () => ({ data: { enrollment_id: 'e1', charge_id: null }, error: null }),
      rows: {
        program_enrollments: {
          id: 'e1',
          academy_id: 'a1',
          program_id: 'p1',
          player_id: 'pl1',
          status: 'active',
          joined_on: '2030-01-07',
          agreed_basis: 'per_session',
          agreed_amount_cents: 4000,
          agreement_source: 'program_option',
        },
      },
    })
    const result = await new SupabaseDataStore(client).enrollInProgram('a1', {
      ...enrollRequest,
      charge: null,
    })
    expect(rpcCalls[0].args.p_charge).toBeNull()
    expect(result.charge).toBeNull()
  })

  it('enrollInProgram surfaces the database error and writes nothing else', async () => {
    const { client, writes } = fakeClient({
      rpc: () => ({ data: null, error: { message: 'A program charge must equal the agreed price' } }),
    })
    await expect(new SupabaseDataStore(client).enrollInProgram('a1', enrollRequest)).rejects.toThrow(
      'A program charge must equal the agreed price',
    )
    expect(writes).toEqual([])
  })
})
