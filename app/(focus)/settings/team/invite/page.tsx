import { redirect } from 'next/navigation'
import { requireCoachPage } from '@/lib/auth'
import { InviteForm } from './InviteForm'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Invite a coach — CoachOS' }

export default async function InvitePage() {
  const { role } = await requireCoachPage()
  if (role !== 'owner') redirect('/settings')
  return <InviteForm />
}
