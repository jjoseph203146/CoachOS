/**
 * Dashboard read model. Assembles "up next", "also today", "needs attention",
 * this-month stats and outstanding totals from the same derived data the rest
 * of the app uses.
 */

import type { DataStore } from '@/lib/data/store'
import { addDays } from '@/lib/domain/dates'
import {
  attendanceRate,
  attendanceState,
  compareSessions,
  isPast,
  type Clock,
} from '@/lib/domain/sessions'
import type { Enrollment, Player, Session } from '@/lib/domain/types'
import { formatMoney } from '@/lib/domain/money'
import { loadFinance } from './finance'
import { sessionsNeedingAttendance } from './sessions'

export interface DashboardModel {
  isNewCoach: boolean
  upNext: {
    session: Session
    enrollments: Enrollment[]
    outstandingCents: number
    attendanceComplete: boolean
  } | null
  alsoToday: Array<{
    session: Session
    enrollments: Enrollment[]
    ended: boolean
    attendanceMissing: boolean
    skipped: boolean
    complete: boolean
  }>
  attention: Array<{
    kind: 'attendance' | 'overdue'
    main: string
    sub: string
    href: string
    dot: string
    cta: string
  }>
  monthSessions: number
  monthAttendanceRate: number | null
  outstandingCents: number
  outstandingPlayers: number
  outstandingCharges: number
  players: Map<string, Player>
}

export async function loadDashboard(
  store: DataStore,
  coachId: string,
  clock: Clock,
  graceMinutes = 0,
): Promise<DashboardModel> {
  const [sessions, enrollments, players, finance, needsAttendance] = await Promise.all([
    store.listSessions(coachId),
    store.listEnrollments(coachId),
    store.listPlayers(coachId, { includeDeleted: true }),
    loadFinance(store, coachId, clock.today),
    sessionsNeedingAttendance(store, coachId, clock, graceMinutes),
  ])

  const playerMap = new Map(players.map((p) => [p.id, p]))
  const bySession = new Map<string, Enrollment[]>()
  for (const e of enrollments) {
    const list = bySession.get(e.sessionId) ?? []
    list.push(e)
    bySession.set(e.sessionId, list)
  }

  const live = sessions.filter((s) => s.status !== 'cancelled')
  const upcoming = live.filter((s) => !isPast(s, clock)).sort(compareSessions)
  const up = upcoming[0] ?? null

  const upNext = up
    ? {
        session: up,
        enrollments: bySession.get(up.id) ?? [],
        outstandingCents: finance.outstandingForSession(up.id),
        attendanceComplete:
          attendanceState(up, bySession.get(up.id) ?? []) === 'complete',
      }
    : null

  const alsoToday = live
    .filter((s) => s.date === clock.today && (!up || s.id !== up.id))
    .sort((a, b) => a.startMin - b.startMin)
    .map((session) => {
      const rosters = bySession.get(session.id) ?? []
      const state = attendanceState(session, rosters)
      return {
        session,
        enrollments: rosters,
        ended: isPast(session, clock),
        attendanceMissing: needsAttendance.some((n) => n.session.id === session.id),
        skipped: session.attendanceSkipped,
        complete: state === 'complete',
      }
    })

  const attention: DashboardModel['attention'] = needsAttendance.map(
    ({ session, enrollments: roster }) => {
      const label =
        session.type === 'private'
          ? (playerMap.get(roster[0]?.playerId ?? '')?.name ?? session.name)
          : session.name
      return {
        kind: 'attendance' as const,
        main: `Attendance missing — ${label}`,
        sub: `${roster.length} player${roster.length > 1 ? 's' : ''}`,
        href: `/sessions/${session.id}/attendance`,
        dot: '#C77E1F',
        cta: 'Mark now',
      }
    },
  )

  const overdue = finance.overdue()
  if (overdue.length > 0) {
    const total = overdue.reduce((sum, v) => sum + v.outstandingCents, 0)
    const uniquePlayers = new Set(overdue.map((v) => v.charge.playerId)).size
    attention.push({
      kind: 'overdue',
      main: `${formatMoney(total)} overdue`,
      sub: `${overdue.length} charge${overdue.length > 1 ? 's' : ''} · ${uniquePlayers} player${uniquePlayers > 1 ? 's' : ''}`,
      href: '/payments?tab=overdue',
      dot: '#B3402F',
      cta: 'Review',
    })
  }

  const monthPrefix = clock.today.slice(0, 7)
  const monthSessions = live.filter(
    (s) => s.date.slice(0, 7) === monthPrefix && s.date <= clock.today,
  )
  const monthEnrollments = sessions
    .filter((s) => s.date.slice(0, 7) === monthPrefix)
    .flatMap((s) => bySession.get(s.id) ?? [])

  const pending = finance.pending()

  return {
    isNewCoach: sessions.length === 0 && players.filter((p) => !p.deletedAt).length === 0,
    upNext,
    alsoToday,
    attention,
    monthSessions: monthSessions.length,
    monthAttendanceRate: attendanceRate(monthEnrollments),
    outstandingCents: finance.totalOutstanding(),
    outstandingPlayers: new Set(pending.map((v) => v.charge.playerId)).size,
    outstandingCharges: pending.length,
    players: playerMap,
  }
}

/** Convenience: the trailing-30-day window used by activity labels. */
export function activityWindowStart(today: string): string {
  return addDays(today, -30)
}
