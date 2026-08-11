import { useMutation, useQueryClient } from '@tanstack/react-query'
import { pluginKeys } from './pluginKeys'
import {
  deletePlugin,
  registerPlugin,
  updatePluginStatus,
  type RegisterPluginPayload,
} from './pluginApi'
import type { PluginStatus } from '../types'

/** 注册 .alp 插件包；成功后整棵插件缓存失效，画布的 useActivePlugins 也随之刷新 */
export function useRegisterPlugin() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: [...pluginKeys.all, 'register'],
    mutationFn: (payload: RegisterPluginPayload) => registerPlugin(payload),
    gcTime: 0,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: pluginKeys.all })
    },
  })
}

export function useUpdatePluginStatus() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: [...pluginKeys.all, 'update-status'],
    mutationFn: ({
      id,
      status,
      occVersion,
    }: {
      id: string
      status: PluginStatus
      occVersion: number
    }) => updatePluginStatus(id, { status, occVersion }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: pluginKeys.all })
    },
  })
}

export function useDeletePlugin() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationKey: [...pluginKeys.all, 'delete'],
    mutationFn: (id: string) => deletePlugin(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: pluginKeys.all })
    },
  })
}
