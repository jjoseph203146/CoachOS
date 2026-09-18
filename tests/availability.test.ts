import { beforeEach, describe, expect, it } from 'vitest'
import { createTestStore, type MockDataStore } from '@/lib/data/mock/store'
import { addDays, todayISO } from '@/lib/domain/dates'
import { checkAvailability, strandedLessons, type HoursWindow } from '@/lib/domain/availability'
import { getMyAvailability, saveAvailability } from '@/lib/services/availability'
import { cancelSession, createSession } from '@/lib/services/sessions'

const TODAY = todayISO()
const ME = 'member-me'
const OTHER = 'member-other'

const dayOf = (iso: string) => new Date(iso + 'T12:00:00').getDay()
/** A date at least a week away that falls on the given weekday. */
function nextOn(weekday: number): string {
  for (let i = 7; i < 14; i++) if (dayOf(addDays(TODAY, i)) === weekday) return addDays(TODAY, i)
  throw new Error('unreachable')
}

let store: MockDataStore
let coachId: string

beforeEach(() => {
  const created = createTestStore('established')
  store = created.store
  coachId = created.coachId
})

const TUESDAY = 2
const tuesdayHours: HoursWindow[] = [{ weekday: TUESDAY, startMin: 9 * 60, endMin: 16 * 60 + 30 }]

const book = (
  date: string,
  startMin: number,
  extra: Partial<Parameters<typeof createSession>[2]> = {},
) =>
  createSession(store, coachId, {
    type: 'private',
    name: 'Lesson',
    date,
    startMin,
    durationMin: 60,
    priceCents: 7500,
    isFree: false,
    location: '',
    capacity: null,
    playerIds: ['p1'],
    allowConflict: true,
    coachMembershipId: ME,
    ...extra,
  })

describe('checking a time against availability', () => {
  it('is unrestricted until the coach sets any hours', () => {
    expect(checkAvailability([], '2026-09-22', 3 * 60, 60)).toEqual({ ok: true })
  })

  it('accepts a lesson wholly inside the day’s hours', () => {
    // 2026-09-22 is a Tuesday.
    expect(checkAvailability(tuesdayHours, '2026-09-22', 10 * 60, 60)).toEqual({ ok: true })
    expect(checkAvailability(tuesdayHours, '2026-09-22', 15 * 60 + 30, 60)).toEqual({ ok: true })
  })

  it('flags a day with no hours as having no availability', () => {
    expect(checkAvailability(tuesdayHours, '2026-09-23', 10 * 60, 60)).toMatchObject({
      ok: false,
      reason: 'none',
    })
  })

  it('flags a lesson that starts early or runs past the end as outside', () => {
    expect(checkAvailability(tuesdayHours, '2026-09-22', 8 * 60, 60)).toMatchObject({
      ok: false,
      reason: 'outside',
    })
    expect(checkAvailability(tuesdayHours, '2026-09-22', 16 * 60, 60)).toMatchObject({
      ok: false,
      reason: 'outside',
    }) // ends 5:00 PM, hours end 4:30 PM
  })
})

describe('booking against availability', () => {
  it('records who runs the lesson', async () => {
    const session = await book(nextOn(TUESDAY), 10 * 60)
    expect(session.coachMembershipId).toBe(ME)
  })

  it('books freely when no hours are set', async () => {
    await expect(book(nextOn(TUESDAY), 3 * 60)).resolves.toBeTruthy()
  })

  it('refuses a private lesson outside the hours unless the coach chooses to book anyway', async () => {
    await store.replaceAvailability(coachId, ME, tuesdayHours)

    await expect(book(nextOn(TUESDAY), 17 * 60)).rejects.toMatchObject({
      code: 'CONFLICT',
      message: expect.stringContaining('outside your Tuesday availability'),
    })
    await expect(book(nextOn(3), 10 * 60)).rejects.toMatchObject({
      code: 'CONFLICT',
      message: expect.stringContaining('not available on Wednesdays'),
    })
    await expect(
      book(nextOn(TUESDAY), 17 * 60, { allowOutsideAvailability: true }),
    ).resolves.toBeTruthy()
  })

  it('allows a lesson inside the hours', async () => {
    await store.replaceAvailability(coachId, ME, tuesdayHours)
    await expect(book(nextOn(TUESDAY), 10 * 60)).resolves.toBeTruthy()
  })

  it('applies to the coach who runs the lesson, not to anyone else’s hours', async () => {
    await store.replaceAvailability(coachId, OTHER, tuesdayHours)
    await expect(book(nextOn(3), 10 * 60)).resolves.toBeTruthy() // ME has no hours set
  })

  it('does not restrict group sessions', async () => {
    await store.replaceAvailability(coachId, ME, tuesdayHours)
    await expect(
      book(nextOn(3), 20 * 60, { type: 'group', capacity: 6, playerIds: ['p1', 'p2'] }),
    ).resolves.toBeTruthy()
  })
})

describe('saving availability', () => {
  it('saves hours, and dropping a day makes it unavailable', async () => {
    const two: HoursWindow[] = [
      { weekday: 1, startMin: 9 * 60, endMin: 17 * 60 },
      { weekday: 2, startMin: 9 * 60, endMin: 17 * 60 },
    ]
    expect(await saveAvailability(store, coachId, ME, two, TODAY)).toEqual({
      saved: true,
      conflicts: [],
    })
    expect((await getMyAvailability(store, coachId, ME)).map((w) => w.weekday)).toEqual([1, 2])

    await saveAvailability(store, coachId, ME, [two[0]], TODAY)
    expect((await getMyAvailability(store, coachId, ME)).map((w) => w.weekday)).toEqual([1])
  })

  it('keeps each coach’s hours separate', async () => {
    await saveAvailability(store, coachId, ME, tuesdayHours, TODAY)
    expect(await getMyAvailability(store, coachId, OTHER)).toEqual([])
  })

  it('rejects impossible hours and duplicate days', async () => {
    await expect(
      saveAvailability(store, coachId, ME, [{ weekday: 1, startMin: 600, endMin: 600 }], TODAY),
    ).rejects.toMatchObject({ code: 'INVALID' })
    await expect(
      saveAvailability(
        store,
        coachId,
        ME,
        [
          { weekday: 1, startMin: 600, endMin: 700 },
          { weekday: 1, startMin: 800, endMin: 900 },
        ],
        TODAY,
      ),
    ).rejects.toMatchObject({ code: 'INVALID' })
  })

  it('will not narrow hours underneath a booked lesson, and saves nothing', async () => {
    await saveAvailability(store, coachId, ME, tuesdayHours, TODAY)
    const lesson = await book(nextOn(TUESDAY), 15 * 60) // 3:00–4:00 PM: fits hours ending 4:30 PM

    // Tuesday narrowed to end at 2:30 PM would strand the 3 PM lesson.
    const result = await saveAvailability(
      store,
      coachId,
      ME,
      [{ weekday: TUESDAY, startMin: 9 * 60, endMin: 14 * 60 + 30 }],
      TODAY,
    )
    expect(result.saved).toBe(false)
    expect(result.conflicts).toEqual([
      expect.objectContaining({
        sessionId: lesson.id,
        startMin: 15 * 60,
        playerName: 'Maya Okonkwo',
      }),
    ])
    // Untouched.
    expect((await getMyAvailability(store, coachId, ME))[0].endMin).toBe(16 * 60 + 30)
  })

  it('ignores lessons that cannot be stranded: cancelled, past, someone else’s, or group', async () => {
    const sessions = await Promise.all([
      book(nextOn(TUESDAY), 16 * 60),
      book(nextOn(TUESDAY), 16 * 60, { coachMembershipId: OTHER }),
    ])
    await cancelSession(store, coachId, sessions[0].id, 'keep', TODAY)

    const all = await store.listSessions(coachId)
    const proposed: HoursWindow[] = [{ weekday: TUESDAY, startMin: 9 * 60, endMin: 12 * 60 }]
    // The cancelled one and the other coach's one are not ME's problem.
    expect(strandedLessons(proposed, all, ME, TODAY)).toEqual([])

    // A lesson already in the past is not stranded either.
    const past = { ...all[0], type: 'private' as const, status: 'scheduled' as const, coachMembershipId: ME, date: addDays(TODAY, -3), startMin: 16 * 60 }
    expect(strandedLessons(proposed, [past], ME, TODAY)).toEqual([])
  })

  it('clearing every day removes the restriction', async () => {
    await saveAvailability(store, coachId, ME, tuesdayHours, TODAY)
    await saveAvailability(store, coachId, ME, [], TODAY)
    await expect(book(nextOn(3), 3 * 60)).resolves.toBeTruthy()
  })
})
