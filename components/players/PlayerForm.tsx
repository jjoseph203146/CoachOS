'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { savePlayerAction } from '@/lib/actions/players'
import { Button, Chip, FieldLabel, TextArea, TextInput } from '@/components/ui/controls'
import { ErrorBanner } from '@/components/ui/primitives'
import { useToast } from '@/components/ui/overlays'
import { formatMoney } from '@/lib/domain/money'

export interface PlayerFormValues {
  playerId?: string
  name: string
  phone: string
  email: string
  level: 'Beginner' | 'Intermediate' | 'Advanced'
  rate: string
  notes: string
}

/** New Player / Edit Player. Matches the prototype's "Player Form" screen. */
export function PlayerForm({
  initial,
  coachDefaultRateCents,
}: {
  initial: PlayerFormValues
  coachDefaultRateCents: number
}) {
  const router = useRouter()
  const { toast } = useToast()
  const [values, setValues] = useState(initial)
  const [error, setError] = useState('')
  const [pending, startTransition] = useTransition()

  const isEdit = !!initial.playerId
  const set = <K extends keyof PlayerFormValues>(key: K, value: PlayerFormValues[K]) =>
    setValues((current) => ({ ...current, [key]: value }))

  const submit = () => {
    setError('')
    startTransition(async () => {
      const result = await savePlayerAction(values)
      if (!result.ok) {
        setError(result.error)
        return
      }
      toast(isEdit ? 'Player updated' : 'Player added')
      router.replace(`/players/${result.data.playerId}`)
      router.refresh()
    })
  }

  return (
    <div className="flex-1 overflow-y-auto px-5 pb-10">
      <div className="flex items-center justify-between pt-2">
        <button
          onClick={() => router.back()}
          aria-label="Close"
          className="w-9 h-9 rounded-full border border-line bg-card flex items-center justify-center text-t14 text-ink"
        >
          ✕
        </button>
        <div className="text-t15 font-bold">{isEdit ? 'Edit Player' : 'New Player'}</div>
        <div className="w-9" />
      </div>

      <div className="mt-5">
        <FieldLabel>Name</FieldLabel>
        <TextInput
          value={values.name}
          onChange={(value) => set('name', value)}
          placeholder="Full name"
          ariaLabel="Player name"
        />
      </div>

      <div className="grid grid-cols-2 gap-[10px] mt-3">
        <div>
          <FieldLabel>Phone</FieldLabel>
          <TextInput
            value={values.phone}
            onChange={(value) => set('phone', value)}
            placeholder="(555) 555-0100"
            inputMode="tel"
            className="!text-t14"
            ariaLabel="Phone"
          />
        </div>
        <div>
          <FieldLabel>Email</FieldLabel>
          <TextInput
            value={values.email}
            onChange={(value) => set('email', value)}
            placeholder="name@email.com"
            inputMode="email"
            className="!text-t14"
            ariaLabel="Email"
          />
        </div>
      </div>

      <div className="mt-[14px]">
        <div className="text-t12 font-semibold text-muted mb-2">Level</div>
        <div className="flex gap-2">
          {(['Beginner', 'Intermediate', 'Advanced'] as const).map((level) => (
            <Chip
              key={level}
              label={level}
              size="sm"
              selected={values.level === level}
              onClick={() => set('level', level)}
            />
          ))}
        </div>
      </div>

      <div className="mt-[14px]">
        <FieldLabel>Default rate</FieldLabel>
        <div className="flex items-center bg-card border border-line rounded-r12 h-[46px] px-[14px]">
          <span className="text-t15 font-bold text-subtle">$</span>
          <input
            value={values.rate}
            inputMode="decimal"
            aria-label="Default rate"
            onChange={(event) => set('rate', event.target.value.replace(/[^0-9.]/g, ''))}
            placeholder="0"
            className="flex-1 border-none bg-transparent text-t15 font-semibold pl-[6px] min-w-0 tnum"
          />
          <span className="text-t12 text-subtle">per session</span>
        </div>
        <div className="text-t115 text-subtle mt-[6px]">
          Leave empty to use your default rate ({formatMoney(coachDefaultRateCents)})
        </div>
      </div>

      <div className="mt-[14px]">
        <FieldLabel>Coach notes</FieldLabel>
        <TextArea
          value={values.notes}
          onChange={(value) => set('notes', value)}
          placeholder="Technique focus, goals, injuries…"
        />
      </div>

      {error ? (
        <div className="mt-[14px]">
          <ErrorBanner message={error} />
        </div>
      ) : null}

      <div className="mt-[18px]">
        <Button size="lg" onClick={submit} disabled={pending}>
          {pending ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Player'}
        </Button>
      </div>
    </div>
  )
}
