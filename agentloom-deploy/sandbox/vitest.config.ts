import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    {
      // 与 tsup `loader: { '.py': 'text' }` 对齐：.py 以字符串默认导出（eval 插件的 runner.py）
      name: 'agentloom-py-text',
      enforce: 'pre',
      transform(code, id) {
        if (!id.endsWith('.py')) return undefined;
        return { code: `export default ${JSON.stringify(code)};`, map: null };
      },
    },
  ],
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
    },
  },
});
