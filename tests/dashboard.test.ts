import { beforeEach, describe, expect, it } from 'vitest'
import { createTestStore, type MockDataStore } from '@/lib/data/mock/store'
import { todayISO } from '@/lib/domain/dates'
import { loadDashboard } from '@/lib/services/dashboard'

/**
 * The stat strip on Today: sessions and players today, minutes scheduled, and
 * money received today. Expected values are derived from the store's own rows
 * so the test doesn't hard-code the seed.
 */

const TODAY = todayISO()
const CLOCK = { today: TODAY, nowMinutes: 12 * 60 }

let store: MockDataStore
let coachId: string

beforeEach(() => {
  const created = createTestStore('established')
  store = created.store
  coachId = created.coachId
})

describe('today stats', () => {
  it('counts today’s live sessions, their players and their minutes', async () => {
    const model = await loadDashboard(store, coachId, CLOCK)

    const sessions = (await store.listSessions(coachId)).filter(
      (s) => s.date === TODAY && s.status !== 'cancelled',
    )
    const enrollments = await store.listEnrollments(coachId)
    const ids = new Set(sessions.map((s) => s.id))

    expect(model.todayCount).toBe(sessions.length)
    expect(model.todayCount).toBeGreaterThan(0)
    expect(model.todayPlayers).toBe(enrollments.filter((e) => ids.has(e.sessionId)).length)
    expect(model.todayMinutes).toBe(sessions.reduce((n, s) => n + s.durationMin, 0))
  })

  it('does not count cancelled sessions', async () => {
    const before = (await loadDashboard(store, coachId, CLOCK)).todayCount
    const [target] = (await store.listSessions(coachId)).filter(
      (s) => s.date === TODAY && s.status !== 'cancelled',
    )
    await store.updateSession(coachId, target.id, {
      status: 'cancelled',
      cancelledAt: new Date().toISOString(),
    })

    expect((await loadDashboard(store, coachId, CLOCK)).todayCount).toBe(before - 1)
  })

  it('reports money received today, and only today', async () => {
    const payments = await store.listPayments(coachId)
    const expected = payments
      .filter((p) => p.paidOn === TODAY)
      .reduce((n, p) => n + p.amountCents, 0)

    const model = await loadDashboard(store, coachId, CLOCK)
    expect(model.revenueTodayCents).toBe(expected)

    // A payment recorded on another day never leaks into today's number.
    const charge = (await store.listCharges(coachId)).find((c) => !c.voidedAt)!
    await store.recordPayment(coachId, {
      chargeId: charge.id,
      amountCents: 1,
      paidOn: '2000-01-01',
      note: '',
    })
    expect((await loadDashboard(store, coachId, CLOCK)).revenueTodayCents).toBe(expected)
  })

  it('carries what attendance items need to render', async () => {
    const model = await loadDashboard(store, coachId, CLOCK)
    const attendance = model.attention.filter((a) => a.kind === 'attendance')
    for (const item of attendance) {
      expect(item.subject).toBeTruthy()
      expect(item.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    }
  })
})
