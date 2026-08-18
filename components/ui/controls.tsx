'use client'

import type { ReactNode } from 'react'

/**
 * Interactive controls. Sizes and colours are the prototype's literal values:
 * primary CTA 48px/12px radius/15px, form CTA 50px/13px radius/15.5px,
 * secondary 46px, segmented track #ECECE7 with a 9px-radius white thumb.
 */

type ButtonTone = 'primary' | 'ink' | 'plain' | 'danger' | 'soft'

const TONE: Record<ButtonTone, string> = {
  primary: 'bg-accent text-white border border-accent',
  ink: 'bg-ink text-shell border border-ink',
  plain: 'bg-card text-ink border border-line',
  danger: 'bg-card text-danger_fg border border-danger_line',
  soft: 'bg-card text-accent_dark border border-accent_line',
}

export function Button({
  children,
  tone = 'primary',
  size = 'md',
  onClick,
  type = 'button',
  disabled,
  className = '',
  full = true,
}: {
  children: ReactNode
  tone?: ButtonTone
  /** lg = 50px form CTA, md = 48px primary, sm = 46px secondary, xs = 44px */
  size?: 'lg' | 'md' | 'sm' | 'xs' | 'chip'
  onClick?: () => void
  type?: 'button' | 'submit'
  disabled?: boolean
  className?: string
  full?: boolean
}) {
  const sizing = {
    lg: 'h-[50px] rounded-r13 text-t155',
    md: 'h-12 rounded-r12 text-t15',
    sm: 'h-[46px] rounded-r12 text-t14',
    xs: 'h-11 rounded-r11 text-t135',
    chip: 'h-10 rounded-r10 text-t13',
  }[size]

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`${full ? 'w-full' : ''} ${sizing} ${TONE[tone]} font-semibold flex items-center justify-center ${
        disabled ? 'opacity-40 cursor-default' : 'cursor-pointer'
      } ${className}`}
    >
      {children}
    </button>
  )
}

/** Segmented control. Selected thumb: white, 9px radius, seg shadow. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  className = '',
}: {
  options: Array<{ value: T; label: string }>
  value: T
  onChange: (value: T) => void
  className?: string
}) {
  return (
    <div className={`flex bg-track rounded-r11 p-[2px] ${className}`}>
      {options.map((option) => {
        const selected = option.value === value
        return (
          <button
            key={option.value}
            onClick={() => onChange(option.value)}
            className={`flex-1 text-center py-2 rounded-r9 text-t13 font-semibold ${
              selected ? 'bg-card text-ink shadow-seg' : 'bg-transparent text-muted'
            }`}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

/** Pill chip. Selected = ink fill, unselected = white with hairline border. */
export function Chip({
  label,
  selected,
  onClick,
  size = 'md',
}: {
  label: string
  selected: boolean
  onClick: () => void
  size?: 'md' | 'sm'
}) {
  const sizing =
    size === 'md' ? 'px-[14px] py-[9px] text-t135' : 'px-[13px] py-2 text-t13'
  return (
    <button
      onClick={onClick}
      className={`rounded-full font-semibold border ${sizing} ${
        selected ? 'bg-ink text-shell border-ink' : 'bg-card text-ink border-line'
      }`}
    >
      {label}
    </button>
  )
}

export function FieldLabel({ children }: { children: ReactNode }) {
  return <div className="text-t12 font-semibold text-muted mb-[6px]">{children}</div>
}

export function TextInput({
  value,
  onChange,
  placeholder,
  type = 'text',
  inputMode,
  className = '',
  height = 46,
  ariaLabel,
  autoComplete,
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  type?: string
  inputMode?: 'text' | 'decimal' | 'email' | 'tel' | 'numeric'
  className?: string
  height?: number
  ariaLabel?: string
  autoComplete?: string
}) {
  return (
    <input
      type={type}
      value={value}
      aria-label={ariaLabel}
      autoComplete={autoComplete}
      inputMode={inputMode}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      style={{ height }}
      className={`w-full border border-line rounded-r12 bg-card px-[14px] text-t145 font-medium ${className}`}
    />
  )
}

export function TextArea({
  value,
  onChange,
  placeholder,
  rows = 4,
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  rows?: number
}) {
  return (
    <textarea
      value={value}
      rows={rows}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      className="w-full border border-line rounded-r12 bg-card px-[14px] py-3 text-t14 leading-[1.5] resize-none"
    />
  )
}

/**
 * Money input with the leading "$" affix. `suffix` renders the trailing hint
 * ("per session", "credit") the prototype shows on several screens.
 */
export function MoneyInput({
  value,
  onChange,
  placeholder = '0',
  suffix,
  height = 52,
  symbolSize = 19,
  valueSize = 22,
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  suffix?: string
  height?: number
  symbolSize?: number
  valueSize?: number
}) {
  return (
    <div
      className="flex items-center bg-card border border-line rounded-r12 px-4"
      style={{ height }}
    >
      <span className="font-bold text-subtle" style={{ fontSize: symbolSize }}>
        $
      </span>
      <input
        value={value}
        inputMode="decimal"
        aria-label="Amount"
        onChange={(event) => onChange(event.target.value.replace(/[^0-9.]/g, ''))}
        placeholder={placeholder}
        style={{ fontSize: valueSize }}
        className="flex-1 border-none bg-transparent font-bold pl-[6px] min-w-0 tnum"
      />
      {suffix ? <span className="text-t13 text-subtle shrink-0">{suffix}</span> : null}
    </div>
  )
}

/** −/+ stepper used for group capacity. */
export function Stepper({
  value,
  onDecrement,
  onIncrement,
}: {
  value: number
  onDecrement: () => void
  onIncrement: () => void
}) {
  const circle =
    'w-9 h-9 rounded-full border border-line bg-card flex items-center justify-center text-t17 text-ink pb-[2px]'
  return (
    <div className="flex items-center gap-[14px]">
      <button onClick={onDecrement} className={circle} aria-label="Decrease">
        −
      </button>
      <div className="text-t17 font-bold w-6 text-center tnum">{value}</div>
      <button onClick={onIncrement} className={circle} aria-label="Increase">
        +
      </button>
    </div>
  )
}

/** Search field with the magnifier glyph, 42px tall on a #ECECE7 track. */
export function SearchInput({
  value,
  onChange,
  placeholder,
}: {
  value: string
  onChange: (value: string) => void
  placeholder: string
}) {
  return (
    <div className="flex items-center gap-[9px] bg-track rounded-r11 h-[42px] px-[13px]">
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#8A8E89"
        strokeWidth="2"
        strokeLinecap="round"
      >
        <circle cx="11" cy="11" r="6.5" />
        <path d="M16 16l4.5 4.5" />
      </svg>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="flex-1 border-none bg-transparent text-t145 h-full min-w-0"
      />
    </div>
  )
}
