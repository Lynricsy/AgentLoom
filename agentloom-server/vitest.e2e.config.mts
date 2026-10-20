import { defineConfig } from 'vitest/config';
import swc from 'unplugin-swc';

export default defineConfig({
  test: {
    globals: true,
    include: ['test/**/*.e2e-spec.ts'],
    root: './',
    testTimeout: 30000,
    // 每个文件在 beforeAll 里各起一个 PostgreSQL 容器和 Nest 应用；按 CPU 数并行会同时拉起几十个，
    // 宿主繁忙时钩子超时。限制并发，可用 E2E_MAX_WORKERS 覆盖。
    maxWorkers: Number(process.env.E2E_MAX_WORKERS ?? 6),
    setupFiles: ['./test/setup-e2e.ts'],
  },
  plugins: [swc.vite()],
});
