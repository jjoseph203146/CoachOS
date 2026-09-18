import { redirect } from 'next/navigation'
import { requireCoachPage } from '@/lib/auth'
import { coachClock } from '@/lib/services/clock'
import { NewProgramForm } from './NewProgramForm'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'New program — CoachOS' }

export default async function NewProgramPage() {
  const { coach, role } = await requireCoachPage()
  // Programs and their prices are the academy owner's to define.
  if (role !== 'owner') redirect('/programs')
  return <NewProgramForm today={coachClock(coach).today} />
}
