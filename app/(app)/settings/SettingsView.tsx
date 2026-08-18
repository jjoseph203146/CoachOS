'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { ScreenBody } from '@/components/shell/AppShell'
import { DetailHeader, ErrorBanner, SectionLabel } from '@/components/ui/primitives'
import { Button, Segmented } from '@/components/ui/controls'
import { Dialog, Sheet, SheetTitle, useToast } from '@/components/ui/overlays'
import { signOutAction } from '@/lib/actions/auth'
import { updateSettingsAction } from '@/lib/actions/settings'
import type { AttendanceWindow, Theme } from '@/lib/domain/types'

interface SettingsValues {
  name: string
  email: string
  businessName: string
  rate: string
  attendanceWindow: AttendanceWindow
  theme: Theme
}

const WINDOWS: AttendanceWindow[] = ['Same day', '24 hours', '48 hours', '72 hours']

export function SettingsView({ initial }: { initial: SettingsValues }) {
  const router = useRouter()
  const { toast } = useToast()
  const [values, setValues] = useState(initial)
  const [windowOpen, setWindowOpen] = useState(false)
  const [signOutOpen, setSignOutOpen] = useState(false)
  const [error, setError] = useState('')
  const [pending, startTransition] = useTransition()

  const dirty = (Object.keys(values) as Array<keyof SettingsValues>).some(
    (key) => values[key] !== initial[key],
  )

  const set = <K extends keyof SettingsValues>(key: K, value: SettingsValues[K]) =>
    setValues((current) => ({ ...current, [key]: value }))

  const save = () =>
    startTransition(async () => {
      setError('')
      const result = await updateSettingsAction(values)
      if (!result.ok) {
        setError(result.error)
        return
      }
      toast('Settings saved')
      router.refresh()
    })

  const boxedInput =
    'w-full h-[42px] border border-line rounded-r10 bg-card px-3 text-t14 font-medium'

  return (
    <ScreenBody className="px-5">
      <DetailHeader backHref="/dashboard" title="Settings" />

      <div className="mt-5">
        <SectionLabel>Profile</SectionLabel>
        <div className="bg-card border border-line rounded-r14 mt-[10px] px-4 py-[14px]">
          <div className="text-t12 font-semibold text-muted mb-[6px]">Name</div>
          <input
            value={values.name}
            aria-label="Name"
            onChange={(event) => set('name', event.target.value)}
            className={boxedInput}
          />
          <div className="text-t12 font-semibold text-muted mb-[6px] mt-3">Email</div>
          <input
            value={values.email}
            aria-label="Email"
            onChange={(event) => set('email', event.target.value)}
            className={boxedInput}
          />
        </div>
      </div>

      <div className="mt-5">
        <SectionLabel>Business</SectionLabel>
        <div className="bg-card border border-line rounded-r14 mt-[10px] px-4 py-[14px]">
          <div className="text-t12 font-semibold text-muted mb-[6px]">
            Academy / business name
          </div>
          <input
            value={values.businessName}
            aria-label="Business name"
            onChange={(event) => set('businessName', event.target.value)}
            className={boxedInput}
          />
        </div>
      </div>

      <div className="mt-5">
        <SectionLabel>Coaching</SectionLabel>
        <div className="bg-card border border-line rounded-r14 mt-[10px] px-4 py-[14px]">
          <div className="text-t12 font-semibold text-muted mb-[6px]">
            Default session rate
          </div>
          <div className="flex items-center border border-line rounded-r10 h-[42px] px-3">
            <span className="text-t14 font-bold text-subtle">$</span>
            <input
              value={values.rate}
              inputMode="decimal"
              aria-label="Default session rate"
              onChange={(event) =>
                set('rate', event.target.value.replace(/[^0-9.]/g, ''))
              }
              className="flex-1 border-none bg-transparent text-t14 font-semibold pl-[5px] min-w-0"
            />
            <span className="text-t115 text-subtle">per session</span>
          </div>

          <button
            onClick={() => setWindowOpen(true)}
            className="w-full flex items-center justify-between mt-[14px] text-left"
          >
            <div>
              <div className="text-t135 font-semibold">Attendance window</div>
              <div className="text-t115 text-subtle mt-[2px]">
                How long after a session before attendance counts as missing
              </div>
            </div>
            <div className="flex items-center gap-[6px] shrink-0 ml-[10px]">
              <span className="text-t13 font-semibold text-accent">
                {values.attendanceWindow}
              </span>
              <span className="text-chevron text-t15">›</span>
            </div>
          </button>
        </div>
      </div>

      <div className="mt-5">
        <SectionLabel>Appearance</SectionLabel>
        <div className="bg-card border border-line rounded-r14 mt-[10px] px-4 py-[14px]">
          <div className="text-t12 font-semibold text-muted mb-2">Theme</div>
          <Segmented
            options={[
              { value: 'Light', label: 'Light' },
              { value: 'Dark', label: 'Dark' },
            ]}
            value={values.theme}
            onChange={(theme) => set('theme', theme)}
          />
          {values.theme === 'Dark' ? (
            <div className="text-t115 text-subtle mt-2">
              Preference saved — the dark palette isn’t implemented yet, so the app
              continues to render light.
            </div>
          ) : null}
        </div>
      </div>

      <div className="mt-5">
        <SectionLabel>Account</SectionLabel>
        <button
          onClick={() => setSignOutOpen(true)}
          className="w-full bg-card border border-line rounded-r14 mt-[10px] px-4 py-[15px] text-t14 font-semibold text-danger_fg text-center"
        >
          Sign Out
        </button>
      </div>

      {error ? (
        <div className="mt-[14px]">
          <ErrorBanner message={error} />
        </div>
      ) : null}

      {dirty ? (
        <div className="mt-4">
          <Button size="md" onClick={save} disabled={pending}>
            {pending ? 'Saving…' : 'Save Changes'}
          </Button>
        </div>
      ) : null}

      <Sheet open={windowOpen} onClose={() => setWindowOpen(false)}>
        <SheetTitle subtitle="How long after a session ends before attendance counts as missing">
          Attendance Window
        </SheetTitle>
        <div className="bg-card border border-line rounded-r14 mt-[14px] px-4 py-[2px]">
          {WINDOWS.map((option, index) => (
            <button
              key={option}
              onClick={() => {
                set('attendanceWindow', option)
                setWindowOpen(false)
              }}
              className={`w-full flex items-center justify-between py-[14px] ${
                index === 0 ? '' : 'border-t border-divider'
              }`}
            >
              <span className="text-t145 font-semibold">{option}</span>
              {values.attendanceWindow === option ? (
                <span className="text-accent font-bold text-t15">✓</span>
              ) : null}
            </button>
          ))}
        </div>
      </Sheet>

      <Dialog
        open={signOutOpen}
        title="Sign out?"
        body="You’ll need to sign in again to reach your sessions."
        buttons={[
          { label: 'Cancel', tone: 'plain', onClick: () => setSignOutOpen(false) },
          {
            label: 'Sign Out',
            tone: 'danger',
            onClick: () => {
              void signOutAction()
            },
          },
        ]}
      />
    </ScreenBody>
  )
}
