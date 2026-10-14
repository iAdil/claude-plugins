import { atom, read, update } from 'claude-code'
import type { EngineInterface, PluginOptions, Register } from 'claude-code'

import type { Queue } from '../types'
import { FORMAT, composeArgv, parseContainers, shortPorts } from './docker'
import { cleanSummary, quickSummary, summaryPrompt } from './lastturn'
import { contextRow, dueAlerts } from './meters'
import { findProject, parseRegistry, statusText } from './project'
import { addTask, completeStep, describeQueue, emptyQueue, finishActive, progress } from './tasks'
import { IDLE, type Day, addActive, addFinished, dayKey, dayReport, duration } from './time'
import { costLine, usageRows } from './usage'

const limits = atom({ plugin: 'work-helper', key: 'limits' } as const, [])
const cost = atom({ plugin: 'work-helper', key: 'cost' } as const, null)
const context = atom({ plugin: 'work-helper', key: 'context' } as const, null)
const queue = atom({ plugin: 'work-helper', key: 'queue' } as const, emptyQueue(''))
const project = atom({ plugin: 'work-helper', key: 'project' } as const, null)
const docker = atom({ plugin: 'work-helper', key: 'docker' } as const, { list: [] })
const alerted = atom({ plugin: 'work-helper', key: 'alerted' } as const, [])
const todayMs = atom({ plugin: 'work-helper', key: 'todayMs' } as const, 0)
const lastTurn = atom({ plugin: 'work-helper', key: 'lastTurn' } as const, null)

const DOCKER_PANE = 'work-helper-docker'

// Every feature can be switched off in /config; a change reloads the module.
const settings = (options: PluginOptions) => {
  const on = (key: string) => options[key] !== false
  const num = (key: string, fallback: number) => (typeof options[key] === 'number' ? (options[key] as number) : fallback)

  return {
    statusLine: on('showProject'),
    tasks: on('showTasks'),
    lastTurn: on('showLastTurn'),
    limits: on('showLimits'),
    context: on('showContext'),
    cost: on('showCost'),
    time: on('trackTime'),
    docker: on('dockerPane'),
    alerts: on('budgetAlerts'),
    costStepUsd: num('costStepUsd', 20),
    limitPercent: num('limitAlertPercent', 80),
    contextPercent: num('contextAlertPercent', 85),
    donePing: on('donePing'),
    doneAfterMs: num('doneAfterSeconds', 120) * 1000,
  }
}

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

let cfg = settings({})

// Where the queue lives: the registry row's path, else the git root, else the directory.
let storeKey = ''
let lastActive: number | undefined
let turnStartedAt: number | undefined
let dockerTimer: { cancel: () => void } | undefined

const refresh = ($: EngineInterface, cwd: string) => locate($, cwd).catch(() => $.ui.status(undefined))

const locate = async ($: EngineInterface, cwd: string) => {
  const home = await $.env.get('HOME')
  const registry = await $.fs.read(`${home}/.claude/project-registry.md`).catch(() => '')
  const row = findProject(parseRegistry(registry), cwd)
  const git = await gitInfo($, cwd)

  $.ui.status(cfg.statusLine ? statusText(cwd, row, git) : undefined)

  const path = row?.path ?? git?.root ?? cwd
  const name = row?.name ?? path.split('/').pop() ?? path
  const key = `queue:${path}`

  await update($, project, () => ({ name, path, runtime: row?.runtime ?? 'docker', url: row?.url ?? '' }))

  if (key !== storeKey) {
    storeKey = key
    const stored = (await $.store.get(key)) as Queue | undefined
    await update($, queue, () => ({ ...(stored ?? emptyQueue(name)), project: name }))
    await loadToday($)
  }
}

const save = async ($: EngineInterface, next: Queue) => {
  await update($, queue, () => next)
  await $.store.set(storeKey, next)
}

// --- time tracking ---------------------------------------------------------

const dayOf = async ($: EngineInterface, date: string) => ((await $.store.get(`time:${date}`)) as Day | undefined) ?? {}

const loadToday = async ($: EngineInterface) => {
  const name = (await read($, project))?.name
  const day = await dayOf($, dayKey(await $.clock.now()))
  await update($, todayMs, () => (name ? (day[name]?.ms ?? 0) : 0))
}

const touch = async ($: EngineInterface) => {
  if (!cfg.time) return

  const now = await $.clock.now()
  const gap = lastActive === undefined ? 0 : now - lastActive
  lastActive = now
  const name = (await read($, project))?.name

  if (name && gap > 0 && gap <= IDLE) {
    const date = dayKey(now)
    const day = addActive(await dayOf($, date), name, gap)
    await $.store.set(`time:${date}`, day)
    await update($, todayMs, () => day[name]?.ms ?? 0)
  }
}

const logFinished = async ($: EngineInterface, title: string) => {
  $.ui.toast(`✔ Task done: ${title}`)
  const name = (await read($, project))?.name

  if (cfg.time && name) {
    const date = dayKey(await $.clock.now())
    await $.store.set(`time:${date}`, addFinished(await dayOf($, date), name, title))
  }
}

// --- alerts ------------------------------------------------------------------

const checkAlerts = async ($: EngineInterface) => {
  if (!cfg.alerts) return

  const spent = await read($, cost)
  const { alerts, fired } = dueAlerts(
    { limits: await read($, limits), usd: spent?.usd, context: await read($, context) },
    cfg,
    await read($, alerted),
  )
  await update($, alerted, () => fired)

  for (const alert of alerts) {
    $.ui.toast(alert.text, { timeoutMs: 10000 })
    await $.ui.notify(alert.text, { title: 'Claude Code' }).catch(() => undefined)
  }
}

// --- last turn ---------------------------------------------------------------

const summarise = async ($: EngineInterface, answer: string) => {
  const text =
    quickSummary(answer) ??
    (await $.model
      .complete({ model: 'haiku', prompt: summaryPrompt(answer), maxTokens: 60 })
      .then(r => (r.isAnswered ? cleanSummary(r.text) : undefined))
      .catch(() => undefined))

  if (text) {
    await update($, lastTurn, () => text)
  }
}

// --- docker ------------------------------------------------------------------

const loadContainers = async ($: EngineInterface) => {
  const p = await read($, project)
  if (!p) return

  const ran = await $.process
    .run(['docker', 'ps', '-a', '--filter', `label=com.docker.compose.project.working_dir=${p.path}`, '--format', FORMAT], {
      timeoutMs: 10000,
    })
    .catch((error: unknown) => ({ exitCode: 1, stdout: '', stderr: String(error) }))

  await update($, docker, d =>
    ran.exitCode === 0
      ? { ...d, list: parseContainers(ran.stdout), error: undefined }
      : { ...d, error: ran.stderr.trim().split('\n')[0] || 'docker ps failed' },
  )
}

const compose = async ($: EngineInterface, action: 'up' | 'stop') => {
  const p = await read($, project)
  if (!p || (await read($, docker)).busy) return

  await update($, docker, d => ({ ...d, busy: action === 'up' ? 'Starting…' : 'Stopping…', error: undefined }))
  const ran = await $.process
    .run(composeArgv(p.runtime, action), { cwd: p.path, timeoutMs: 300000 })
    .catch((error: unknown) => ({ exitCode: 1, stdout: '', stderr: String(error) }))
  await update($, docker, d => ({
    ...d,
    busy: undefined,
    error: ran.exitCode === 0 ? undefined : ran.stderr.trim().split('\n').pop() || `${action} failed`,
  }))
  await loadContainers($)
}

const openDocker = async ($: EngineInterface) => {
  const p = await read($, project)
  await loadContainers($)
  dockerTimer ??= $.clock.every(5000, () => void loadContainers($))

  return $.ui.open({ id: DOCKER_PANE, title: `Docker · ${p?.name ?? 'no project'}` })
}

// --- tools -------------------------------------------------------------------

const registerTools = ($: EngineInterface) =>
  Promise.all([
    ...(cfg.tasks
      ? [
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
        ]
      : []),
    ...(cfg.time
      ? [
          $.tool.register({
            name: 'time_report',
            description:
              'Active time work-helper tracked per project on a day (gaps over 15 minutes count as away), with the tasks finished that day. Use it to write an hours / timesheet entry.',
            inputSchema: {
              type: 'object',
              properties: { date: { type: 'string', description: 'YYYY-MM-DD, default today' } },
            },
          }),
        ]
      : []),
  ])

export const register: Register = (on, options) => {
  cfg = settings(options)

  // --- lifecycle ---------------------------------------------------------------

  on('session.start', async ($, e, next) => {
    const started = await next(e)
    await refresh($, started.cwd)
    await registerTools($)

    if (cfg.docker) {
      await $.command.register({ name: 'docker', description: "Show the current project's containers with start / stop buttons" })
    }
    if (cfg.time) {
      await $.command.register({ name: 'time', description: 'Show the active time work-helper tracked today, per project' })
    }

    const usage = await $.session.usage().catch(() => undefined)
    if (usage) {
      await update($, limits, () => usage.rateLimits)
      await update($, context, () => usage.context)
      await update($, cost, () => (usage.cost ? { usd: usage.cost.usd, startedAt: usage.startedAt } : null))
    }

    return started
  })

  on('classic.CwdChanged', async ($, e, next) => {
    const result = await next(e)
    await refresh($, e.new_cwd)

    return result
  }).catch(($, e, next) => next(e))

  on('prompt.submit', async ($, e, next) => {
    turnStartedAt = await $.clock.now()
    await touch($)

    return next(e)
  }).catch(($, e, next) => next(e))

  on('tool.call', async ($, e, next) => {
    await touch($)

    return next(e)
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)

    // Not awaited: the row fills in a moment later instead of holding up the turn's end.
    if (cfg.lastTurn && e.reason === 'answer' && e.agentId === undefined && e.answer.trim()) {
      void summarise($, e.answer).catch(() => undefined)
    }

    // The branch can change during a turn (git checkout in Bash).
    await refresh($, await $.session.cwd())
    await touch($)

    const elapsed = turnStartedAt === undefined ? 0 : (await $.clock.now()) - turnStartedAt
    turnStartedAt = undefined

    if (cfg.donePing && elapsed >= cfg.doneAfterMs) {
      const p = await read($, project)
      await $.ui
        .notify(`Done after ${duration(elapsed)}${p ? ` · ${p.name}` : ''}`, { title: 'Claude Code' })
        .catch(() => undefined)
    }

    return result
  })

  on('session.measure', async ($, e, next) => {
    if (e.changed.includes('rateLimits')) {
      await update($, limits, () => e.rateLimits)
    }

    if (e.changed.includes('context')) {
      await update($, context, () => e.context)
    }

    if (e.cost && e.changed.includes('cost')) {
      const usd = e.cost.usd
      const startedAt = (await read($, cost))?.startedAt ?? (await $.session.usage()).startedAt
      await update($, cost, () => ({ usd, startedAt }))
    }

    await checkAlerts($)

    return next(e)
  })

  // --- commands ----------------------------------------------------------------

  on('command.run', { command: 'docker' }, async $ => {
    const opened = await openDocker($)

    return { text: opened.isPlaced ? 'Docker pane opened.' : 'Docker pane is waiting for a wider terminal.' }
  })

  on('command.run', { command: 'time' }, async $ => {
    const date = dayKey(await $.clock.now())

    return { text: dayReport(date, await dayOf($, date)) }
  })

  on('ui.close', { id: DOCKER_PANE }, async ($, e, next) => {
    dockerTimer?.cancel()
    dockerTimer = undefined

    return next(e)
  }).catch(($, e, next) => next(e))

  // --- task tools --------------------------------------------------------------

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
      await logFinished($, finished.title)
    }

    return { result: describeQueue(after) }
  }).catch(() => ({ deny: 'work-helper: task_step_done failed.' }))

  on('tool.call', { tool: /^mcp__work-helper__task_finish$/ }, async $ => {
    const { queue: after, finished } = finishActive(await read($, queue))
    await save($, after)

    if (finished) {
      await logFinished($, finished.title)
    }

    return { result: describeQueue(after) }
  }).catch(() => ({ deny: 'work-helper: task_finish failed.' }))

  on('tool.call', { tool: /^mcp__work-helper__task_list$/ }, async $ => ({
    result: describeQueue(await read($, queue)),
  })).catch(() => ({ deny: 'work-helper: task_list failed.' }))

  on('tool.call', { tool: /^mcp__work-helper__time_report$/ }, async ($, e) => {
    const { date } = e as unknown as { date?: string }
    const day = date ?? dayKey(await $.clock.now())

    return { result: dayReport(day, await dayOf($, day)) }
  }).catch(() => ({ deny: 'work-helper: time_report failed.' }))

  // Keeps the model aware of the active task so it ticks steps as it works.
  on('prompt.compose', async ($, e, next) => {
    const composed = await next(e)
    const current = await read($, queue)

    if (!cfg.tasks || current.tasks.length === 0) {
      return composed
    }

    const text = `# work-helper task queue\n${describeQueue(current)}\n\nWhen you finish a step of the active task, call mcp__work-helper__task_step_done with its number. Do not start queued tasks unless the user asks.`

    return { sections: [...composed.sections, { id: 'work-helper:tasks', text, scope: 'session' as const }] }
  })

  // --- drawing -----------------------------------------------------------------

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const now = await $.clock.now()
    const rows = cfg.limits ? usageRows(await read($, limits), now) : []
    const ctx = cfg.context ? contextRow(await read($, context)) : undefined
    const spent = cfg.cost ? await read($, cost) : null
    const money = spent && costLine(spent.usd, spent.startedAt, now)
    const today = cfg.time ? await read($, todayMs) : 0
    const name = (await read($, project))?.name
    const [active, upNext, ...later] = cfg.tasks ? (await read($, queue)).tasks : []
    const last = cfg.lastTurn ? await read($, lastTurn) : null

    if (e.props.hasSurvey || (rows.length === 0 && !active && !last && !ctx && !money && today === 0)) {
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
        {last && (
          <Box key="last">
            <Text color="success">{'✓ Last: '}</Text>
            <Text wrap="truncate">{last}</Text>
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
        {ctx && (
          <Box key="context">
            <Text dimColor>{'ctx'.padEnd(5)}</Text>
            <Text color={ctx.tone}>{ctx.filled}</Text>
            <Text color="subtle">{ctx.empty}</Text>
            <Text bold color={ctx.tone}>{` ${String(ctx.percent).padStart(3)}% used`}</Text>
            {ctx.detail && <Text dimColor>{` · ${ctx.detail} tokens`}</Text>}
          </Box>
        )}
        {(money || today > 0) && (
          <Box key="cost">
            {money && <Text dimColor>{'tokens ≈ '}</Text>}
            {money && <Text bold color="warning">{money.total}</Text>}
            {money && <Text dimColor>{` at API prices · session ${money.elapsed}`}</Text>}
            {money?.perHour && <Text dimColor>{` · ${money.perHour}`}</Text>}
            {today > 0 && <Text dimColor>{`${money ? ' · ' : ''}today on ${name}: `}</Text>}
            {today > 0 && <Text bold>{duration(today)}</Text>}
          </Box>
        )}
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: DOCKER_PANE }, async ($, e) => {
    const { Box, Button, Text } = $.ui.resolve(e)
    const p = await read($, project)
    const d = await read($, docker)
    const running = d.list.filter(c => c.state === 'running').length

    return (
      <Box flexDirection="column">
        <Box key="head">
          <Text bold>{p?.name ?? 'no project'}</Text>
          <Text dimColor>{` · ${p?.runtime ?? '?'} · ${running}/${d.list.length} running`}</Text>
        </Box>
        {p?.url && <Text dimColor>{p.url}</Text>}
        <Text> </Text>
        {d.list.length === 0 && <Text dimColor>No containers for this project.</Text>}
        {d.list.map(c => (
          <Box key={c.name}>
            <Text color={c.state === 'running' ? 'success' : 'inactive'}>{c.state === 'running' ? '● ' : '○ '}</Text>
            <Text wrap="truncate">{c.name}</Text>
            <Text dimColor wrap="truncate">{` ${c.status}${c.ports ? ` · ${shortPorts(c.ports)}` : ''}`}</Text>
          </Box>
        ))}
        <Text> </Text>
        {d.busy && <Text color="warning">{d.busy}</Text>}
        {d.error && <Text color="error" wrap="truncate">{d.error}</Text>}
        <Box key="actions">
          <Button key="up" label="Start" hotkey="s" variant="primary" onPress={() => void compose($, 'up')} />
          <Text> </Text>
          <Button key="stop" label="Stop" hotkey="x" onPress={() => void compose($, 'stop')} />
          <Text> </Text>
          <Button key="refresh" label="Refresh" hotkey="r" onPress={() => void loadContainers($)} />
        </Box>
      </Box>
    )
  })
}
