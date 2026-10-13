import { describe, expect, test } from 'claude-code/testing'

import { findProject, parseRegistry, statusText } from './project'

const REGISTRY = `# Project registry

| Name | Path | Framework | Runtime | Slot | Ports | URL | Updated |
|---|---|---|---|---|---|---|---|
| adro | /home/adil/projects/personal/laravel/adro | Laravel 12 | sail | 95 | APP_PORT=8095 | https://adro | 2026-10-01 |
| hisense | /home/adil/projects/l6/hisense | Symfony 8 | docker | x92 | db=3392 | https://hisense | 2026-10-07 |
`

describe('work-helper project lookup', () => {
  const projects = parseRegistry(REGISTRY)

  test('parses only project rows', async () => {
    expect(projects.map(p => p.name)).toEqual(['adro', 'hisense'])
  })

  test('finds the project for a nested directory', async () => {
    expect(findProject(projects, '/home/adil/projects/l6/hisense/src/Controller')?.name).toBe('hisense')
  })

  test('does not match a sibling with the same prefix', async () => {
    expect(findProject(projects, '/home/adil/projects/l6/hisense-old')).toBeUndefined()
  })

  test('formats the status line', async () => {
    const hisense = findProject(projects, '/home/adil/projects/l6/hisense')
    expect(statusText('/x', hisense, { root: '/x', branch: 'main' })).toBe('📁 hisense · Symfony 8 · docker · ⎇ main')
    expect(statusText('/home/adil', undefined, undefined)).toBe('📁 no project · /home/adil')
  })
})
