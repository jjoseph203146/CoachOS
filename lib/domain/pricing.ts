/**
 * Pricing rules.
 *
 * Prices have two very different lives:
 *
 *   STANDARD prices are live configuration — the academy's default rate, a
 *   player's own rate, a session's price (and, later, a program's price
 *   options). They can be edited at any time.
 *
 *   A CHARGE is history. It snapshots the amount that was agreed when it was
 *   created, plus where that amount came from and what the standard was at the
 *   time. Editing a standard price never reaches back into a charge.
 *
 * This module only decides what the snapshot says. It performs no I/O.
 */

import type { Academy, Player, PriceBasis, PriceSource } from './types'

/** The provenance stored alongside a charge amount. */
export interface PriceSnapshot {
  priceSource: PriceSource
  priceBasis: PriceBasis | null
  standardAmountCents: number | null
}

/**
 * The standard rate for a private lesson with this player: their own rate when
 * they have one, otherwise the academy default.
 */
export function standardRateFor(
  player: Pick<Player, 'defaultRateCents'>,
  academy: Pick<Academy, 'defaultRateCents'>,
): { cents: number; source: Extract<PriceSource, 'player_default' | 'academy_default'> } {
  return player.defaultRateCents != null
    ? { cents: player.defaultRateCents, source: 'player_default' }
    : { cents: academy.defaultRateCents, source: 'academy_default' }
}

/**
 * Snapshot for a private-lesson booking. If the price entered equals the
 * standard rate the charge says so; otherwise it is a deliberate override —
 * 'custom' — and the standard is kept alongside so the difference is visible.
 */
export function privateLessonSnapshot(
  priceCents: number,
  standard: { cents: number; source: 'player_default' | 'academy_default' },
): PriceSnapshot {
  return {
    priceSource: priceCents === standard.cents ? standard.source : 'custom',
    priceBasis: 'per_session',
    standardAmountCents: standard.cents,
  }
}

/**
 * Snapshot for a charge whose amount is simply the price set on the session
 * itself (group sessions, or a player added to an existing session). The
 * session price IS the standard here, so there is nothing to compare against.
 */
export function sessionPriceSnapshot(): PriceSnapshot {
  return { priceSource: 'session_price', priceBasis: 'per_session', standardAmountCents: null }
}

/** Snapshot for an ad-hoc charge the owner enters by hand. */
export function manualSnapshot(): PriceSnapshot {
  return { priceSource: 'manual', priceBasis: null, standardAmountCents: null }
}
