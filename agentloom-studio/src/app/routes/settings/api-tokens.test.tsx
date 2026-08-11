import { describe, expect, it } from 'vitest'

import { ApiTokenPage } from '@/features/platform-api-token'

import { apiTokensRoute } from './api-tokens'

describe('apiTokensRoute', () => {
  it('把 API Token 页挂载在 /settings/api-tokens', () => {
    expect(apiTokensRoute.options).toMatchObject({
      path: '/settings/api-tokens',
      component: ApiTokenPage,
    })
  })
})
