import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'

export interface NotificationStoreState {
  isDropdownOpen: boolean
}

export interface NotificationStoreActions {
  actions: {
    setDropdownOpen: (open: boolean) => void
    reset: () => void
  }
}

function createInitialState(): NotificationStoreState {
  return {
    isDropdownOpen: false,
  }
}

export const useNotificationStore = create<
  NotificationStoreState & NotificationStoreActions
>()(
  devtools(
    immer((set) => ({
        ...createInitialState(),
        actions: {
          setDropdownOpen: (open) => {
            set((state) => {
              state.isDropdownOpen = open
            })
          },

          reset: () => {
            set((state) => {
              Object.assign(state, createInitialState())
            })
          },
        },
      })),
    { name: 'NotificationStore' },
  ),
)


export const useIsDropdownOpen = () =>
  useNotificationStore((state) => state.isDropdownOpen)

export const useNotificationActions = () =>
  useNotificationStore((state) => state.actions)
