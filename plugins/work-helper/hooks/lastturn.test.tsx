import { expect, mock, test } from 'claude-code/testing'
import type { ModelCompleteInput, On } from 'claude-code'
import type { TestBody } from 'claude-code/testing'

import { cleanSummary, quickSummary, summaryPrompt } from './lastturn'

const BAND = {
  plugin: 'work-helper',
  surface: 'terminal',
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

const LONG = `I added the LICENSE file at the repo root with the MIT text, put a license field in plugin.json and a License section at the end of the README. ${'More detail. '.repeat(10)}`

const turn = (answer: string, extra: Record<string, unknown> = {}) =>
  ({ answer, durationMs: 1000, isAborted: false, turnId: 't1', reason: 'answer', ...extra }) as const

test('a short final message is its own summary', () => {
  expect(quickSummary('  Done:\n  pushed to main.  ')).toBe('Done: pushed to main.')
  expect(quickSummary('')).toBeUndefined()
  expect(quickSummary(LONG)).toBeUndefined()
})

test('the model reply is cleaned to one line', () => {
  expect(cleanSummary('"Added MIT license and README section."\n')).toBe('Added MIT license and README section')
  expect(cleanSummary('  \n ')).toBeUndefined()
  expect(summaryPrompt(LONG)).toContain('<message>')
})

const setup = (on: On, reply: () => unknown) => {
  const calls: ModelCompleteInput[] = []
  const clock = mock.clock(on)
  on('turn.complete', (_$, e) => ({ text: e.answer }))
  on('session.cwd', () => ({ value: '/tmp/none' }))
  // Stands for the engine's own band, drawn when the plugin has nothing to show.
  on('ui.render', ($, e) => {
    const { Box } = $.ui.resolve(e)

    return <Box />
  })
  on('model.complete', (_$, e) => {
    calls.push(e)
    return { value: reply() } as never
  })

  return { calls, clock }
}

const bandText = async ($: Parameters<TestBody>[0]) => {
  const ui = await $.ui.mount(BAND)
  const found = await ui.find({ type: 'Text', text: /✓ Last/ })
  const row = found ? await ui.find({ type: 'Text', text: /pushed|Added/ }) : undefined
  await ui.unmount()

  return row?.text
}

test('a long answer is summarised by haiku into the band', async ($, on) => {
  const { calls, clock } = setup(on, () => ({ isAnswered: true, text: 'Added MIT license and README section.', usage: {} }))

  await $.turn.complete(turn(LONG))
  await clock.settle()

  expect(calls.length).toBe(1)
  expect(calls[0]?.model).toBe('haiku')
  expect(await bandText($)).toBe('Added MIT license and README section')
})

test('a short answer skips the model call', async ($, on) => {
  const { calls, clock } = setup(on, () => ({ isAnswered: true, text: 'x', usage: {} }))

  await $.turn.complete(turn('Committed and pushed to main.'))
  await clock.settle()

  expect(calls.length).toBe(0)
  expect(await bandText($)).toBe('Committed and pushed to main.')
})

test('aborted turns, subagent turns and failed calls leave the row alone', async ($, on) => {
  const { calls, clock } = setup(on, () => ({ isAnswered: false, reason: 'empty-reply', usage: {} }))

  await $.turn.complete(turn('Committed and pushed to main.'))
  await $.turn.complete(turn(LONG, { reason: 'aborted', isAborted: true }))
  await $.turn.complete(turn(LONG, { agentId: 'a1' }))
  await $.turn.complete(turn(LONG))
  await clock.settle()

  expect(calls.length).toBe(1)
  expect(await bandText($)).toBe('Committed and pushed to main.')
})

test('turned off: no call and no row', { options: { showLastTurn: false } }, async ($, on) => {
  const { calls, clock } = setup(on, () => ({ isAnswered: true, text: 'Added it', usage: {} }))

  await $.turn.complete(turn(LONG))
  await clock.settle()

  expect(calls.length).toBe(0)
  expect(await bandText($)).toBeUndefined()
})
