import { describe, expect, test } from 'claude-code/testing'

import { composeArgv, parseContainers, shortPorts } from './docker'

describe('work-helper docker', () => {
  test('parses docker ps lines', async () => {
    const list = parseContainers('web-1\trunning\tUp 2 hours\t0.0.0.0:8492->443/tcp\ndb-1\texited\tExited (0)\t\n')
    expect(list.map(c => c.name)).toEqual(['db-1', 'web-1'])
    expect(list[1]).toEqual({ name: 'web-1', state: 'running', status: 'Up 2 hours', ports: '0.0.0.0:8492->443/tcp' })
  })

  test('shortens published ports', async () => {
    expect(shortPorts('0.0.0.0:8492->443/tcp, [::]:8492->443/tcp, 9000/tcp')).toBe('8492→443')
  })

  test('uses sail for sail projects', async () => {
    expect(composeArgv('sail', 'up')).toEqual(['./vendor/bin/sail', 'up', '-d'])
    expect(composeArgv('docker', 'stop')).toEqual(['docker', 'compose', 'stop'])
  })
})
