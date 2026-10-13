import { expect, mock, test } from 'claude-code/testing'

const BAND = {
  plugin: 'work-helper',
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 10,
    bodyColumns: 120,
    scroll: { offset: 0, bodyRows: 10 },
    view: {},
  },
} as const

test('draws both usage windows above the prompt', async ($, on) => {
  const clock = mock.clock(on)
  await clock.set(Date.parse('2026-10-13T10:00:00Z'))
  on('session.measure', (_$, e) => ({ changed: e.changed }))

  await $.session.measure({
    context: { window: 200000 },
    rateLimits: [
      { kind: 'five_hour', percentUsed: 38, resetsAt: '2026-10-13T12:14:00Z' },
      { kind: 'seven_day', percentUsed: 91 },
    ],
    changed: ['rateLimits'],
  })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })
    expect(await ui.find({ type: 'Text', text: /62% left/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /9% left/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /resets in 2h 14m/ })).toBeDefined()
    await ui.unmount()
  }
})
