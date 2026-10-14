export type Limit = { kind: string; percentUsed: number; resetsAt?: string }

// usd summed over the session's priced API responses; startedAt in $.clock.now() ms.
export type Cost = { usd: number; startedAt: number }

export type Ctx = { tokens?: number; window: number; percent?: number }

export type Step = { text: string; done: boolean }

export type Task = { id: string; title: string; steps: Step[] }

// tasks[0] is the active task, the rest wait in order.
export type Queue = { project: string; tasks: Task[] }

export type ProjectInfo = { name: string; path: string; runtime: string; url: string }

export type Container = { name: string; state: string; status: string; ports: string }

export type Docker = { list: Container[]; busy?: string; error?: string }

declare module 'claude-code' {
  interface PluginState {
    'work-helper': {
      limits: Limit[]
      queue: Queue
      cost: Cost | null
      context: Ctx | null
      project: ProjectInfo | null
      docker: Docker
      alerted: string[]
      todayMs: number
      lastTurn: string | null
    }
  }
}
