'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { updatePasswordAction } from '@/lib/actions/auth'
import { Button, FieldLabel, TextInput } from '@/components/ui/controls'
import { ErrorBanner } from '@/components/ui/primitives'
import { useToast } from '@/components/ui/overlays'

export function ResetPasswordForm() {
  const router = useRouter()
  const { toast } = useToast()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [fields, setFields] = useState<Record<string, string>>({})
  const [error, setError] = useState('')
  const [pending, startTransition] = useTransition()

  const submit = () => {
    setError('')
    setFields({})
    startTransition(async () => {
      const result = await updatePasswordAction({ password, confirm })
      if (!result.ok) {
        setFields(result.fields ?? {})
        setError(result.fields ? '' : result.error)
        return
      }
      toast('Password updated')
      router.push('/dashboard')
      router.refresh()
    })
  }

  return (
    <div className="flex-1 overflow-y-auto px-6 pb-10 flex flex-col justify-center">
      <div className="text-center">
        <div className="text-t26 font-extrabold tracking-tight3">Set a new password</div>
        <div className="text-t135 text-muted mt-[6px]">
          Choose something you haven’t used before.
        </div>
      </div>

      <form
        className="mt-7"
        onSubmit={(event) => {
          event.preventDefault()
          submit()
        }}
      >
        <FieldLabel>New password</FieldLabel>
        <TextInput
          value={password}
          onChange={setPassword}
          type="password"
          autoComplete="new-password"
          height={48}
          ariaLabel="New password"
        />
        {fields.password ? (
          <div className="text-t115 text-danger_fg mt-[5px] font-medium">
            {fields.password}
          </div>
        ) : null}

        <div className="mt-[14px]">
          <FieldLabel>Confirm password</FieldLabel>
          <TextInput
            value={confirm}
            onChange={setConfirm}
            type="password"
            autoComplete="new-password"
            height={48}
            ariaLabel="Confirm password"
          />
          {fields.confirm ? (
            <div className="text-t115 text-danger_fg mt-[5px] font-medium">
              {fields.confirm}
            </div>
          ) : null}
        </div>

        {error ? (
          <div className="mt-[14px]">
            <ErrorBanner message={error} />
          </div>
        ) : null}

        <div className="mt-5">
          <Button size="lg" type="submit" disabled={pending}>
            {pending ? 'Saving…' : 'Update Password'}
          </Button>
        </div>
      </form>
    </div>
  )
}
