import { defineConfig } from 'vitepress'
import { withMermaid } from 'vitepress-plugin-mermaid'

export default withMermaid(
  defineConfig({
    title: 'AgentLoom',
    description: '多智能体工作流编排平台 — 文档中心',
    srcDir: '.',
    srcExclude: ['AGENTS.md', '_bmad/**', 'node_modules/**'],
    cleanUrls: true,
    lastUpdated: true,
    ignoreDeadLinks: false,

    vite: {
      build: {
        chunkSizeWarningLimit: 10000,
      },
    },

    head: [
      ['link', { rel: 'icon', type: 'image/svg+xml', href: '/logo.svg' }],
    ],

    locales: {
      zh: {
        label: '中文',
        lang: 'zh-CN',
        description: '多智能体工作流编排平台',
      },
      en: {
        label: 'English',
        lang: 'en-US',
        description: 'Multi-Agent Workflow Orchestration Platform',
      },
    },

    themeConfig: {
      siteTitle: 'AgentLoom',

      nav: [
        { text: '指南', link: '/zh/guide/' },
        { text: '服务端', link: '/zh/server/' },
        { text: '工作室', link: '/zh/studio/' },
        { text: '类型引擎', link: '/zh/type-engine/' },
        {
          text: '生态',
          items: [
            { text: '插件生态', link: '/zh/plugins/' },
            { text: '移动端', link: '/zh/mobile/' },
          ],
        },
        { text: 'API 参考', link: '/zh/api/' },
        { text: '部署运维', link: '/zh/deployment/' },
      ],

      sidebar: {
        '/zh/guide/': [
          {
            text: '指南',
            items: [
              { text: '介绍', link: '/zh/guide/' },
              { text: '快速开始', link: '/zh/guide/getting-started' },
              { text: '架构总览', link: '/zh/guide/architecture' },
              { text: '核心概念', link: '/zh/guide/concepts' },
            ],
          },
        ],
        '/zh/server/': [
          {
            text: '核心架构',
            items: [
              { text: '概述', link: '/zh/server/' },
              { text: '模块架构', link: '/zh/server/modules' },
              { text: '中间件与守卫链', link: '/zh/server/middleware' },
              { text: '安全与加密', link: '/zh/server/security' },
            ],
          },
          {
            text: '基础设施',
            items: [
              { text: '数据库', link: '/zh/server/database' },
              { text: '队列系统', link: '/zh/server/queues' },
              { text: '实时通信', link: '/zh/server/realtime' },
              { text: 'ACP 协议', link: '/zh/server/acp' },
            ],
          },
        ],
        '/zh/studio/': [
          {
            text: '工作室',
            items: [
              { text: '概述', link: '/zh/studio/' },
              { text: '画布编辑器', link: '/zh/studio/canvas' },
              { text: '状态管理', link: '/zh/studio/state' },
              { text: '功能模块', link: '/zh/studio/features' },
              { text: 'WASM 集成', link: '/zh/studio/wasm' },
            ],
          },
        ],
        '/zh/type-engine/': [
          {
            text: '类型引擎',
            items: [
              { text: '概述', link: '/zh/type-engine/' },
              { text: '架构与兼容性规则', link: '/zh/type-engine/architecture' },
              { text: 'WASM API 参考', link: '/zh/type-engine/api' },
              { text: '构建指南', link: '/zh/type-engine/build' },
            ],
          },
        ],
        '/zh/plugins/': [
          {
            text: '插件生态',
            items: [
              { text: '概述', link: '/zh/plugins/' },
              { text: '插件 SDK', link: '/zh/plugins/sdk' },
              { text: '插件 CLI', link: '/zh/plugins/cli' },
              { text: '开发教程', link: '/zh/plugins/tutorial' },
              { text: '服务端系统', link: '/zh/plugins/server-side' },
            ],
          },
        ],
        '/zh/mobile/': [
          {
            text: '移动端',
            items: [
              { text: '概述', link: '/zh/mobile/' },
              { text: '架构详解', link: '/zh/mobile/architecture' },
              { text: '开发指南', link: '/zh/mobile/getting-started' },
            ],
          },
        ],
        '/zh/api/': [
          {
            text: 'API 参考',
            items: [
              { text: 'OpenAPI 文档', link: '/zh/api/' },
            ],
          },
        ],
        '/zh/deployment/': [
          {
            text: '部署运维',
            items: [
              { text: '概述', link: '/zh/deployment/' },
              { text: 'Docker Compose', link: '/zh/deployment/docker' },
              { text: 'Kubernetes / Helm', link: '/zh/deployment/helm' },
              { text: '备份与恢复', link: '/zh/deployment/backup' },
              { text: 'Nginx 配置', link: '/zh/deployment/nginx' },
            ],
          },
        ],
      },

      search: {
        provider: 'local',
        options: {
          locales: {
            zh: {
              translations: {
                button: {
                  buttonText: '搜索文档',
                  buttonAriaLabel: '搜索文档',
                },
                modal: {
                  displayDetails: '显示详细列表',
                  resetButtonTitle: '清除查询条件',
                  backButtonTitle: '关闭搜索',
                  noResultsText: '无法找到相关结果',
                  footer: {
                    selectText: '选择',
                    navigateText: '切换',
                    closeText: '关闭',
                  },
                },
              },
            },
          },
        },
      },

      socialLinks: [
        { icon: 'github', link: 'https://github.com/example/agentloom' },
      ],

      footer: {
        message: 'AgentLoom — 多智能体工作流编排平台',
        copyright: '© 2024-2026 AgentLoom. All rights reserved.',
      },

      outline: {
        level: [2, 3],
        label: '本页目录',
      },

      lastUpdated: {
        text: '最后更新于',
      },

      docFooter: {
        prev: '上一篇',
        next: '下一篇',
      },

      returnToTopLabel: '返回顶部',
      sidebarMenuLabel: '菜单',
      darkModeSwitchLabel: '主题',
    },

    mermaid: {},
  }),
)
