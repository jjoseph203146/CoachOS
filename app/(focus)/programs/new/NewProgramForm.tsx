'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Chip, FieldLabel, MoneyInput, Segmented, TextInput } from '@/components/ui/controls'
import { useToast } from '@/components/ui/overlays'
import { ErrorBanner } from '@/components/ui/primitives'
import { createProgramAction } from '@/lib/actions/programs'
import { addDays, formatTime } from '@/lib/domain/dates'
import { BASIS_CHOICES, BASIS_LABEL, weekdayShort } from '@/lib/domain/programs'
import type { PriceBasis, ProgramAudience } from '@/lib/domain/types'

interface OptionRow {
  key: number
  label: string
  basis: PriceBasis
  amount: string
}

const TIMES = Array.from({ length: 33 }, (_, index) => 360 + index * 30) // 6:00 AM – 10:00 PM
const DURATIONS = [60, 90, 120, 180, 240]

/** Owner-only: define a recurring program and its price options. */
export function NewProgramForm({ today }: { today: string }) {
  const router = useRouter()
  const { toast } = useToast()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState('')

  const [name, setName] = useState('')
  const [audience, setAudience] = useState<ProgramAudience>('youth')
  const [weekdays, setWeekdays] = useState<number[]>([])
  const [startMin, setStartMin] = useState(17 * 60)
  const [durationMin, setDurationMin] = useState(90)
  const [location, setLocation] = useState('')
  const [capacity, setCapacity] = useState('')
  const [ageRange, setAgeRange] = useState('')
  const [startsOn, setStartsOn] = useState(today)
  const [endsOn, setEndsOn] = useState('')
  const [nextKey, setNextKey] = useState(1)
  const [options, setOptions] = useState<OptionRow[]>([
    { key: 0, label: 'Weekly', basis: 'weekly', amount: '' },
  ])

  const toggleDay = (day: number) =>
    setWeekdays((current) =>
      current.includes(day) ? current.filter((d) => d !== day) : [...current, day],
    )

  const addOption = (basis: PriceBasis) => {
    setOptions((current) => [
      ...current,
      { key: nextKey, label: BASIS_LABEL[basis], basis, amount: '' },
    ])
    setNextKey((key) => key + 1)
  }

  const patchOption = (key: number, patch: Partial<OptionRow>) =>
    setOptions((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)))

  const submit = () => {
    setError('')
    startTransition(async () => {
      const result = await createProgramAction({
        name,
        audience,
        weekdays,
        startMin,
        durationMin,
        location,
        capacity: capacity.trim() ? Number(capacity) : null,
        ageRange,
        startsOn,
        endsOn: endsOn || null,
        options: options.map(({ label, basis, amount }) => ({ label, basis, amount })),
      })
      if (!result.ok) {
        setError(result.error)
        return
      }
      toast('Program created')
      router.replace(`/programs/${result.data.programId}`)
      router.refresh()
    })
  }

  const heading = 'text-t17 font-extrabold text-ink'
  const select =
    'w-full h-[46px] border border-field rounded-r12 bg-card px-[14px] text-t145 font-medium'

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
        <div className="text-t15 font-bold">New Program</div>
        <div className="w-9" />
      </div>

      <div className="mt-[22px]">
        <div className={heading}>About</div>
        <div className="mt-[10px]">
          <FieldLabel>Name</FieldLabel>
          <TextInput value={name} onChange={setName} placeholder="Youth Clinic" ariaLabel="Name" />
        </div>
        <div className="mt-3">
          <FieldLabel>Who it’s for</FieldLabel>
          <Segmented
            options={[
              { value: 'youth', label: 'Youth' },
              { value: 'adult', label: 'Adult' },
            ]}
            value={audience}
            onChange={setAudience}
          />
        </div>
        <div className="mt-3">
          <FieldLabel>Age range (optional)</FieldLabel>
          <TextInput value={ageRange} onChange={setAgeRange} placeholder="6–17" ariaLabel="Age range" />
        </div>
      </div>

      <div className="mt-[22px]">
        <div className={heading}>Schedule</div>
        <div className="mt-[10px]">
          <FieldLabel>Days</FieldLabel>
          <div className="flex gap-2 flex-wrap">
            {[0, 1, 2, 3, 4, 5, 6].map((day) => (
              <Chip
                key={day}
                label={weekdayShort(day)}
                selected={weekdays.includes(day)}
                onClick={() => toggleDay(day)}
                size="sm"
              />
            ))}
          </div>
        </div>
        <div className="mt-3">
          <FieldLabel>Starts at</FieldLabel>
          <select
            value={startMin}
            aria-label="Start time"
            onChange={(event) => setStartMin(Number(event.target.value))}
            className={select}
          >
            {TIMES.map((minute) => (
              <option key={minute} value={minute}>
                {formatTime(minute)}
              </option>
            ))}
          </select>
        </div>
        <div className="mt-3">
          <FieldLabel>Length</FieldLabel>
          <div className="flex gap-2 flex-wrap">
            {DURATIONS.map((minutes) => (
              <Chip
                key={minutes}
                label={minutes % 60 === 0 ? `${minutes / 60}h` : `${minutes} min`}
                selected={durationMin === minutes}
                onClick={() => setDurationMin(minutes)}
                size="sm"
              />
            ))}
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div>
            <FieldLabel>First day</FieldLabel>
            <input
              type="date"
              value={startsOn}
              min={addDays(today, -365)}
              aria-label="First day"
              onChange={(event) => setStartsOn(event.target.value)}
              className={select}
            />
          </div>
          <div>
            <FieldLabel>Last day (optional)</FieldLabel>
            <input
              type="date"
              value={endsOn}
              min={startsOn}
              aria-label="Last day"
              onChange={(event) => setEndsOn(event.target.value)}
              className={select}
            />
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div>
            <FieldLabel>Location</FieldLabel>
            <TextInput value={location} onChange={setLocation} placeholder="Courts 1–4" ariaLabel="Location" />
          </div>
          <div>
            <FieldLabel>Capacity (optional)</FieldLabel>
            <TextInput
              value={capacity}
              onChange={(value) => setCapacity(value.replace(/[^0-9]/g, ''))}
              inputMode="numeric"
              placeholder="No limit"
              ariaLabel="Capacity"
            />
          </div>
        </div>
      </div>

      <div className="mt-[22px]">
        <div className={heading}>Price options</div>
        <div className="text-t125 text-muted mt-1 leading-[1.5]">
          A program can be paid for in more than one way. Each participant is charged the
          price they agree to when they join — changing an option later never changes what
          someone already agreed.
        </div>

        <div className="mt-3 flex flex-col gap-[10px]">
          {options.map((row) => (
            <div key={row.key} className="bg-card border border-line rounded-r14 p-3">
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <TextInput
                    value={row.label}
                    onChange={(label) => patchOption(row.key, { label })}
                    placeholder="Label"
                    ariaLabel="Option label"
                    height={42}
                  />
                </div>
                {options.length > 1 ? (
                  <button
                    onClick={() => setOptions((current) => current.filter((r) => r.key !== row.key))}
                    aria-label="Remove option"
                    className="w-9 h-9 rounded-full text-subtle text-t16 shrink-0"
                  >
                    ✕
                  </button>
                ) : null}
              </div>
              <div className="grid grid-cols-2 gap-2 mt-2">
                <select
                  value={row.basis}
                  aria-label="Per"
                  onChange={(event) => patchOption(row.key, { basis: event.target.value as PriceBasis })}
                  className="h-[46px] border border-field rounded-r12 bg-card px-3 text-t14 font-medium"
                >
                  {BASIS_CHOICES.map((basis) => (
                    <option key={basis} value={basis}>
                      {BASIS_LABEL[basis]}
                    </option>
                  ))}
                </select>
                <MoneyInput
                  value={row.amount}
                  onChange={(amount) => patchOption(row.key, { amount })}
                  height={46}
                  symbolSize={15}
                  valueSize={16}
                />
              </div>
            </div>
          ))}
        </div>

        <div className="flex gap-2 flex-wrap mt-3">
          {BASIS_CHOICES.map((basis) => (
            <button
              key={basis}
              onClick={() => addOption(basis)}
              className="h-9 px-3 rounded-full border text-t125 font-semibold text-accent"
              style={{ borderStyle: 'dashed', borderColor: '#C9D3DE' }}
            >
              + {BASIS_LABEL[basis]}
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <div className="mt-4">
          <ErrorBanner message={error} />
        </div>
      ) : null}

      <button
        onClick={submit}
        disabled={pending}
        className="w-full h-[50px] rounded-r13 bg-accent text-white text-t155 font-bold mt-6 disabled:opacity-60"
      >
        {pending ? 'Creating…' : 'Create Program'}
      </button>
      <div className="text-center text-t115 text-subtle mt-2">
        The next 8 weeks of sessions are scheduled for you.
      </div>
    </div>
  )
}
