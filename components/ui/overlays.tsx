'use client'

import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'

/**
 * Bottom sheets, dialogs and toasts.
 *
 * Geometry and motion come straight from the prototype:
 *  sheet   #FCFCFA, 20px top radius, 10px/20px/34px padding, sheetUp .28s
 *  scrim   rgba(23,25,24,.45), fadeIn .2s
 *  dialog  18px radius, max-width 330px, popIn .22s
 *  toast   106px from the bottom, ink pill, toastUp .25s
 */

export function Scrim({ onClick }: { onClick?: () => void }) {
  return (
    <div
      onClick={onClick}
      className="absolute inset-0 z-40 animate-fadeIn"
      style={{ background: 'rgba(23,25,24,.45)' }}
    />
  )
}

export function Sheet({
  open,
  onClose,
  children,
  maxHeight,
  zIndex = 41,
}: {
  open: boolean
  onClose: () => void
  children: ReactNode
  maxHeight?: string
  zIndex?: number
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <>
      <div
        onClick={onClose}
        className="absolute inset-0 animate-fadeIn"
        style={{ background: 'rgba(23,25,24,.45)', zIndex: zIndex - 1 }}
      />
      <div
        role="dialog"
        aria-modal="true"
        className="absolute left-0 right-0 bottom-0 bg-sheet rounded-t-r20 px-5 pt-[10px] pb-[34px] shadow-sheet animate-sheetUp overflow-y-auto"
        style={{ zIndex, maxHeight }}
      >
        <div className="w-9 h-1 rounded-r3 bg-handle mx-auto mb-4" />
        {children}
      </div>
    </>
  )
}

export function SheetTitle({
  children,
  subtitle,
}: {
  children: ReactNode
  subtitle?: string
}) {
  return (
    <>
      <div className="text-t16 font-bold text-center">{children}</div>
      {subtitle ? (
        <div className="text-t12 text-subtle text-center mt-1">{subtitle}</div>
      ) : null}
    </>
  )
}

export interface DialogButton {
  label: string
  tone: 'primary' | 'ink' | 'plain' | 'danger'
  onClick: () => void
  disabled?: boolean
}

const DIALOG_TONE: Record<DialogButton['tone'], string> = {
  primary: 'bg-accent text-white border-accent',
  ink: 'bg-ink text-white border-ink',
  danger: 'bg-danger_fg text-white border-danger_fg',
  plain: 'bg-card text-ink border-line',
}

export function Dialog({
  open,
  title,
  body,
  buttons,
  input,
}: {
  open: boolean
  title: string
  body: string
  buttons: DialogButton[]
  input?: {
    value: string
    onChange: (value: string) => void
    placeholder: string
  }
}) {
  if (!open) return null
  return (
    <div
      className="absolute inset-0 z-[60] flex items-center justify-center p-7 animate-fadeIn"
      style={{ background: 'rgba(23,25,24,.5)' }}
      role="alertdialog"
      aria-modal="true"
    >
      <div className="bg-sheet rounded-r18 p-5 w-full max-w-[330px] animate-popIn shadow-dialog">
        <div className="text-t165 font-bold tracking-tight1">{title}</div>
        <div className="text-t135 text-muted mt-2 leading-[1.55] pretty">{body}</div>
        {input ? (
          <input
            value={input.value}
            onChange={(event) => input.onChange(event.target.value)}
            placeholder={input.placeholder}
            className="w-full h-11 border border-line rounded-r11 bg-card px-[13px] text-t14 font-medium mt-[14px]"
          />
        ) : null}
        <div className="flex flex-col gap-2 mt-4">
          {buttons.map((button) => (
            <button
              key={button.label}
              onClick={button.disabled ? undefined : button.onClick}
              className={`h-[45px] rounded-r12 border text-t14 font-semibold flex items-center justify-center ${
                DIALOG_TONE[button.tone]
              } ${button.disabled ? 'opacity-40 cursor-default' : ''}`}
            >
              {button.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ---- toast ----

interface ToastContextValue {
  toast: (message: string) => void
}

const ToastContext = createContext<ToastContextValue>({ toast: () => {} })

export function useToast() {
  return useContext(ToastContext)
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<string | null>(null)

  const toast = useCallback((next: string) => {
    setMessage(next)
  }, [])

  useEffect(() => {
    if (!message) return
    const timer = setTimeout(() => setMessage(null), 2400)
    return () => clearTimeout(timer)
  }, [message])

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {message ? (
        <div
          className="absolute left-5 right-5 z-[80] flex justify-center pointer-events-none"
          style={{ bottom: 106 }}
          role="status"
          aria-live="polite"
        >
          <div className="bg-ink text-shell text-t13 font-medium px-[18px] py-[11px] rounded-r12 shadow-toast animate-toastUp text-center">
            {message}
          </div>
        </div>
      ) : null}
    </ToastContext.Provider>
  )
}
