import { describe, expect, test } from 'claude-code/testing'

import { findProject, parseRegistry, statusText } from './project'

const REGISTRY = `# Project registry

| Name | Path | Framework | Runtime | Slot | Ports | URL | Updated |
|---|---|---|---|---|---|---|---|
| threads | /home/dev/projects/threads | Laravel 12 | sail | 95 | APP_PORT=8095 | https://threads | 2026-10-01 |
| instagram | /home/dev/projects/instagram | Symfony 8 | docker | x92 | db=3392 | https://instagram | 2026-10-07 |
`

describe('work-helper project lookup', () => {
  const projects = parseRegistry(REGISTRY)

  test('parses only project rows', async () => {
    expect(projects.map(p => p.name)).toEqual(['threads', 'instagram'])
  })

  test('finds the project for a nested directory', async () => {
    expect(findProject(projects, '/home/dev/projects/instagram/src/Controller')?.name).toBe('instagram')
  })

  test('does not match a sibling with the same prefix', async () => {
    expect(findProject(projects, '/home/dev/projects/instagram-old')).toBeUndefined()
  })

  test('formats the status line', async () => {
    const instagram = findProject(projects, '/home/dev/projects/instagram')
    expect(statusText('/x', instagram, { root: '/x', branch: 'main' })).toBe('📁 instagram · Symfony 8 · docker · ⎇ main')
    expect(statusText('/home/dev', undefined, undefined)).toBe('📁 no project · /home/dev')
  })
})
