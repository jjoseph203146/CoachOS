'use client'

import { useState, useTransition } from 'react'
import { requestPasswordResetAction } from '@/lib/actions/auth'
import { Button, FieldLabel, TextInput } from '@/components/ui/controls'
import { ErrorBanner } from '@/components/ui/primitives'

export function ForgotPasswordForm() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const [pending, startTransition] = useTransition()

  const submit = () => {
    setError('')
    startTransition(async () => {
      const result = await requestPasswordResetAction({ email })
      if (!result.ok) {
        setError(result.error)
        return
      }
      setSent(true)
    })
  }

  return (
    <div className="flex-1 overflow-y-auto px-6 pb-10 flex flex-col justify-center">
      <div className="text-center">
        <div className="text-t26 font-extrabold tracking-tight3">Reset password</div>
        <div className="text-t135 text-muted mt-[6px]">
          We’ll email you a link to set a new one.
        </div>
      </div>

      {sent ? (
        <>
          <div className="bg-accent_soft rounded-r11 px-[14px] py-[11px] text-t125 font-medium text-accent_dark mt-7 text-center">
            If an account exists for {email}, a reset link is on its way. The link
            expires in an hour.
          </div>
          <div className="text-center text-t13 text-muted mt-[18px]">
            <a href="/login" className="text-accent font-semibold">
              Back to sign in
            </a>
          </div>
        </>
      ) : (
        <>
          <form
            className="mt-7"
            onSubmit={(event) => {
              event.preventDefault()
              submit()
            }}
          >
            <FieldLabel>Email</FieldLabel>
            <TextInput
              value={email}
              onChange={setEmail}
              type="email"
              inputMode="email"
              autoComplete="email"
              height={48}
              ariaLabel="Email"
            />

            {error ? (
              <div className="mt-[14px]">
                <ErrorBanner message={error} />
              </div>
            ) : null}

            <div className="mt-5">
              <Button size="lg" type="submit" disabled={pending}>
                {pending ? 'Sending…' : 'Send Reset Link'}
              </Button>
            </div>
          </form>

          <div className="text-center text-t13 text-muted mt-[18px]">
            Remembered it?{' '}
            <a href="/login" className="text-accent font-semibold">
              Sign in
            </a>
          </div>
        </>
      )}
    </div>
  )
}
