import { useShallow } from 'zustand/react/shallow'

import { useAuthStore } from '../stores/auth.store'

export function useAuth() {
  return useAuthStore(
    useShallow((state) => ({
      session: state.session,
      user: state.user,
      accessToken: state.accessToken,
      isLoading: state.isLoading,
      isAuthenticated: state.isAuthenticated,
      signOut: state.signOut,
    })),
  )
}
