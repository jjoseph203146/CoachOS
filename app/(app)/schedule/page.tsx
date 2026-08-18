import { requireCoachPage } from '@/lib/auth'
import { attendanceMissing, attendanceState, isPast } from '@/lib/domain/sessions'
import { defaultClock } from '@/lib/services/players'
import { ScheduleView, type ScheduleRow } from './ScheduleView'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Schedule — CoachOS' }

export default async function SchedulePage() {
  const { store, coachId } = await requireCoachPage()
  const clock = defaultClock()

  const [sessions, enrollments, players] = await Promise.all([
    store.listSessions(coachId),
    store.listEnrollments(coachId),
    store.listPlayers(coachId, { includeDeleted: true }),
  ])

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
    if (cancelled) badge = { text: 'Cancelled', bg: '#EDEDE8', fg: '#6B706C' }
    else if (attendanceMissing(session, roster, clock))
      badge = { text: 'Attendance missing', bg: '#F6EEDB', fg: '#96690F' }
    else if (ended && state === 'complete')
      badge = { text: 'Done', bg: '#EDEDE8', fg: '#6B706C' }
    else if (session.capacity && roster.length >= session.capacity)
      badge = { text: 'Full', bg: '#E4F2E9', fg: '#2E7D4F' }

    return {
      id: session.id,
      date: session.date,
      startMin: session.startMin,
      durationMin: session.durationMin,
      title: session.type === 'private' ? 'Private Lesson' : session.name,
      subtitle:
        session.type === 'private'
          ? (playerNames.get(roster[0]?.playerId ?? '') ?? '')
          : `${roster.length}${session.capacity ? ` of ${session.capacity}` : ''} players`,
      cancelled,
      ended,
      badge,
    }
  })

  return <ScheduleView rows={rows} today={clock.today} />
}
