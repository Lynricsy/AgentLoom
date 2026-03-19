import { describe, expect, it } from 'vitest'
import { resourceGovernanceRoute } from './resource-quotas'

describe('resourceGovernanceRoute', () => {
  it('mounts the resource governance page on /settings/resource-quotas', () => {
    expect(resourceGovernanceRoute.options).toMatchObject({
      path: '/settings/resource-quotas',
    })
  })
})
