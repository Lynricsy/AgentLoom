import { describe, expect, it } from 'vitest'

import { NotificationPreferencesPage } from '@/features/notification'

import { notificationPreferencesRoute } from './notifications'

describe('notificationPreferencesRoute', () => {
  it('把通知偏好页挂载在 /settings/notifications', () => {
    expect(notificationPreferencesRoute.options).toMatchObject({
      path: '/settings/notifications',
      component: NotificationPreferencesPage,
    })
  })
})
