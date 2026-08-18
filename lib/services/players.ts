/**
 * Player service. Archiving is preferred over deletion so that historical
 * sessions, attendance and financial records stay readable.
 */

import type { DataStore, NewPlayerInput } from '@/lib/data/store'
import { todayISO } from '@/lib/domain/dates'
import { activityLabel, compareSessions, isPast, type Clock } from '@/lib/domain/sessions'
import type { Player } from '@/lib/domain/types'
import { DomainError } from './errors'
import { loadFinance } from './finance'

export interface PlayerRow {
  player: Player
  nextSessionDate: string | null
  outstandingCents: number
  activity: string
}

export async function listPlayers(
  store: DataStore,
  coachId: string,
  opts: { tab: 'active' | 'archived'; query?: string; clock: Clock },
): Promise<PlayerRow[]> {
  const [players, sessions, enrollments, finance] = await Promise.all([
    store.listPlayers(coachId),
    store.listSessions(coachId),
    store.listEnrollments(coachId),
    loadFinance(store, coachId, opts.clock.today),
  ])

  const pool = players.filter((p) =>
    opts.tab === 'active' ? !p.archived : p.archived,
  )
  const query = (opts.query ?? '').trim().toLowerCase()
  const filtered = query
    ? pool.filter((p) => p.name.toLowerCase().includes(query))
    : pool

  const sessionsById = new Map(sessions.map((s) => [s.id, s]))

  const rows = filtered.map((player) => {
    const upcoming = enrollments
      .filter((e) => e.playerId === player.id)
      .map((e) => sessionsById.get(e.sessionId))
      .filter(
        (s): s is NonNullable<typeof s> =>
          !!s && s.status !== 'cancelled' && !isPast(s, opts.clock),
      )
      .sort(compareSessions)

    return {
      player,
      nextSessionDate: upcoming[0]?.date ?? null,
      outstandingCents: finance.outstandingFor(player.id),
      activity: activityLabel(sessions, enrollments, player.id, opts.clock.today),
    }
  })

  // Soonest session first, then largest balance, then name — as the prototype did.
  return rows.sort((a, b) => {
    const ak = a.nextSessionDate ?? '9999'
    const bk = b.nextSessionDate ?? '9999'
    if (ak !== bk) return ak < bk ? -1 : 1
    if (a.outstandingCents !== b.outstandingCents) {
      return b.outstandingCents - a.outstandingCents
    }
    return a.player.name < b.player.name ? -1 : 1
  })
}

export async function getPlayer(
  store: DataStore,
  coachId: string,
  playerId: string,
): Promise<Player> {
  const player = await store.getPlayer(coachId, playerId)
  if (!player || player.deletedAt) {
    throw new DomainError('NOT_FOUND', 'That player could not be found.')
  }
  return player
}

export async function createPlayer(
  store: DataStore,
  coachId: string,
  input: NewPlayerInput,
): Promise<Player> {
  return store.createPlayer(coachId, input)
}

export async function updatePlayer(
  store: DataStore,
  coachId: string,
  playerId: string,
  input: Partial<NewPlayerInput>,
): Promise<Player> {
  await getPlayer(store, coachId, playerId)
  // NOTE: changing `defaultRateCents` intentionally does NOT touch existing
  // charges. Charge amounts are captured at creation and stay historical.
  return store.updatePlayer(coachId, playerId, input)
}

export async function setPlayerArchived(
  store: DataStore,
  coachId: string,
  playerId: string,
  archived: boolean,
): Promise<Player> {
  await getPlayer(store, coachId, playerId)
  return store.updatePlayer(coachId, playerId, { archived })
}

/**
 * Soft delete. The player disappears from active use, but every session,
 * enrollment, charge, payment and credit they are attached to is preserved.
 */
export async function deletePlayer(
  store: DataStore,
  coachId: string,
  playerId: string,
  confirmationName: string,
): Promise<void> {
  const player = await getPlayer(store, coachId, playerId)
  if (confirmationName.trim() !== player.name) {
    throw new DomainError('INVALID', 'Type the player’s full name to confirm.')
  }
  await store.updatePlayer(coachId, playerId, {
    archived: true,
    deletedAt: new Date().toISOString(),
  })
}

/** Players eligible to be put on a session: active, not archived, not deleted. */
export async function listSelectablePlayers(
  store: DataStore,
  coachId: string,
): Promise<Player[]> {
  const players = await store.listPlayers(coachId)
  return players
    .filter((p) => !p.archived && !p.deletedAt)
    .sort((a, b) => (a.name < b.name ? -1 : 1))
}

export function defaultClock(): Clock {
  const now = new Date()
  return { today: todayISO(now), nowMinutes: now.getHours() * 60 + now.getMinutes() }
}
