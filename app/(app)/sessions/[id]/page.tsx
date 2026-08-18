import { notFound } from 'next/navigation'
import { requireCoachPage } from '@/lib/auth'
import { formatLong, formatTime } from '@/lib/domain/dates'
import { CHARGE_TONE } from '@/lib/domain/finance'
import { formatMoney, centsToInput } from '@/lib/domain/money'
import { attendanceLabel, sessionEndMin } from '@/lib/domain/sessions'
import { isDomainError } from '@/lib/services/errors'
import { loadFinance } from '@/lib/services/finance'
import { defaultClock, listSelectablePlayers } from '@/lib/services/players'
import { getSessionDetail } from '@/lib/services/sessions'
import { SessionDetailView } from './SessionDetailView'

export const dynamic = 'force-dynamic'

export default async function SessionDetailPage({
  params,
}: {
  params: { id: string }
}) {
  const { store, coachId } = await requireCoachPage()
  const clock = defaultClock()

  let detail
  try {
    detail = await getSessionDetail(store, coachId, params.id, clock)
  } catch (error) {
    if (isDomainError(error) && error.code === 'NOT_FOUND') notFound()
    throw error
  }

  const { session, enrollments, players, past, attendance } = detail
  const finance = await loadFinance(store, coachId, clock.today)
  const chargeViews = finance.forSession(session.id)
  const selectable = await listSelectablePlayers(store, coachId)

  const enrolledIds = new Set(enrollments.map((e) => e.playerId))
  const cancelled = session.status === 'cancelled'
  const marked = enrollments.filter(
    (e) => e.attendance === 'present' || e.attendance === 'absent',
  ).length

  let statusLine: string
  if (cancelled) {
    statusLine = 'Cancelled'
  } else if (past) {
    const dayDiff = Math.round(
      (new Date(clock.today + 'T12:00:00').getTime() -
        new Date(session.date + 'T12:00:00').getTime()) /
        86400000,
    )
    const ago = dayDiff === 0 ? 'today' : dayDiff === 1 ? 'yesterday' : `${dayDiff} days ago`
    statusLine =
      `Ended ${ago}` +
      (session.attendanceSkipped
        ? ' · attendance skipped'
        : ` · ${marked} of ${enrollments.length} marked`) +
      (detail.outstandingCents > 0
        ? ` · ${formatMoney(detail.outstandingCents)} outstanding`
        : '')
  } else if (session.date === clock.today) {
    statusLine = `Today · ${formatTime(session.startMin)} · ${
      attendance === 'complete' ? 'attendance taken' : 'attendance not taken'
    }`
  } else {
    statusLine =
      `${formatLong(session.date)} · ${formatTime(session.startMin)}` +
      (detail.outstandingCents > 0
        ? ` · ${formatMoney(detail.outstandingCents)} unpaid`
        : '')
  }

  return (
    <SessionDetailView
      session={{
        id: session.id,
        name: session.name,
        type: session.type,
        date: session.date,
        startMin: session.startMin,
        durationMin: session.durationMin,
        priceCents: session.priceCents,
        priceInput: centsToInput(session.priceCents),
        isFree: session.isFree,
        location: session.location,
        capacity: session.capacity,
        cancelled,
        attendanceSkipped: session.attendanceSkipped,
      }}
      typeChip={session.type === 'private' ? 'Private Lesson' : 'Group Session'}
      statusLine={statusLine}
      dateLine={formatLong(session.date)}
      timeLine={`${formatTime(session.startMin)} – ${formatTime(sessionEndMin(session))} · ${session.durationMin} min`}
      locationLine={session.location || 'No location set'}
      priceLine={
        session.isFree
          ? 'Free session'
          : `${formatMoney(session.priceCents)}${session.type === 'group' ? ' per player' : ''}`
      }
      capacityLine={
        session.type === 'group'
          ? `${enrollments.length} of ${session.capacity} enrolled`
          : ''
      }
      showTakeAttendance={
        !cancelled &&
        !session.attendanceSkipped &&
        enrollments.length > 0 &&
        attendance !== 'complete' &&
        (past || session.date === clock.today)
      }
      canAddPlayer={
        session.type === 'group' &&
        !cancelled &&
        enrollments.length < (session.capacity ?? 99)
      }
      roster={enrollments.map((enrollment) => {
        const player = players.get(enrollment.playerId)
        const view = chargeViews.find((v) => v.charge.playerId === enrollment.playerId)
        const label = attendanceLabel(enrollment.attendance, session.attendanceSkipped)
        const tone = view ? CHARGE_TONE[view.status] : null
        return {
          playerId: enrollment.playerId,
          name: player?.name ?? 'Player',
          attendanceText: label.text,
          attendanceColor: label.color,
          chargeId: view?.charge.id ?? null,
          payText: view ? `${formatMoney(view.amountCents)} · ${tone!.label}` : '',
          payBg: tone?.bg ?? '',
          payFg: tone?.fg ?? '',
          freeTag: !view && session.isFree,
        }
      })}
      addablePlayers={selectable
        .filter((p) => !enrolledIds.has(p.id))
        .map((p) => ({ id: p.id, name: p.name, level: p.level }))}
      addChargeNote={
        !session.isFree && session.priceCents > 0
          ? `Adding a player creates a ${formatMoney(session.priceCents)} pending charge.`
          : 'This is a free session — no charge is created.'
      }
      unpaid={{
        count: chargeViews.filter((v) => v.isPending).length,
        cents: chargeViews
          .filter((v) => v.isPending)
          .reduce((sum, v) => sum + v.outstandingCents, 0),
      }}
      today={clock.today}
    />
  )
}
