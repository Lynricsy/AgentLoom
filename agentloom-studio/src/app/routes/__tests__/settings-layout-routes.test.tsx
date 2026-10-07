import { describe, expect, it } from 'vitest'
import { createRouter, createMemoryHistory } from '@tanstack/react-router'
import { routeTree } from '../routeTree'

const PATHS = [
  '/settings',
  '/settings/preferences',
  '/settings/api-tokens',
  '/settings/notifications',
  '/settings/organization',
  '/settings/security',
  '/settings/encryption',
  '/settings/security/autonomy-policy',
  '/settings/monitoring',
  '/settings/resource-quotas',
  '/settings/private-deployment',
  '/settings/audit-logs',
]

function matchAt(path: string) {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
  })
  return router.matchRoutes(router.latestLocation).map((m) => ({
    id: m.routeId,
    fullPath: m.fullPath,
  }))
}

describe('设置区路由必须挂在 settings-layout 之下', () => {
  it.each(PATHS)('%s 经过 settings-layout 并命中对应叶子', (path) => {
    const matches = matchAt(path)
    expect(matches.map((m) => m.id)).toContain('/settings-layout')
    expect(matches.at(-1)?.fullPath?.replace(/\/$/, '')).toBe(path)
  })

  it('非 settings 路径不经过 settings-layout', () => {
    expect(matchAt('/workflows').map((m) => m.id)).not.toContain(
      '/settings-layout',
    )
  })
})
