import { beforeEach, describe, expect, it } from 'vitest'
import { createTestStore, type MockDataStore } from '@/lib/data/mock/store'
import { addDays, todayISO } from '@/lib/domain/dates'
import { categoryOf, percentChange, weekStart } from '@/lib/domain/revenue'
import { loadRevenue, recordRevenue } from '@/lib/services/revenue'
import { createProgram, enrollParticipant } from '@/lib/services/programs'
import { createSession } from '@/lib/services/sessions'
import { recordPayment } from '@/lib/services/finance'

const TODAY = todayISO()

let store: MockDataStore
let coachId: string

beforeEach(() => {
  const created = createTestStore('established')
  store = created.store
  coachId = created.coachId
})

const record = (over: Partial<Parameters<typeof recordRevenue>[3]> = {}, role: 'owner' | 'coach' = 'owner') =>
  recordRevenue(
    store,
    coachId,
    role,
    { playerId: 'p1', amountCents: 6000, category: 'private', paidOn: TODAY, note: '', ...over },
    TODAY,
  )

describe('pure rules', () => {
  it('weeks run Monday to Sunday', () => {
    // 2026-09-14 is a Monday.
    expect(weekStart('2026-09-14')).toBe('2026-09-14')
    expect(weekStart('2026-09-17')).toBe('2026-09-14')
    expect(weekStart('2026-09-20')).toBe('2026-09-14') // Sunday belongs to the week before it
    expect(weekStart('2026-09-21')).toBe('2026-09-21')
  })

  it('reports change against last week, or nothing when there is no baseline', () => {
    expect(percentChange(150, 100)).toBe(50)
    expect(percentChange(50, 100)).toBe(-50)
    expect(percentChange(100, 0)).toBeNull()
  })

  it('categorises a payment by what it paid for', () => {
    const base = { id: 'c', isManual: false, label: '', sessionId: null } as any
    expect(categoryOf(undefined, undefined, undefined)).toBe('other')
    expect(categoryOf(base, { type: 'private' } as any, undefined)).toBe('private')
    expect(categoryOf(base, { type: 'group' } as any, undefined)).toBe('group')
    expect(categoryOf(base, undefined, { audience: 'youth' } as any)).toBe('youth')
    expect(categoryOf(base, undefined, { audience: 'adult' } as any)).toBe('adult')
    expect(categoryOf({ ...base, isManual: true, label: 'Youth Program' }, undefined, undefined)).toBe('youth')
    expect(categoryOf({ ...base, isManual: true, label: 'Racquet restring' }, undefined, undefined)).toBe('other')
  })
})

describe('the revenue summary', () => {
  it('counts money received, and matches an independent tally of the payments', async () => {
    const summary = await loadRevenue(store, coachId, TODAY)
    const payments = await store.listPayments(coachId)

    const sum = (pred: (d: string) => boolean) =>
      payments.filter((p) => pred(p.paidOn)).reduce((n, p) => n + p.amountCents, 0)
    const start = weekStart(TODAY)

    expect(summary.todayCents).toBe(sum((d) => d === TODAY))
    expect(summary.weekCents).toBe(sum((d) => d >= start && d <= addDays(start, 6)))
    expect(summary.monthCents).toBe(sum((d) => d.slice(0, 7) === TODAY.slice(0, 7) && d <= TODAY))
    // The chart's seven bars add up to the week.
    expect(summary.weekDays).toHaveLength(7)
    expect(summary.weekDays.reduce((n, d) => n + d.cents, 0)).toBe(summary.weekCents)
    expect(summary.weekDays.filter((d) => d.isToday)).toHaveLength(1)
  })

  it('does not count what is merely owed', async () => {
    const before = await loadRevenue(store, coachId, TODAY)
    // A new charge that nobody has paid adds nothing.
    await createSession(store, coachId, {
      type: 'private', name: 'L', date: addDays(TODAY, 3), startMin: 600, durationMin: 60,
      priceCents: 50000, isFree: false, location: '', capacity: null, playerIds: ['p1'],
      allowConflict: true,
    })
    expect((await loadRevenue(store, coachId, TODAY)).monthCents).toBe(before.monthCents)
  })

  it('splits the month by category and the shares add up', async () => {
    await record({ amountCents: 4000, category: 'youth' })
    await record({ amountCents: 2000, category: 'adult', playerId: 'p2' })
    const { categories, monthCents } = await loadRevenue(store, coachId, TODAY)

    expect(categories.reduce((n, c) => n + c.cents, 0)).toBe(monthCents)
    expect(categories.find((c) => c.key === 'youth')!.cents).toBeGreaterThanOrEqual(4000)
    expect(categories.map((c) => c.cents)).toEqual([...categories.map((c) => c.cents)].sort((a, b) => b - a))
    expect(categories.every((c) => c.cents > 0)).toBe(true)
  })

  it('attributes program payments to the program’s audience', async () => {
    const program = await createProgram(
      store, coachId, 'owner',
      {
        name: 'Adult Clinic', audience: 'adult', weekdays: [2], startMin: 1140, durationMin: 90,
        location: '', capacity: null, ageRange: '', startsOn: TODAY, endsOn: null,
        options: [{ label: 'Weekly', basis: 'weekly', amountCents: 12000 }],
      },
      TODAY,
    )
    const option = (await store.listPriceOptions(coachId))[0]
    const { enrollment } = await enrollParticipant(
      store, coachId, 'owner',
      { programId: program.id, playerId: 'p1', priceOptionId: option.id, customAmountCents: null, note: '' },
      TODAY,
    )
    const charge = (await store.listCharges(coachId)).find((c) => c.programEnrollmentId === enrollment.id)!
    await recordPayment(store, coachId, { chargeId: charge.id, amountCents: 12000, today: TODAY })

    const summary = await loadRevenue(store, coachId, TODAY)
    expect(summary.categories.find((c) => c.key === 'adult')!.cents).toBe(12000)
  })

  it('lists the latest payments newest first, with who and what', async () => {
    await record({ amountCents: 1234, note: 'cash', paidOn: TODAY })
    const { recent } = await loadRevenue(store, coachId, TODAY)
    expect(recent.length).toBeLessThanOrEqual(5)
    expect(recent[0]).toMatchObject({ cents: 1234, paidOn: TODAY, label: 'Private Lesson' })
    const dates = recent.map((r) => r.paidOn)
    expect(dates).toEqual([...dates].sort().reverse())
  })
})

describe('recording revenue', () => {
  it('creates a paid manual charge, so revenue and the books agree', async () => {
    const chargesBefore = (await store.listCharges(coachId)).length
    const before = (await loadRevenue(store, coachId, TODAY)).todayCents
    await record({ amountCents: 6000, category: 'youth' })

    const charges = await store.listCharges(coachId)
    expect(charges).toHaveLength(chargesBefore + 1)
    const created = charges[charges.length - 1]
    expect(created).toMatchObject({
      isManual: true,
      priceSource: 'manual',
      label: 'Youth Program',
      amountCents: 6000,
    })
    const payments = (await store.listPayments(coachId)).filter((p) => p.chargeId === created.id)
    expect(payments).toHaveLength(1)
    expect(payments[0]).toMatchObject({ amountCents: 6000, paidOn: TODAY })
    expect((await loadRevenue(store, coachId, TODAY)).todayCents).toBe(before + 6000)
  })

  it('can be dated in the past but never the future', async () => {
    const past = addDays(TODAY, -3)
    await record({ paidOn: past, amountCents: 700 })
    expect((await store.listPayments(coachId)).some((p) => p.paidOn === past && p.amountCents === 700)).toBe(true)
    await expect(record({ paidOn: addDays(TODAY, 1) })).rejects.toMatchObject({ code: 'INVALID' })
  })

  it('is owner-only, and validates the amount, player and category', async () => {
    await expect(record({}, 'coach')).rejects.toMatchObject({ code: 'FORBIDDEN' })
    await expect(record({ amountCents: 0 })).rejects.toMatchObject({ code: 'INVALID' })
    await expect(record({ playerId: 'nobody' })).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await expect(record({ category: 'bogus' as any })).rejects.toMatchObject({ code: 'INVALID' })
  })

  it('leaves nothing behind when it is refused', async () => {
    const charges = (await store.listCharges(coachId)).length
    const payments = (await store.listPayments(coachId)).length
    await expect(record({ amountCents: -5 })).rejects.toBeTruthy()
    await expect(record({ playerId: 'nobody' })).rejects.toBeTruthy()
    expect(await store.listCharges(coachId)).toHaveLength(charges)
    expect(await store.listPayments(coachId)).toHaveLength(payments)
  })
})
