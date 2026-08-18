import { describe, expect, it } from 'vitest'
import {
  chargeStatusOf,
  creditFits,
  outstandingCentsOf,
  paymentFits,
  revenueBetween,
  viewCharge,
} from '@/lib/domain/finance'
import type { Charge, Credit, Payment } from '@/lib/domain/types'

const TODAY = '2026-08-16'

function charge(overrides: Partial<Charge> = {}): Charge {
  return {
    id: 'c1',
    coachId: 'coach',
    playerId: 'p1',
    sessionId: 's1',
    amountCents: 5000,
    dueDate: TODAY,
    isManual: false,
    label: '',
    note: '',
    voidedAt: null,
    voidNote: '',
    createdAt: '2026-08-01T00:00:00Z',
    ...overrides,
  }
}

function payment(amountCents: number, paidOn = TODAY): Payment {
  return {
    id: `pay-${amountCents}-${paidOn}`,
    coachId: 'coach',
    chargeId: 'c1',
    amountCents,
    paidOn,
    note: '',
    createdAt: '2026-08-01T00:00:00Z',
  }
}

function credit(amountCents: number): Credit {
  return {
    id: `cr-${amountCents}`,
    coachId: 'coach',
    chargeId: 'c1',
    amountCents,
    reason: '',
    createdAt: '2026-08-01T00:00:00Z',
  }
}

describe('outstanding balance', () => {
  it('$50 charge -> $50 outstanding', () => {
    expect(outstandingCentsOf(charge(), [], [])).toBe(5000)
  })

  it('$50 charge + $20 payment -> $30 outstanding', () => {
    expect(outstandingCentsOf(charge(), [payment(2000)], [])).toBe(3000)
  })

  it('$50 charge + $50 payment -> $0 outstanding', () => {
    expect(outstandingCentsOf(charge(), [payment(5000)], [])).toBe(0)
  })

  it('$50 charge + $20 credit -> $30 outstanding', () => {
    expect(outstandingCentsOf(charge(), [], [credit(2000)])).toBe(3000)
  })

  it('voided $50 charge -> $0 outstanding', () => {
    const voided = charge({ voidedAt: '2026-08-10T00:00:00Z' })
    expect(outstandingCentsOf(voided, [], [])).toBe(0)
  })

  it('combines payments and credits, and never goes below zero', () => {
    expect(outstandingCentsOf(charge(), [payment(3000)], [credit(2000)])).toBe(0)
    expect(outstandingCentsOf(charge(), [payment(3000)], [credit(9000)])).toBe(0)
  })
})

describe('charge status', () => {
  it('labels a settled charge paid when money was received', () => {
    expect(chargeStatusOf(charge(), [payment(5000)], [], TODAY)).toBe('paid')
  })

  it('labels a fully written-down charge credited', () => {
    expect(chargeStatusOf(charge(), [], [credit(5000)], TODAY)).toBe('credited')
  })

  it('labels a voided charge voided regardless of activity', () => {
    const voided = charge({ voidedAt: '2026-08-10T00:00:00Z' })
    expect(chargeStatusOf(voided, [], [], TODAY)).toBe('voided')
  })

  it('labels an unpaid charge past its due date overdue', () => {
    const late = charge({ dueDate: '2026-08-10' })
    expect(chargeStatusOf(late, [], [], TODAY)).toBe('overdue')
  })

  it('labels a part-paid, not-yet-due charge partial', () => {
    const future = charge({ dueDate: '2026-08-20' })
    expect(chargeStatusOf(future, [payment(2000)], [], TODAY)).toBe('partial')
  })

  it('labels an untouched, not-yet-due charge unpaid', () => {
    const future = charge({ dueDate: '2026-08-20' })
    expect(chargeStatusOf(future, [], [], TODAY)).toBe('unpaid')
  })
})

describe('guards', () => {
  it('rejects a credit larger than the remaining balance', () => {
    const view = viewCharge({ charge: charge(), payments: [], credits: [] }, TODAY)
    expect(creditFits(view, 5000)).toBe(true)
    expect(creditFits(view, 5001)).toBe(false)
    expect(creditFits(view, 0)).toBe(false)
  })

  it('rejects a payment larger than the remaining balance', () => {
    const view = viewCharge(
      { charge: charge(), payments: [payment(2000)], credits: [] },
      TODAY,
    )
    expect(view.outstandingCents).toBe(3000)
    expect(paymentFits(view, 3000)).toBe(true)
    expect(paymentFits(view, 3001)).toBe(false)
  })
})

describe('revenue', () => {
  it('counts money received, not money scheduled', () => {
    const payments = [payment(5000, '2026-08-05'), payment(2500, '2026-09-02')]
    expect(revenueBetween(payments, '2026-08-01', '2026-08-31')).toBe(5000)
    expect(revenueBetween(payments, '2026-08-01', '2026-09-30')).toBe(7500)
  })
})
