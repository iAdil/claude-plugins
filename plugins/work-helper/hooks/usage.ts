import type { Limit } from '../types'

export type Row = {
  label: string
  used: number
  left: number
  filled: string
  empty: string
  tone: 'success' | 'warning' | 'error'
  resets: string | undefined
}

const LABELS: Record<string, string> = { five_hour: '5h', seven_day: 'week' }
const ORDER = ['five_hour', 'seven_day']
const BAR = 20

export const timeLeft = (ms: number): string => {
  const minutes = Math.max(0, Math.round(ms / 60000))
  const days = Math.floor(minutes / 1440)
  const hours = Math.floor((minutes % 1440) / 60)
  const mins = minutes % 60

  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${mins}m`
  return `${mins}m`
}

export const usageRows = (limits: Limit[], now: number): Row[] =>
  limits
    .filter(l => ORDER.includes(l.kind))
    .sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind))
    .map(l => {
      const used = Math.min(100, Math.max(0, l.percentUsed))
      const cells = Math.round((used / 100) * BAR)
      const resetAt = l.resetsAt === undefined ? NaN : Date.parse(l.resetsAt)

      return {
        label: LABELS[l.kind] ?? l.kind,
        used: Math.round(used),
        left: Math.round(100 - used),
        filled: '█'.repeat(cells),
        empty: '░'.repeat(BAR - cells),
        tone: used < 60 ? 'success' : used < 85 ? 'warning' : 'error',
        resets: Number.isNaN(resetAt) ? undefined : timeLeft(resetAt - now),
      }
    })
