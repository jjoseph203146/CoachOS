import { Card, SectionLabel, StatTile } from '@/components/ui/primitives'
import { formatShort } from '@/lib/domain/dates'
import { formatMoney } from '@/lib/domain/money'
import type { RevenueSummary } from '@/lib/services/revenue'

/** The analytics above the charge list: what came in, when, and from what. */
export function RevenueHeader({ summary }: { summary: RevenueSummary }) {
  const peak = Math.max(1, ...summary.weekDays.map((d) => d.cents))
  const change = summary.weekChangePercent

  return (
    <>
      <div className="flex gap-2 mt-4">
        <StatTile value={formatMoney(summary.todayCents)} label="Today" />
        <StatTile value={formatMoney(summary.weekCents)} label="This Week" />
        <StatTile value={formatMoney(summary.monthCents)} label="This Month" />
      </div>

      <div className="mt-[22px]">
        <SectionLabel>This week’s revenue</SectionLabel>
      </div>
      <Card className="mt-[10px]" padded>
        <div className="flex items-center justify-between">
          <div className="text-t28 font-extrabold tnum tracking-tight2">
            {formatMoney(summary.weekCents)}
          </div>
          {change !== null ? (
            <span
              className={`text-t12 font-semibold px-[9px] py-[5px] rounded-full ${
                change >= 0 ? 'bg-success_bg text-success' : 'bg-danger_bg text-danger'
              }`}
            >
              {change >= 0 ? '↑' : '↓'} {Math.abs(change)}%
            </span>
          ) : null}
        </div>
        <div
          className="flex items-end gap-3 mt-3"
          style={{ height: 96 }}
          role="img"
          aria-label={`Revenue by day this week: ${summary.weekDays
            .map((d) => `${d.label} ${formatMoney(d.cents)}`)
            .join(', ')}`}
        >
          {summary.weekDays.map((day) => (
            <div key={day.date} className="flex-1 h-full flex flex-col justify-end items-center">
              <div
                className="w-full rounded-t-[5px]"
                style={{
                  height: `${Math.max(4, Math.round((day.cents / peak) * 100))}%`,
                  background: day.isToday ? '#1677EE' : '#BCD9F8',
                  opacity: day.cents === 0 ? 0.5 : 1,
                }}
              />
            </div>
          ))}
        </div>
        <div className="flex gap-3 mt-[6px]">
          {summary.weekDays.map((day) => (
            <div
              key={day.date}
              className={`flex-1 text-center text-t10 ${
                day.isToday ? 'font-bold text-accent' : 'text-subtle'
              }`}
            >
              {day.label}
            </div>
          ))}
        </div>
      </Card>

      {summary.categories.length > 0 ? (
        <>
          <div className="mt-[22px]">
            <SectionLabel>This month</SectionLabel>
          </div>
          <div className="mt-[10px] flex flex-col gap-2">
            {summary.categories.map((category) => (
              <Card key={category.key} padded>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-t14 font-bold">{category.label}</div>
                    <div className="text-t12 text-muted">{category.sharePercent}% of revenue</div>
                  </div>
                  <div className="text-t15 font-bold tnum">{formatMoney(category.cents)}</div>
                </div>
              </Card>
            ))}
          </div>
        </>
      ) : null}

      {summary.recent.length > 0 ? (
        <>
          <div className="mt-[22px]">
            <SectionLabel>Recent</SectionLabel>
          </div>
          <Card className="mt-[10px]">
            {summary.recent.map((item, index) => (
              <div
                key={item.id}
                className={`flex items-center justify-between px-4 py-[12px] ${
                  index === 0 ? '' : 'border-t border-divider'
                }`}
              >
                <div className="min-w-0">
                  <div className="text-t14 font-semibold truncate">{item.playerName}</div>
                  <div className="text-t12 text-muted">
                    {formatShort(item.paidOn)} · {item.label}
                  </div>
                </div>
                <div className="text-t15 font-bold tnum text-success">
                  +{formatMoney(item.cents)}
                </div>
              </div>
            ))}
          </Card>
        </>
      ) : null}
    </>
  )
}
