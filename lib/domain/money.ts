/**
 * Money handling. Everything is integer cents — no floating point arithmetic
 * is ever performed on monetary values.
 */

/** Parse user input like "75", "52.5", "$52.50" into integer cents. */
export function parseMoneyToCents(input: string | number | null | undefined): number | null {
  if (input === null || input === undefined) return null
  const raw = String(input).trim().replace(/[$,\s]/g, '')
  if (raw === '') return null
  if (!/^\d*\.?\d*$/.test(raw)) return null
  const value = Number(raw)
  if (!Number.isFinite(value) || value < 0) return null
  // Round to the nearest cent, guarding against binary FP drift (e.g. 52.555).
  return Math.round((value + Number.EPSILON) * 100)
}

/**
 * Format cents the way the prototype's `money()` helper did:
 * whole dollars render without decimals ("$75"), otherwise two decimals
 * ("$52.50"). Negative values render with a leading minus ("−$5").
 */
export function formatMoney(cents: number): string {
  const negative = cents < 0
  const abs = Math.abs(Math.round(cents))
  const dollars = abs / 100
  const body = abs % 100 === 0 ? String(abs / 100) : dollars.toFixed(2)
  return (negative ? '−$' : '$') + body
}

/** Cents -> a plain editable string for form inputs ("7500" -> "75"). */
export function centsToInput(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return ''
  return cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2)
}

/** Strip everything a money input should not accept, as the prototype did. */
export function sanitizeMoneyInput(value: string): string {
  return value.replace(/[^0-9.]/g, '')
}

export function sumCents(values: number[]): number {
  return values.reduce((total, n) => total + n, 0)
}
