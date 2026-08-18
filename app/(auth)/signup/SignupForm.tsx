'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { signUpAction } from '@/lib/actions/auth'
import { Button, FieldLabel, TextInput } from '@/components/ui/controls'
import { ErrorBanner } from '@/components/ui/primitives'

export function SignupForm({ demoMode }: { demoMode: boolean }) {
  const router = useRouter()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [fields, setFields] = useState<Record<string, string>>({})
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [pending, startTransition] = useTransition()

  const submit = () => {
    setError('')
    setNotice('')
    setFields({})
    startTransition(async () => {
      const result = await signUpAction({ name, email, password, confirm })
      if (!result.ok) {
        setFields(result.fields ?? {})
        setError(result.fields ? '' : result.error)
        return
      }
      if (result.data.needsConfirmation) {
        setNotice('Check your email to confirm your account, then sign in.')
        return
      }
      router.push('/onboarding')
      router.refresh()
    })
  }

  const FieldError = ({ name: key }: { name: string }) =>
    fields[key] ? (
      <div className="text-t115 text-danger_fg mt-[5px] font-medium">{fields[key]}</div>
    ) : null

  return (
    <div className="flex-1 overflow-y-auto px-6 pb-10 flex flex-col justify-center">
      <div className="text-center">
        <div className="text-t26 font-extrabold tracking-tight3">Create your account</div>
        <div className="text-t13 text-muted mt-[5px]">
          Coach<span className="text-accent font-bold">OS</span> — free while in beta
        </div>
      </div>

      <form
        className="mt-7"
        onSubmit={(event) => {
          event.preventDefault()
          submit()
        }}
      >
        <FieldLabel>Name</FieldLabel>
        <TextInput
          value={name}
          onChange={setName}
          placeholder="Your full name"
          autoComplete="name"
          ariaLabel="Name"
        />
        <FieldError name="name" />

        <div className="mt-[13px]">
          <FieldLabel>Email</FieldLabel>
          <TextInput
            value={email}
            onChange={setEmail}
            placeholder="you@email.com"
            type="email"
            inputMode="email"
            autoComplete="email"
            ariaLabel="Email"
          />
          <FieldError name="email" />
        </div>

        <div className="mt-[13px]">
          <FieldLabel>Password</FieldLabel>
          <TextInput
            value={password}
            onChange={setPassword}
            type="password"
            autoComplete="new-password"
            ariaLabel="Password"
          />
          <FieldError name="password" />
        </div>

        <div className="mt-[13px]">
          <FieldLabel>Confirm password</FieldLabel>
          <TextInput
            value={confirm}
            onChange={setConfirm}
            type="password"
            autoComplete="new-password"
            ariaLabel="Confirm password"
          />
          <FieldError name="confirm" />
        </div>

        {error ? (
          <div className="mt-[14px]">
            <ErrorBanner message={error} />
          </div>
        ) : null}
        {notice ? (
          <div className="mt-[14px] bg-accent_soft rounded-r11 px-[14px] py-[11px] text-t125 font-medium text-accent_dark">
            {notice}
          </div>
        ) : null}

        <div className="mt-5">
          <Button size="lg" type="submit" disabled={pending}>
            {pending ? 'Creating account…' : 'Create Account'}
          </Button>
        </div>
      </form>

      <div className="text-center text-t13 text-muted mt-[18px]">
        Already have an account?{' '}
        <a href="/login" className="text-accent font-semibold">
          Sign in
        </a>
      </div>

      {demoMode ? (
        <div className="text-center text-t115 text-faint mt-7">
          Running without Supabase — accounts aren’t persisted in demo mode.
        </div>
      ) : null}
    </div>
  )
}
