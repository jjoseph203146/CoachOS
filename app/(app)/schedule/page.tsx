import { requireCoachPage } from '@/lib/auth'
import { coachClock, coachGraceMinutes } from '@/lib/services/clock'
import { attendanceMissing, attendanceState, isPast } from '@/lib/domain/sessions'
import { ScheduleView, type ScheduleRow } from './ScheduleView'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Calendar — CoachOS' }

export default async function SchedulePage() {
  const { store, coachId, coach } = await requireCoachPage()
  const clock = coachClock(coach)
  const grace = coachGraceMinutes(coach)

  const [sessions, enrollments, players, programs] = await Promise.all([
    store.listSessions(coachId),
    store.listEnrollments(coachId),
    store.listPlayers(coachId, { includeDeleted: true }),
    store.listPrograms(coachId),
  ])
  const audienceByProgram = new Map(programs.map((p) => [p.id, p.audience]))

  const playerNames = new Map(players.map((p) => [p.id, p.name]))
  const bySession = new Map<string, typeof enrollments>()
  for (const enrollment of enrollments) {
    const list = bySession.get(enrollment.sessionId) ?? []
    list.push(enrollment)
    bySession.set(enrollment.sessionId, list)
  }

  // Everything the client needs is derived here, on the server, so the two
  // never disagree about whether a session is "done" or "missing attendance".
  const rows: ScheduleRow[] = sessions.map((session) => {
    const roster = bySession.get(session.id) ?? []
    const cancelled = session.status === 'cancelled'
    const ended = isPast(session, clock)
    const state = attendanceState(session, roster)

    let badge: ScheduleRow['badge'] = null
    if (cancelled) badge = { text: 'Cancelled', bg: '#EEF3F8', fg: '#6D7A8C' }
    else if (attendanceMissing(session, roster, clock, grace))
      badge = { text: 'Attendance missing', bg: '#FBF3E4', fg: '#96690F' }
    else if (ended && state === 'complete')
      badge = { text: 'Done', bg: '#EEF3F8', fg: '#6D7A8C' }
    else if (session.capacity && roster.length >= session.capacity)
      badge = { text: 'Full', bg: '#EAF8EF', fg: '#159A55' }

    return {
      id: session.id,
      date: session.date,
      startMin: session.startMin,
      durationMin: session.durationMin,
      kind:
        session.type === 'private'
          ? 'private'
          : session.programId && audienceByProgram.get(session.programId) === 'adult'
            ? 'adult'
            : 'group',
      title: session.type === 'private' ? 'Private Lesson' : session.name,
      subtitle:
        session.type === 'private'
          ? (playerNames.get(roster[0]?.playerId ?? '') ?? '')
          : session.programId
            ? `${roster.filter((e) => e.expected).length} expected`
            : `${roster.length}${session.capacity ? ` of ${session.capacity}` : ''} players`,
      cancelled,
      ended,
      badge,
    }
  })

  return <ScheduleView rows={rows} today={clock.today} />
}
