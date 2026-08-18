import { describe, expect, it } from 'vitest'
import {
  isValidTimeZone,
  minutesBetween,
  supportedTimeZones,
  zonedNow,
} from '@/lib/domain/dates'
import { attendanceGraceMinutes, attendanceMissing } from '@/lib/domain/sessions'
import { coachClock, coachGraceMinutes } from '@/lib/services/clock'
import type { Enrollment, Session } from '@/lib/domain/types'

describe('zonedNow', () => {
  it('returns the calendar date of the given zone, not the server', () => {
    // 2026-08-17T02:30:00Z — already the 17th in UTC, still the 16th in LA.
    const instant = new Date('2026-08-17T02:30:00Z')

    expect(zonedNow('UTC', instant)).toEqual({ today: '2026-08-17', minutes: 150 })
    expect(zonedNow('America/Los_Angeles', instant)).toEqual({
      today: '2026-08-16',
      minutes: 19 * 60 + 30, // 7:30 PM
    })
  })

  it('is correct east of Greenwich too', () => {
    const instant = new Date('2026-08-16T22:00:00Z')
    expect(zonedNow('Australia/Sydney', instant)).toEqual({
      today: '2026-08-17',
      minutes: 8 * 60,
    })
  })

  it('handles midnight without reporting hour 24', () => {
    const instant = new Date('2026-08-16T07:00:00Z') // midnight PDT
    expect(zonedNow('America/Los_Angeles', instant)).toEqual({
      today: '2026-08-16',
      minutes: 0,
    })
  })

  it('falls back to UTC for an unknown zone rather than throwing', () => {
    const instant = new Date('2026-08-17T02:30:00Z')
    expect(zonedNow('Mars/Olympus_Mons', instant)).toEqual(
      zonedNow('UTC', instant),
    )
  })

  it('validates zone names', () => {
    expect(isValidTimeZone('America/Los_Angeles')).toBe(true)
    expect(isValidTimeZone('Mars/Olympus_Mons')).toBe(false)
    expect(isValidTimeZone('')).toBe(false)
  })

  it('offers a non-empty timezone list for the settings picker', () => {
    const zones = supportedTimeZones()
    expect(zones.length).toBeGreaterThan(0)
    expect(zones).toContain('America/Los_Angeles')
  })
})

describe('coachClock', () => {
  it('drives "today" from the coach zone, so an evening session stays today', () => {
    // 7:30 PM Sunday in LA. A UTC server would already call this Monday.
    const instant = new Date('2026-08-17T02:30:00Z')

    expect(coachClock({ timezone: 'America/Los_Angeles' }, instant).today).toBe(
      '2026-08-16',
    )
    expect(coachClock({ timezone: 'UTC' }, instant).today).toBe('2026-08-17')
  })

  it('treats a missing zone as UTC rather than failing', () => {
    const instant = new Date('2026-08-17T02:30:00Z')
    expect(coachClock({ timezone: '' }, instant).today).toBe('2026-08-17')
  })
})

describe('minutesBetween', () => {
  it('spans days correctly', () => {
    expect(minutesBetween('2026-08-16', 1380, '2026-08-17', 60)).toBe(120)
    expect(minutesBetween('2026-08-16', 600, '2026-08-16', 660)).toBe(60)
    expect(minutesBetween('2026-08-16', 600, '2026-08-19', 600)).toBe(3 * 1440)
  })
})

describe('attendance window', () => {
  const session: Session = {
    id: 's1',
    coachId: 'coach',
    type: 'group',
    name: 'Evening Drills',
    date: '2026-08-16',
    startMin: 1020, // 5:00 PM
    durationMin: 60, // ends 6:00 PM
    priceCents: 3000,
    isFree: false,
    location: '',
    capacity: 6,
    status: 'scheduled',
    attendanceSkipped: false,
    cancelledAt: null,
    createdAt: '2026-08-01T00:00:00Z',
  }

  const enrollments: Enrollment[] = [
    {
      id: 'e1',
      coachId: 'coach',
      sessionId: 's1',
      playerId: 'p1',
      attendance: 'unmarked',
      createdAt: '2026-08-01T00:00:00Z',
    },
  ]

  it('maps each window setting to a grace period', () => {
    expect(attendanceGraceMinutes('Same day')).toBe(0)
    expect(attendanceGraceMinutes('24 hours')).toBe(1440)
    expect(attendanceGraceMinutes('48 hours')).toBe(2880)
    expect(attendanceGraceMinutes('72 hours')).toBe(4320)
  })

  it('with "Same day", nags as soon as the session ends', () => {
    const justAfter = { today: '2026-08-16', nowMinutes: 1081 }
    expect(attendanceMissing(session, enrollments, justAfter, 0)).toBe(true)
  })

  it('with "24 hours", stays quiet until the window elapses', () => {
    const grace = attendanceGraceMinutes('24 hours')

    // 2 hours after it ended — still inside the window.
    expect(
      attendanceMissing(session, enrollments, { today: '2026-08-16', nowMinutes: 1200 }, grace),
    ).toBe(false)

    // 23 hours after — still inside.
    expect(
      attendanceMissing(session, enrollments, { today: '2026-08-17', nowMinutes: 1020 }, grace),
    ).toBe(false)

    // 25 hours after — now it is missing.
    expect(
      attendanceMissing(session, enrollments, { today: '2026-08-17', nowMinutes: 1140 }, grace),
    ).toBe(true)
  })

  it('never nags about cancelled or skipped sessions, whatever the window', () => {
    const late = { today: '2026-08-20', nowMinutes: 600 }
    expect(
      attendanceMissing({ ...session, status: 'cancelled' }, enrollments, late, 0),
    ).toBe(false)
    expect(
      attendanceMissing({ ...session, attendanceSkipped: true }, enrollments, late, 0),
    ).toBe(false)
  })

  it('reads the grace period off the coach', () => {
    expect(coachGraceMinutes({ attendanceWindow: 'Same day' })).toBe(0)
    expect(coachGraceMinutes({ attendanceWindow: '48 hours' })).toBe(2880)
  })
})
