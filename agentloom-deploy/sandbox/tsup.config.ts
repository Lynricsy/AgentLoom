import { writeFile } from 'node:fs/promises';
import { defineConfig } from 'tsup';

/** VM 内置 Cordis 插件（agentloom-lsp/ast/browser/eval），由 profile-writer 按策略 insert */
const BUILTIN_PLUGINS = ['lsp', 'ast', 'browser', 'eval'] as const;

async function writePluginManifest(dir: string, name: string): Promise<void> {
  await writeFile(
    `${dir}/package.json`,
    `${JSON.stringify(
      {
        name,
        private: true,
        type: 'module',
        main: './index.js',
        peerDependencies: { '@deepseek-ai/cordis': '~4.0.4' },
      },
      null,
      2,
    )}\n`,
  );
}

export default defineConfig({
  entry: {
    server: 'src/server.ts',
    // dsh 子进程按绝对路径 insert 的 Cordis 插件（agentloom-bridge）
    'dsh-bridge/index': 'src/dsh-bridge/index.ts',
    ...Object.fromEntries(
      BUILTIN_PLUGINS.map((name) => [`dsh-plugins/${name}/index`, `src/dsh-plugins/${name}/index.ts`]),
    ),
  },
  format: ['esm'],
  target: 'node22',
  dts: true,
  clean: true,
  // eval 插件的 Python runner 以文本内联进产物
  loader: { '.py': 'text' },
  async onSuccess() {
    await writePluginManifest('dist/dsh-bridge', '@agentloom/dsh-bridge');
    for (const name of BUILTIN_PLUGINS) {
      await writePluginManifest(`dist/dsh-plugins/${name}`, `@agentloom/dsh-plugin-${name}`);
    }
  },
});
