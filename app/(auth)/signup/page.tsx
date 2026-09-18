import { getStore } from '@/lib/data'
import { isSupabaseConfigured } from '@/lib/supabase/env'
import { previewInvite } from '@/lib/services/team'
import { SignupForm } from './SignupForm'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Create account — CoachOS' }

export default async function SignupPage({
  searchParams,
}: {
  searchParams: { invite?: string }
}) {
  // An open invitation locks the address: the database puts a new user in the
  // inviter's academy only when their sign-up email matches the invitation.
  const preview = searchParams.invite
    ? await previewInvite(getStore(), searchParams.invite)
    : null
  const invite =
    preview && preview.state === 'open'
      ? { email: preview.email, businessName: preview.businessName }
      : null

  return <SignupForm demoMode={!isSupabaseConfigured()} invite={invite} />
}
