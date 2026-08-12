import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * 源码级第三方样式引入约束。
 *
 * 背景（一次真实的生产事故）：同一张第三方样式表如果既被 src/index.css 用
 * `@import` 内联、又被某个 .ts/.tsx 以副作用方式引入，打包器会把这两条路径当成
 * 两个不同的模块，最终产物里就会出现两份副本，而 JS 侧那份排在 index.css 之后。
 *
 * 对 @xyflow/react 来说这是致命的：它的默认规则 `.react-flow__edge-path` 与我们的
 * `.smart-edge-path` 特异性同为 (0,1,0)，同特异性下后出现者胜出。于是第二份默认样式
 * 反向覆盖了自定义规则，连线的渐变描边与 1.75px 线宽全部失效，实测计算值退回 xyflow
 * 默认的 stroke #b1b1b7 / stroke-width 1px。
 *
 * 这类缺陷只在真实浏览器的层叠计算中暴露：jsdom 不实现 CSS 层叠，组件测试与快照都
 * 测不出来，开发模式下样式注入顺序也与生产构建不同。因此只能在源码层面守住约束。
 */

const SRC_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.css']

/** 唯一允许承载全局 `@import` 的样式入口 */
const GLOBAL_STYLESHEET = 'index.css'
const XYFLOW_STYLESHEET = '@xyflow/react/dist/style.css'

/** 只匹配 CSS 的 at-rule 引入，注释里提到的包名不会命中 */
const CSS_AT_IMPORT = /@import\s+(?:url\()?["']([^"']+)["']/g
/** 只匹配副作用引入（行首 import + 字符串），`import x from '...'` 与注释都不会命中 */
const JS_SIDE_EFFECT_IMPORT = /(?:^|\n)[ \t]*import\s+["']([^"']+)["']/g

type Mechanism = 'css-@import' | 'js-import'

interface StylesheetImport {
  specifier: string
  /** 相对 src/ 的路径，断言失败信息里直接可读 */
  file: string
  mechanism: Mechanism
}

function collectSourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      collectSourceFiles(fullPath, acc)
    } else if (SOURCE_EXTENSIONS.some((ext) => entry.name.endsWith(ext))) {
      acc.push(fullPath)
    }
  }
  return acc
}

function collectStylesheetImports(files: string[]): StylesheetImport[] {
  const imports: StylesheetImport[] = []

  for (const fullPath of files) {
    const source = readFileSync(fullPath, 'utf8')
    const file = relative(SRC_ROOT, fullPath)
    const pattern = fullPath.endsWith('.css')
      ? CSS_AT_IMPORT
      : JS_SIDE_EFFECT_IMPORT
    const mechanism: Mechanism = fullPath.endsWith('.css')
      ? 'css-@import'
      : 'js-import'

    pattern.lastIndex = 0
    for (
      let match = pattern.exec(source);
      match !== null;
      match = pattern.exec(source)
    ) {
      const specifier = match[1]
      if (specifier !== undefined) {
        imports.push({ specifier, file, mechanism })
      }
    }
  }

  return imports
}

const sourceFiles = collectSourceFiles(SRC_ROOT)
const stylesheetImports = collectStylesheetImports(sourceFiles)

function describeImport({ file, mechanism }: StylesheetImport): string {
  return `${file} (${mechanism})`
}

describe('第三方样式表引入约束', () => {
  it('扫描确实覆盖到源码树（守住这条断言，其余断言才有意义）', () => {
    expect(sourceFiles).toContain(join(SRC_ROOT, GLOBAL_STYLESHEET))
    expect(sourceFiles.filter((f) => f.endsWith('.tsx')).length).toBeGreaterThan(
      50,
    )
  })

  it('@xyflow/react 默认样式有且仅有一处引入，且必须在 src/index.css', () => {
    const xyflowImports = stylesheetImports.filter(
      (entry) => entry.specifier === XYFLOW_STYLESHEET,
    )

    // 多出任意一处（尤其是画布组件里的 `import '@xyflow/react/dist/style.css'`）都会
    // 让默认样式在产物中排到 .smart-edge-path 之后并反向覆盖它。
    expect(xyflowImports.map(describeImport)).toEqual([
      `${GLOBAL_STYLESHEET} (css-@import)`,
    ])
  })

  it('同一张样式表不允许同时经 CSS @import 和 JS 副作用引入', () => {
    const bySpecifier = new Map<string, StylesheetImport[]>()
    for (const entry of stylesheetImports) {
      const bucket = bySpecifier.get(entry.specifier)
      if (bucket) bucket.push(entry)
      else bySpecifier.set(entry.specifier, [entry])
    }

    // 两种引入机制绕过了打包器的模块去重，是产物里出现重复副本的根因；
    // 单一机制下重复引入同一模块会被正常去重，不在此约束范围内。
    const mixed = [...bySpecifier.entries()]
      .filter(([, entries]) => new Set(entries.map((e) => e.mechanism)).size > 1)
      .map(([specifier, entries]) => `${specifier}: ${entries.map(describeImport).join(', ')}`)

    expect(mixed).toEqual([])
  })
})
