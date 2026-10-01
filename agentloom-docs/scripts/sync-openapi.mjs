/**
 * 构建/预览前同步 OpenAPI spec：
 * agentloom-server/sdk/openapi.json → public/openapi.json
 * 源文件缺失时直接失败，不生成空 stub（空 stub 会让 REST 参考页静默变空）。
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SOURCE = resolve(__dirname, '../../agentloom-server/sdk/openapi.json')
const TARGET = resolve(__dirname, '../public/openapi.json')
const SERVER_URL = process.env.DOCS_OPENAPI_SERVER_URL ?? 'https://agentloom.ling.plus/api/v1'

if (!existsSync(SOURCE)) {
  console.error(`[sync-openapi] 找不到 ${SOURCE}`)
  console.error('[sync-openapi] 先在 agentloom-server 运行 pnpm openapi:export')
  process.exit(1)
}

const spec = JSON.parse(await readFile(SOURCE, 'utf-8'))

// 第一个 server 指向文档站展示的 API 地址；其余相对地址补全为生产域名
const servers = (spec.servers ?? []).map((s) => ({
  ...s,
  url: s.url.startsWith('/') ? `https://agentloom.ling.plus${s.url}` : s.url,
}))
if (servers.length === 0) servers.push({ url: SERVER_URL })
else servers[0] = { ...servers[0], url: SERVER_URL }
spec.servers = servers

// server 导出的 path 自带全局前缀（如 /api/v1/health），server URL 也以该前缀结尾；
// vitepress-openapi 按 `${serverUrl}${path}` 拼接请求，需从 path 去掉前缀，避免 /api/v1/api/v1/…
const prefix = new URL(SERVER_URL).pathname.replace(/\/+$/, '')
const paths = Object.keys(spec.paths ?? {})
if (prefix && paths.length > 0) {
  if (!paths.every((p) => p.startsWith(`${prefix}/`))) {
    console.error(`[sync-openapi] 存在不以 ${prefix}/ 开头的 path，无法与 server URL 对齐`)
    process.exit(1)
  }
  spec.paths = Object.fromEntries(Object.entries(spec.paths).map(([p, v]) => [p.slice(prefix.length), v]))
}

await mkdir(dirname(TARGET), { recursive: true })
const json = JSON.stringify(spec, null, 2)
await writeFile(TARGET, json)
console.log(`[sync-openapi] ${SOURCE} → ${TARGET} (${(json.length / 1024).toFixed(1)} KB)`)
