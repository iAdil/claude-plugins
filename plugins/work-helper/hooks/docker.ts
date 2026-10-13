import type { Container } from '../types'

export const FORMAT = '{{.Names}}\t{{.State}}\t{{.Status}}\t{{.Ports}}'

export const parseContainers = (stdout: string): Container[] =>
  stdout
    .split('\n')
    .filter(line => line.trim() !== '')
    .map(line => {
      const [name = '', state = '', status = '', ports = ''] = line.split('\t')

      return { name, state, status, ports }
    })
    .sort((a, b) => a.name.localeCompare(b.name))

// Sail projects go through sail so its env (WWWUSER, ports) applies.
export const composeArgv = (runtime: string, action: 'up' | 'stop'): string[] => {
  const base = runtime === 'sail' ? ['./vendor/bin/sail'] : ['docker', 'compose']

  return action === 'up' ? [...base, 'up', '-d'] : [...base, 'stop']
}

// Host side of each published port, deduplicated: "0.0.0.0:8492->443/tcp, [::]:8492->443/tcp" -> "8492→443".
export const shortPorts = (ports: string): string =>
  [...new Set(ports.split(', ').map(p => p.match(/:(\d+)->(\d+)/)).filter(m => m !== null).map(m => `${m[1]}→${m[2]}`))].join(' ')
