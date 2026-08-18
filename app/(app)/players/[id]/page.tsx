import { notFound } from 'next/navigation'
import { requireCoachPage } from '@/lib/auth'
import { coachClock } from '@/lib/services/clock'
import { formatMedium, formatRelative, formatTime } from '@/lib/domain/dates'
import { formatMoney } from '@/lib/domain/money'
import {
  activityLabel,
  attendanceRate,
  compareSessions,
  isPast,
} from '@/lib/domain/sessions'
import { isDomainError } from '@/lib/services/errors'
import { loadFinance } from '@/lib/services/finance'
import { getPlayer } from '@/lib/services/players'
import { PlayerDetailView } from './PlayerDetailView'

export const dynamic = 'force-dynamic'

export default async function PlayerDetailPage({ params }: { params: { id: string } }) {
  const { store, coachId, coach } = await requireCoachPage()
  const clock = coachClock(coach)

  let player
  try {
    player = await getPlayer(store, coachId, params.id)
  } catch (error) {
    if (isDomainError(error) && error.code === 'NOT_FOUND') notFound()
    throw error
  }

  const [sessions, enrollments, finance] = await Promise.all([
    store.listSessions(coachId),
    store.listEnrollments(coachId),
    loadFinance(store, coachId, clock.today),
  ])

  const mine = enrollments.filter((e) => e.playerId === player.id)
  const mineIds = new Set(mine.map((e) => e.sessionId))
  const theirSessions = sessions.filter((s) => mineIds.has(s.id))

  const upcoming = theirSessions
    .filter((s) => s.status !== 'cancelled' && !isPast(s, clock))
    .sort(compareSessions)

  const history = theirSessions
    .filter((s) => isPast(s, clock) || s.status === 'cancelled')
    .sort((a, b) => -compareSessions(a, b))

  const attendanceBySession = new Map(mine.map((e) => [e.sessionId, e.attendance]))
  const outstanding = finance.outstandingFor(player.id)
  const pendingCount = finance.forPlayer(player.id).filter((v) => v.isPending).length

  return (
    <PlayerDetailView
      player={{
        id: player.id,
        name: player.name,
        level: player.level,
        archived: player.archived,
        notes: player.notes,
        phone: player.phone,
        email: player.email,
      }}
      tiles={{
        next: upcoming[0] ? formatRelative(upcoming[0].date, clock.today) : '—',
        activity: activityLabel(sessions, enrollments, player.id, clock.today),
        attendance: (() => {
          const rate = attendanceRate(mine)
          return rate === null ? '—' : `${rate}%`
        })(),
        outstanding: outstanding > 0 ? formatMoney(outstanding) : '$0',
        outstandingRaw: outstanding,
      }}
      upcoming={upcoming.slice(0, 4).map((session) => ({
        id: session.id,
        line1: `${formatRelative(session.date, clock.today)} · ${formatTime(session.startMin)}`,
        line2: session.type === 'private' ? 'Private Lesson' : session.name,
      }))}
      history={history.slice(0, 6).map((session) => {
        const mark = attendanceBySession.get(session.id)
        const cancelled = session.status === 'cancelled'
        const label = cancelled
          ? 'Cancelled'
          : session.attendanceSkipped || mark === 'skipped'
            ? 'Skipped'
            : mark === 'present'
              ? 'Present'
              : mark === 'absent'
                ? 'Absent'
                : 'Unmarked'
        const color = cancelled
          ? '#8A8E89'
          : mark === 'present'
            ? '#2E7D4F'
            : mark === 'absent'
              ? '#B3402F'
              : '#8A8E89'
        return {
          id: session.id,
          line1: formatMedium(session.date),
          line2: session.type === 'private' ? 'Private Lesson' : session.name,
          right: label,
          rightColor: color,
        }
      })}
      hasAnySession={theirSessions.length > 0}
      paymentSummary={
        outstanding > 0
          ? `${formatMoney(outstanding)} outstanding · ${pendingCount} unpaid charge${
              pendingCount === 1 ? '' : 's'
            }`
          : 'All settled — nothing outstanding'
      }
    />
  )
}
