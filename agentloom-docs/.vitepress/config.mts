import { defineConfig } from 'vitepress'
import { withMermaid } from 'vitepress-plugin-mermaid'

export default withMermaid(
  defineConfig({
    title: 'AgentLoom',
    description: '多智能体工作流编排平台 — 文档中心',
    srcDir: '.',
    cleanUrls: true,
    lastUpdated: true,

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
            text: '服务端',
            items: [
              { text: '概述', link: '/zh/server/' },
              { text: '模块架构', link: '/zh/server/modules' },
              { text: '认证与多租户', link: '/zh/server/auth' },
              { text: '工作流引擎', link: '/zh/server/execution' },
              { text: '智能路由', link: '/zh/server/smart-routing' },
              { text: '知识库 RAG', link: '/zh/server/knowledge' },
              { text: 'E2EE 加密', link: '/zh/server/encryption' },
            ],
          },
        ],
        '/zh/studio/': [
          {
            text: '工作室',
            items: [
              { text: '概述', link: '/zh/studio/' },
              { text: '画布编辑器', link: '/zh/studio/canvas' },
              { text: '节点类型', link: '/zh/studio/node-types' },
              { text: '执行监控', link: '/zh/studio/execution' },
              { text: '设置与管理', link: '/zh/studio/settings' },
            ],
          },
        ],
        '/zh/type-engine/': [
          {
            text: '类型引擎',
            items: [
              { text: '概述', link: '/zh/type-engine/' },
              { text: '端口数据类型', link: '/zh/type-engine/port-types' },
              { text: '兼容性规则', link: '/zh/type-engine/compatibility' },
              { text: 'WASM 集成', link: '/zh/type-engine/wasm' },
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
              { text: '开发指南', link: '/zh/plugins/development' },
              { text: '发布与市场', link: '/zh/plugins/marketplace' },
            ],
          },
        ],
        '/zh/mobile/': [
          {
            text: '移动端',
            items: [
              { text: '概述', link: '/zh/mobile/' },
              { text: '功能模块', link: '/zh/mobile/features' },
              { text: '实时通信', link: '/zh/mobile/realtime' },
            ],
          },
        ],
        '/zh/api/': [
          {
            text: 'API 参考',
            items: [
              { text: '概述', link: '/zh/api/' },
              { text: 'REST API', link: '/zh/api/rest' },
              { text: 'Socket.IO 协议', link: '/zh/api/socketio' },
              { text: '认证方式', link: '/zh/api/authentication' },
            ],
          },
        ],
        '/zh/deployment/': [
          {
            text: '部署运维',
            items: [
              { text: '概述', link: '/zh/deployment/' },
              { text: 'Docker Compose', link: '/zh/deployment/docker-compose' },
              { text: 'Kubernetes / Helm', link: '/zh/deployment/kubernetes' },
              { text: '环境变量', link: '/zh/deployment/env-vars' },
              { text: '备份与恢复', link: '/zh/deployment/backup' },
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
