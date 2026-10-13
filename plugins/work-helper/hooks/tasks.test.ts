import { describe, expect, test } from 'claude-code/testing'

import { addTask, completeStep, describeQueue, emptyQueue, finishActive, progress } from './tasks'

const twoTasks = () =>
  addTask(
    addTask(emptyQueue('hisense'), { id: '1', title: 'Add 2FA', steps: ['Entity', 'Form', 'Tests'] }, 'end'),
    { id: '2', title: 'Turnstile', steps: ['Widget'] },
    'end',
  )

describe('work-helper task queue', () => {
  test('the first task added is active, later ones wait', async () => {
    expect(twoTasks().tasks.map(t => t.title)).toEqual(['Add 2FA', 'Turnstile'])
  })

  test("'next' goes right after the active task", async () => {
    const q = addTask(twoTasks(), { id: '3', title: 'Hotfix', steps: ['Fix'] }, 'next')
    expect(q.tasks.map(t => t.title)).toEqual(['Add 2FA', 'Hotfix', 'Turnstile'])
  })

  test('ticking steps moves the percent and finishes the task', async () => {
    let q = completeStep(twoTasks(), 2).queue
    expect(progress(q.tasks[0]!)).toEqual({ done: 1, total: 3, percent: 33 })

    q = completeStep(q, 1).queue
    const last = completeStep(q, 3)
    expect(last.finished?.title).toBe('Add 2FA')
    expect(last.queue.tasks.map(t => t.title)).toEqual(['Turnstile'])
  })

  test('an out-of-range step changes nothing', async () => {
    const q = twoTasks()
    expect(completeStep(q, 9).queue).toEqual(q)
  })

  test('finishing drops the active task', async () => {
    expect(finishActive(twoTasks()).queue.tasks.map(t => t.title)).toEqual(['Turnstile'])
    expect(describeQueue(emptyQueue('x'))).toBe('No tasks queued for x.')
  })
})
