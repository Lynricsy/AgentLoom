import { defineConfig } from 'vitest/config'
import { loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

export default defineConfig(({ mode }) => {
  // 开发服务器端口与代理目标只在本机生效，不使用 VITE_ 前缀，避免被打进客户端 bundle。
  const env = loadEnv(mode, import.meta.dirname, 'STUDIO_DEV_')
  const devPort = Number(env.STUDIO_DEV_PORT || 5173)
  const apiTarget = env.STUDIO_DEV_API_TARGET || 'http://localhost:3000'

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, './src'),
      },
    },
    server: {
      port: devPort,
      fs: {
        allow: [path.resolve(import.meta.dirname, '..')],
      },
      proxy: {
        '/api': {
          target: apiTarget,
          changeOrigin: true,
        },
        '/socket.io': {
          target: apiTarget,
          changeOrigin: true,
          ws: true,
        },
      },
    },
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: './src/test-setup.ts',
      css: false,
      testTimeout: 10000,
      include: ['src/**/*.test.{ts,tsx}'],
      coverage: {
        provider: 'v8',
        reporter: ['text', 'html'],
      },
    },
  }
})
