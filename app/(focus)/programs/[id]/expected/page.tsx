import { notFound } from 'next/navigation'
import { requireCoachPage } from '@/lib/auth'
import { coachClock } from '@/lib/services/clock'
import { formatRelative, formatTime } from '@/lib/domain/dates'
import { isDomainError } from '@/lib/services/errors'
import { loadProgramDetail } from '@/lib/services/programs'
import { ExpectedView } from './ExpectedView'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Expected — CoachOS' }

export default async function ExpectedPage({
  params,
  searchParams,
}: {
  params: { id: string }
  searchParams: { session?: string }
}) {
  const { store, coachId, coach } = await requireCoachPage()
  const clock = coachClock(coach)

  let detail
  try {
    detail = await loadProgramDetail(store, coachId, params.id, clock.today)
  } catch (error) {
    if (isDomainError(error) && error.code === 'NOT_FOUND') notFound()
    throw error
  }

  const chosen =
    detail.upcoming.find((s) => s.id === searchParams.session) ?? detail.upcoming[0]
  if (!chosen) notFound()

  const [enrollments, players] = await Promise.all([
    store.listEnrollmentsForSession(coachId, chosen.id),
    store.listPlayers(coachId, { includeDeleted: true }),
  ])
  const names = new Map(players.map((p) => [p.id, p.name]))

  return (
    <ExpectedView
      programId={detail.program.id}
      programName={detail.program.name}
      sessionId={chosen.id}
      sessions={detail.upcoming.slice(0, 8).map((s) => ({
        id: s.id,
        label: formatRelative(s.date, clock.today),
      }))}
      when={`${formatRelative(chosen.date, clock.today)} · ${formatTime(chosen.startMin)}`}
      rows={enrollments
        .map((e) => ({
          playerId: e.playerId,
          name: names.get(e.playerId) ?? 'Player',
          expected: e.expected,
        }))
        .sort((a, b) => a.name.localeCompare(b.name))}
    />
  )
}
