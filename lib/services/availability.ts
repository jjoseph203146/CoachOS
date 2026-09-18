/**
 * Availability service — a coach's weekly private-lesson hours.
 *
 * Saving is refused while a booked lesson would fall outside the new hours,
 * because narrowing availability underneath a confirmed lesson would quietly
 * contradict it. The coach updates or cancels that lesson first.
 */

import type { DataStore } from '@/lib/data/store'
import { strandedLessons, type HoursWindow } from '@/lib/domain/availability'
import type { ISODate } from '@/lib/domain/types'
import { DomainError } from './errors'

export async function getMyAvailability(
  store: DataStore,
  coachId: string,
  membershipId: string,
): Promise<HoursWindow[]> {
  const all = await store.listAvailability(coachId)
  return all
    .filter((w) => w.membershipId === membershipId)
    .map(({ weekday, startMin, endMin }) => ({ weekday, startMin, endMin }))
    .sort((a, b) => a.weekday - b.weekday)
}

export interface StrandedLesson {
  sessionId: string
  date: ISODate
  startMin: number
  durationMin: number
  playerName: string
}

export interface SaveAvailabilityResult {
  saved: boolean
  /** Lessons that would fall outside the proposed hours. Nothing is saved while any exist. */
  conflicts: StrandedLesson[]
}

export async function saveAvailability(
  store: DataStore,
  coachId: string,
  membershipId: string,
  windows: HoursWindow[],
  today: ISODate,
): Promise<SaveAvailabilityResult> {
  const seen = new Set<number>()
  for (const window of windows) {
    if (window.weekday < 0 || window.weekday > 6) {
      throw new DomainError('INVALID', 'That isn’t a valid day.')
    }
    if (seen.has(window.weekday)) {
      throw new DomainError('INVALID', 'Each day can have one set of hours.')
    }
    seen.add(window.weekday)
    if (window.startMin < 0 || window.endMin > 24 * 60 || window.endMin <= window.startMin) {
      throw new DomainError('INVALID', 'The end time has to be after the start time.')
    }
  }

  const [sessions, enrollments, players] = await Promise.all([
    store.listSessions(coachId),
    store.listEnrollments(coachId),
    store.listPlayers(coachId, { includeDeleted: true }),
  ])
  const names = new Map(players.map((p) => [p.id, p.name]))
  const conflicts = strandedLessons(windows, sessions, membershipId, today).map((session) => ({
    sessionId: session.id,
    date: session.date,
    startMin: session.startMin,
    durationMin: session.durationMin,
    playerName:
      names.get(enrollments.find((e) => e.sessionId === session.id)?.playerId ?? '') ??
      'A lesson',
  }))
  if (conflicts.length > 0) return { saved: false, conflicts }

  await store.replaceAvailability(coachId, membershipId, windows)
  return { saved: true, conflicts: [] }
}
