import { describe, expect, it } from 'vitest'
import {
  centsToInput,
  formatMoney,
  parseMoneyToCents,
  sumCents,
} from '@/lib/domain/money'

describe('money', () => {
  it('parses plain and decimal input into integer cents', () => {
    expect(parseMoneyToCents('75')).toBe(7500)
    expect(parseMoneyToCents('52.50')).toBe(5250)
    expect(parseMoneyToCents('52.5')).toBe(5250)
    expect(parseMoneyToCents('$1,234.56')).toBe(123456)
    expect(parseMoneyToCents('0')).toBe(0)
  })

  it('rejects nonsense and negatives', () => {
    expect(parseMoneyToCents('')).toBeNull()
    expect(parseMoneyToCents('abc')).toBeNull()
    expect(parseMoneyToCents('-5')).toBeNull()
    expect(parseMoneyToCents(null)).toBeNull()
  })

  it('avoids floating point drift', () => {
    // 0.1 + 0.2 style errors must never reach a stored amount.
    expect(parseMoneyToCents('0.07')).toBe(7)
    expect(parseMoneyToCents('1.10')).toBe(110)
    expect(parseMoneyToCents('29.99')).toBe(2999)
  })

  it('formats whole dollars without decimals, part dollars with two', () => {
    expect(formatMoney(7500)).toBe('$75')
    expect(formatMoney(5250)).toBe('$52.50')
    expect(formatMoney(0)).toBe('$0')
    expect(formatMoney(-500)).toBe('−$5')
  })

  it('round-trips through the form representation', () => {
    expect(centsToInput(7500)).toBe('75')
    expect(centsToInput(5250)).toBe('52.50')
    expect(parseMoneyToCents(centsToInput(12345))).toBe(12345)
  })

  it('sums without precision loss', () => {
    expect(sumCents([3500, 3500, 3500])).toBe(10500)
  })
})
