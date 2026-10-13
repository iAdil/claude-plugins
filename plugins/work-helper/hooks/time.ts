// Active time: gaps between activity (a prompt, a tool call, a finished turn) up to IDLE
// count; a longer gap means you were away.
export const IDLE = 15 * 60000

export type Day = Record<string, { ms: number; tasks: string[] }>

export const dayKey = (now: number): string => {
  try {
    return new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
  } catch {
    return new Date(now).toISOString().slice(0, 10)
  }
}

export const addActive = (day: Day, project: string, ms: number): Day => {
  const was = day[project] ?? { ms: 0, tasks: [] }

  return { ...day, [project]: { ...was, ms: was.ms + ms } }
}

export const addFinished = (day: Day, project: string, title: string): Day => {
  const was = day[project] ?? { ms: 0, tasks: [] }

  return { ...day, [project]: { ...was, tasks: [...was.tasks, title] } }
}

export const duration = (ms: number): string => {
  const minutes = Math.round(ms / 60000)
  const hours = Math.floor(minutes / 60)

  return hours > 0 ? `${hours}h ${minutes % 60}m` : `${minutes}m`
}

export const dayReport = (date: string, day: Day): string => {
  const rows = Object.entries(day).sort((a, b) => b[1].ms - a[1].ms)

  if (rows.length === 0) {
    return `No tracked time on ${date}.`
  }

  const total = rows.reduce((sum, [, v]) => sum + v.ms, 0)
  const lines = rows.map(
    ([project, v]) =>
      `- ${project}: ${duration(v.ms)}${v.tasks.length > 0 ? ` (finished: ${v.tasks.join('; ')})` : ''}`,
  )

  return [`Tracked time on ${date}: ${duration(total)}`, ...lines].join('\n')
}
