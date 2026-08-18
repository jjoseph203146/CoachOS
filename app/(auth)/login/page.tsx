import { isSupabaseConfigured } from '@/lib/supabase/env'
import { LoginForm } from './LoginForm'

export const metadata = { title: 'Sign in — CoachOS' }

export default function LoginPage({
  searchParams,
}: {
  searchParams: { error?: string }
}) {
  const linkError =
    searchParams.error === 'link_expired'
      ? 'That link has expired. Request a new one.'
      : searchParams.error === 'link_invalid'
        ? 'That link is not valid. Request a new one.'
        : ''

  return <LoginForm demoMode={!isSupabaseConfigured()} linkError={linkError} />
}
