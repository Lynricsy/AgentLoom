import { describe, expect, it } from 'vitest'
import { monitoringKeys } from './monitoringKeys'

describe('monitoringKeys', () => {
  it('includes the selected monitoring window in the dashboard query key', () => {
    expect(monitoringKeys.dashboard('org-1', '24h')).toEqual([
      'monitoring',
      'dashboard',
      'org-1',
      '24h',
    ])
  })
})
