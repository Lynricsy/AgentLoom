/**
 * 构建前同步 OpenAPI spec
 * 从 agentloom-server 拉取最新 spec 并写入 public/
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SOURCE = resolve(__dirname, '../../agentloom-server/sdk/openapi.json');
const TARGET = resolve(__dirname, '../public/openapi.json');

const STUB_SPEC = {
  openapi: '3.0.0',
  info: {
    title: 'AgentLoom API',
    version: '1.0.0',
    description: 'AgentLoom 平台 API 参考文档',
  },
  paths: {},
};

async function sync() {
  await mkdir(dirname(TARGET), { recursive: true });

  let spec;
  if (existsSync(SOURCE)) {
    const raw = await readFile(SOURCE, 'utf-8');
    spec = JSON.parse(raw);

    // 规范化相对 server URL 为绝对 URL
    if (spec.servers) {
      spec.servers = spec.servers.map((s) => ({
        ...s,
        url: s.url.startsWith('/')
          ? `https://agentloom.ling.plus${s.url}`
          : s.url,
      }));
    }

    console.log(`[sync-openapi] 已从 ${SOURCE} 同步 spec`);
  } else {
    spec = STUB_SPEC;
    console.log('[sync-openapi] 源文件不存在，使用 stub spec');
  }

  const json = JSON.stringify(spec, null, 2);
  await writeFile(TARGET, json);
  console.log(`[sync-openapi] 写入 ${TARGET} (${(json.length / 1024).toFixed(1)} KB)`);
}

sync().catch((err) => {
  console.error('[sync-openapi] 同步失败:', err);
  process.exit(1);
});
