import type { DefaultTheme } from 'vitepress'

// 贡献者侧边栏：新增/移动 dev/ 页面时同步本文件
const dev: DefaultTheme.SidebarItem[] = [
  {
    text: '入门',
    items: [
      { text: '贡献者入口', link: '/dev/' },
      { text: '本地开发环境', link: '/dev/setup' },
      { text: '系统架构', link: '/dev/architecture' },
      { text: '核心概念', link: '/dev/concepts' },
    ],
  },
  {
    text: '服务端',
    collapsed: true,
    items: [
      { text: '模块总览', link: '/dev/server/' },
      { text: '模块清单', link: '/dev/server/modules' },
      { text: '请求管线', link: '/dev/server/request-pipeline' },
      { text: '安全', link: '/dev/server/security' },
      { text: '数据库', link: '/dev/server/database' },
      { text: '队列', link: '/dev/server/queues' },
      { text: '实时通信', link: '/dev/server/realtime' },
      { text: 'ACP', link: '/dev/server/acp' },
    ],
  },
  {
    text: '前端',
    collapsed: true,
    items: [
      { text: 'Studio 总览', link: '/dev/studio/' },
      { text: 'Feature 清单', link: '/dev/studio/features' },
      { text: '画布', link: '/dev/studio/canvas' },
      { text: '状态管理', link: '/dev/studio/state' },
    ],
  },
  {
    text: '类型引擎',
    collapsed: true,
    items: [
      { text: '概览', link: '/dev/type-engine/' },
      { text: '架构', link: '/dev/type-engine/architecture' },
      { text: 'API', link: '/dev/type-engine/api' },
      { text: '构建', link: '/dev/type-engine/build' },
      { text: 'WASM 集成', link: '/dev/type-engine/wasm' },
    ],
  },
  {
    text: '移动端',
    collapsed: true,
    items: [
      { text: '概览', link: '/dev/mobile/' },
      { text: '架构', link: '/dev/mobile/architecture' },
      { text: '开发环境', link: '/dev/mobile/getting-started' },
    ],
  },
  {
    text: '决策记录',
    collapsed: true,
    items: [{ text: '0001 Agent 对外 API', link: '/dev/decisions/0001-agent-external-api' }],
  },
]

export default dev
