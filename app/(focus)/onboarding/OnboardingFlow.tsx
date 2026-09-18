'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { completeOnboardingAction } from '@/lib/actions/settings'
import { Button, TextInput } from '@/components/ui/controls'
import { ErrorBanner } from '@/components/ui/primitives'
import { useToast } from '@/components/ui/overlays'
import { firstName } from '@/lib/domain/dates'
import type { MembershipRole } from '@/lib/domain/types'

/**
 * Onboarding, matching the prototype's dot pager and copy. An owner sets up the
 * business (five steps); an invited coach only says who they are (three) — the
 * business and its rate already exist.
 */
export function OnboardingFlow({
  role,
  academyName,
  initialName,
  initialBusiness,
  initialRate,
}: {
  role: MembershipRole
  academyName: string
  initialName: string
  initialBusiness: string
  initialRate: string
}) {
  const isOwner = role === 'owner'
  const STEPS = isOwner ? [0, 1, 2, 3, 4] : [0, 1, 4]
  const router = useRouter()
  const { toast } = useToast()
  const [step, setStep] = useState(0)
  const [name, setName] = useState(initialName)
  const [business, setBusiness] = useState(initialBusiness)
  const [rate, setRate] = useState(initialRate || '70')
  const [error, setError] = useState('')
  const [pending, startTransition] = useTransition()

  const detectedTimezone = (() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined
    } catch {
      return undefined
    }
  })()

  const next = () =>
    setStep((current) => STEPS[Math.min(STEPS.length - 1, STEPS.indexOf(current) + 1)])
  const prev = () => setStep((current) => STEPS[Math.max(0, STEPS.indexOf(current) - 1)])

  const finish = () => {
    setError('')
    startTransition(async () => {
      const result = await completeOnboardingAction({
        name,
        businessName: business,
        rate,
        // The browser knows the coach's real zone; the server (UTC) does not.
        timezone: detectedTimezone,
      })
      if (!result.ok) {
        setError(result.error)
        return
      }
      toast(`Welcome to CoachOS, ${firstName(name)}`)
      router.push('/dashboard')
      router.refresh()
    })
  }

  return (
    <div className="flex-1 overflow-y-auto px-6 pb-10 flex flex-col justify-center">
      <div className="flex justify-center gap-[6px]">
        {STEPS.map((index) => (
          <div
            key={index}
            className="w-[7px] h-[7px] rounded-full"
            style={{ background: index <= step ? '#1677EE' : '#D5DCE5' }}
          />
        ))}
      </div>

      {step === 0 ? (
        <>
          <div className="text-center mt-[30px]">
            <div className="text-t28 font-extrabold tracking-tight3">
              Coach<span className="text-accent">OS</span>
            </div>
            <div className="text-t15 text-muted mt-[14px] leading-[1.6] pretty">
              {isOwner
                ? 'Know what’s next, what needs doing, and who owes you — from your phone, courtside.'
                : `You’ve joined ${academyName || 'your team'} as a coach. Let’s get you set up.`}
            </div>
          </div>
          <div className="mt-[34px]">
            <Button size="lg" onClick={next}>
              Get Started
            </Button>
          </div>
        </>
      ) : null}

      {step === 1 ? (
        <>
          <div className="text-t22 font-bold tracking-tight2 mt-[30px]">
            What’s your name?
          </div>
          <div className="mt-4">
            <TextInput
              value={name}
              onChange={setName}
              placeholder="Your full name"
              height={50}
              ariaLabel="Your name"
            />
          </div>
          <div className="mt-4">
            <Button size="lg" onClick={next}>
              Continue
            </Button>
          </div>
        </>
      ) : null}

      {step === 2 ? (
        <>
          <div className="text-t22 font-bold tracking-tight2 mt-[30px]">
            Business or academy name
          </div>
          <div className="text-t13 text-muted mt-[5px]">
            Optional — you can add this later.
          </div>
          <div className="mt-4">
            <TextInput
              value={business}
              onChange={setBusiness}
              placeholder="e.g. Peak Performance Tennis"
              height={50}
              ariaLabel="Business name"
            />
          </div>
          <div className="mt-4">
            <Button size="lg" onClick={next}>
              Continue
            </Button>
          </div>
        </>
      ) : null}

      {step === 3 ? (
        <>
          <div className="text-t22 font-bold tracking-tight2 mt-[30px]">
            Default session rate
          </div>
          <div className="text-t13 text-muted mt-[5px]">
            Used when a player doesn’t have their own rate.
          </div>
          <div className="flex items-center bg-card border border-line rounded-r12 h-[54px] px-4 mt-4">
            <span className="text-t19 font-bold text-subtle">$</span>
            <input
              value={rate}
              inputMode="decimal"
              aria-label="Default rate"
              onChange={(event) => setRate(event.target.value.replace(/[^0-9.]/g, ''))}
              className="flex-1 border-none bg-transparent text-t20 font-bold pl-[6px] min-w-0"
            />
            <span className="text-t125 text-subtle">per session</span>
          </div>
          <div className="mt-4">
            <Button size="lg" onClick={next}>
              Continue
            </Button>
          </div>
        </>
      ) : null}

      {step === 4 ? (
        <>
          <div className="text-center mt-[30px]">
            <div className="w-14 h-14 rounded-full bg-accent_soft text-accent_dark flex items-center justify-center text-t24 font-bold mx-auto">
              ✓
            </div>
            <div className="text-t24 font-bold tracking-tight2 mt-[18px]">
              You’re set, {firstName(name)}
            </div>
            <div className="text-t14 text-muted mt-2">
              Add players and schedule your first session.
            </div>
            {isOwner && detectedTimezone ? (
              <div className="text-t115 text-subtle mt-3">
                Timezone set to {detectedTimezone.replace(/_/g, ' ')} — change it any
                time in Settings.
              </div>
            ) : null}
          </div>
          {error ? (
            <div className="mt-4">
              <ErrorBanner message={error} />
            </div>
          ) : null}
          <div className="mt-[30px]">
            <Button size="lg" onClick={finish} disabled={pending}>
              {pending ? 'Saving…' : 'Go to Dashboard'}
            </Button>
          </div>
        </>
      ) : null}

      {step > 0 && step < 4 && STEPS.includes(step) ? (
        <button
          onClick={prev}
          className="text-center text-t13 font-semibold text-muted py-[14px]"
        >
          Back
        </button>
      ) : null}

      <button
        onClick={() => router.push('/dashboard')}
        className="text-center text-t125 font-semibold text-faint py-[10px]"
      >
        Skip for now
      </button>
    </div>
  )
}
