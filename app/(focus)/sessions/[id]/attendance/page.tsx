import { notFound } from 'next/navigation'
import { requireCoachPage } from '@/lib/auth'
import { formatRelative, formatTime } from '@/lib/domain/dates'
import { isDomainError } from '@/lib/services/errors'
import { defaultClock } from '@/lib/services/players'
import { getSessionDetail } from '@/lib/services/sessions'
import { AttendanceView } from './AttendanceView'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Attendance — CoachOS' }

export default async function AttendancePage({ params }: { params: { id: string } }) {
  const { store, coachId } = await requireCoachPage()
  const clock = defaultClock()

  let detail
  try {
    detail = await getSessionDetail(store, coachId, params.id, clock)
  } catch (error) {
    if (isDomainError(error) && error.code === 'NOT_FOUND') notFound()
    throw error
  }

  const { session, enrollments, players } = detail

  return (
    <AttendanceView
      sessionId={session.id}
      typeLabel={session.type === 'private' ? 'Private lesson' : 'Group session'}
      title={
        session.type === 'private'
          ? (players.get(enrollments[0]?.playerId ?? '')?.name ?? session.name)
          : session.name
      }
      when={`${formatRelative(session.date, clock.today)} · ${formatTime(session.startMin)}`}
      rows={enrollments.map((enrollment) => ({
        playerId: enrollment.playerId,
        name: players.get(enrollment.playerId)?.name ?? 'Player',
        level: players.get(enrollment.playerId)?.level ?? '',
        attendance: enrollment.attendance,
      }))}
    />
  )
}
