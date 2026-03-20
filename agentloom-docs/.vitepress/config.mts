import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'AgentLoom',
  srcDir: '.',
  cleanUrls: true,
  lastUpdated: true,
  locales: {
    zh: {
      label: '中文',
      lang: 'zh-CN',
    },
    en: {
      label: 'English',
      lang: 'en-US',
    },
  },
  themeConfig: {
    nav: [],
    sidebar: {},
    socialLinks: [],
  },
})
