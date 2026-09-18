import { beforeEach, describe, expect, it } from 'vitest'
import { createTestStore, type MockDataStore } from '@/lib/data/mock/store'
import { addDays, todayISO } from '@/lib/domain/dates'
import { billingPeriod, occurrenceDates, weekdaysLabel } from '@/lib/domain/programs'
import { attendanceMissing, attendanceState } from '@/lib/domain/sessions'
import {
  archivePriceOption,
  billPlace,
  createProgram,
  endPlace,
  endProgram,
  enrollParticipant,
  extendProgram,
  generateOccurrences,
  listPrograms,
  loadProgramDetail,
  setExpected,
  updatePriceOption,
  type CreateProgramArgs,
} from '@/lib/services/programs'
import { saveAttendance, updateSession } from '@/lib/services/sessions'

const TODAY = todayISO()

let store: MockDataStore
let coachId: string

beforeEach(() => {
  const created = createTestStore('established')
  store = created.store
  coachId = created.coachId
})

const baseArgs = (overrides: Partial<CreateProgramArgs> = {}): CreateProgramArgs => ({
  name: 'Summer Camp',
  audience: 'youth',
  weekdays: [0, 1, 2, 3, 4, 5, 6],
  startMin: 600,
  durationMin: 180,
  location: 'Main Courts',
  capacity: null,
  ageRange: '6–12',
  startsOn: TODAY,
  endsOn: null,
  options: [
    { label: 'Weekly', basis: 'weekly', amountCents: 15000 },
    { label: 'Drop-in', basis: 'drop_in', amountCents: 3500 },
    { label: 'Per session', basis: 'per_session', amountCents: 4000 },
    { label: 'Full summer', basis: 'full_program', amountCents: 90000 },
  ],
  ...overrides,
})

async function makeProgram(overrides: Partial<CreateProgramArgs> = {}) {
  const program = await createProgram(store, coachId, 'owner', baseArgs(overrides), TODAY)
  const options = (await store.listPriceOptions(coachId)).filter((o) => o.programId === program.id)
  const option = (label: string) => options.find((o) => o.label === label)!
  return { program, option }
}

const enroll = (
  programId: string,
  playerId: string,
  optionId: string | null,
  role: 'owner' | 'coach' = 'owner',
  custom: number | null = null,
) =>
  enrollParticipant(
    store,
    coachId,
    role,
    { programId, playerId, priceOptionId: optionId, customAmountCents: custom, note: '' },
    TODAY,
  )

const chargesFor = async (playerId: string, programId: string) =>
  (await store.listCharges(coachId)).filter(
    (c) => c.playerId === playerId && c.programId === programId,
  )

describe('pure program rules', () => {
  it('lists the dates a program meets, clipped to its own dates', () => {
    // 2026-09-14 is a Monday.
    const program = { weekdays: [1, 3], startsOn: '2026-09-01', endsOn: '2026-09-16' }
    expect(occurrenceDates(program, '2026-09-14', '2026-09-30')).toEqual([
      '2026-09-14',
      '2026-09-16',
    ])
  })

  it('bills weekly and monthly prices by period, and nothing else', () => {
    expect(billingPeriod('weekly', '2026-09-14')).toEqual({ start: '2026-09-14', end: '2026-09-20' })
    expect(billingPeriod('monthly', '2026-09-14')).toEqual({
      start: '2026-09-14',
      end: '2026-10-13',
    })
    expect(billingPeriod('monthly', '2026-01-31')).toEqual({
      start: '2026-01-31',
      end: '2026-02-27',
    })
    expect(billingPeriod('drop_in', '2026-09-14')).toBeNull()
    expect(billingPeriod('full_program', '2026-09-14')).toBeNull()
  })

  it('labels days compactly', () => {
    expect(weekdaysLabel([1, 2, 3, 4])).toBe('Mon–Thu')
    expect(weekdaysLabel([2])).toBe('Tue')
    expect(weekdaysLabel([1, 3, 5])).toBe('Mon, Wed, Fri')
  })
})

describe('defining programs (owner only)', () => {
  it('a coach cannot create a program or change its prices', async () => {
    await expect(createProgram(store, coachId, 'coach', baseArgs(), TODAY)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })
    const { option } = await makeProgram()
    await expect(
      updatePriceOption(store, coachId, 'coach', option('Weekly').id, { amountCents: 1 }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    await expect(
      archivePriceOption(store, coachId, 'coach', option('Weekly').id),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  it('needs a name, a day, and at least one price option', async () => {
    await expect(
      createProgram(store, coachId, 'owner', baseArgs({ name: ' ' }), TODAY),
    ).rejects.toMatchObject({ code: 'INVALID' })
    await expect(
      createProgram(store, coachId, 'owner', baseArgs({ weekdays: [] }), TODAY),
    ).rejects.toMatchObject({ code: 'INVALID' })
    await expect(
      createProgram(store, coachId, 'owner', baseArgs({ options: [] }), TODAY),
    ).rejects.toMatchObject({ code: 'INVALID' })
  })

  it('has no price of its own; its occurrences are unpriced group sessions', async () => {
    const { program } = await makeProgram()
    const sessions = (await store.listSessions(coachId)).filter((s) => s.programId === program.id)
    expect(sessions.length).toBeGreaterThan(50)
    for (const session of sessions) {
      expect(session.type).toBe('group')
      expect(session.priceCents).toBe(0)
      expect(session.name).toBe('Summer Camp')
    }
  })

  it('generating occurrences is idempotent, and extending continues after the last one', async () => {
    const { program } = await makeProgram({ weekdays: [1] })
    const count = () =>
      store.listSessions(coachId).then((all) => all.filter((s) => s.programId === program.id).length)
    const before = await count()
    expect(await generateOccurrences(store, coachId, program.id, TODAY, addDays(TODAY, 56))).toBe(0)
    expect(await count()).toBe(before)

    expect(await extendProgram(store, coachId, program.id, TODAY)).toBeGreaterThan(0)
    expect(await count()).toBeGreaterThan(before)
  })
})

describe('enrolling: the agreement is a snapshot, the charge copies it', () => {
  it('a weekly option snapshots the agreement and bills the first week', async () => {
    const { program, option } = await makeProgram()
    const { enrollment, charged } = await enroll(program.id, 'p1', option('Weekly').id)

    expect(charged).toBe(true)
    expect(enrollment).toMatchObject({
      agreedLabel: 'Weekly',
      agreedBasis: 'weekly',
      agreedAmountCents: 15000,
      standardAmountCents: 15000,
      agreementSource: 'program_option',
    })
    const [charge] = await chargesFor('p1', program.id)
    expect(charge).toMatchObject({
      amountCents: 15000,
      priceSource: 'program_option',
      priceBasis: 'weekly',
      standardAmountCents: 15000,
      programEnrollmentId: enrollment.id,
      periodStart: TODAY,
      periodEnd: addDays(TODAY, 6),
    })
  })

  it('drop-in and full-program places are billed once; per-session places not until they attend', async () => {
    const { program, option } = await makeProgram()
    await enroll(program.id, 'p1', option('Drop-in').id)
    await enroll(program.id, 'p2', option('Full summer').id)
    await enroll(program.id, 'p3', option('Per session').id)

    expect((await chargesFor('p1', program.id)).map((c) => c.amountCents)).toEqual([3500])
    expect((await chargesFor('p2', program.id)).map((c) => c.amountCents)).toEqual([90000])
    expect(await chargesFor('p3', program.id)).toHaveLength(0)
  })

  it('a per-session participant is charged once per session attended, at their agreed price', async () => {
    const { program, option } = await makeProgram()
    await enroll(program.id, 'p3', option('Per session').id)
    const session = (await store.listSessions(coachId))
      .filter((s) => s.programId === program.id)
      .sort((a, b) => (a.date < b.date ? -1 : 1))[0]

    await saveAttendance(store, coachId, session.id, [{ playerId: 'p3', attendance: 'present' }])
    await saveAttendance(store, coachId, session.id, [{ playerId: 'p3', attendance: 'present' }])

    const charges = await chargesFor('p3', program.id)
    expect(charges).toHaveLength(1)
    expect(charges[0]).toMatchObject({
      amountCents: 4000,
      sessionId: session.id,
      priceBasis: 'per_session',
      priceSource: 'program_option',
    })
  })

  it('a participant marked absent is not charged for that session', async () => {
    const { program, option } = await makeProgram()
    await enroll(program.id, 'p3', option('Per session').id)
    const session = (await store.listSessions(coachId)).find((s) => s.programId === program.id)!
    await saveAttendance(store, coachId, session.id, [{ playerId: 'p3', attendance: 'absent' }])
    expect(await chargesFor('p3', program.id)).toHaveLength(0)
  })

  it('a coach can enrol at a standard option, but a custom price is the owner’s', async () => {
    const { program, option } = await makeProgram()
    await expect(enroll(program.id, 'p1', option('Weekly').id, 'coach')).resolves.toBeTruthy()

    await expect(
      enroll(program.id, 'p2', option('Weekly').id, 'coach', 10000),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    expect(
      (await store.listProgramEnrollments(coachId)).some((e) => e.playerId === 'p2'),
    ).toBe(false)

    // Sending the standard amount is not a departure from it.
    await expect(enroll(program.id, 'p2', option('Weekly').id, 'coach', 15000)).resolves.toBeTruthy()
  })

  it('an owner can agree a custom price; the standard stays on the record and the charge follows', async () => {
    const { program, option } = await makeProgram()
    const { enrollment } = await enroll(program.id, 'p1', option('Weekly').id, 'owner', 10000)

    expect(enrollment).toMatchObject({
      agreedAmountCents: 10000,
      standardAmountCents: 15000,
      agreementSource: 'custom',
    })
    const [charge] = await chargesFor('p1', program.id)
    expect(charge).toMatchObject({
      amountCents: 10000,
      standardAmountCents: 15000,
      priceSource: 'custom',
    })
  })

  it('a $0 custom agreement enrols without creating a charge', async () => {
    const { program, option } = await makeProgram()
    await enroll(program.id, 'p1', option('Weekly').id, 'owner', 0)
    expect(await chargesFor('p1', program.id)).toHaveLength(0)
  })

  it('refuses double enrolment, unavailable players and a full program', async () => {
    const { program, option } = await makeProgram({ capacity: 2 })
    await enroll(program.id, 'p1', option('Weekly').id)
    await expect(enroll(program.id, 'p1', option('Weekly').id)).rejects.toMatchObject({
      code: 'CONFLICT',
    })
    await expect(enroll(program.id, 'p7', option('Weekly').id)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    }) // archived player
    await enroll(program.id, 'p2', option('Weekly').id)
    await expect(enroll(program.id, 'p3', option('Weekly').id)).rejects.toMatchObject({
      code: 'CONFLICT',
    })
  })

  it('requires a standard option unless the owner describes a custom one', async () => {
    const { program } = await makeProgram()
    await expect(enroll(program.id, 'p1', null)).rejects.toMatchObject({ code: 'INVALID' })
    await expect(enroll(program.id, 'p1', null, 'owner', 5000)).rejects.toMatchObject({
      code: 'INVALID',
    })
    const { enrollment } = await enrollParticipant(
      store,
      coachId,
      'owner',
      {
        programId: program.id,
        playerId: 'p1',
        priceOptionId: null,
        customAmountCents: 5000,
        customLabel: 'Scholarship',
        note: 'Sponsored',
      },
      TODAY,
    )
    expect(enrollment).toMatchObject({
      agreedLabel: 'Scholarship',
      agreedBasis: 'custom',
      standardAmountCents: null,
      agreementNote: 'Sponsored',
    })
  })
})

describe('changing a program’s price never rewrites what was agreed', () => {
  it('leaves an existing agreement and its charges alone, and applies only to new enrolments', async () => {
    const { program, option } = await makeProgram()
    const { enrollment } = await enroll(program.id, 'p1', option('Weekly').id)

    await updatePriceOption(store, coachId, 'owner', option('Weekly').id, { amountCents: 20000 })

    const place = (await store.listProgramEnrollments(coachId)).find((e) => e.id === enrollment.id)!
    expect(place.agreedAmountCents).toBe(15000)
    expect(place.standardAmountCents).toBe(15000)
    const [charge] = await chargesFor('p1', program.id)
    expect(charge.amountCents).toBe(15000)
    expect(charge.standardAmountCents).toBe(15000)

    // Billing the next week still uses the AGREEMENT, not the option's new price.
    await billPlace(store, coachId, enrollment.id, TODAY)
    const amounts = (await chargesFor('p1', program.id)).map((c) => c.amountCents)
    expect(amounts).toEqual([15000, 15000])

    // A newcomer pays the new price.
    await enroll(program.id, 'p2', option('Weekly').id)
    expect((await chargesFor('p2', program.id))[0].amountCents).toBe(20000)
  })

  it('an archived option cannot be chosen, but the agreements that used it are unaffected', async () => {
    const { program, option } = await makeProgram()
    const { enrollment } = await enroll(program.id, 'p1', option('Drop-in').id)
    await archivePriceOption(store, coachId, 'owner', option('Drop-in').id)

    await expect(enroll(program.id, 'p2', option('Drop-in').id)).rejects.toMatchObject({
      code: 'INVALID',
    })
    const place = (await store.listProgramEnrollments(coachId)).find((e) => e.id === enrollment.id)!
    expect(place.agreedLabel).toBe('Drop-in')
    expect(place.agreedAmountCents).toBe(3500)
  })
})

describe('recurring billing', () => {
  it('bills weekly periods back to back', async () => {
    const { program, option } = await makeProgram()
    const { enrollment } = await enroll(program.id, 'p1', option('Weekly').id)
    await billPlace(store, coachId, enrollment.id, TODAY)
    await billPlace(store, coachId, enrollment.id, TODAY)

    const periods = (await chargesFor('p1', program.id))
      .map((c) => [c.periodStart, c.periodEnd])
      .sort()
    expect(periods).toEqual([
      [TODAY, addDays(TODAY, 6)],
      [addDays(TODAY, 7), addDays(TODAY, 13)],
      [addDays(TODAY, 14), addDays(TODAY, 20)],
    ])
  })

  it('will not bill past the program’s end, or bill a one-off place twice', async () => {
    const { program, option } = await makeProgram({ endsOn: addDays(TODAY, 5) })
    const weekly = await enroll(program.id, 'p1', option('Weekly').id)
    await expect(billPlace(store, coachId, weekly.enrollment.id, TODAY)).rejects.toMatchObject({
      code: 'CONFLICT',
    })

    const dropIn = await enroll(program.id, 'p2', option('Drop-in').id)
    await expect(billPlace(store, coachId, dropIn.enrollment.id, TODAY)).rejects.toMatchObject({
      code: 'CONFLICT',
    })
  })

  it('per-session places are not billed manually', async () => {
    const { program, option } = await makeProgram()
    const { enrollment } = await enroll(program.id, 'p3', option('Per session').id)
    await expect(billPlace(store, coachId, enrollment.id, TODAY)).rejects.toMatchObject({
      code: 'INVALID',
    })
  })
})

describe('the roster and the expected list', () => {
  it('puts a new participant on upcoming occurrences as expected, and ending removes them but keeps charges', async () => {
    const { program, option } = await makeProgram()
    const { enrollment } = await enroll(program.id, 'p1', option('Weekly').id)

    const sessionIds = (await store.listSessions(coachId))
      .filter((s) => s.programId === program.id)
      .map((s) => s.id)
    const onSessions = async () =>
      (await store.listEnrollments(coachId)).filter(
        (e) => e.playerId === 'p1' && sessionIds.includes(e.sessionId),
      )
    expect((await onSessions()).length).toBe(sessionIds.length)
    expect((await onSessions()).every((e) => e.expected)).toBe(true)

    await endPlace(store, coachId, enrollment.id, TODAY)
    // Future occurrences (after today) drop them; today's stays until it happens.
    expect((await onSessions()).length).toBeLessThan(sessionIds.length)
    expect((await chargesFor('p1', program.id)).length).toBe(1)
    const detail = await loadProgramDetail(store, coachId, program.id, TODAY)
    expect(detail.roster).toHaveLength(0)
  })

  it('a non-expected player who never turned up does not make attendance incomplete', async () => {
    const { program, option } = await makeProgram()
    await enroll(program.id, 'p1', option('Weekly').id)
    await enroll(program.id, 'p2', option('Weekly').id)
    const session = (await store.listSessions(coachId)).find((s) => s.programId === program.id)!

    await setExpected(store, coachId, session.id, [{ playerId: 'p2', expected: false }])
    await saveAttendance(store, coachId, session.id, [{ playerId: 'p1', attendance: 'present' }])

    const enrollments = await store.listEnrollmentsForSession(coachId, session.id)
    expect(attendanceState(session, enrollments)).toBe('complete')

    // ...and once that occurrence is long past it is not reported as missing.
    const past = { ...session, date: addDays(TODAY, -10) }
    expect(attendanceMissing(past, enrollments, { today: TODAY, nowMinutes: 720 }, 0)).toBe(false)
  })

  it('but a non-expected player who WAS marked still counts', async () => {
    const { program, option } = await makeProgram()
    await enroll(program.id, 'p1', option('Weekly').id)
    const session = (await store.listSessions(coachId)).find((s) => s.programId === program.id)!
    await setExpected(store, coachId, session.id, [{ playerId: 'p1', expected: false }])
    await saveAttendance(store, coachId, session.id, [{ playerId: 'p1', attendance: 'absent' }])
    const enrollments = await store.listEnrollmentsForSession(coachId, session.id)
    expect(attendanceState(session, enrollments)).toBe('complete')
  })

  it('rejects an expected list for players who are not on the session', async () => {
    const { program } = await makeProgram()
    const session = (await store.listSessions(coachId)).find((s) => s.programId === program.id)!
    await expect(
      setExpected(store, coachId, session.id, [{ playerId: 'p1', expected: false }]),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })
})

describe('program occurrences and ending a program', () => {
  it('an occurrence can be rescheduled without a session price', async () => {
    const { program } = await makeProgram()
    const session = (await store.listSessions(coachId)).find((s) => s.programId === program.id)!
    await expect(
      updateSession(
        store,
        coachId,
        session.id,
        {
          name: session.name,
          date: session.date,
          startMin: session.startMin + 30,
          durationMin: session.durationMin,
          priceCents: 0,
          location: session.location,
          capacity: null,
        },
        TODAY,
        'coach',
      ),
    ).resolves.toMatchObject({ requiresPriceDecision: false })
  })

  it('only the owner can end a program; ending cancels future sessions and closes the roster, keeping charges', async () => {
    const { program, option } = await makeProgram()
    await enroll(program.id, 'p1', option('Weekly').id)

    await expect(endProgram(store, coachId, 'coach', program.id, TODAY)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })
    await endProgram(store, coachId, 'owner', program.id, TODAY)

    expect((await store.getProgram(coachId, program.id))!.status).toBe('ended')
    const future = (await store.listSessions(coachId)).filter(
      (s) => s.programId === program.id && s.date > TODAY,
    )
    expect(future.length).toBeGreaterThan(0)
    expect(future.every((s) => s.status === 'cancelled')).toBe(true)
    expect((await store.listProgramEnrollments(coachId))[0].status).toBe('ended')
    expect(await chargesFor('p1', program.id)).toHaveLength(1)
    await expect(enroll(program.id, 'p2', option('Weekly').id)).rejects.toMatchObject({
      code: 'CONFLICT',
    })
  })

  it('lists programs with their roster size and next occurrence', async () => {
    const { program, option } = await makeProgram()
    await enroll(program.id, 'p1', option('Weekly').id)
    const [item] = await listPrograms(store, coachId, TODAY)
    expect(item.program.id).toBe(program.id)
    expect(item.activeCount).toBe(1)
    expect(item.nextOccurrence?.date).toBe(TODAY)
  })
})
