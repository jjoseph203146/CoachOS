import { isSupabaseConfigured } from '@/lib/supabase/env'
import { SignupForm } from './SignupForm'

export const metadata = { title: 'Create account — CoachOS' }

export default function SignupPage() {
  return <SignupForm demoMode={!isSupabaseConfigured()} />
}
