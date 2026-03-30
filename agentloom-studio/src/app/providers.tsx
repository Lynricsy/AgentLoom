import { useEffect } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { RouterProvider } from '@tanstack/react-router'
import { queryClient } from '@/shared/api/queryClient'
import { ThemeProvider } from '@/shared/providers/theme-provider'
import { ToastProvider } from '@/shared/ui/toast'
import { useAuthStore } from '@/features/auth/stores/auth.store'
import { registerAllToolRenderers } from '@/shared/components/tool-renderers'
import { router } from './router'

// 注册所有工具渲染器（仅执行一次）
registerAllToolRenderers()

export function AppProviders() {
  useEffect(() => {
    useAuthStore.getState().initialize()
  }, [])

  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <RouterProvider router={router} />
          <ReactQueryDevtools initialIsOpen={false} buttonPosition="bottom-left" />
        </ToastProvider>
      </QueryClientProvider>
    </ThemeProvider>
  )
}
