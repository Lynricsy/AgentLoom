import type { DefaultTheme } from 'vitepress'

// 贡献者侧边栏：新增/移动 dev/ 页面时同步本文件
const dev: DefaultTheme.SidebarItem[] = [
  {
    text: '入门',
    items: [
      { text: '贡献者入口', link: '/dev/' },
      { text: '搭建本地开发环境', link: '/dev/setup' },
      { text: '系统架构', link: '/dev/architecture' },
      { text: '核心概念', link: '/dev/concepts' },
    ],
  },
  {
    text: '服务端',
    collapsed: true,
    items: [
      { text: '模块与分域', link: '/dev/server/' },
      { text: '请求管线', link: '/dev/server/request-pipeline' },
      { text: '安全', link: '/dev/server/security' },
      { text: '数据库', link: '/dev/server/database' },
      { text: '队列', link: '/dev/server/queues' },
      { text: '实时通信', link: '/dev/server/realtime' },
      { text: 'Agent 运行态', link: '/dev/server/agent-runtime' },
      { text: 'ACP', link: '/dev/server/acp' },
      { text: '插件执行', link: '/dev/server/plugins' },
      { text: 'Runtime 插件', link: '/dev/server/runtime-plugins' },
      { text: '生成应用', link: '/dev/server/generated-apps' },
    ],
  },
  {
    text: '前端',
    collapsed: true,
    items: [
      { text: 'Studio 结构', link: '/dev/studio/' },
      { text: '画布', link: '/dev/studio/canvas' },
      { text: '状态管理', link: '/dev/studio/state' },
    ],
  },
  {
    text: '共享与引擎',
    collapsed: true,
    items: [
      { text: '契约与再生成', link: '/dev/contracts' },
      { text: '类型引擎', link: '/dev/type-engine' },
    ],
  },
  {
    text: '移动端',
    collapsed: true,
    items: [{ text: 'Flutter 应用', link: '/dev/mobile' }],
  },
  {
    text: '沙箱运行时',
    collapsed: true,
    items: [{ text: 'Firecracker 运行时', link: '/dev/firecracker-runtime' }],
  },
  {
    text: '工程实践',
    collapsed: true,
    items: [
      { text: '运行与编写测试', link: '/dev/testing' },
      { text: '新增服务端模块', link: '/dev/howto/add-server-module' },
      { text: '新增节点类型', link: '/dev/howto/add-node-type' },
      { text: '新增环境变量', link: '/dev/howto/add-env-var' },
      { text: '新增 Socket 事件', link: '/dev/howto/add-socket-event' },
      { text: '文档维护指南', link: '/dev/docs-maintenance' },
    ],
  },
  {
    text: '决策记录',
    collapsed: true,
    items: [
      { text: 'ADR 索引', link: '/dev/decisions/' },
      { text: '0001 Agent 对外 API', link: '/dev/decisions/0001-agent-external-api' },
      { text: '0002 文档体系', link: '/dev/decisions/0002-docs-system' },
      { text: '0003 sandbox 运行态切换为 dsh', link: '/dev/decisions/0003-dsh-sandbox-runtime' },
    ],
  },
]

export default dev
