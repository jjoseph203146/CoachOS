'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { signInAction } from '@/lib/actions/auth'
import { Button, FieldLabel, TextInput } from '@/components/ui/controls'
import { ErrorBanner } from '@/components/ui/primitives'

export function LoginForm({
  demoMode,
  linkError = '',
}: {
  demoMode: boolean
  linkError?: string
}) {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(linkError)
  const [pending, startTransition] = useTransition()

  const submit = () => {
    setError('')
    startTransition(async () => {
      const result = await signInAction({ email, password })
      if (!result.ok) {
        setError(result.error)
        return
      }
      router.push('/dashboard')
      router.refresh()
    })
  }

  return (
    <div className="flex-1 overflow-y-auto px-6 pb-10 flex flex-col justify-center">
      <div className="text-center">
        <div className="text-t30 font-extrabold tracking-tight3">
          Coach<span className="text-accent">OS</span>
        </div>
        <div className="text-t135 text-muted mt-[6px]">Your coaching command center</div>
      </div>

      <form
        className="mt-9"
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
        <div className="mt-[14px]">
          <FieldLabel>Password</FieldLabel>
          <TextInput
            value={password}
            onChange={setPassword}
            type="password"
            autoComplete="current-password"
            height={48}
            ariaLabel="Password"
          />
        </div>

        {error ? (
          <div className="mt-[14px]">
            <ErrorBanner message={error} />
          </div>
        ) : null}

        <div className="mt-5">
          <Button size="lg" type="submit" disabled={pending}>
            {pending ? 'Signing in…' : 'Sign In'}
          </Button>
        </div>
      </form>

      <div className="text-center mt-4">
        <a href="/forgot-password" className="text-t13 font-semibold text-accent">
          Forgot your password?
        </a>
      </div>

      <div className="text-center text-t13 text-muted mt-[14px]">
        New here?{' '}
        <a href="/signup" className="text-accent font-semibold">
          Create account
        </a>
      </div>

      {demoMode ? (
        <div className="text-center text-t115 text-faint mt-7">
          Running without Supabase — any credentials sign you into the demo data.
        </div>
      ) : null}
    </div>
  )
}
