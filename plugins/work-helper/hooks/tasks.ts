import type { Queue, Task } from '../types'

export const emptyQueue = (project: string): Queue => ({ project, tasks: [] })

export const progress = (task: Task) => {
  const done = task.steps.filter(s => s.done).length
  const total = task.steps.length

  return { done, total, percent: total === 0 ? 0 : Math.round((done / total) * 100) }
}

export const addTask = (
  queue: Queue,
  task: Omit<Task, 'steps'> & { steps: string[] },
  position: 'next' | 'end',
): Queue => {
  const added: Task = { ...task, steps: task.steps.map(text => ({ text, done: false })) }
  const tasks =
    position === 'next' && queue.tasks.length > 0
      ? [queue.tasks[0]!, added, ...queue.tasks.slice(1)]
      : [...queue.tasks, added]

  return { ...queue, tasks }
}

// Ticks a step (1-based) of the active task; a task with every step done leaves the queue.
export const completeStep = (queue: Queue, step: number): { queue: Queue; finished?: Task } => {
  const [active, ...rest] = queue.tasks

  if (active === undefined || step < 1 || step > active.steps.length) {
    return { queue }
  }

  const steps = active.steps.map((s, i) => (i === step - 1 ? { ...s, done: true } : s))
  const ticked = { ...active, steps }

  return steps.every(s => s.done)
    ? { queue: { ...queue, tasks: rest }, finished: ticked }
    : { queue: { ...queue, tasks: [ticked, ...rest] } }
}

export const finishActive = (queue: Queue): { queue: Queue; finished?: Task } => {
  const [active, ...rest] = queue.tasks

  return active === undefined ? { queue } : { queue: { ...queue, tasks: rest }, finished: active }
}

export const describeQueue = (queue: Queue): string => {
  const [active, ...waiting] = queue.tasks

  if (active === undefined) {
    return `No tasks queued for ${queue.project}.`
  }

  const { done, total, percent } = progress(active)
  const steps = active.steps.map((s, i) => `  [${s.done ? 'x' : ' '}] ${i + 1}. ${s.text}`).join('\n')
  const next = waiting.map((t, i) => `  ${i + 1}. ${t.title}`).join('\n')

  return [
    `Project: ${queue.project}`,
    `Active task: ${active.title} (${percent}%, ${done}/${total} steps)`,
    steps,
    waiting.length > 0 ? `Up next:\n${next}` : 'Up next: nothing',
  ].join('\n')
}
