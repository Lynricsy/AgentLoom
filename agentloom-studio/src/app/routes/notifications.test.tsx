import { describe, expect, it } from 'vitest'

import { NotificationCenterPage } from '@/features/notification'

import { notificationCenterRoute } from './notifications'

describe('notificationCenterRoute', () => {
  it('把通知中心页挂载在 /notifications', () => {
    expect(notificationCenterRoute.options).toMatchObject({
      path: '/notifications',
      component: NotificationCenterPage,
    })
  })
})
