import type { DefaultTheme } from 'vitepress'

// 部署运维侧边栏：新增/移动 deploy/ 页面时同步本文件
const deploy: DefaultTheme.SidebarItem[] = [
  {
    text: '部署运维',
    items: [
      { text: '部署拓扑', link: '/deploy/' },
      { text: 'Docker Compose 部署', link: '/deploy/compose' },
      { text: 'Helm 部署', link: '/deploy/helm' },
      { text: '备份与恢复', link: '/deploy/backup-restore' },
      { text: '反向代理', link: '/deploy/reverse-proxy' },
    ],
  },
]

export default deploy
