'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Button, FieldLabel, TextInput } from '@/components/ui/controls'
import { useToast } from '@/components/ui/overlays'
import { ErrorBanner, Notice } from '@/components/ui/primitives'
import { inviteCoachAction } from '@/lib/actions/team'
import { copyText } from '@/lib/client/clipboard'

/** Owner-only. Coach is the only role an invitation can create. */
export function InviteForm() {
  const router = useRouter()
  const { toast } = useToast()
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [link, setLink] = useState<{ url: string; email: string } | null>(null)
  const [pending, startTransition] = useTransition()

  const send = () =>
    startTransition(async () => {
      setError('')
      const result = await inviteCoachAction({ email })
      if (!result.ok) {
        setError(result.error)
        return
      }
      setLink({
        url: `${window.location.origin}/invite/${result.data.token}`,
        email: result.data.email,
      })
      router.refresh()
    })

  const copy = async () => {
    if (!link) return
    toast((await copyText(link.url)) ? 'Invitation link copied' : 'Select the link and copy it')
  }

  return (
    <div className="flex-1 overflow-y-auto px-5 pb-10">
      <div className="flex items-center justify-between pt-2">
        <button
          onClick={() => router.back()}
          aria-label="Back"
          className="w-9 h-9 rounded-full border border-line bg-card flex items-center justify-center text-t18 text-ink pb-[2px]"
        >
          ‹
        </button>
        <div className="text-t15 font-bold">Invite Coach</div>
        <div className="w-9" />
      </div>

      {link ? (
        <>
          <div className="mt-6 bg-success_bg text-success rounded-r14 p-3">
            <div className="text-t14 font-bold">Invitation created</div>
            <div className="text-t125 mt-[2px]">For {link.email}</div>
          </div>
          <div className="mt-4">
            <Notice title="Send them this link yourself.">
              CoachOS doesn’t send email. They open the link, sign up with {link.email}, and
              join your team as a coach. It works for 14 days.
            </Notice>
          </div>
          <div className="mt-4 bg-tile border border-line rounded-r12 p-3 text-t12 text-ink break-all select-all">
            {link.url}
          </div>
          <div className="mt-4">
            <Button size="lg" onClick={copy}>
              Copy Link
            </Button>
          </div>
          <div className="mt-3">
            <Button tone="plain" size="lg" onClick={() => router.push('/settings/team')}>
              Done
            </Button>
          </div>
        </>
      ) : (
        <>
          <div className="mt-6">
            <FieldLabel>Email</FieldLabel>
            <TextInput
              value={email}
              onChange={setEmail}
              placeholder="coach@example.com"
              type="email"
              inputMode="email"
              autoComplete="off"
              ariaLabel="Email"
            />
          </div>
          <div className="mt-[13px]">
            <FieldLabel>Role</FieldLabel>
            <select
              aria-label="Role"
              disabled
              className="w-full h-[46px] border border-field rounded-r12 bg-tile px-[14px] text-t145 font-medium text-muted"
            >
              <option>Coach</option>
            </select>
          </div>
          <div className="text-t12 text-muted mt-3 leading-[1.5]">
            Coaches can run sessions, take attendance and manage your roster. They don’t see
            revenue or balances.
          </div>
          {error ? (
            <div className="mt-4">
              <ErrorBanner message={error} />
            </div>
          ) : null}
          <div className="mt-5">
            <Button size="lg" onClick={send} disabled={pending || !email.trim()}>
              {pending ? 'Creating…' : 'Create Invitation'}
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
