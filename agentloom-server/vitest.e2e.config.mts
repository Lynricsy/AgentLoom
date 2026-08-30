import { defineConfig } from 'vitest/config';
import swc from 'unplugin-swc';

export default defineConfig({
  test: {
    globals: true,
    include: ['test/**/*.e2e-spec.ts'],
    root: './',
    testTimeout: 30000,
    setupFiles: ['./test/setup-e2e.ts'],
  },
  plugins: [swc.vite()],
});
