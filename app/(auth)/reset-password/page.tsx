import { ResetPasswordForm } from './ResetPasswordForm'

export const metadata = { title: 'Set a new password — CoachOS' }

/**
 * Reached only by following the emailed recovery link, which /auth/callback
 * has already exchanged for a session.
 */
export default function ResetPasswordPage() {
  return <ResetPasswordForm />
}
