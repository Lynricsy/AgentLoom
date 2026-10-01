import { defineConfig } from 'vitepress'
import { withMermaid } from 'vitepress-plugin-mermaid'
import guide from './sidebar/guide'
import api from './sidebar/api'
import deploy from './sidebar/deploy'
import dev from './sidebar/dev'

export default withMermaid(
  defineConfig({
    lang: 'zh-CN',
    title: 'AgentLoom',
    description: '多智能体工作流编排平台 — 文档中心',
    base: '/documentation/',
    srcDir: '.',
    srcExclude: ['AGENTS.md', 'README.md', '_generated/**', 'node_modules/**'],
    cleanUrls: true,
    lastUpdated: true,
    ignoreDeadLinks: false,

    vite: {
      build: {
        chunkSizeWarningLimit: 10000,
      },
    },

    // head 不会自动拼接 base，这里必须写完整路径
    head: [['link', { rel: 'icon', type: 'image/png', href: '/documentation/brand/logo.png' }]],

    themeConfig: {
      logo: { src: '/brand/logo.png', alt: 'AgentLoom Logo' },
      siteTitle: 'AgentLoom',

      nav: [
        { text: '用户指南', link: '/guide/' },
        { text: 'API 与集成', link: '/api/' },
        { text: '部署运维', link: '/deploy/' },
        { text: '贡献者', link: '/dev/' },
      ],

      sidebar: {
        '/guide/': guide,
        '/api/': api,
        '/deploy/': deploy,
        '/dev/': dev,
      },

      search: {
        provider: 'local',
        options: {
          translations: {
            button: { buttonText: '搜索文档', buttonAriaLabel: '搜索文档' },
            modal: {
              displayDetails: '显示详细列表',
              resetButtonTitle: '清除查询条件',
              backButtonTitle: '关闭搜索',
              noResultsText: '无法找到相关结果',
              footer: { selectText: '选择', navigateText: '切换', closeText: '关闭' },
            },
          },
          miniSearch: {
            options: {
              // CJK 分词：按空白与中文标点切分
              tokenize: (text: string) =>
                text.split(/[\s\-，。！？、；：""''（）【】\u200b]+/g).filter(Boolean),
            },
          },
        },
      },

      socialLinks: [{ icon: 'github', link: 'https://github.com/AgentLoom/agentloom' }],

      footer: {
        message: 'AgentLoom — 多智能体工作流编排平台',
        copyright: '© 2024-2026 AgentLoom. All rights reserved.',
      },

      outline: { level: [2, 3], label: '本页目录' },
      lastUpdated: { text: '最后更新于' },
      docFooter: { prev: '上一篇', next: '下一篇' },
      returnToTopLabel: '返回顶部',
      sidebarMenuLabel: '菜单',
      darkModeSwitchLabel: '主题',
    },

    mermaid: {},
  }),
)
