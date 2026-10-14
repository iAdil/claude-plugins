import { describe, expect, test } from 'claude-code/testing'

import { addActive, addFinished, dayReport, duration } from './time'

describe('work-helper time', () => {
  test('adds time and finished tasks per project', async () => {
    let day = addActive({}, 'instagram', 90 * 60000)
    day = addActive(day, 'instagram', 30 * 60000)
    day = addActive(day, 'threads', 10 * 60000)
    day = addFinished(day, 'instagram', 'Add photo stories')
    expect(dayReport('2026-10-13', day)).toBe(
      ['Tracked time on 2026-10-13: 2h 10m', '- instagram: 2h 0m (finished: Add photo stories)', '- threads: 10m'].join('\n'),
    )
  })

  test('formats durations', async () => {
    expect(duration(59 * 60000)).toBe('59m')
    expect(duration(125 * 60000)).toBe('2h 5m')
  })
})
