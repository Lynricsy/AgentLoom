import type { DefaultTheme } from 'vitepress'

// API 与集成侧边栏：新增/移动 api/ 页面时同步本文件
const api: DefaultTheme.SidebarItem[] = [
  {
    text: 'API 与集成',
    items: [
      { text: '概览', link: '/api/' },
      { text: 'REST 参考', link: '/api/rest' },
    ],
  },
  {
    text: '插件开发',
    items: [
      { text: '插件生态', link: '/api/plugins/' },
      { text: '开发教程', link: '/api/plugins/tutorial' },
      { text: 'Plugin SDK', link: '/api/plugins/sdk' },
      { text: 'Plugin CLI', link: '/api/plugins/cli' },
      { text: '市场与收益', link: '/api/plugins/marketplace' },
    ],
  },
]

export default api
