'use client'

import { useState, useTransition } from 'react'
import { Button, Chip, FieldLabel, MoneyInput, TextInput } from '@/components/ui/controls'
import { Sheet, SheetTitle, useToast } from '@/components/ui/overlays'
import { ErrorBanner } from '@/components/ui/primitives'
import { recordRevenueAction } from '@/lib/actions/revenue'
import { RECORD_CATEGORIES, type RevenueCategory } from '@/lib/domain/revenue'

/** Money already received that no charge covers: recorded as a charge that is paid in full. */
export function RecordRevenueSheet({
  open,
  onClose,
  onDone,
  today,
  players,
}: {
  open: boolean
  onClose: () => void
  onDone: () => void
  today: string
  players: Array<{ id: string; name: string }>
}) {
  const { toast } = useToast()
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState<RevenueCategory>('private')
  const [playerId, setPlayerId] = useState<string | null>(null)
  const [paidOn, setPaidOn] = useState(today)
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [pending, startTransition] = useTransition()

  const save = () => {
    if (!playerId) return
    setError('')
    startTransition(async () => {
      const result = await recordRevenueAction({ playerId, amount, category, paidOn, note })
      if (!result.ok) {
        setError(result.error)
        return
      }
      toast('Revenue recorded')
      setAmount('')
      setNote('')
      setPlayerId(null)
      onDone()
    })
  }

  return (
    <Sheet open={open} onClose={onClose} maxHeight="90%">
      <SheetTitle subtitle="Money you’ve already received">Record Revenue</SheetTitle>

      <div className="mt-4">
        <FieldLabel>Amount</FieldLabel>
        <MoneyInput value={amount} onChange={setAmount} height={50} symbolSize={16} valueSize={18} />
      </div>

      <div className="mt-3">
        <FieldLabel>Category</FieldLabel>
        <div className="flex gap-2 flex-wrap">
          {RECORD_CATEGORIES.map((c) => (
            <Chip
              key={c.key}
              label={c.label}
              selected={category === c.key}
              onClick={() => setCategory(c.key)}
              size="sm"
            />
          ))}
        </div>
      </div>

      <div className="mt-3">
        <FieldLabel>Related person</FieldLabel>
        <div className="flex gap-2 flex-wrap max-h-[120px] overflow-y-auto">
          {players.map((p) => (
            <Chip
              key={p.id}
              label={p.name}
              selected={playerId === p.id}
              onClick={() => setPlayerId(p.id)}
              size="sm"
            />
          ))}
        </div>
      </div>

      <div className="mt-3">
        <FieldLabel>Date</FieldLabel>
        <input
          type="date"
          value={paidOn}
          max={today}
          aria-label="Date"
          onChange={(event) => setPaidOn(event.target.value)}
          className="w-full h-[46px] border border-field rounded-r12 bg-card px-[14px] text-t145 font-medium"
        />
      </div>

      <div className="mt-3">
        <FieldLabel>Note</FieldLabel>
        <TextInput value={note} onChange={setNote} placeholder="Optional" ariaLabel="Note" />
      </div>

      {error ? (
        <div className="mt-3">
          <ErrorBanner message={error} />
        </div>
      ) : null}

      <div className="mt-4">
        <Button size="lg" onClick={save} disabled={pending || !playerId || !amount}>
          {pending ? 'Saving…' : 'Save Revenue'}
        </Button>
      </div>
    </Sheet>
  )
}
