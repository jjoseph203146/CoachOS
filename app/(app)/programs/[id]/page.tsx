import { notFound } from 'next/navigation'
import { requireCoachPage } from '@/lib/auth'
import { coachClock } from '@/lib/services/clock'
import { formatRelative, formatTime } from '@/lib/domain/dates'
import { weekdaysLabel, BASIS_LABEL } from '@/lib/domain/programs'
import { centsToInput } from '@/lib/domain/money'
import { isDomainError } from '@/lib/services/errors'
import { loadProgramDetail } from '@/lib/services/programs'
import { ProgramDetailView } from './ProgramDetailView'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Program — CoachOS' }

export default async function ProgramPage({ params }: { params: { id: string } }) {
  const { store, coachId, coach, role } = await requireCoachPage()
  const clock = coachClock(coach)

  let detail
  try {
    detail = await loadProgramDetail(store, coachId, params.id, clock.today)
  } catch (error) {
    if (isDomainError(error) && error.code === 'NOT_FOUND') notFound()
    throw error
  }
  const { program, options, roster, upcoming } = detail

  const [players, next] = await Promise.all([
    store.listPlayers(coachId),
    upcoming[0]
      ? store.listEnrollmentsForSession(coachId, upcoming[0].id)
      : Promise.resolve([]),
  ])
  const onRoster = new Set(roster.map((r) => r.enrollment.playerId))
  const end = program.startMin + program.durationMin

  return (
    <ProgramDetailView
      isOwner={role === 'owner'}
      program={{
        id: program.id,
        name: program.name,
        audience: program.audience,
        status: program.status,
        scheduleLine: `${weekdaysLabel(program.weekdays)} · ${formatTime(program.startMin)}–${formatTime(end)}`,
        location: program.location,
        ageRange: program.ageRange,
        capacity: program.capacity,
      }}
      options={options.map((o) => ({
        id: o.id,
        label: o.label,
        basisLabel: BASIS_LABEL[o.basis],
        amountCents: o.amountCents,
        amountInput: centsToInput(o.amountCents),
        archived: !!o.archivedAt,
      }))}
      roster={roster.map((r) => ({
        enrollmentId: r.enrollment.id,
        playerId: r.enrollment.playerId,
        name: r.playerName,
        agreedLabel: r.enrollment.agreedLabel,
        agreedBasis: r.enrollment.agreedBasis,
        agreedBasisLabel: BASIS_LABEL[r.enrollment.agreedBasis],
        agreedCents: r.enrollment.agreedAmountCents,
        standardCents: r.enrollment.standardAmountCents,
        custom: r.enrollment.agreementSource === 'custom',
        note: r.enrollment.agreementNote,
        chargeCount: r.chargeCount,
        billedThrough: r.lastChargeEnd,
      }))}
      next={
        upcoming[0]
          ? {
              sessionId: upcoming[0].id,
              when: `${formatRelative(upcoming[0].date, clock.today)} · ${formatTime(upcoming[0].startMin)}–${formatTime(upcoming[0].startMin + upcoming[0].durationMin)}`,
              expected: next.filter((e) => e.expected).length,
              onSession: next.length,
              isToday: upcoming[0].date === clock.today,
            }
          : null
      }
      upcoming={upcoming.slice(1, 6).map((s) => ({
        id: s.id,
        when: `${formatRelative(s.date, clock.today)} · ${formatTime(s.startMin)}`,
      }))}
      addable={players
        .filter((p) => !p.archived && !onRoster.has(p.id))
        .map((p) => ({ id: p.id, name: p.name, level: p.level }))}
    />
  )
}
