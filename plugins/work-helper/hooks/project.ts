export type Project = { name: string; path: string; framework: string; runtime: string }

// Rows of the registry's markdown table: `| Name | Path | Framework | Runtime | ...`
export const parseRegistry = (text: string): Project[] =>
  text
    .split('\n')
    .filter(line => line.startsWith('| '))
    .map(line => line.split('|').map(cell => cell.trim()))
    .filter(([, name, path]) => name !== 'Name' && path?.startsWith('/'))
    .map(([, name = '', path = '', framework = '', runtime = '']) => ({ name, path, framework, runtime }))

// The registered project holding `cwd`; the deepest path wins when several do.
export const findProject = (projects: Project[], cwd: string): Project | undefined =>
  projects
    .filter(p => cwd === p.path || cwd.startsWith(`${p.path}/`))
    .sort((a, b) => b.path.length - a.path.length)[0]

export const statusText = (
  cwd: string,
  project: Project | undefined,
  git: { root: string; branch: string } | undefined,
): string => {
  const branch = git ? ` · ⎇ ${git.branch}` : ''

  if (project) {
    return `📁 ${project.name} · ${project.framework} · ${project.runtime}${branch}`
  }

  if (git) {
    return `📁 ${git.root.split('/').pop()} (not in registry)${branch}`
  }

  return `📁 no project · ${cwd}`
}
