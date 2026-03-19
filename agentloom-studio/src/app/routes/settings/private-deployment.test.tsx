import { describe, expect, it } from 'vitest'
import { privateDeploymentRoute } from './private-deployment'

describe('privateDeploymentRoute', () => {
  it('mounts the private deployment page on /settings/private-deployment', () => {
    expect(privateDeploymentRoute.options).toMatchObject({
      path: '/settings/private-deployment',
    })
  })
})
