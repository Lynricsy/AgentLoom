import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'
import { existsSync, mkdirSync, copyFileSync, writeFileSync, statSync } from 'fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const srcPath = resolve(__dirname, '../../agentloom-server/sdk/openapi.json')
const destDir = resolve(__dirname, '../public')
const destPath = resolve(destDir, 'openapi.json')

mkdirSync(destDir, { recursive: true })

if (!existsSync(srcPath)) {
  console.warn('⚠️  OpenAPI source not found:', srcPath)
  console.warn('⚠️  Generating stub spec — run `pnpm openapi:export` in agentloom-server for full API docs.')
  const stub = { openapi: '3.0.0', info: { title: 'AgentLoom API', version: '0.0.0' }, paths: {} }
  writeFileSync(destPath, JSON.stringify(stub, null, 2))
  process.exit(0)
}

copyFileSync(srcPath, destPath)

const sizeKb = (statSync(destPath).size / 1024).toFixed(1)
console.log(`✅ OpenAPI spec synced → ${destPath} (${sizeKb} KB)`)
