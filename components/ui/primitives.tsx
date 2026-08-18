import type { ReactNode } from 'react'
import { initials as toInitials } from '@/lib/domain/dates'

/**
 * Presentational primitives. Every measurement here is lifted verbatim from
 * docs/CoachOS.dc.html — card radius 16px, hairline #E5E6E1, row divider
 * #F0F1EC, shadow 0 1px 2px rgba(23,25,24,.04), and so on.
 */

export function Card({
  children,
  className = '',
  padded = false,
}: {
  children: ReactNode
  className?: string
  padded?: boolean
}) {
  return (
    <div
      className={`bg-card border border-line rounded-r16 shadow-card overflow-hidden ${
        padded ? 'p-4' : ''
      } ${className}`}
    >
      {children}
    </div>
  )
}

/** Uppercase mono section heading: 10.5px / 500 / .14em tracking / #6B706C. */
export function SectionLabel({
  children,
  className = '',
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={`font-mono text-t105 font-medium tracking-mono uppercase text-muted ${className}`}
    >
      {children}
    </div>
  )
}

/** List row inside a Card. The first row carries no top divider. */
export function Row({
  children,
  first,
  onClick,
  className = '',
  style,
}: {
  children: ReactNode
  first?: boolean
  onClick?: () => void
  className?: string
  style?: React.CSSProperties
}) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag
      onClick={onClick}
      style={style}
      className={`w-full flex items-center gap-3 ${
        first ? '' : 'border-t border-divider'
      } ${onClick ? 'cursor-pointer' : ''} ${className}`}
    >
      {children}
    </Tag>
  )
}

export function Avatar({
  name,
  size = 40,
  dark = false,
}: {
  name: string
  size?: number
  dark?: boolean
}) {
  const fontSize = size >= 54 ? 17 : size >= 44 ? 14 : size >= 40 ? 13 : 12
  return (
    <div
      className={`rounded-full flex items-center justify-center font-semibold shrink-0 ${
        dark ? 'bg-ink text-shell' : 'bg-avatar text-ink'
      }`}
      style={{ width: size, height: size, fontSize }}
    >
      {toInitials(name)}
    </div>
  )
}

/** Pill badge. Colours are passed in so callers can use the exact tone maps. */
export function Badge({
  label,
  bg,
  fg,
  className = '',
}: {
  label: string
  bg: string
  fg: string
  className?: string
}) {
  return (
    <span
      className={`text-t115 font-semibold px-[10px] py-[3px] rounded-full shrink-0 ${className}`}
      style={{ background: bg, color: fg }}
    >
      {label}
    </span>
  )
}

export function Chevron() {
  return <span className="text-chevron text-t17 leading-none">›</span>
}

/** Skeleton block using the prototype's exact shimmer gradient. */
export function Skeleton({
  height,
  radius = 16,
  className = '',
  width,
}: {
  height: number
  radius?: number
  className?: string
  width?: string
}) {
  return (
    <div
      className={`skeleton ${className}`}
      style={{ height, borderRadius: radius, width }}
    />
  )
}

export function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="bg-danger_bg rounded-r11 px-[14px] py-[11px] text-t125 font-medium text-danger_fg">
      {message}
    </div>
  )
}

/** Centred empty state used by lists that have never had content. */
export function EmptyCard({
  title,
  body,
  children,
}: {
  title: string
  body?: string
  children?: ReactNode
}) {
  return (
    <div className="bg-card border border-line rounded-r16 px-[22px] py-[26px] text-center">
      <div className="text-t145 font-semibold">{title}</div>
      {body ? <div className="text-t13 text-muted mt-[3px]">{body}</div> : null}
      {children}
    </div>
  )
}

/** Inline empty state (no card) used for "no search results". */
export function EmptyInline({ title, body }: { title: string; body?: string }) {
  return (
    <div className="text-center pt-[44px] px-5">
      <div className="text-t145 font-semibold">{title}</div>
      {body ? <div className="text-t13 text-muted mt-1">{body}</div> : null}
    </div>
  )
}

/** Screen header with a circular back button, used by every detail screen. */
export function DetailHeader({
  onBack,
  title,
  right,
  backHref,
}: {
  onBack?: () => void
  title?: ReactNode
  right?: ReactNode
  backHref?: string
}) {
  const button = (
    <span className="w-9 h-9 rounded-full border border-line bg-card flex items-center justify-center text-t18 text-ink pb-[2px]">
      ‹
    </span>
  )
  return (
    <div className="flex items-center justify-between pt-2">
      {backHref ? (
        <a href={backHref} aria-label="Back">
          {button}
        </a>
      ) : (
        <button onClick={onBack} aria-label="Back">
          {button}
        </button>
      )}
      {typeof title === 'string' ? (
        <div className="text-t15 font-bold">{title}</div>
      ) : (
        title
      )}
      {right ?? <div className="w-9" />}
    </div>
  )
}

/** Two-column stat strip ("This month" on the dashboard). */
export function StatPair({
  left,
  right,
}: {
  left: { label: string; value: string }
  right: { label: string; value: string }
}) {
  return (
    <div className="bg-card border border-line rounded-r16 shadow-card px-[18px] py-4 flex items-stretch gap-[18px]">
      <div className="flex-1">
        <div className="text-t12 text-muted font-medium">{left.label}</div>
        <div className="text-t24 font-bold mt-[3px] tnum">{left.value}</div>
      </div>
      <div className="w-px bg-divider" />
      <div className="flex-1">
        <div className="text-t12 text-muted font-medium">{right.label}</div>
        <div className="text-t24 font-bold mt-[3px] tnum">{right.value}</div>
      </div>
    </div>
  )
}
