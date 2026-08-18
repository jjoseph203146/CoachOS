import { isSupabaseConfigured } from '@/lib/supabase/env'
import { LoginForm } from './LoginForm'

export const metadata = { title: 'Sign in — CoachOS' }

export default function LoginPage() {
  return <LoginForm demoMode={!isSupabaseConfigured()} />
}
