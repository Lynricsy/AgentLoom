import { useEffect } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { RouterProvider } from '@tanstack/react-router'
import { queryClient } from '@/shared/api/queryClient'
import { ToastProvider } from '@/shared/ui/toast'
import { useAuthStore } from '@/features/auth/stores/auth.store'
import { router } from './router'

export function AppProviders() {
  useEffect(() => {
    useAuthStore.getState().initialize()
  }, [])

  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <RouterProvider router={router} />
        <ReactQueryDevtools initialIsOpen={false} buttonPosition="bottom-left" />
      </ToastProvider>
    </QueryClientProvider>
  )
}
