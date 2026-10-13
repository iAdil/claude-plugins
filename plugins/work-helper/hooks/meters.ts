import type { Ctx, Limit } from '../types'

const BAR = 20

export type Tone = 'success' | 'warning' | 'error'

export const tone = (used: number): Tone => (used < 60 ? 'success' : used < 85 ? 'warning' : 'error')

const thousands = (n: number) => (n >= 1000 ? `${Math.round(n / 1000)}k` : String(n))

export const contextRow = (ctx: Ctx | null) => {
  if (ctx?.percent === undefined) {
    return undefined
  }

  const used = Math.min(100, Math.max(0, ctx.percent))
  const cells = Math.round((used / 100) * BAR)

  return {
    percent: Math.round(used),
    filled: '█'.repeat(cells),
    empty: '░'.repeat(BAR - cells),
    tone: tone(used),
    detail: ctx.tokens === undefined ? undefined : `${thousands(ctx.tokens)} / ${thousands(ctx.window)}`,
  }
}

export type Alert = { key: string; text: string }

export type AlertConfig = { costStepUsd: number; limitPercent: number; contextPercent: number }

const LABELS: Record<string, string> = { five_hour: '5-hour', seven_day: 'Weekly' }

// Each alert fires once: its key joins `fired`. The context alert re-arms once the window
// drops well below the threshold again (after a /compact).
export const dueAlerts = (
  now: { limits: Limit[]; usd?: number; context: Ctx | null },
  cfg: AlertConfig,
  fired: readonly string[],
): { alerts: Alert[]; fired: string[] } => {
  const candidates: Alert[] = []

  for (const l of now.limits) {
    for (const at of [cfg.limitPercent, 95]) {
      if (l.percentUsed >= at && LABELS[l.kind]) {
        candidates.push({
          key: `limit:${l.kind}:${l.resetsAt ?? ''}:${at}`,
          text: `⚠ ${LABELS[l.kind]} limit ${Math.round(l.percentUsed)}% used`,
        })
      }
    }
  }

  if (now.usd !== undefined && cfg.costStepUsd > 0) {
    const steps = Math.floor(now.usd / cfg.costStepUsd)
    if (steps >= 1) {
      candidates.push({ key: `cost:${steps}`, text: `💸 Session tokens passed $${steps * cfg.costStepUsd} at API prices` })
    }
  }

  const ctx = now.context?.percent
  const kept = ctx !== undefined && ctx < cfg.contextPercent - 20 ? fired.filter(k => k !== 'context') : [...fired]

  if (ctx !== undefined && ctx >= cfg.contextPercent) {
    candidates.push({ key: 'context', text: `🧠 Context ${Math.round(ctx)}% full, consider /compact` })
  }

  const alerts = candidates.filter(a => !kept.includes(a.key))

  return { alerts, fired: [...kept, ...alerts.map(a => a.key)] }
}
