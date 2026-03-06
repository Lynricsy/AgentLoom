import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

const runsTestDirectory = process.argv.some((arg) => arg.includes('test/'));

export default defineConfig({
  test: {
    globals: true,
    root: './',
    include: runsTestDirectory
      ? ['src/**/*.spec.ts', 'test/**/*.e2e-spec.ts']
      : ['src/**/*.spec.ts'],
    setupFiles: runsTestDirectory ? ['./test/setup-e2e.ts'] : [],
    testTimeout: runsTestDirectory ? 30000 : undefined,
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
