'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Button, FieldLabel, TextInput } from '@/components/ui/controls'
import { Sheet, SheetTitle, useToast } from '@/components/ui/overlays'
import { savePlayerAction } from '@/lib/actions/players'
import { buildQuickAddInput } from '@/lib/domain/quickAdd'

/**
 * The lightweight Quick Add Person sheet from the V1 spec: first name, last
 * name, optional phone — nothing else. It saves through the same action as the
 * full player form, then closes and leaves the user exactly where they were
 * (the caller can react to the new person via `onSaved`).
 */
export function QuickAddPersonSheet({
  open,
  onClose,
  onSaved,
  zIndex,
}: {
  open: boolean
  onClose: () => void
  /** Called after the person is saved, before the sheet closes. */
  onSaved?: (person: { id: string; name: string }) => void
  zIndex?: number
}) {
  const router = useRouter()
  const { toast } = useToast()
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [phone, setPhone] = useState('')
  const [error, setError] = useState('')
  const [pending, startTransition] = useTransition()

  const close = () => {
    setFirstName('')
    setLastName('')
    setPhone('')
    setError('')
    onClose()
  }

  const save = () => {
    const built = buildQuickAddInput({ firstName, lastName, phone })
    if (!built.ok) {
      setError(built.error)
      return
    }
    setError('')
    startTransition(async () => {
      const result = await savePlayerAction(built.input)
      if (!result.ok) {
        setError(result.error)
        return
      }
      toast(`Added ${built.input.name}`)
      onSaved?.({ id: result.data.playerId, name: built.input.name })
      // Re-read the current screen so the new person shows up in it.
      router.refresh()
      close()
    })
  }

  return (
    <Sheet open={open} onClose={close} zIndex={zIndex}>
      <SheetTitle subtitle="Only the name is required. Finish the profile later.">
        Quick Add Person
      </SheetTitle>

      <div className="mt-4">
        <FieldLabel>First name *</FieldLabel>
        <TextInput value={firstName} onChange={setFirstName} autoComplete="off" ariaLabel="First name" />
      </div>
      <div className="mt-3">
        <FieldLabel>Last name *</FieldLabel>
        <TextInput value={lastName} onChange={setLastName} autoComplete="off" ariaLabel="Last name" />
      </div>
      <div className="mt-3">
        <FieldLabel>Phone</FieldLabel>
        <TextInput
          value={phone}
          onChange={setPhone}
          placeholder="Optional"
          type="tel"
          inputMode="tel"
          autoComplete="off"
          ariaLabel="Phone"
        />
      </div>

      {error ? (
        <div role="alert" className="text-t125 text-danger_fg mt-3">
          {error}
        </div>
      ) : null}

      <div className="mt-4">
        <Button onClick={save} disabled={pending}>
          {pending ? 'Saving…' : 'Save & Continue'}
        </Button>
      </div>
    </Sheet>
  )
}
