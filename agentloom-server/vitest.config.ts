import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// 仅当显式指定 test/ 目录下的文件时才包含 E2E 测试
// 注意：不能用 includes('test/')，否则会匹配到 vitest 二进制路径中的 "vitest/"
const runsTestDirectory = process.argv.some(
  (arg) => arg.startsWith('test/') || arg === 'test',
);

export default defineConfig({
  test: {
    globals: true,
    root: './',
    include: runsTestDirectory
      ? ['src/**/*.spec.ts', 'test/**/*.e2e-spec.ts']
      : ['src/**/*.spec.ts'],
    setupFiles: runsTestDirectory ? ['./test/setup-e2e.ts'] : [],
    testTimeout: runsTestDirectory ? 30000 : undefined,
    env: {
      APP_MINIO_ENDPOINT: 'localhost',
      APP_MINIO_PORT: '9000',
      APP_MINIO_ACCESS_KEY: 'test-access-key',
      APP_MINIO_SECRET_KEY: 'test-secret-key',
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/main.ts',
        'src/**/*.spec.ts',
        'src/**/*.dto.ts',
        'src/**/*.schema.ts',
        'src/database/migrations/**',
      ],
      thresholds: {
        statements: 80,
        branches: 80,
        functions: 80,
        lines: 80,
      },
    },
  },
  plugins: [swc.vite()],
});
