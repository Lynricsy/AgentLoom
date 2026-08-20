import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  useIsDropdownOpen,
  useNotificationActions,
  useNotificationStore,
} from './notificationStore'

describe('notificationStore', () => {
  beforeEach(() => {
    useNotificationStore.getState().actions.reset()
  })

  it('stores dropdown visibility as UI state', () => {
    const { result: openResult } = renderHook(() => useIsDropdownOpen())
    const { result: actionsResult } = renderHook(() => useNotificationActions())

    act(() => {
      actionsResult.current.setDropdownOpen(true)
    })

    expect(openResult.current).toBe(true)
  })

  it('does not duplicate server-owned notification entities or unread count', () => {
    const state = useNotificationStore.getState()

    expect('notifications' in state).toBe(false)
    expect('unreadCount' in state).toBe(false)
  })

  it('can close an open dropdown', () => {
    const { actions } = useNotificationStore.getState()
    actions.setDropdownOpen(true)
    actions.setDropdownOpen(false)

    expect(useNotificationStore.getState().isDropdownOpen).toBe(false)
  })

  it('exposes only UI actions', () => {
    const actions = useNotificationStore.getState().actions

    expect(Object.keys(actions).sort()).toEqual(['reset', 'setDropdownOpen'])
  })

  it('does not change server-owned state when dropdown visibility changes', () => {
    useNotificationStore.getState().actions.setDropdownOpen(true)
    const state = useNotificationStore.getState()

    expect('notifications' in state).toBe(false)
    expect('unreadCount' in state).toBe(false)
  })

  it('reset restores the UI state', () => {
    const { actions } = useNotificationStore.getState()
    actions.setDropdownOpen(true)
    actions.reset()

    expect(useNotificationStore.getState().isDropdownOpen).toBe(false)
  })
})
