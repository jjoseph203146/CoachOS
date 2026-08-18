import { requireCoachPage } from '@/lib/auth'
import { coachClock } from '@/lib/services/clock'
import { listPlayers } from '@/lib/services/players'
import { formatRelative } from '@/lib/domain/dates'
import { formatMoney } from '@/lib/domain/money'
import { PlayersView, type PlayerListRow } from './PlayersView'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Players — CoachOS' }

export default async function PlayersPage() {
  const { store, coachId, coach } = await requireCoachPage()
  const clock = coachClock(coach)

  const [active, archived] = await Promise.all([
    listPlayers(store, coachId, { tab: 'active', clock }),
    listPlayers(store, coachId, { tab: 'archived', clock }),
  ])

  const toRow = (
    row: Awaited<ReturnType<typeof listPlayers>>[number],
    archivedTab: boolean,
  ): PlayerListRow => ({
    id: row.player.id,
    name: row.player.name,
    subtitle: `${row.player.level} · ${row.activity}`,
    next: row.nextSessionDate
      ? `Next: ${formatRelative(row.nextSessionDate, clock.today)}`
      : archivedTab
        ? 'Archived'
        : 'No upcoming',
    outstanding: row.outstandingCents > 0 ? formatMoney(row.outstandingCents) : '',
  })

  return (
    <PlayersView
      active={active.map((row) => toRow(row, false))}
      archived={archived.map((row) => toRow(row, true))}
    />
  )
}
