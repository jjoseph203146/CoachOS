import { requireCoachPage } from '@/lib/auth'
import { getMyAvailability } from '@/lib/services/availability'
import { AvailabilityView } from './AvailabilityView'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Availability — CoachOS' }

export default async function AvailabilityPage() {
  const { store, coachId, membershipId } = await requireCoachPage()
  const windows = await getMyAvailability(store, coachId, membershipId)
  return <AvailabilityView initial={windows} />
}
