import { redirect } from 'next/navigation'
import { requireCoachPage } from '@/lib/auth'
import { loadTeam } from '@/lib/services/team'
import { TeamView } from './TeamView'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Team — CoachOS' }

export default async function TeamPage() {
  const { store, coachId, membershipId, role } = await requireCoachPage()
  // Managing the team is the academy owner's.
  if (role !== 'owner') redirect('/settings')
  const team = await loadTeam(store, coachId, role, membershipId)
  return <TeamView members={team.members} invites={team.invites} />
}
