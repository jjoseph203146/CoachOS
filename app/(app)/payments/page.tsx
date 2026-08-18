import { requireCoachPage } from '@/lib/auth'
import { formatMedium, formatShort } from '@/lib/domain/dates'
import { CHARGE_TONE } from '@/lib/domain/finance'
import { loadFinance } from '@/lib/services/finance'
import { defaultClock, listSelectablePlayers } from '@/lib/services/players'
import { PaymentsView, type ChargeRow } from './PaymentsView'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Payments — CoachOS' }

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: { tab?: string; player?: string }
}) {
  const { store, coachId } = await requireCoachPage()
  const clock = defaultClock()

  const [finance, sessions, players, selectable] = await Promise.all([
    loadFinance(store, coachId, clock.today),
    store.listSessions(coachId),
    store.listPlayers(coachId, { includeDeleted: true }),
    listSelectablePlayers(store, coachId),
  ])

  const sessionsById = new Map(sessions.map((s) => [s.id, s]))
  const playersById = new Map(players.map((p) => [p.id, p]))

  const rows: ChargeRow[] = finance.views.map((view) => {
    const charge = view.charge
    const session = charge.sessionId ? sessionsById.get(charge.sessionId) : null
    const tone = CHARGE_TONE[view.status]
    const player = playersById.get(charge.playerId)

    return {
      id: charge.id,
      playerId: charge.playerId,
      playerName: player?.name ?? 'Player',
      subtitle: charge.isManual
        ? `${charge.label} · Manual`
        : session
          ? `${session.type === 'private' ? 'Private Lesson' : session.name} · ${formatShort(session.date)}`
          : '',
      sheetContext: charge.isManual
        ? `${charge.label} · Manual charge · due ${formatShort(charge.dueDate)}`
        : session
          ? `${session.type === 'private' ? 'Private Lesson' : session.name} · ${formatMedium(session.date)}`
          : '',
      sessionId: charge.sessionId,
      amountCents: view.amountCents,
      paidCents: view.paidCents,
      creditedCents: view.creditedCents,
      outstandingCents: view.outstandingCents,
      status: view.status,
      isPending: view.isPending,
      isOverdue: view.isOverdue,
      dueDate: charge.dueDate,
      badge: { text: tone.label, bg: tone.bg, fg: tone.fg },
      note: charge.voidedAt
        ? charge.voidNote || 'This charge was written off.'
        : charge.note,
      searchText:
        `${player?.name ?? ''} ${session?.name ?? ''} ${charge.label}`.toLowerCase(),
    }
  })

  return (
    <PaymentsView
      rows={rows}
      today={clock.today}
      initialTab={
        searchParams.tab === 'paid'
          ? 'paid'
          : searchParams.tab === 'overdue'
            ? 'overdue'
            : 'pending'
      }
      initialPlayerFilter={searchParams.player ?? null}
      players={selectable.map((p) => ({ id: p.id, name: p.name }))}
      playerNames={Object.fromEntries(players.map((p) => [p.id, p.name]))}
    />
  )
}
