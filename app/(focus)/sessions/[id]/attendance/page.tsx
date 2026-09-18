import { notFound } from 'next/navigation'
import { requireCoachPage } from '@/lib/auth'
import { coachClock } from '@/lib/services/clock'
import { formatRelative, formatTime } from '@/lib/domain/dates'
import { isDomainError } from '@/lib/services/errors'
import { getSessionDetail } from '@/lib/services/sessions'
import { AttendanceView } from './AttendanceView'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Attendance — CoachOS' }

export default async function AttendancePage({ params }: { params: { id: string } }) {
  const { store, coachId, coach, membershipId } = await requireCoachPage()
  const clock = coachClock(coach)

  let detail
  try {
    detail = await getSessionDetail(store, coachId, params.id, clock)
  } catch (error) {
    if (isDomainError(error) && error.code === 'NOT_FOUND') notFound()
    throw error
  }

  const { session, enrollments, players } = detail

  // Program sessions record which coaches worked. Until someone has, the person
  // taking attendance is assumed to have.
  const [team, worked] = session.programId
    ? await Promise.all([
        store.listMemberships(coachId),
        store.listSessionCoaches(coachId, session.id),
      ])
    : [[], [] as string[]]

  return (
    <AttendanceView
      sessionId={session.id}
      typeLabel={
        session.type === 'private'
          ? 'Private lesson'
          : session.programId
            ? 'Program'
            : 'Group session'
      }
      planned={session.programId !== null}
      coaches={team.map((m) => ({
        membershipId: m.id,
        name: m.name || m.email,
        worked: worked.length > 0 ? worked.includes(m.id) : m.id === membershipId,
      }))}
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
        expected: enrollment.expected,
      }))}
    />
  )
}
