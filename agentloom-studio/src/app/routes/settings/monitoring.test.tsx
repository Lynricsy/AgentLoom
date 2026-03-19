import { describe, expect, it } from 'vitest'
import { monitoringRoute } from './monitoring'

describe('monitoringRoute', () => {
  it('mounts the monitoring page on /settings/monitoring', () => {
    expect(monitoringRoute.options).toMatchObject({
      path: '/settings/monitoring',
    })
  })
})
