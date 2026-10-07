import { useMutation, useQueryClient } from '@tanstack/react-query'
import { runtimePluginKeys } from './runtimePluginKeys'
import {
  deleteRuntimePlugin,
  registerRuntimePlugin,
  updateRuntimePluginStatus,
  type RegisterRuntimePluginPayload,
} from './runtimePluginApi'
import type { RuntimePluginStatus } from '../types'

/** 注册 .alp runtime 插件包；成功后整棵缓存失效，画布的 useActiveRuntimePlugins 随之刷新 */
export function useRegisterRuntimePlugin() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: [...runtimePluginKeys.all, 'register'],
    mutationFn: (payload: RegisterRuntimePluginPayload) => registerRuntimePlugin(payload),
    gcTime: 0,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: runtimePluginKeys.all })
    },
  })
}

export function useUpdateRuntimePluginStatus() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: [...runtimePluginKeys.all, 'update-status'],
    mutationFn: ({
      id,
      status,
      occVersion,
    }: {
      id: string
      status: RuntimePluginStatus
      occVersion: number
    }) => updateRuntimePluginStatus(id, { status, occVersion }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: runtimePluginKeys.all })
    },
  })
}

export function useDeleteRuntimePlugin() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: [...runtimePluginKeys.all, 'delete'],
    mutationFn: (id: string) => deleteRuntimePlugin(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: runtimePluginKeys.all })
    },
  })
}
