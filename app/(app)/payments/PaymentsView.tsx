'use client'

import { useRouter } from 'next/navigation'
import { useMemo, useState, useTransition } from 'react'
import { ScreenBody } from '@/components/shell/AppShell'
import { Avatar, Card, EmptyInline } from '@/components/ui/primitives'
import {
  Button,
  Chip,
  MoneyInput,
  SearchInput,
  Segmented,
  TextInput,
} from '@/components/ui/controls'
import { Dialog, Sheet, SheetTitle, useToast } from '@/components/ui/overlays'
import {
  createManualChargeAction,
  markPaidAction,
  markUnpaidAction,
  recordCreditAction,
  recordPaymentAction,
} from '@/lib/actions/payments'
import { addDays, formatMedium } from '@/lib/domain/dates'
import { formatMoney } from '@/lib/domain/money'
import type { ChargeStatus } from '@/lib/domain/types'

export interface ChargeRow {
  id: string
  playerId: string
  playerName: string
  subtitle: string
  sheetContext: string
  sessionId: string | null
  amountCents: number
  paidCents: number
  creditedCents: number
  outstandingCents: number
  status: ChargeStatus
  isPending: boolean
  isOverdue: boolean
  dueDate: string
  badge: { text: string; bg: string; fg: string }
  note: string
  searchText: string
}

type Tab = 'pending' | 'paid' | 'overdue'

export function PaymentsView({
  rows,
  today,
  initialTab,
  initialPlayerFilter,
  players,
  playerNames,
}: {
  rows: ChargeRow[]
  today: string
  initialTab: Tab
  initialPlayerFilter: string | null
  players: Array<{ id: string; name: string }>
  playerNames: Record<string, string>
}) {
  const router = useRouter()
  const { toast } = useToast()
  const [tab, setTab] = useState<Tab>(initialTab)
  const [query, setQuery] = useState('')
  const [playerFilter, setPlayerFilter] = useState<string | null>(initialPlayerFilter)
  const [openChargeId, setOpenChargeId] = useState<string | null>(null)
  const [creditOpen, setCreditOpen] = useState(false)
  const [partialOpen, setPartialOpen] = useState(false)
  const [manualOpen, setManualOpen] = useState(false)
  const [confirmUnpaid, setConfirmUnpaid] = useState(false)
  const [pending, startTransition] = useTransition()

  const open = rows.find((row) => row.id === openChargeId) ?? null

  const visible = useMemo(() => {
    const trimmed = query.trim().toLowerCase()
    const filtered = rows.filter((row) => {
      if (playerFilter && row.playerId !== playerFilter) return false
      if (tab === 'pending' && !row.isPending) return false
      if (tab === 'paid' && row.status !== 'paid') return false
      if (tab === 'overdue' && !row.isOverdue) return false
      if (trimmed && !row.searchText.includes(trimmed)) return false
      return true
    })

    return filtered.sort((a, b) => {
      if (tab === 'paid') return a.dueDate < b.dueDate ? 1 : -1
      const ao = a.isOverdue ? 0 : 1
      const bo = b.isOverdue ? 0 : 1
      if (ao !== bo) return ao - bo
      return a.dueDate < b.dueDate ? -1 : 1
    })
  }, [rows, tab, query, playerFilter])

  const total = visible.reduce(
    (sum, row) => sum + (tab === 'paid' ? row.paidCents : row.outstandingCents),
    0,
  )
  const uniquePlayers = new Set(visible.map((row) => row.playerId)).size

  const run = (
    fn: () => Promise<{ ok: boolean; error?: string }>,
    successMessage: string,
    onDone?: () => void,
  ) =>
    startTransition(async () => {
      const result = await fn()
      if (result.ok) {
        toast(successMessage)
        onDone?.()
        router.refresh()
      } else {
        toast(result.error ?? 'Something went wrong.')
      }
    })

  return (
    <ScreenBody className="px-5 pt-1">
      <div className="flex items-center justify-between pt-3">
        <div className="text-t25 font-bold tracking-tight2">Payments</div>
        <button
          onClick={() => setManualOpen(true)}
          className="text-t125 font-semibold px-[13px] py-[9px] rounded-full bg-ink text-shell"
        >
          Add Charge
        </button>
      </div>

      <div className="mt-[14px]">
        <SearchInput value={query} onChange={setQuery} placeholder="Search payments" />
      </div>

      {playerFilter ? (
        <div className="flex mt-3">
          <button
            onClick={() => setPlayerFilter(null)}
            className="flex items-center gap-[7px] text-t125 font-semibold bg-accent_soft text-accent_dark px-3 py-[7px] rounded-full"
          >
            <span>{playerNames[playerFilter] ?? 'Player'}</span>
            <span className="text-t11">✕</span>
          </button>
        </div>
      ) : null}

      <Segmented
        className="mt-3"
        options={[
          { value: 'pending', label: 'Pending' },
          { value: 'paid', label: 'Paid' },
          { value: 'overdue', label: 'Overdue' },
        ]}
        value={tab}
        onChange={setTab}
      />

      {visible.length > 0 ? (
        <>
          <div className="bg-card border border-line rounded-r16 shadow-card mt-[14px] px-[18px] py-[14px] flex items-center justify-between">
            <div>
              <div className="font-mono text-t10 font-medium tracking-mono2 uppercase text-muted">
                {tab === 'pending' ? 'Pending total' : tab === 'paid' ? 'Collected' : 'Overdue total'}
              </div>
              <div className="text-t24 font-bold mt-[3px] tnum">{formatMoney(total)}</div>
            </div>
            <div className="text-t12 text-muted text-right">
              {visible.length} charge{visible.length === 1 ? '' : 's'} · {uniquePlayers}{' '}
              player{uniquePlayers === 1 ? '' : 's'}
            </div>
          </div>

          <Card className="mt-3">
            {visible.map((row, index) => (
              <button
                key={row.id}
                onClick={() => setOpenChargeId(row.id)}
                className={`w-full flex items-center gap-3 px-4 py-[13px] text-left ${
                  index === 0 ? '' : 'border-t border-divider'
                }`}
              >
                <Avatar name={row.playerName} size={40} />
                <div className="flex-1 min-w-0">
                  <div className="text-t15 font-semibold">{row.playerName}</div>
                  <div className="text-t125 text-muted mt-[1px]">{row.subtitle}</div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-t15 font-bold tnum">
                    {formatMoney(tab === 'paid' ? row.paidCents : row.outstandingCents)}
                  </div>
                  <span
                    className="text-t11 font-semibold px-2 py-[2px] rounded-full inline-block mt-[3px]"
                    style={{ background: row.badge.bg, color: row.badge.fg }}
                  >
                    {row.badge.text}
                  </span>
                </div>
              </button>
            ))}
          </Card>
          <div className="text-center text-t115 text-faint pt-[14px]">
            Tap a row for details and actions
          </div>
        </>
      ) : (
        <EmptyInline
          title={
            query.trim()
              ? `No payments match “${query}”`
              : tab === 'pending'
                ? 'No outstanding payments'
                : tab === 'paid'
                  ? 'No collected payments yet'
                  : 'Nothing overdue'
          }
          body={
            query.trim()
              ? 'Try a different name or session.'
              : tab === 'pending'
                ? 'Everything is settled.'
                : tab === 'paid'
                  ? 'Payments you mark paid will appear here.'
                  : 'No pending charges are past due.'
          }
        />
      )}

      {/* ---- payment sheet ---- */}
      <Sheet
        open={!!open && !creditOpen && !partialOpen}
        onClose={() => setOpenChargeId(null)}
        maxHeight="82%"
      >
        {open ? (
          <>
            <div className="flex items-center gap-3">
              <Avatar name={open.playerName} size={44} />
              <div className="flex-1 min-w-0">
                <div className="text-t16 font-bold">{open.playerName}</div>
                <div className="text-t125 text-muted mt-[1px]">{open.sheetContext}</div>
              </div>
              <span
                className="text-t115 font-semibold px-[10px] py-[5px] rounded-full shrink-0"
                style={{ background: open.badge.bg, color: open.badge.fg }}
              >
                {open.badge.text}
              </span>
            </div>

            <div className="bg-card border border-line rounded-r14 mt-4 px-4 py-1">
              <SheetLine label="Due" value={formatMoney(open.amountCents)} />
              <SheetLine
                label="Credit"
                value={
                  open.creditedCents > 0 ? `−${formatMoney(open.creditedCents)}` : '$0'
                }
                muted={open.creditedCents === 0}
              />
              {open.paidCents > 0 ? (
                <SheetLine
                  label="Collected"
                  value={formatMoney(open.paidCents)}
                  bold
                  color="#2E7D4F"
                />
              ) : null}
              {open.outstandingCents > 0 ? (
                <SheetLine
                  label="Remaining"
                  value={formatMoney(open.outstandingCents)}
                  bold
                />
              ) : null}
            </div>

            {open.note ? (
              <div className="text-t125 text-muted mt-3 leading-[1.5] pretty">
                {open.note}
              </div>
            ) : null}

            <div className="flex flex-col gap-[9px] mt-4">
              {open.isPending ? (
                <>
                  <Button
                    tone="primary"
                    size="sm"
                    disabled={pending}
                    onClick={() =>
                      run(
                        () =>
                          markPaidAction({
                            chargeId: open.id,
                            expectedOutstanding: open.outstandingCents,
                          }),
                        `Marked paid · ${formatMoney(open.outstandingCents)}`,
                        () => setOpenChargeId(null),
                      )
                    }
                  >
                    Mark Paid
                  </Button>
                  <Button tone="plain" size="sm" onClick={() => setPartialOpen(true)}>
                    Record Partial Payment
                  </Button>
                  <Button tone="plain" size="sm" onClick={() => setCreditOpen(true)}>
                    Credit
                  </Button>
                </>
              ) : null}
              {open.status === 'paid' ? (
                <Button tone="danger" size="sm" onClick={() => setConfirmUnpaid(true)}>
                  Mark Unpaid
                </Button>
              ) : null}
            </div>

            {open.sessionId ? (
              <button
                onClick={() => router.push(`/sessions/${open.sessionId}`)}
                className="w-full text-center text-t13 font-semibold text-accent pt-[15px] pb-[2px]"
              >
                View Session
              </button>
            ) : null}
          </>
        ) : null}
      </Sheet>

      {open ? (
        <>
          <AmountSheet
            open={partialOpen}
            title="Record Payment"
            subtitle={open.playerName}
            lines={[
              ['Original amount', formatMoney(open.amountCents)],
              ['Already collected', formatMoney(open.paidCents)],
              ['Remaining', formatMoney(open.outstandingCents)],
            ]}
            suffix="payment"
            confirmLabel="Record Payment"
            confirmTone="primary"
            notePlaceholder="Note (optional)"
            maxCents={open.outstandingCents}
            pending={pending}
            onClose={() => setPartialOpen(false)}
            onSubmit={(amount, note) =>
              run(
                () =>
                  recordPaymentAction({
                    chargeId: open.id,
                    amount,
                    expectedOutstanding: open.outstandingCents,
                    note,
                  }),
                `Payment recorded · ${formatMoney(Math.round(Number(amount) * 100))}`,
                () => {
                  setPartialOpen(false)
                  setOpenChargeId(null)
                },
              )
            }
          />

          <AmountSheet
            open={creditOpen}
            title="Credit Charge"
            subtitle={open.playerName}
            lines={[
              ['Original amount', formatMoney(open.amountCents)],
              ['Existing credit', formatMoney(open.creditedCents)],
              ['Remaining', formatMoney(open.outstandingCents)],
            ]}
            suffix="credit"
            confirmLabel="Apply Credit"
            confirmTone="ink"
            notePlaceholder="Reason (optional)"
            maxCents={open.outstandingCents}
            pending={pending}
            onClose={() => setCreditOpen(false)}
            onSubmit={(amount, note) =>
              run(
                () =>
                  recordCreditAction({ chargeId: open.id, amount, reason: note }),
                'Credit applied',
                () => {
                  setCreditOpen(false)
                  setOpenChargeId(null)
                },
              )
            }
          />

          <Dialog
            open={confirmUnpaid}
            title="Mark unpaid?"
            body={`${formatMoney(open.paidCents)} will be removed from collected revenue and return to pending.`}
            buttons={[
              { label: 'Cancel', tone: 'plain', onClick: () => setConfirmUnpaid(false) },
              {
                label: 'Mark Unpaid',
                tone: 'danger',
                onClick: () => {
                  setConfirmUnpaid(false)
                  run(() => markUnpaidAction({ chargeId: open.id }), 'Marked unpaid', () =>
                    setOpenChargeId(null),
                  )
                },
              },
            ]}
          />
        </>
      ) : null}

      <ManualChargeSheet
        open={manualOpen}
        players={players}
        today={today}
        pending={pending}
        onClose={() => setManualOpen(false)}
        onSubmit={(input) =>
          run(() => createManualChargeAction(input), 'Charge added', () =>
            setManualOpen(false),
          )
        }
      />
    </ScreenBody>
  )
}

function SheetLine({
  label,
  value,
  bold,
  color,
  muted,
}: {
  label: string
  value: string
  bold?: boolean
  color?: string
  muted?: boolean
}) {
  return (
    <div className="flex justify-between items-center py-[11px] border-t border-divider first:border-t-0">
      <span className="text-t135 text-muted">{label}</span>
      <span
        className={`text-t15 tnum ${bold ? 'font-bold' : 'font-medium'}`}
        style={{ color: color ?? (muted ? '#8A8E89' : '#171918') }}
      >
        {value}
      </span>
    </div>
  )
}

function AmountSheet({
  open,
  title,
  subtitle,
  lines,
  suffix,
  confirmLabel,
  confirmTone,
  notePlaceholder,
  maxCents,
  pending,
  onClose,
  onSubmit,
}: {
  open: boolean
  title: string
  subtitle: string
  lines: Array<[string, string]>
  suffix: string
  confirmLabel: string
  confirmTone: 'primary' | 'ink'
  notePlaceholder: string
  maxCents: number
  pending: boolean
  onClose: () => void
  onSubmit: (amount: string, note: string) => void
}) {
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')

  const submit = () => {
    const cents = Math.round(Number(amount) * 100)
    if (!amount || !Number.isFinite(cents) || cents <= 0) {
      setError('Enter an amount.')
      return
    }
    if (cents > maxCents) {
      setError(`Amount cannot exceed the remaining ${formatMoney(maxCents)}.`)
      return
    }
    setError('')
    onSubmit(amount, note)
  }

  return (
    <Sheet open={open} onClose={onClose} zIndex={45}>
      <SheetTitle subtitle={subtitle}>{title}</SheetTitle>
      <div className="bg-card border border-line rounded-r14 mt-[14px] px-4 py-1">
        {lines.map(([label, value]) => (
          <div
            key={label}
            className="flex justify-between py-[10px] border-t border-divider first:border-t-0"
          >
            <span className="text-t13 text-muted">{label}</span>
            <span className="text-t14 font-semibold tnum">{value}</span>
          </div>
        ))}
      </div>
      <div className="mt-[14px]">
        <MoneyInput
          value={amount}
          onChange={setAmount}
          suffix={suffix}
          height={50}
          symbolSize={17}
          valueSize={18}
        />
      </div>
      <div className="mt-[10px]">
        <TextInput
          value={note}
          onChange={setNote}
          placeholder={notePlaceholder}
          height={44}
          className="!text-t135"
          ariaLabel={notePlaceholder}
        />
      </div>
      {error ? (
        <div className="mt-[10px] bg-danger_bg rounded-r11 px-[13px] py-[10px] text-t125 font-medium text-danger_fg">
          {error}
        </div>
      ) : null}
      <div className="mt-[14px]">
        <Button tone={confirmTone} size="md" onClick={submit} disabled={pending}>
          {confirmLabel}
        </Button>
      </div>
    </Sheet>
  )
}

function ManualChargeSheet({
  open,
  players,
  today,
  pending,
  onClose,
  onSubmit,
}: {
  open: boolean
  players: Array<{ id: string; name: string }>
  today: string
  pending: boolean
  onClose: () => void
  onSubmit: (input: {
    playerId: string
    amount: string
    dueDate: string
    label: string
  }) => void
}) {
  const [playerId, setPlayerId] = useState<string | null>(null)
  const [amount, setAmount] = useState('')
  const [due, setDue] = useState(today)
  const [label, setLabel] = useState('')
  const [error, setError] = useState('')

  const dueOptions = [
    { label: 'Due today', iso: today },
    { label: 'Tomorrow', iso: addDays(today, 1) },
    { label: 'In a week', iso: addDays(today, 7) },
    { label: 'In two weeks', iso: addDays(today, 14) },
  ]

  const submit = () => {
    if (!playerId) {
      setError('Choose a player.')
      return
    }
    if (!amount || Number(amount) <= 0) {
      setError('Enter an amount.')
      return
    }
    setError('')
    onSubmit({ playerId, amount, dueDate: due, label })
  }

  return (
    <Sheet open={open} onClose={onClose} maxHeight="84%">
      <SheetTitle>Add Manual Charge</SheetTitle>

      <div className="font-mono text-t10 font-medium tracking-mono2 uppercase text-muted mt-4">
        Player
      </div>
      <div className="flex flex-wrap gap-[7px] mt-[9px]">
        {players.map((player) => (
          <Chip
            key={player.id}
            label={player.name}
            size="sm"
            selected={playerId === player.id}
            onClick={() => setPlayerId(player.id)}
          />
        ))}
      </div>

      <div className="font-mono text-t10 font-medium tracking-mono2 uppercase text-muted mt-4">
        Amount
      </div>
      <div className="mt-[9px]">
        <MoneyInput
          value={amount}
          onChange={setAmount}
          height={50}
          symbolSize={17}
          valueSize={18}
        />
      </div>

      <div className="font-mono text-t10 font-medium tracking-mono2 uppercase text-muted mt-4">
        Due
      </div>
      <div className="flex flex-wrap gap-[7px] mt-[9px]">
        {dueOptions.map((option) => (
          <Chip
            key={option.iso}
            label={option.label}
            size="sm"
            selected={due === option.iso}
            onClick={() => setDue(option.iso)}
          />
        ))}
      </div>

      <div className="mt-4">
        <TextInput
          value={label}
          onChange={setLabel}
          placeholder="What’s this for? e.g. Racquet restring"
          className="!text-t135"
          ariaLabel="Charge description"
        />
      </div>

      {error ? (
        <div className="mt-[10px] bg-danger_bg rounded-r11 px-[13px] py-[10px] text-t125 font-medium text-danger_fg">
          {error}
        </div>
      ) : null}

      <div className="mt-[14px]">
        <Button size="md" onClick={submit} disabled={pending}>
          Add Charge
        </Button>
      </div>
    </Sheet>
  )
}
