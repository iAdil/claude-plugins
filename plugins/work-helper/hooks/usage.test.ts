import { describe, expect, test } from 'claude-code/testing'

import { costLine, timeLeft, usageRows } from './usage'

const NOW = Date.parse('2026-10-13T10:00:00Z')

describe('work-helper usage rows', () => {
  test('orders 5h before weekly and skips other windows', async () => {
    const rows = usageRows(
      [
        { kind: 'seven_day', percentUsed: 55 },
        { kind: 'spend_limit', percentUsed: 10 },
        { kind: 'five_hour', percentUsed: 38 },
      ],
      NOW,
    )
    expect(rows.map(r => r.label)).toEqual(['5h', 'week'])
  })

  test('computes remaining share, bar and tone', async () => {
    const [row] = usageRows([{ kind: 'five_hour', percentUsed: 90, resetsAt: '2026-10-13T12:14:00Z' }], NOW)
    expect(row?.left).toBe(10)
    expect(row?.filled.length).toBe(18)
    expect(row?.empty.length).toBe(2)
    expect(row?.tone).toBe('error')
    expect(row?.resets).toBe('2h 14m')
  })

  test('formats time to reset', async () => {
    expect(timeLeft((3 * 24 + 4) * 3600000)).toBe('3d 4h')
    expect(timeLeft(5 * 60000)).toBe('5m')
    expect(timeLeft(-1000)).toBe('0m')
  })
})

describe('work-helper session cost', () => {
  test('formats the total and hides the rate in the first 10 minutes', async () => {
    expect(costLine(0.4219, NOW - 5 * 60000, NOW)).toEqual({ total: '$0.42', perHour: undefined, elapsed: '5m' })
  })

  test('shows an hourly rate once the session is older', async () => {
    expect(costLine(12.34, NOW - 2 * 3600000, NOW)).toEqual({ total: '$12.3', perHour: '$6.17/h', elapsed: '2h 0m' })
  })
})
