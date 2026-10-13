import { describe, expect, test } from 'claude-code/testing'

import { contextRow, dueAlerts } from './meters'

const CFG = { costStepUsd: 20, limitPercent: 80, contextPercent: 85 }

describe('work-helper meters', () => {
  test('context row', async () => {
    expect(contextRow({ tokens: 124000, window: 200000, percent: 62 })).toMatchObject({
      percent: 62,
      tone: 'warning',
      detail: '124k / 200k',
    })
    expect(contextRow({ window: 200000 })).toBeUndefined()
  })

  test('limit and cost alerts fire once', async () => {
    const now = { limits: [{ kind: 'five_hour', percentUsed: 82, resetsAt: 'R' }], usd: 41, context: null }
    const first = dueAlerts(now, CFG, [])
    expect(first.alerts.map(a => a.text)).toEqual(['⚠ 5-hour limit 82% used', '💸 Session tokens passed $40 at API prices'])
    expect(dueAlerts(now, CFG, first.fired).alerts).toEqual([])
  })

  test('context alert re-arms after a compact', async () => {
    const full = dueAlerts({ limits: [], context: { window: 1, percent: 90 } }, CFG, [])
    expect(full.alerts).toHaveLength(1)
    const compacted = dueAlerts({ limits: [], context: { window: 1, percent: 30 } }, CFG, full.fired)
    expect(compacted.fired).toEqual([])
    expect(dueAlerts({ limits: [], context: { window: 1, percent: 88 } }, CFG, compacted.fired).alerts).toHaveLength(1)
  })
})
