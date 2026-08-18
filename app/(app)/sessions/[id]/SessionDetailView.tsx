'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { ScreenBody } from '@/components/shell/AppShell'
import { Avatar, Card, DetailHeader } from '@/components/ui/primitives'
import { Button, Chip, MoneyInput, Stepper, TextInput } from '@/components/ui/controls'
import { Dialog, Sheet, SheetTitle, useToast } from '@/components/ui/overlays'
import {
  addPlayerToSessionAction,
  cancelSessionAction,
  removePlayerFromSessionAction,
  updateSessionAction,
} from '@/lib/actions/sessions'
import { addDays, dayOfMonth, dowShort, formatTime } from '@/lib/domain/dates'
import { formatMoney } from '@/lib/domain/money'

interface SessionData {
  id: string
  name: string
  type: 'private' | 'group'
  date: string
  startMin: number
  durationMin: number
  priceCents: number
  priceInput: string
  isFree: boolean
  location: string
  capacity: number | null
  cancelled: boolean
  attendanceSkipped: boolean
}

interface RosterRow {
  playerId: string
  name: string
  attendanceText: string
  attendanceColor: string
  chargeId: string | null
  payText: string
  payBg: string
  payFg: string
  freeTag: boolean
}

export function SessionDetailView({
  session,
  typeChip,
  statusLine,
  dateLine,
  timeLine,
  locationLine,
  priceLine,
  capacityLine,
  showTakeAttendance,
  canAddPlayer,
  roster,
  addablePlayers,
  addChargeNote,
  unpaid,
  today,
}: {
  session: SessionData
  typeChip: string
  statusLine: string
  dateLine: string
  timeLine: string
  locationLine: string
  priceLine: string
  capacityLine: string
  showTakeAttendance: boolean
  canAddPlayer: boolean
  roster: RosterRow[]
  addablePlayers: Array<{ id: string; name: string; level: string }>
  addChargeNote: string
  unpaid: { count: number; cents: number }
  today: string
}) {
  const router = useRouter()
  const { toast } = useToast()
  const [editOpen, setEditOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [menuFor, setMenuFor] = useState<RosterRow | null>(null)
  const [removeTarget, setRemoveTarget] = useState<RosterRow | null>(null)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [pending, startTransition] = useTransition()

  const run = (
    fn: () => Promise<{ ok: boolean; error?: string }>,
    message: string,
    after?: () => void,
  ) =>
    startTransition(async () => {
      const result = await fn()
      if (result.ok) {
        toast(message)
        after?.()
        router.refresh()
      } else {
        toast(result.error ?? 'Something went wrong.')
      }
    })

  const removeHasCharge =
    removeTarget !== null &&
    roster.find((r) => r.playerId === removeTarget.playerId)?.chargeId !== null

  return (
    <ScreenBody className="px-5">
      <DetailHeader
        backHref="/schedule"
        title={
          <div className="font-mono text-t105 font-medium tracking-mono2 uppercase text-muted">
            {typeChip}
          </div>
        }
      />

      {session.cancelled ? (
        <div className="mt-[14px] bg-neutral_chip rounded-r12 px-[14px] py-[10px] text-t125 font-semibold text-muted text-center">
          This session was cancelled
        </div>
      ) : null}

      <div className="text-t23 font-bold tracking-tight15 mt-4">{session.name}</div>
      <div className="text-t13 text-muted mt-[5px] font-medium">{statusLine}</div>

      <div className="bg-card border border-line rounded-r16 shadow-card mt-4 px-4 py-[2px]">
        <DetailRow label="Date" value={dateLine} first />
        <DetailRow label="Time" value={timeLine} numeric />
        <DetailRow label="Location" value={locationLine} />
        <DetailRow label="Price" value={priceLine} numeric />
        {session.type === 'group' ? (
          <DetailRow label="Capacity" value={capacityLine} />
        ) : null}
      </div>

      {showTakeAttendance ? (
        <button
          onClick={() => router.push(`/sessions/${session.id}/attendance`)}
          className="w-full h-12 rounded-r12 bg-accent text-white text-t15 font-semibold flex items-center justify-center mt-[14px]"
        >
          Take Attendance
        </button>
      ) : null}

      <div className="mt-[26px] flex items-center justify-between">
        <div className="font-mono text-t105 font-medium tracking-mono uppercase text-muted">
          Roster
        </div>
        {session.type === 'group' ? (
          <div className="text-t12 text-muted">{capacityLine}</div>
        ) : null}
      </div>

      {roster.length > 0 ? (
        <Card className="mt-[10px]">
          {roster.map((row, index) => (
            <div
              key={row.playerId}
              className={`flex items-center gap-[11px] pl-4 pr-3 py-[13px] ${
                index === 0 ? '' : 'border-t border-divider'
              }`}
            >
              <Avatar name={row.name} size={40} />
              <div className="flex-1 min-w-0">
                <div className="text-t15 font-semibold">{row.name}</div>
                <div
                  className="text-t125 mt-[1px] font-medium"
                  style={{ color: row.attendanceColor }}
                >
                  {row.attendanceText}
                </div>
              </div>
              {row.chargeId ? (
                <button
                  onClick={() => router.push('/payments?tab=pending')}
                  className="text-t115 font-semibold px-[10px] py-[6px] rounded-full shrink-0 tnum"
                  style={{ background: row.payBg, color: row.payFg }}
                >
                  {row.payText}
                </button>
              ) : null}
              {row.freeTag ? (
                <span className="text-t115 font-semibold px-[10px] py-[6px] rounded-full bg-neutral_chip text-muted shrink-0">
                  Free
                </span>
              ) : null}
              <button
                onClick={() => setMenuFor(row)}
                aria-label={`Options for ${row.name}`}
                className="w-8 h-8 rounded-full flex items-center justify-center text-subtle text-t17 font-bold shrink-0 tracking-[.5px]"
              >
                ⋯
              </button>
            </div>
          ))}
        </Card>
      ) : (
        <div className="bg-card border border-line rounded-r16 p-[22px] text-center mt-[10px]">
          <div className="text-t14 font-semibold">No players on this session</div>
          <div className="text-t125 text-muted mt-[3px]">
            Add a player to build the roster.
          </div>
        </div>
      )}

      {canAddPlayer ? (
        <button
          onClick={() => setAddOpen(true)}
          className="w-full mt-[10px] h-11 border border-dashed border-dashed rounded-r12 flex items-center justify-center text-t135 font-semibold text-accent bg-card"
          style={{ borderColor: '#C9CCC3', borderStyle: 'dashed' }}
        >
          + Add Player
        </button>
      ) : null}

      {!session.cancelled ? (
        <div className="mt-[26px]">
          <div className="font-mono text-t105 font-medium tracking-mono uppercase text-muted">
            Actions
          </div>
          <div className="grid grid-cols-2 gap-[10px] mt-[10px]">
            <Button tone="plain" size="sm" onClick={() => setEditOpen(true)}>
              Edit
            </Button>
            <Button
              tone="plain"
              size="sm"
              onClick={() => router.push(`/schedule/new?duplicate=${session.id}`)}
            >
              Duplicate
            </Button>
          </div>
          <div className="mt-[10px]">
            <Button tone="danger" size="sm" onClick={() => setCancelOpen(true)}>
              Cancel Session
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-[26px]">
          <Button
            tone="plain"
            size="sm"
            onClick={() => router.push(`/schedule/new?duplicate=${session.id}`)}
          >
            Duplicate as New Session
          </Button>
        </div>
      )}

      <EditSessionSheet
        open={editOpen}
        session={session}
        today={today}
        pending={pending}
        onClose={() => setEditOpen(false)}
        onSaved={() => {
          setEditOpen(false)
          router.refresh()
        }}
      />

      <Sheet open={addOpen} onClose={() => setAddOpen(false)} maxHeight="72%">
        <SheetTitle subtitle={addChargeNote}>Add Player</SheetTitle>
        {addablePlayers.length > 0 ? (
          <div className="bg-card border border-line rounded-r14 mt-[14px] overflow-hidden">
            {addablePlayers.map((player, index) => (
              <button
                key={player.id}
                onClick={() =>
                  run(
                    () =>
                      addPlayerToSessionAction({
                        sessionId: session.id,
                        playerId: player.id,
                      }),
                    `${player.name.split(' ')[0]} added`,
                    () => setAddOpen(false),
                  )
                }
                className={`w-full flex items-center gap-3 px-4 py-3 ${
                  index === 0 ? '' : 'border-t border-divider'
                }`}
              >
                <Avatar name={player.name} size={38} />
                <div className="flex-1 text-left">
                  <div className="text-t145 font-semibold">{player.name}</div>
                  <div className="text-t12 text-muted">{player.level}</div>
                </div>
                <span className="text-t13 font-semibold text-accent">Add</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="text-center text-t13 text-muted pt-[22px] pb-[6px]">
            Every active player is already on this session.
          </div>
        )}
      </Sheet>

      <Sheet open={!!menuFor} onClose={() => setMenuFor(null)}>
        {menuFor ? (
          <>
            <SheetTitle>{menuFor.name}</SheetTitle>
            <button
              onClick={() => {
                const target = menuFor
                setMenuFor(null)
                router.push(`/players/${target.playerId}`)
              }}
              className="w-full flex items-center px-[2px] py-[15px] border-b border-divider mt-2"
            >
              <div className="flex-1 text-left text-t15 font-semibold">View Player</div>
              <span className="text-chevron text-t17">›</span>
            </button>
            {session.type === 'group' && !session.cancelled ? (
              <button
                onClick={() => {
                  const target = menuFor
                  setMenuFor(null)
                  setRemoveTarget(target)
                }}
                className="w-full text-left px-[2px] py-[15px] text-t15 font-semibold text-danger_fg"
              >
                Remove from Session
              </button>
            ) : null}
          </>
        ) : null}
      </Sheet>

      {/* Removing a player: keep or credit their unpaid charge. */}
      <Dialog
        open={!!removeTarget && removeHasCharge}
        title={`Remove ${removeTarget?.name.split(' ')[0] ?? ''}?`}
        body={`${removeTarget?.name.split(' ')[0] ?? 'They'} has a charge for this session. Removing a player doesn’t erase their financial record. What should happen?`}
        buttons={[
          {
            label: 'Keep the charge',
            tone: 'ink',
            onClick: () => {
              const target = removeTarget!
              setRemoveTarget(null)
              run(
                () =>
                  removePlayerFromSessionAction({
                    sessionId: session.id,
                    playerId: target.playerId,
                    chargeDecision: 'keep',
                  }),
                `${target.name.split(' ')[0]} removed from session`,
              )
            },
          },
          {
            label: 'Credit the charge',
            tone: 'plain',
            onClick: () => {
              const target = removeTarget!
              setRemoveTarget(null)
              run(
                () =>
                  removePlayerFromSessionAction({
                    sessionId: session.id,
                    playerId: target.playerId,
                    chargeDecision: 'credit',
                  }),
                `${target.name.split(' ')[0]} removed from session`,
              )
            },
          },
          { label: 'Cancel', tone: 'plain', onClick: () => setRemoveTarget(null) },
        ]}
      />

      <Dialog
        open={!!removeTarget && !removeHasCharge}
        title={`Remove ${removeTarget?.name.split(' ')[0] ?? ''} from this session?`}
        body="No charges are attached to this player for this session."
        buttons={[
          { label: 'Cancel', tone: 'plain', onClick: () => setRemoveTarget(null) },
          {
            label: 'Remove',
            tone: 'danger',
            onClick: () => {
              const target = removeTarget!
              setRemoveTarget(null)
              run(
                () =>
                  removePlayerFromSessionAction({
                    sessionId: session.id,
                    playerId: target.playerId,
                    chargeDecision: 'keep',
                  }),
                `${target.name.split(' ')[0]} removed from session`,
              )
            },
          },
        ]}
      />

      {/* Cancelling: the charge decision travels with the cancellation. */}
      <Dialog
        open={cancelOpen && unpaid.count > 0}
        title="Cancel session?"
        body={`This session has ${formatMoney(unpaid.cents)} in unpaid charges. Paid charges are never changed. What should happen to the unpaid ones?`}
        buttons={[
          {
            label: 'Void unpaid charges',
            tone: 'danger',
            onClick: () => {
              setCancelOpen(false)
              run(
                () =>
                  cancelSessionAction({
                    sessionId: session.id,
                    chargeDecision: 'void',
                  }),
                'Session cancelled',
              )
            },
          },
          {
            label: 'Keep unpaid charges',
            tone: 'ink',
            onClick: () => {
              setCancelOpen(false)
              run(
                () =>
                  cancelSessionAction({
                    sessionId: session.id,
                    chargeDecision: 'keep',
                  }),
                'Session cancelled',
              )
            },
          },
          { label: 'Don’t cancel', tone: 'plain', onClick: () => setCancelOpen(false) },
        ]}
      />

      <Dialog
        open={cancelOpen && unpaid.count === 0}
        title="Cancel this session?"
        body="The session stays on your schedule, marked as cancelled. No charges are attached."
        buttons={[
          { label: 'Keep Session', tone: 'plain', onClick: () => setCancelOpen(false) },
          {
            label: 'Cancel Session',
            tone: 'danger',
            onClick: () => {
              setCancelOpen(false)
              run(
                () =>
                  cancelSessionAction({
                    sessionId: session.id,
                    chargeDecision: 'keep',
                  }),
                'Session cancelled',
              )
            },
          },
        ]}
      />
    </ScreenBody>
  )
}

function DetailRow({
  label,
  value,
  first,
  numeric,
}: {
  label: string
  value: string
  first?: boolean
  numeric?: boolean
}) {
  return (
    <div
      className={`flex justify-between items-center py-[11px] ${
        first ? '' : 'border-t border-divider'
      }`}
    >
      <span className="text-t13 text-muted">{label}</span>
      <span className={`text-t135 font-semibold ${numeric ? 'tnum' : ''}`}>{value}</span>
    </div>
  )
}

/** Edit Session sheet, including the unpaid-charge repricing decision. */
function EditSessionSheet({
  open,
  session,
  today,
  pending,
  onClose,
  onSaved,
}: {
  open: boolean
  session: SessionData
  today: string
  pending: boolean
  onClose: () => void
  onSaved: () => void
}) {
  const { toast } = useToast()
  const [name, setName] = useState(session.name)
  const [date, setDate] = useState(session.date)
  const [startMin, setStartMin] = useState(session.startMin)
  const [durationMin, setDurationMin] = useState(session.durationMin)
  const [price, setPrice] = useState(session.priceInput)
  const [location, setLocation] = useState(session.location)
  const [capacity, setCapacity] = useState(session.capacity ?? 6)
  const [error, setError] = useState('')
  const [priceDecision, setPriceDecision] = useState(false)
  const [saving, startSaving] = useTransition()

  const dates = Array.from({ length: 14 }, (_, index) => addDays(today, index))
  if (!dates.includes(date)) dates.unshift(date)
  const times = Array.from({ length: 28 }, (_, index) => 420 + index * 30)

  const save = (decision?: 'keep' | 'update') =>
    startSaving(async () => {
      setError('')
      const result = await updateSessionAction({
        sessionId: session.id,
        name,
        date,
        startMin,
        durationMin,
        price,
        location,
        capacity: session.type === 'group' ? capacity : null,
        priceChangeDecision: decision,
      })
      if (!result.ok) {
        setError(result.error)
        return
      }
      if (result.data.requiresPriceDecision) {
        setPriceDecision(true)
        return
      }
      setPriceDecision(false)
      toast('Session updated')
      onSaved()
    })

  return (
    <>
      <Sheet open={open && !priceDecision} onClose={onClose} maxHeight="84%">
        <SheetTitle>Edit Session</SheetTitle>

        <SheetFieldLabel>Name</SheetFieldLabel>
        <div className="mt-[9px]">
          <TextInput value={name} onChange={setName} className="!text-t14" ariaLabel="Session name" />
        </div>

        <SheetFieldLabel>When</SheetFieldLabel>
        <div className="flex gap-2 overflow-x-auto mt-[9px] pb-[2px]">
          {dates.map((iso) => {
            const selected = iso === date
            return (
              <button
                key={iso}
                onClick={() => setDate(iso)}
                className="shrink-0 w-[50px] py-[7px] rounded-r12 border text-center"
                style={{
                  background: selected ? '#171918' : '#FFFFFF',
                  borderColor: selected ? '#171918' : '#E5E6E1',
                }}
              >
                <div
                  className="font-mono text-t9 tracking-mono4"
                  style={{ color: selected ? '#B9BDB6' : '#6B706C' }}
                >
                  {dowShort(iso).toUpperCase()}
                </div>
                <div
                  className="text-t14 font-bold mt-[1px] tnum"
                  style={{ color: selected ? '#F7F7F3' : '#171918' }}
                >
                  {dayOfMonth(iso)}
                </div>
              </button>
            )
          })}
        </div>

        <div className="flex gap-2 overflow-x-auto mt-[9px] pb-[2px]">
          {times.map((minute) => (
            <button
              key={minute}
              onClick={() => setStartMin(minute)}
              className="shrink-0 px-3 py-2 rounded-full border text-t125 font-semibold tnum"
              style={{
                background: minute === startMin ? '#171918' : '#FFFFFF',
                color: minute === startMin ? '#F7F7F3' : '#171918',
                borderColor: minute === startMin ? '#171918' : '#E5E6E1',
              }}
            >
              {formatTime(minute)}
            </button>
          ))}
        </div>

        <div className="flex gap-2 flex-wrap mt-[9px]">
          {[30, 45, 60, 90, 120].map((minutes) => (
            <button
              key={minutes}
              onClick={() => setDurationMin(minutes)}
              className="px-3 py-2 rounded-full border text-t125 font-semibold"
              style={{
                background: minutes === durationMin ? '#171918' : '#FFFFFF',
                color: minutes === durationMin ? '#F7F7F3' : '#171918',
                borderColor: minutes === durationMin ? '#171918' : '#E5E6E1',
              }}
            >
              {minutes} min
            </button>
          ))}
        </div>

        {!session.isFree ? (
          <>
            <SheetFieldLabel>Price</SheetFieldLabel>
            <div className="mt-[9px]">
              <MoneyInput
                value={price}
                onChange={setPrice}
                height={48}
                symbolSize={16}
                valueSize={16}
                suffix={session.type === 'group' ? 'per player' : undefined}
              />
            </div>
          </>
        ) : null}

        <SheetFieldLabel>Location</SheetFieldLabel>
        <div className="mt-[9px]">
          <TextInput
            value={location}
            onChange={setLocation}
            className="!text-t14"
            ariaLabel="Location"
          />
        </div>

        {session.type === 'group' ? (
          <div className="mt-[14px] flex items-center justify-between">
            <div className="text-t125 font-semibold text-muted">Capacity</div>
            <Stepper
              value={capacity}
              onDecrement={() => setCapacity((c) => Math.max(2, c - 1))}
              onIncrement={() => setCapacity((c) => Math.min(12, c + 1))}
            />
          </div>
        ) : null}

        {error ? (
          <div className="mt-3 bg-danger_bg rounded-r11 px-[13px] py-[10px] text-t125 font-medium text-danger_fg">
            {error}
          </div>
        ) : null}

        <div className="mt-4">
          <Button size="md" onClick={() => save()} disabled={saving || pending}>
            {saving ? 'Saving…' : 'Save Changes'}
          </Button>
        </div>
      </Sheet>

      <Dialog
        open={priceDecision}
        title="Session price changed"
        body="There are unpaid charges for this session. Paid charges are never changed."
        buttons={[
          {
            label: `Update unpaid to ${price ? formatMoney(Math.round(Number(price) * 100)) : ''}`,
            tone: 'ink',
            onClick: () => save('update'),
          },
          {
            label: 'Keep existing payments',
            tone: 'plain',
            onClick: () => save('keep'),
          },
          { label: 'Cancel', tone: 'plain', onClick: () => setPriceDecision(false) },
        ]}
      />
    </>
  )
}

function SheetFieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="font-mono text-t10 font-medium tracking-mono2 uppercase text-muted mt-4">
      {children}
    </div>
  )
}
