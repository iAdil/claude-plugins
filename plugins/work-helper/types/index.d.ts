export type Limit = { kind: string; percentUsed: number; resetsAt?: string }

export type Step = { text: string; done: boolean }

export type Task = { id: string; title: string; steps: Step[] }

// tasks[0] is the active task, the rest wait in order.
export type Queue = { project: string; tasks: Task[] }

declare module 'claude-code' {
  interface PluginState {
    'work-helper': { limits: Limit[]; queue: Queue }
  }
}
