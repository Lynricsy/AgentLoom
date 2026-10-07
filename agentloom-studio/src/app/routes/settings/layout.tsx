import { createRoute } from '@tanstack/react-router'
import { SettingsLayout } from '@/shared/components/settings-layout'
import { rootRoute } from '../__root'

/**
 * 设置区的 pathless 父路由：只提供二级子导航壳层，不吃掉路径段。
 * 子路由继续使用绝对 path（`/settings/...`），因此既有 path 断言不变。
 */
export const settingsLayoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'settings-layout',
  component: SettingsLayout,
})
