import { writeFile } from 'node:fs/promises';
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    server: 'src/server.ts',
    // dsh 子进程按绝对路径 insert 的 Cordis 插件（agentloom-bridge）
    'dsh-bridge/index': 'src/dsh-bridge/index.ts',
  },
  format: ['esm'],
  target: 'node22',
  dts: true,
  clean: true,
  async onSuccess() {
    await writeFile(
      'dist/dsh-bridge/package.json',
      `${JSON.stringify(
        {
          name: '@agentloom/dsh-bridge',
          private: true,
          type: 'module',
          main: './index.js',
          peerDependencies: { '@deepseek-ai/cordis': '~4.0.4' },
        },
        null,
        2,
      )}\n`,
    );
  },
});
