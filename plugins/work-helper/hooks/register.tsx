import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Queue } from '../types'
import { findProject, parseRegistry, statusText } from './project'
import { addTask, completeStep, describeQueue, emptyQueue, finishActive, progress } from './tasks'
import { usageRows } from './usage'

const limits = atom({ plugin: 'work-helper', key: 'limits' } as const, [])
const queue = atom({ plugin: 'work-helper', key: 'queue' } as const, emptyQueue(''))

const gitInfo = async ($: EngineInterface, cwd: string) => {
  const ran = await $.process
    .run(['git', 'rev-parse', '--show-toplevel', '--abbrev-ref', 'HEAD'], { cwd, timeoutMs: 5000 })
    .catch(() => undefined)

  if (ran === undefined || ran.exitCode !== 0) {
    return undefined
  }

  const [root = cwd, branch = '?'] = ran.stdout.trim().split('\n')

  return { root, branch }
}

// Where the queue lives: the registry row's path, else the git root, else the directory.
let storeKey = ''

const refresh = ($: EngineInterface, cwd: string) =>
  show($, cwd).catch(() => $.ui.status(undefined))

const show = async ($: EngineInterface, cwd: string) => {
  const home = await $.env.get('HOME')
  const registry = await $.fs.read(`${home}/.claude/project-registry.md`).catch(() => '')
  const project = findProject(parseRegistry(registry), cwd)
  const git = await gitInfo($, cwd)

  $.ui.status(statusText(cwd, project, git))

  const path = project?.path ?? git?.root ?? cwd
  const key = `queue:${path}`

  if (key !== storeKey) {
    storeKey = key
    const stored = (await $.store.get(key)) as Queue | undefined
    const name = project?.name ?? path.split('/').pop() ?? path
    await update($, queue, () => ({ ...(stored ?? emptyQueue(name)), project: name }))
  }
}

const save = async ($: EngineInterface, next: Queue) => {
  await update($, queue, () => next)
  await $.store.set(storeKey, next)
}

const registerTools = ($: EngineInterface) =>
  Promise.all([
    $.tool.register({
      name: 'task_add',
      description:
        "Adds a task to the current project's work-helper queue (shown above the prompt). Split the task into 3-7 concrete, checkable steps. position 'end' (default) queues it last; 'next' puts it right after the active task.",
      inputSchema: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Short task title, under 60 characters' },
          steps: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 10 },
          position: { type: 'string', enum: ['end', 'next'] },
        },
        required: ['title', 'steps'],
      },
    }),
    $.tool.register({
      name: 'task_step_done',
      description:
        "Marks a step (1-based) of the project's active task as done. Call it as soon as you finish each step. When every step is done the task completes and the next one becomes active.",
      inputSchema: {
        type: 'object',
        properties: { step: { type: 'integer', minimum: 1 } },
        required: ['step'],
      },
    }),
    $.tool.register({
      name: 'task_finish',
      description: "Completes (or drops) the project's active task whatever its steps say, and activates the next one.",
    }),
    $.tool.register({
      name: 'task_list',
      description: "Shows the project's work-helper queue: the active task with its steps, and what is up next.",
    }),
  ])

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    await refresh($, started.cwd)
    await registerTools($)

    const usage = await $.session.usage().catch(() => undefined)
    if (usage) await update($, limits, () => usage.rateLimits)

    return started
  })

  on('classic.CwdChanged', async ($, e, next) => {
    const result = await next(e)
    await refresh($, e.new_cwd)

    return result
  }).catch(($, e, next) => next(e))

  // The branch can change during a turn (git checkout in Bash).
  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    await refresh($, await $.session.cwd())

    return result
  })

  on('session.measure', async ($, e, next) => {
    if (e.changed.includes('rateLimits')) {
      await update($, limits, () => e.rateLimits)
    }

    return next(e)
  })

  on('tool.call', { tool: /^mcp__work-helper__task_add$/ }, async ($, e) => {
    const input = e as unknown as { title: string; steps: string[]; position?: 'next' | 'end' }
    const id = String(await $.clock.now())
    await save($, addTask(await read($, queue), { id, ...input }, input.position ?? 'end'))

    return { result: describeQueue(await read($, queue)) }
  }).catch(() => ({ deny: 'work-helper: task_add failed.' }))

  on('tool.call', { tool: /^mcp__work-helper__task_step_done$/ }, async ($, e) => {
    const { step } = e as unknown as { step: number }
    const before = await read($, queue)

    if (before.tasks[0] === undefined || step > before.tasks[0].steps.length) {
      return { deny: `No step ${step} on the active task.\n${describeQueue(before)}` }
    }

    const { queue: after, finished } = completeStep(before, step)
    await save($, after)

    if (finished) {
      $.ui.toast(`✔ Task done: ${finished.title}`)
    }

    return { result: describeQueue(after) }
  }).catch(() => ({ deny: 'work-helper: task_step_done failed.' }))

  on('tool.call', { tool: /^mcp__work-helper__task_finish$/ }, async $ => {
    const { queue: after, finished } = finishActive(await read($, queue))
    await save($, after)

    if (finished) {
      $.ui.toast(`✔ Task done: ${finished.title}`)
    }

    return { result: describeQueue(after) }
  }).catch(() => ({ deny: 'work-helper: task_finish failed.' }))

  on('tool.call', { tool: /^mcp__work-helper__task_list$/ }, async $ => ({
    result: describeQueue(await read($, queue)),
  })).catch(() => ({ deny: 'work-helper: task_list failed.' }))

  // Keeps the model aware of the active task so it ticks steps as it works.
  on('prompt.compose', async ($, e, next) => {
    const composed = await next(e)
    const current = await read($, queue)

    if (current.tasks.length === 0) {
      return composed
    }

    const text = `# work-helper task queue\n${describeQueue(current)}\n\nWhen you finish a step of the active task, call mcp__work-helper__task_step_done with its number. Do not start queued tasks unless the user asks.`

    return { sections: [...composed.sections, { id: 'work-helper:tasks', text, scope: 'session' as const }] }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const rows = usageRows(await read($, limits), await $.clock.now())
    const [active, upNext, ...later] = (await read($, queue)).tasks

    if (e.props.hasSurvey || (rows.length === 0 && active === undefined)) {
      return next(e)
    }

    const { Box, Text } = $.ui.resolve(e)
    const p = active && progress(active)
    const cells = p ? Math.round(p.percent / 10) : 0
    const nextStep = active?.steps.find(s => !s.done)

    return (
      <Box flexDirection="column">
        {active && p && (
          <Box key="task">
            <Text bold color="claude">{'▶ '}</Text>
            <Text bold>{active.title} </Text>
            <Text color="claude">{'█'.repeat(cells)}</Text>
            <Text color="subtle">{'░'.repeat(10 - cells)}</Text>
            <Text bold color="claude">{` ${p.percent}%`}</Text>
            <Text dimColor>{` · ${p.done}/${p.total}`}</Text>
            {nextStep && <Text dimColor>{` · now: ${nextStep.text}`}</Text>}
          </Box>
        )}
        {active && (
          <Box key="next">
            <Text dimColor>{'⏭ Next: '}</Text>
            <Text>{upNext ? upNext.title : '—'}</Text>
            {later.length > 0 && <Text dimColor>{` (+${later.length} more)`}</Text>}
          </Box>
        )}
        {rows.map(row => (
          <Box key={row.label}>
            <Text dimColor>{row.label.padEnd(5)}</Text>
            <Text color={row.tone}>{row.filled}</Text>
            <Text color="subtle">{row.empty}</Text>
            <Text bold color={row.tone}>{` ${String(row.left).padStart(3)}% left`}</Text>
            {row.resets && <Text dimColor>{` · resets in ${row.resets}`}</Text>}
          </Box>
        ))}
      </Box>
    )
  })
}
