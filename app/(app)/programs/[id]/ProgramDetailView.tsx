'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMemo, useState, useTransition } from 'react'
import { ScreenBody } from '@/components/shell/AppShell'
import { Button, Chip, MoneyInput, SearchInput, TextInput } from '@/components/ui/controls'
import { Dialog, Sheet, SheetTitle, useToast } from '@/components/ui/overlays'
import {
  Avatar,
  Card,
  DetailHeader,
  ErrorBanner,
  Notice,
  SectionLabel,
} from '@/components/ui/primitives'
import {
  addPriceOptionAction,
  archivePriceOptionAction,
  billPlaceAction,
  endPlaceAction,
  endProgramAction,
  enrollParticipantAction,
  extendProgramAction,
  updatePriceOptionAction,
} from '@/lib/actions/programs'
import { BASIS_CHOICES, BASIS_LABEL, isRecurringBasis } from '@/lib/domain/programs'
import { formatMoney } from '@/lib/domain/money'
import type { PriceBasis } from '@/lib/domain/types'

interface OptionData {
  id: string
  label: string
  basisLabel: string
  amountCents: number
  amountInput: string
  archived: boolean
}

interface RosterData {
  enrollmentId: string
  playerId: string
  name: string
  agreedLabel: string
  agreedBasis: PriceBasis
  agreedBasisLabel: string
  agreedCents: number
  standardCents: number | null
  custom: boolean
  note: string
  chargeCount: number
  billedThrough: string | null
}

export function ProgramDetailView({
  isOwner,
  program,
  options,
  roster,
  next,
  upcoming,
  addable,
}: {
  isOwner: boolean
  program: {
    id: string
    name: string
    audience: 'youth' | 'adult'
    status: 'active' | 'ended'
    scheduleLine: string
    location: string
    ageRange: string
    capacity: number | null
  }
  options: OptionData[]
  roster: RosterData[]
  next: {
    sessionId: string
    when: string
    expected: number
    onSession: number
    isToday: boolean
  } | null
  upcoming: Array<{ id: string; when: string }>
  addable: Array<{ id: string; name: string; level: string }>
}) {
  const router = useRouter()
  const { toast } = useToast()
  const [pending, startTransition] = useTransition()
  const [enrollOpen, setEnrollOpen] = useState(false)
  const [pricesOpen, setPricesOpen] = useState(false)
  const [menuFor, setMenuFor] = useState<RosterData | null>(null)
  const [endOpen, setEndOpen] = useState(false)

  const active = program.status === 'active'
  const liveOptions = options.filter((o) => !o.archived)

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

  const billLabel = (row: RosterData) =>
    row.agreedBasis === 'weekly'
      ? 'Bill next week'
      : row.agreedBasis === 'monthly'
        ? 'Bill next month'
        : 'Bill this place'
  const canBill = (row: RosterData) =>
    active &&
    row.agreedCents > 0 &&
    row.agreedBasis !== 'per_session' &&
    (isRecurringBasis(row.agreedBasis) || row.chargeCount === 0)

  return (
    <ScreenBody className="px-5">
      <DetailHeader backHref="/programs" title="Program" />

      <Card className="mt-4" padded>
        <div className="flex items-center gap-2">
          <span
            className={`text-t12 font-semibold px-[9px] py-[5px] rounded-full ${
              active
                ? program.audience === 'adult'
                  ? 'bg-purple_bg text-purple'
                  : 'bg-success_bg text-success'
                : 'bg-neutral_chip text-muted'
            }`}
          >
            {active ? 'Active Program' : 'Ended'}
          </span>
          <span className="text-t12 text-muted">
            {program.audience === 'adult' ? 'Adult' : 'Youth'}
          </span>
        </div>
        <div className="text-t22 font-extrabold tracking-tight15 mt-2">{program.name}</div>
        <div className="text-t13 text-muted mt-[2px]">{program.scheduleLine}</div>
        <div className="flex justify-between mt-[14px] text-t14">
          <span>Enrolled</span>
          <b className="tnum">
            {roster.length}
            {program.capacity ? ` of ${program.capacity}` : ''}
          </b>
        </div>
        {program.location ? (
          <div className="flex justify-between mt-2 text-t14">
            <span>Location</span>
            <b>{program.location}</b>
          </div>
        ) : null}
        {program.ageRange ? (
          <div className="flex justify-between mt-2 text-t14">
            <span>Ages</span>
            <b>{program.ageRange}</b>
          </div>
        ) : null}
      </Card>

      {next ? (
        <>
          <div className="mt-[22px]">
            <SectionLabel>Next occurrence</SectionLabel>
          </div>
          <Card className="mt-[10px]" padded>
            <div className="text-t15 font-bold">{next.when}</div>
            <div className="text-t125 text-muted mt-[2px]">
              {next.expected} expected · {next.onSession} on the roster
            </div>
            <div className="grid grid-cols-2 gap-2 mt-3">
              <Link
                href={`/programs/${program.id}/expected?session=${next.sessionId}`}
                className="h-11 rounded-r13 bg-accent_soft text-accent_text text-t14 font-bold flex items-center justify-center"
              >
                Manage Expected
              </Link>
              <Link
                href={`/sessions/${next.sessionId}/attendance`}
                className="h-11 rounded-r13 bg-accent text-white text-t14 font-bold flex items-center justify-center"
              >
                Take Attendance
              </Link>
            </div>
            <Link
              href={`/sessions/${next.sessionId}`}
              className="block text-center text-t13 font-semibold text-accent mt-3"
            >
              View session
            </Link>
          </Card>
        </>
      ) : active ? (
        <div className="mt-[22px]">
          <Notice title="No upcoming sessions">
            Schedule the next weeks to see them on the calendar.
          </Notice>
        </div>
      ) : null}

      <div className="flex items-center justify-between mt-[26px]">
        <SectionLabel>Prices</SectionLabel>
        {isOwner && active ? (
          <button
            onClick={() => setPricesOpen(true)}
            className="text-t13 font-semibold text-accent"
          >
            Manage
          </button>
        ) : null}
      </div>
      <Card className="mt-[10px]">
        {options.map((option, index) => (
          <div
            key={option.id}
            className={`flex items-center px-4 py-[13px] ${
              index === 0 ? '' : 'border-t border-divider'
            }`}
            style={{ opacity: option.archived ? 0.5 : 1 }}
          >
            <div className="flex-1">
              <div className="text-t145 font-semibold">{option.label}</div>
              <div className="text-t12 text-muted">
                {option.basisLabel}
                {option.archived ? ' · Archived' : ''}
              </div>
            </div>
            <div className="text-t15 font-bold tnum">{formatMoney(option.amountCents)}</div>
          </div>
        ))}
      </Card>
      <div className="text-t115 text-subtle mt-2 leading-[1.5]">
        Participants pay the price they agreed to. Changing a price here only affects who
        joins from now on.
      </div>

      <div className="flex items-center justify-between mt-[26px]">
        <SectionLabel>Roster</SectionLabel>
        {active ? (
          <button
            onClick={() => setEnrollOpen(true)}
            className="text-t13 font-semibold text-accent"
          >
            + Enroll
          </button>
        ) : null}
      </div>
      {roster.length === 0 ? (
        <Card className="mt-[10px]" padded>
          <div className="text-t14 font-semibold">No one enrolled yet</div>
          <div className="text-t125 text-muted mt-[2px]">
            Enroll players and choose the price each one agrees to.
          </div>
        </Card>
      ) : (
        <Card className="mt-[10px]">
          {roster.map((row, index) => (
            <button
              key={row.enrollmentId}
              onClick={() => setMenuFor(row)}
              className={`w-full flex items-center gap-3 px-4 py-[12px] ${
                index === 0 ? '' : 'border-t border-divider'
              }`}
            >
              <Avatar name={row.name} size={38} />
              <div className="flex-1 min-w-0">
                <div className="text-t145 font-bold truncate">{row.name}</div>
                <div className="text-t12 text-muted mt-[1px]">
                  {row.agreedLabel} · {formatMoney(row.agreedCents)}
                  {row.custom && row.standardCents !== null
                    ? ` (standard ${formatMoney(row.standardCents)})`
                    : ''}
                </div>
              </div>
              {row.custom ? (
                <span className="text-t115 font-semibold px-2 py-[3px] rounded-full bg-purple_bg text-purple shrink-0">
                  Custom
                </span>
              ) : null}
              <span className="text-subtle text-t17 font-bold shrink-0">⋯</span>
            </button>
          ))}
        </Card>
      )}

      {upcoming.length > 0 ? (
        <>
          <div className="mt-[26px]">
            <SectionLabel>Coming up</SectionLabel>
          </div>
          <Card className="mt-[10px]">
            {upcoming.map((session, index) => (
              <Link
                key={session.id}
                href={`/sessions/${session.id}`}
                className={`flex items-center justify-between px-4 py-[13px] text-t14 font-semibold ${
                  index === 0 ? '' : 'border-t border-divider'
                }`}
              >
                {session.when}
                <span className="text-chevron text-t17">›</span>
              </Link>
            ))}
          </Card>
        </>
      ) : null}

      {active ? (
        <div className="mt-4">
          <Button
            tone="plain"
            size="sm"
            disabled={pending}
            onClick={() =>
              run(
                async () => {
                  const result = await extendProgramAction({ programId: program.id })
                  return result.ok ? { ok: true } : result
                },
                'Scheduled more weeks',
              )
            }
          >
            Schedule 8 more weeks
          </Button>
        </div>
      ) : null}

      {isOwner && active ? (
        <div className="mt-3 mb-4">
          <Button tone="danger" size="sm" onClick={() => setEndOpen(true)}>
            End Program
          </Button>
        </div>
      ) : null}

      <EnrollSheet
        open={enrollOpen}
        onClose={() => setEnrollOpen(false)}
        programId={program.id}
        isOwner={isOwner}
        options={liveOptions}
        addable={addable}
        onDone={() => {
          setEnrollOpen(false)
          router.refresh()
        }}
      />

      <PricesSheet
        open={pricesOpen}
        onClose={() => setPricesOpen(false)}
        programId={program.id}
        options={options}
        onChanged={() => router.refresh()}
      />

      <Sheet open={!!menuFor} onClose={() => setMenuFor(null)}>
        <SheetTitle
          subtitle={
            menuFor
              ? `${menuFor.agreedLabel} · ${formatMoney(menuFor.agreedCents)}${
                  menuFor.billedThrough ? ` · billed through ${menuFor.billedThrough}` : ''
                }`
              : ''
          }
        >
          {menuFor?.name ?? ''}
        </SheetTitle>
        {menuFor?.note ? (
          <div className="text-t125 text-muted text-center mt-2">“{menuFor.note}”</div>
        ) : null}
        <div className="flex flex-col gap-2 mt-4">
          {menuFor && canBill(menuFor) ? (
            <Button
              disabled={pending}
              onClick={() => {
                const target = menuFor
                setMenuFor(null)
                run(
                  () => billPlaceAction({ programId: program.id, enrollmentId: target.enrollmentId }),
                  'Charge added',
                )
              }}
            >
              {billLabel(menuFor)} · {formatMoney(menuFor.agreedCents)}
            </Button>
          ) : null}
          {menuFor && menuFor.agreedBasis === 'per_session' ? (
            <div className="text-t125 text-muted text-center">
              Charged automatically for each session they’re marked present.
            </div>
          ) : null}
          <Button
            tone="danger"
            disabled={pending}
            onClick={() => {
              const target = menuFor!
              setMenuFor(null)
              run(
                () => endPlaceAction({ programId: program.id, enrollmentId: target.enrollmentId }),
                `${target.name.split(' ')[0]} removed from the program`,
              )
            }}
          >
            Remove from program
          </Button>
          <Button tone="plain" onClick={() => setMenuFor(null)}>
            Close
          </Button>
        </div>
        <div className="text-t115 text-subtle text-center mt-3">
          Existing charges stay as they are.
        </div>
      </Sheet>

      <Dialog
        open={endOpen}
        title="End this program?"
        body="Future sessions are cancelled and everyone is removed from the roster. Charges already created are not changed."
        buttons={[
          { label: 'Keep Program', tone: 'plain', onClick: () => setEndOpen(false) },
          {
            label: 'End Program',
            tone: 'danger',
            onClick: () => {
              setEndOpen(false)
              run(() => endProgramAction({ programId: program.id }), 'Program ended')
            },
          },
        ]}
      />
    </ScreenBody>
  )
}

function EnrollSheet({
  open,
  onClose,
  programId,
  isOwner,
  options,
  addable,
  onDone,
}: {
  open: boolean
  onClose: () => void
  programId: string
  isOwner: boolean
  options: OptionData[]
  addable: Array<{ id: string; name: string; level: string }>
  onDone: () => void
}) {
  const { toast } = useToast()
  const [query, setQuery] = useState('')
  const [playerId, setPlayerId] = useState<string | null>(null)
  const [optionId, setOptionId] = useState<string | null>(null)
  const [custom, setCustom] = useState(false)
  const [customAmount, setCustomAmount] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [pending, startTransition] = useTransition()

  const chosenOption = options.find((o) => o.id === (optionId ?? options[0]?.id))
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? addable.filter((p) => p.name.toLowerCase().includes(q)) : addable
  }, [addable, query])

  const submit = () => {
    if (!playerId || !chosenOption) return
    setError('')
    startTransition(async () => {
      const result = await enrollParticipantAction({
        programId,
        playerId,
        priceOptionId: chosenOption.id,
        customAmount: isOwner && custom ? customAmount : undefined,
        note: isOwner && custom ? note : '',
      })
      if (!result.ok) {
        setError(result.error)
        return
      }
      toast('Enrolled')
      setPlayerId(null)
      setCustom(false)
      setCustomAmount('')
      setNote('')
      onDone()
    })
  }

  return (
    <Sheet open={open} onClose={onClose} maxHeight="88%">
      <SheetTitle>Enroll a Player</SheetTitle>

      {addable.length === 0 ? (
        <div className="text-t13 text-muted text-center mt-4">
          Everyone on your roster is already in this program.{' '}
          <Link href="/players/new" className="text-accent font-semibold">
            Add a person
          </Link>
        </div>
      ) : (
        <>
          <div className="mt-4">
            <SearchInput value={query} onChange={setQuery} placeholder="Search players" />
          </div>
          <div className="mt-3 max-h-[190px] overflow-y-auto bg-card border border-line rounded-r14">
            {filtered.map((player, index) => (
              <button
                key={player.id}
                onClick={() => setPlayerId(player.id)}
                className={`w-full flex items-center gap-3 px-3 py-[10px] ${
                  index === 0 ? '' : 'border-t border-divider'
                }`}
              >
                <Avatar name={player.name} size={32} />
                <div className="flex-1 text-left text-t14 font-semibold">{player.name}</div>
                {playerId === player.id ? (
                  <span className="text-accent font-bold">✓</span>
                ) : null}
              </button>
            ))}
            {filtered.length === 0 ? (
              <div className="text-t13 text-muted text-center py-4">No one matches.</div>
            ) : null}
          </div>

          <div className="text-t12 font-bold mt-4">Price</div>
          <div className="flex flex-col gap-2 mt-2">
            {options.map((option) => {
              const selected = chosenOption?.id === option.id
              return (
                <button
                  key={option.id}
                  onClick={() => setOptionId(option.id)}
                  className="w-full flex items-center px-4 py-3 rounded-r13 border"
                  style={{
                    background: selected ? '#EDF4FF' : '#FFFFFF',
                    borderColor: selected ? '#1677EE' : '#DCE5EF',
                  }}
                >
                  <div className="flex-1 text-left">
                    <div className="text-t14 font-bold">{option.label}</div>
                    <div className="text-t12 text-muted">{option.basisLabel}</div>
                  </div>
                  <div className="text-t15 font-bold tnum">{formatMoney(option.amountCents)}</div>
                </button>
              )
            })}
          </div>

          {isOwner ? (
            <div className="mt-3">
              <button
                onClick={() => setCustom((c) => !c)}
                className="text-t13 font-semibold text-accent"
              >
                {custom ? '− Use the standard price' : '+ Agree a different price'}
              </button>
              {custom ? (
                <div className="mt-2">
                  <MoneyInput
                    value={customAmount}
                    onChange={setCustomAmount}
                    suffix={chosenOption ? `standard ${formatMoney(chosenOption.amountCents)}` : ''}
                    height={46}
                    symbolSize={15}
                    valueSize={16}
                  />
                  <div className="mt-2">
                    <TextInput
                      value={note}
                      onChange={setNote}
                      placeholder="Reason (e.g. sibling discount)"
                      ariaLabel="Reason"
                      height={42}
                    />
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="text-t115 text-subtle mt-2">
              A different price for one participant is set by the academy owner.
            </div>
          )}

          {error ? (
            <div className="mt-3">
              <ErrorBanner message={error} />
            </div>
          ) : null}

          <div className="mt-4">
            <Button
              disabled={pending || !playerId || !chosenOption || (custom && !customAmount)}
              onClick={submit}
            >
              {pending ? 'Enrolling…' : 'Enroll'}
            </Button>
          </div>
        </>
      )}
    </Sheet>
  )
}

function PricesSheet({
  open,
  onClose,
  programId,
  options,
  onChanged,
}: {
  open: boolean
  onClose: () => void
  programId: string
  options: OptionData[]
  onChanged: () => void
}) {
  const { toast } = useToast()
  const [pending, startTransition] = useTransition()
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [newLabel, setNewLabel] = useState('')
  const [newBasis, setNewBasis] = useState<PriceBasis>('weekly')
  const [newAmount, setNewAmount] = useState('')
  const [error, setError] = useState('')

  const act = (fn: () => Promise<{ ok: boolean; error?: string }>, message: string) =>
    startTransition(async () => {
      setError('')
      const result = await fn()
      if (!result.ok) {
        setError(result.error ?? 'Something went wrong.')
        return
      }
      toast(message)
      onChanged()
    })

  return (
    <Sheet open={open} onClose={onClose} maxHeight="88%">
      <SheetTitle subtitle="Applies to new participants only. Existing agreements keep their price.">
        Manage Prices
      </SheetTitle>

      <div className="flex flex-col gap-[10px] mt-4">
        {options
          .filter((option) => !option.archived)
          .map((option) => {
            const draft = drafts[option.id] ?? option.amountInput
            const changed = draft !== option.amountInput
            return (
              <div key={option.id} className="bg-card border border-line rounded-r14 p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-t14 font-bold">{option.label}</div>
                    <div className="text-t12 text-muted">{option.basisLabel}</div>
                  </div>
                  <button
                    onClick={() =>
                      act(
                        () => archivePriceOptionAction({ programId, optionId: option.id }),
                        'Option archived',
                      )
                    }
                    disabled={pending}
                    className="text-t12 font-semibold text-danger_fg"
                  >
                    Archive
                  </button>
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <div className="flex-1">
                    <MoneyInput
                      value={draft}
                      onChange={(value) => setDrafts((d) => ({ ...d, [option.id]: value }))}
                      height={42}
                      symbolSize={14}
                      valueSize={15}
                    />
                  </div>
                  <button
                    disabled={!changed || pending}
                    onClick={() =>
                      act(
                        () =>
                          updatePriceOptionAction({
                            programId,
                            optionId: option.id,
                            amount: draft,
                          }),
                        'Price updated for new participants',
                      )
                    }
                    className="h-[42px] px-4 rounded-r12 bg-accent text-white text-t13 font-bold disabled:opacity-40"
                  >
                    Save
                  </button>
                </div>
              </div>
            )
          })}
      </div>

      <div className="text-t12 font-bold mt-5">Add an option</div>
      <div className="mt-2">
        <TextInput value={newLabel} onChange={setNewLabel} placeholder="Label" ariaLabel="Label" height={42} />
      </div>
      <div className="grid grid-cols-2 gap-2 mt-2">
        <select
          value={newBasis}
          aria-label="Per"
          onChange={(event) => setNewBasis(event.target.value as PriceBasis)}
          className="h-[46px] border border-field rounded-r12 bg-card px-3 text-t14 font-medium"
        >
          {BASIS_CHOICES.map((basis) => (
            <option key={basis} value={basis}>
              {BASIS_LABEL[basis]}
            </option>
          ))}
        </select>
        <MoneyInput
          value={newAmount}
          onChange={setNewAmount}
          height={46}
          symbolSize={15}
          valueSize={16}
        />
      </div>

      {error ? (
        <div className="mt-3">
          <ErrorBanner message={error} />
        </div>
      ) : null}

      <div className="mt-3">
        <Button
          tone="plain"
          disabled={pending || !newLabel.trim() || !newAmount}
          onClick={() =>
            act(
              async () => {
                const result = await addPriceOptionAction({
                  programId,
                  option: { label: newLabel, basis: newBasis, amount: newAmount },
                })
                if (result.ok) {
                  setNewLabel('')
                  setNewAmount('')
                }
                return result
              },
              'Option added',
            )
          }
        >
          Add Option
        </Button>
      </div>
    </Sheet>
  )
}
