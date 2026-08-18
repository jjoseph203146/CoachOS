'use client'

import { useRouter } from 'next/navigation'
import { useMemo, useState, useTransition } from 'react'
import {
  Button,
  Chip,
  FieldLabel,
  MoneyInput,
  Stepper,
  TextInput,
} from '@/components/ui/controls'
import { Dialog, useToast } from '@/components/ui/overlays'
import { ErrorBanner } from '@/components/ui/primitives'
import { createSessionAction } from '@/lib/actions/sessions'
import { addDays, dayOfMonth, dowFull, dowShort, formatTime } from '@/lib/domain/dates'
import { centsToInput, formatMoney, parseMoneyToCents } from '@/lib/domain/money'

interface Draft {
  type: 'private' | 'group'
  playerIds: string[]
  date: string
  startMin: number
  durationMin: number
  price: string
  isFree: boolean
  location: string
  capacity: number
  from: string
}

export function NewSessionForm({
  draft,
  today,
  coachDefaultRateCents,
  players,
  existing,
}: {
  draft: Draft
  today: string
  coachDefaultRateCents: number
  players: Array<{ id: string; name: string; rateCents: number | null }>
  existing: Array<{
    id: string
    name: string
    date: string
    startMin: number
    endMin: number
  }>
}) {
  const router = useRouter()
  const { toast } = useToast()
  const [state, setState] = useState(draft)
  const [priceDirty, setPriceDirty] = useState(!!draft.price)
  const [nameDirty, setNameDirty] = useState(false)
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [conflictOpen, setConflictOpen] = useState(false)
  const [pending, startTransition] = useTransition()

  const isGroup = state.type === 'group'

  // Auto-generated name, exactly as the prototype derives it.
  const autoName = isGroup
    ? `${dowFull(state.date)} Group Session`
    : state.playerIds[0]
      ? `${players.find((p) => p.id === state.playerIds[0])?.name ?? ''} Private Lesson`
      : 'Private Lesson'
  const effectiveName = nameDirty ? name : autoName

  const dates = useMemo(() => {
    const list = Array.from({ length: 14 }, (_, index) => addDays(today, index))
    if (!list.includes(state.date)) list.unshift(state.date)
    return list
  }, [today, state.date])

  const times = useMemo(
    () => Array.from({ length: 28 }, (_, index) => 420 + index * 30),
    [],
  )

  const conflict = useMemo(() => {
    const start = state.startMin
    const end = state.startMin + state.durationMin
    return (
      existing.find(
        (s) => s.date === state.date && !(end <= s.startMin || start >= s.endMin),
      ) ?? null
    )
  }, [existing, state.date, state.startMin, state.durationMin])

  const togglePlayer = (playerId: string) => {
    setState((current) => {
      const nextIds = isGroup
        ? current.playerIds.includes(playerId)
          ? current.playerIds.filter((id) => id !== playerId)
          : [...current.playerIds, playerId]
        : current.playerIds[0] === playerId
          ? []
          : [playerId]

      let nextPrice = current.price
      if (!priceDirty && !isGroup) {
        const player = players.find((p) => p.id === nextIds[0])
        nextPrice = nextIds[0]
          ? centsToInput(player?.rateCents ?? coachDefaultRateCents)
          : centsToInput(coachDefaultRateCents)
      }
      return { ...current, playerIds: nextIds, price: nextPrice }
    })
    setError('')
  }

  const priceCents = parseMoneyToCents(state.price) ?? 0

  const submit = (allowConflict = false) => {
    setError('')
    if (state.playerIds.length === 0) {
      setError(isGroup ? 'Add at least one player.' : 'Choose a player for this lesson.')
      return
    }
    if (isGroup && state.playerIds.length > state.capacity) {
      setError('More players selected than capacity allows.')
      return
    }
    if (!state.isFree && priceCents <= 0) {
      setError('Set a price, or mark the session free.')
      return
    }
    if (conflict && !allowConflict) {
      setConflictOpen(true)
      return
    }

    startTransition(async () => {
      const result = await createSessionAction({
        type: state.type,
        name: effectiveName,
        date: state.date,
        startMin: state.startMin,
        durationMin: state.durationMin,
        isFree: state.isFree,
        price: state.price,
        location: state.location,
        capacity: isGroup ? state.capacity : null,
        playerIds: state.playerIds,
        allowConflict,
      })
      if (!result.ok) {
        setError(result.error)
        return
      }
      toast('Session created')
      router.replace(`/sessions/${result.data.sessionId}`)
      router.refresh()
    })
  }

  const provenance = state.isFree
    ? 'Free session — no charge will be created'
    : priceDirty
      ? 'Custom price'
      : !isGroup && state.playerIds[0]
        ? (() => {
            const player = players.find((p) => p.id === state.playerIds[0])
            return player?.rateCents != null
              ? `${player.name.split(' ')[0]}’s default rate`
              : 'Coach default'
          })()
        : !isGroup
          ? 'Coach default'
          : state.price
            ? 'Per player'
            : 'Set a per-player price'

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
        <div className="text-t15 font-bold">
          {isGroup ? 'New Group Session' : 'New Private Lesson'}
        </div>
        <div className="w-9" />
      </div>

      {state.from ? (
        <div className="text-center text-t115 text-subtle mt-2">{state.from}</div>
      ) : null}

      {/* ---- who ---- */}
      <div className="mt-[22px]">
        <SectionMono>Who</SectionMono>
        {players.length === 0 ? (
          <div className="bg-card border border-line rounded-r14 p-[18px] text-center mt-[10px]">
            <div className="text-t14 font-semibold">No players available</div>
            <div className="text-t125 text-muted mt-[3px]">
              Add a player to schedule this session.
            </div>
            <button
              onClick={() => router.push('/players/new')}
              className="w-full h-[42px] rounded-r11 bg-ink text-shell text-t135 font-semibold flex items-center justify-center mt-3"
            >
              Add Player
            </button>
          </div>
        ) : null}
        <div className="flex flex-wrap gap-2 mt-[10px]">
          {players.map((player) => (
            <Chip
              key={player.id}
              label={player.name}
              selected={state.playerIds.includes(player.id)}
              onClick={() => togglePlayer(player.id)}
            />
          ))}
        </div>
        {isGroup ? (
          <div className="text-t12 text-muted mt-[9px]">
            {state.playerIds.length} selected · capacity {state.capacity}
          </div>
        ) : state.playerIds.length === 0 ? (
          <div className="text-t12 text-muted mt-[9px]">Choose one player</div>
        ) : null}
      </div>

      {/* ---- when ---- */}
      <div className="mt-[26px]">
        <SectionMono>When</SectionMono>
        <div className="flex gap-2 overflow-x-auto mt-[10px] pb-[2px]">
          {dates.map((iso) => {
            const selected = iso === state.date
            return (
              <button
                key={iso}
                onClick={() => setState((c) => ({ ...c, date: iso }))}
                className="shrink-0 w-[52px] py-2 rounded-r12 border text-center"
                style={{
                  background: selected ? '#171918' : '#FFFFFF',
                  borderColor: selected
                    ? '#171918'
                    : iso === today
                      ? '#B9BDB6'
                      : '#E5E6E1',
                }}
              >
                <div
                  className="font-mono text-t9 tracking-mono4"
                  style={{ color: selected ? '#B9BDB6' : '#6B706C' }}
                >
                  {dowShort(iso).toUpperCase()}
                </div>
                <div
                  className="text-t15 font-bold mt-[1px] tnum"
                  style={{ color: selected ? '#F7F7F3' : '#171918' }}
                >
                  {dayOfMonth(iso)}
                </div>
              </button>
            )
          })}
        </div>

        <div className="flex gap-2 overflow-x-auto mt-[10px] pb-[2px]">
          {times.map((minute) => (
            <button
              key={minute}
              onClick={() => setState((c) => ({ ...c, startMin: minute }))}
              className="shrink-0 px-[13px] py-[9px] rounded-full border text-t13 font-semibold tnum"
              style={{
                background: minute === state.startMin ? '#171918' : '#FFFFFF',
                color: minute === state.startMin ? '#F7F7F3' : '#171918',
                borderColor: minute === state.startMin ? '#171918' : '#E5E6E1',
              }}
            >
              {formatTime(minute)}
            </button>
          ))}
        </div>

        <div className="flex gap-2 flex-wrap mt-[10px]">
          {[30, 45, 60, 90, 120].map((minutes) => (
            <button
              key={minutes}
              onClick={() => setState((c) => ({ ...c, durationMin: minutes }))}
              className="px-[13px] py-[9px] rounded-full border text-t13 font-semibold"
              style={{
                background: minutes === state.durationMin ? '#171918' : '#FFFFFF',
                color: minutes === state.durationMin ? '#F7F7F3' : '#171918',
                borderColor: minutes === state.durationMin ? '#171918' : '#E5E6E1',
              }}
            >
              {minutes} min
            </button>
          ))}
        </div>

        {conflict ? (
          <div className="flex items-center gap-[9px] mt-3 bg-warn_bg rounded-r11 px-[13px] py-[10px]">
            <div className="w-[7px] h-[7px] rounded-full bg-warn_dot shrink-0" />
            <div className="text-t125 font-medium text-warn_fg">
              Overlaps {conflict.name} · {formatTime(conflict.startMin)}–
              {formatTime(conflict.endMin)}
            </div>
          </div>
        ) : null}
      </div>

      {/* ---- how much ---- */}
      <div className="mt-[26px]">
        <SectionMono>How much</SectionMono>
        <div className="flex bg-track rounded-r11 p-[2px] mt-[10px]">
          <button
            onClick={() => setState((c) => ({ ...c, isFree: false }))}
            className={`flex-1 text-center py-2 rounded-r9 text-t13 font-semibold ${
              !state.isFree ? 'bg-card text-ink shadow-seg' : 'bg-transparent text-muted'
            }`}
          >
            Charge
          </button>
          <button
            onClick={() => setState((c) => ({ ...c, isFree: true }))}
            className={`flex-1 text-center py-2 rounded-r9 text-t13 font-semibold ${
              state.isFree ? 'bg-card text-ink shadow-seg' : 'bg-transparent text-muted'
            }`}
          >
            Free
          </button>
        </div>

        {!state.isFree ? (
          <>
            <div className="flex items-center gap-[10px] mt-3">
              <div className="flex-1">
                <MoneyInput
                  value={state.price}
                  onChange={(value) => {
                    setPriceDirty(true)
                    setState((c) => ({ ...c, price: value }))
                  }}
                />
              </div>
              {isGroup ? (
                <span className="text-t13 text-muted shrink-0">per player</span>
              ) : null}
            </div>
            <div className="text-t12 text-subtle mt-[7px]">{provenance}</div>
            {isGroup && state.playerIds.length > 0 && priceCents > 0 ? (
              <div className="text-t125 font-semibold mt-1 tnum">
                {state.playerIds.length} players × {formatMoney(priceCents)} ={' '}
                {formatMoney(priceCents * state.playerIds.length)}
              </div>
            ) : null}
          </>
        ) : (
          <div className="text-t12 text-subtle mt-[10px]">
            Free session — no charges will be created.
          </div>
        )}
      </div>

      {/* ---- details ---- */}
      <div className="mt-[26px]">
        <SectionMono>Details</SectionMono>
        <div className="mt-[10px]">
          <FieldLabel>Session name</FieldLabel>
          <TextInput
            value={effectiveName}
            onChange={(value) => {
              setNameDirty(true)
              setName(value)
            }}
            ariaLabel="Session name"
          />
        </div>
        <div className="mt-3">
          <FieldLabel>Location</FieldLabel>
          <TextInput
            value={state.location}
            onChange={(value) => setState((c) => ({ ...c, location: value }))}
            placeholder="Court 1, Main Gym…"
            ariaLabel="Location"
          />
        </div>
        {isGroup ? (
          <div className="mt-[14px] flex items-center justify-between">
            <div className="text-t12 font-semibold text-muted">Capacity</div>
            <Stepper
              value={state.capacity}
              onDecrement={() =>
                setState((c) => ({
                  ...c,
                  capacity: Math.max(Math.max(2, c.playerIds.length), c.capacity - 1),
                }))
              }
              onIncrement={() =>
                setState((c) => ({ ...c, capacity: Math.min(12, c.capacity + 1) }))
              }
            />
          </div>
        ) : null}
      </div>

      {error ? (
        <div className="mt-4">
          <ErrorBanner message={error} />
        </div>
      ) : null}

      <div className="mt-[18px]">
        <Button size="lg" onClick={() => submit(false)} disabled={pending}>
          {pending ? 'Saving…' : 'Create Session'}
        </Button>
      </div>

      <Dialog
        open={conflictOpen}
        title="Schedule conflict"
        body={
          conflict
            ? `You already have ${conflict.name} from ${formatTime(conflict.startMin)}–${formatTime(conflict.endMin)} that day.`
            : ''
        }
        buttons={[
          {
            label: 'Choose another time',
            tone: 'plain',
            onClick: () => setConflictOpen(false),
          },
          {
            label: 'Create anyway',
            tone: 'ink',
            onClick: () => {
              setConflictOpen(false)
              submit(true)
            },
          },
        ]}
      />
    </div>
  )
}

function SectionMono({ children }: { children: React.ReactNode }) {
  return (
    <div className="font-mono text-t105 font-medium tracking-mono uppercase text-muted">
      {children}
    </div>
  )
}
