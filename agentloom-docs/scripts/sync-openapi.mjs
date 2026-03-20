import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'
import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from 'fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const srcPath = resolve(__dirname, '../../agentloom-server/sdk/openapi.json')
const destDir = resolve(__dirname, '../public')
const destPath = resolve(destDir, 'openapi.json')

/** 默认的文档预览基础 URL */
const DEFAULT_BASE_URL = 'http://localhost:3000'

mkdirSync(destDir, { recursive: true })

if (!existsSync(srcPath)) {
  console.warn('⚠️  OpenAPI source not found:', srcPath)
  console.warn('⚠️  Generating stub spec — run `pnpm openapi:export` in agentloom-server for full API docs.')
  const stub = {
    openapi: '3.0.0',
    info: { title: 'AgentLoom API', version: '0.0.0' },
    servers: [{ url: DEFAULT_BASE_URL, description: 'Local Development' }],
    paths: {},
  }
  writeFileSync(destPath, JSON.stringify(stub, null, 2))
  process.exit(0)
}

// 读取原始 spec 并规范化 servers[].url 为绝对 URL
// vitepress-openapi 内部使用 URL.canParse() 校验，相对路径 (如 /api/v1) 会触发错误
const spec = JSON.parse(readFileSync(srcPath, 'utf-8'))

if (Array.isArray(spec.servers)) {
  for (const server of spec.servers) {
    if (server.url && !URL.canParse(server.url)) {
      const absolute = new URL(server.url, DEFAULT_BASE_URL).href
      console.log(`  ↳ 规范化 server URL: ${server.url} → ${absolute}`)
      server.url = absolute
    }
  }
}

writeFileSync(destPath, JSON.stringify(spec, null, 2))

const sizeKb = (statSync(destPath).size / 1024).toFixed(1)
console.log(`✅ OpenAPI spec synced → ${destPath} (${sizeKb} KB)`)
