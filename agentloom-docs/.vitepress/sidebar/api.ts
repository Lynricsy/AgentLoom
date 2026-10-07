import type { DefaultTheme } from 'vitepress'

// API 与集成侧边栏：新增/移动 api/ 页面时同步本文件
const api: DefaultTheme.SidebarItem[] = [
  {
    text: 'API 与集成',
    items: [
      { text: 'API 约定', link: '/api/' },
      { text: 'REST 参考', link: '/api/rest' },
      { text: 'Agent 对外 API', link: '/api/agent-api' },
      { text: 'Webhook 与 API 事件', link: '/api/webhooks' },
      { text: '生成应用接入', link: '/api/generated-apps' },
    ],
  },
  {
    text: '插件开发',
    items: [
      { text: '插件体系', link: '/api/plugins/' },
      { text: '开发教程', link: '/api/plugins/tutorial' },
      { text: 'Plugin SDK', link: '/api/plugins/sdk' },
      { text: 'Plugin CLI', link: '/api/plugins/cli' },
      { text: '开发 runtime 插件', link: '/api/plugins/runtime' },
      { text: '市场与收益', link: '/api/plugins/marketplace' },
    ],
  },
]

export default api
