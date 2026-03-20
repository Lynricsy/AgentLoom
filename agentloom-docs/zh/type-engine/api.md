# WASM API 参考

类型引擎通过 WebAssembly 导出 **3 个核心函数**，供 Studio 前端调用。

## 初始化

WASM 模块需要先异步初始化：

```typescript
import init, {
  checkCompatibility,
  checkSchemaCompatibility,
  validateSchema
} from '@agentloom/type-engine'

// 初始化 WASM 模块
await init()
```

::: tip Studio 集成方式
在 Studio 中，WASM 加载由 `TypeEngineRuntime` 管理，运行在 Web Worker 中。开发者无需手动调用 `init()`。详见 [Studio WASM 集成](/zh/studio/wasm)。
:::

## checkCompatibility

检查两个端口定义之间的兼容性。

### 签名

```typescript
function checkCompatibility(
  source: PortDefinition,
  target: PortDefinition
): CompatibilityResult
```

### 参数类型

```typescript
interface PortDefinition {
  id: string
  label: string
  direction: 'input' | 'output'
  dataType: 'model' | 'text' | 'json' | 'image' | 'audio' | 'tool' | 'sandbox' | 'knowledge'
  description?: string
  required?: boolean
  multiple?: boolean
  maxConnections?: number
  schema?: TypeSchema
}
```

### 返回类型

```typescript
interface CompatibilityResult {
  level: 'EXACT' | 'TRANSFORM' | 'PARTIAL' | 'INCOMPATIBLE'
  reason?: string
  transform?: string          // 转换函数名（仅 TRANSFORM 级别）
  matchedRatio?: number       // 匹配比率（仅 PARTIAL 级别）
  matchedCount?: number       // 已匹配字段数
  totalCount?: number         // 总字段数
  missingFields?: string[]    // 缺失字段列表
  candidateMappings?: Record<string, CandidateMapping[]>  // 候选映射建议
}

interface CandidateMapping {
  field: string              // 候选源字段名
  similarity: number         // 相似度分数 (0.0 ~ 1.0)
  autoRecommended: boolean   // 是否自动推荐 (≥ 0.85)
}
```

### 使用示例

```typescript
// 示例 1：完全兼容（同类型）
const result = checkCompatibility(
  {
    id: 'output-1',
    label: '输出文本',
    direction: 'output',
    dataType: 'text'
  },
  {
    id: 'input-1',
    label: '输入文本',
    direction: 'input',
    dataType: 'text'
  }
)
console.log(result.level) // 'EXACT'

// 示例 2：可转换（text → json）
const result2 = checkCompatibility(
  {
    id: 'output-1',
    label: 'LLM 输出',
    direction: 'output',
    dataType: 'text'
  },
  {
    id: 'input-1',
    label: 'JSON 输入',
    direction: 'input',
    dataType: 'json'
  }
)
console.log(result2.level)     // 'TRANSFORM'
console.log(result2.transform) // 'parse_json'

// 示例 3：不兼容
const result3 = checkCompatibility(
  {
    id: 'output-1',
    label: '图像输出',
    direction: 'output',
    dataType: 'image'
  },
  {
    id: 'input-1',
    label: '音频输入',
    direction: 'input',
    dataType: 'audio'
  }
)
console.log(result3.level) // 'INCOMPATIBLE'
```

## checkSchemaCompatibility

检查两个 TypeSchema 之间的兼容性。适用于同数据类型端口间的精细比较。

### 签名

```typescript
function checkSchemaCompatibility(
  source: TypeSchema,
  target: TypeSchema
): CompatibilityResult
```

### 参数类型

```typescript
// TypeSchema 是联合类型，由 shape 字段判别
type TypeSchema = ScalarTypeSchema | ObjectTypeSchema | ArrayTypeSchema

interface ScalarTypeSchema {
  kind: 'model' | 'text' | 'image' | 'audio' | 'tool' | 'sandbox' | 'knowledge'
  format?: string
  examples?: string[]
  title?: string
  description?: string
  nullable?: boolean
}

interface ObjectTypeSchema {
  kind: 'json'
  shape: 'object'
  properties: Record<string, TypeSchema>
  required?: string[]
  additionalProperties?: boolean
  title?: string
  description?: string
  nullable?: boolean
}

interface ArrayTypeSchema {
  kind: 'json'
  shape: 'array'
  items: TypeSchema
  minItems?: number
  maxItems?: number
  title?: string
  description?: string
  nullable?: boolean
}
```

### 使用示例

```typescript
// 比较两个 Object Schema
const result = checkSchemaCompatibility(
  {
    kind: 'json',
    shape: 'object',
    properties: {
      name: { kind: 'text' },
      age: { kind: 'json', shape: 'object', properties: {} },
      email: { kind: 'text' }
    },
    required: ['name']
  },
  {
    kind: 'json',
    shape: 'object',
    properties: {
      name: { kind: 'text' },
      address: { kind: 'text' }
    },
    required: ['name']
  }
)

console.log(result.level)          // 'PARTIAL'
console.log(result.matchedRatio)   // 0.5 (name 匹配，address 缺失)
console.log(result.missingFields)  // ['address']
console.log(result.candidateMappings)
// { address: [{ field: 'email', similarity: 0.62, autoRecommended: false }] }
```

## validateSchema

验证一个 TypeSchema 定义是否合法。

### 签名

```typescript
function validateSchema(
  input: string | TypeSchema | null | undefined
): ValidationResult
```

### 返回类型

```typescript
interface ValidationResult {
  valid: boolean
  errors: ValidationError[]
}

interface ValidationError {
  path: string      // 错误位置路径
  message: string   // 错误描述
}
```

### 使用示例

```typescript
// 有效 Schema
const result = validateSchema({
  kind: 'json',
  shape: 'object',
  properties: {
    name: { kind: 'text' },
    items: {
      kind: 'json',
      shape: 'array',
      items: { kind: 'text' }
    }
  },
  required: ['name']
})
console.log(result.valid)  // true
console.log(result.errors) // []

// 无效 Schema：Scalar 不能使用 json kind
const result2 = validateSchema({
  kind: 'json'  // 错误：json kind 必须有 shape
})
console.log(result2.valid)  // false

// 支持字符串输入（JSON 字符串）
const result3 = validateSchema('{"kind":"text"}')
console.log(result3.valid)  // true

// null/undefined 输入返回无效
const result4 = validateSchema(null)
console.log(result4.valid)  // false
```

## 错误处理

所有 WASM 函数在遇到无法处理的错误时（如参数反序列化失败）会抛出 `TypeEngineError`：

```typescript
try {
  const result = checkCompatibility(invalidInput, {})
} catch (error) {
  if (error instanceof Error && error.name === 'TypeEngineError') {
    console.error('错误码:', (error as any).code)
    console.error('上下文:', (error as any).context)
  }
}
```

::: warning 注意
`TypeEngineError` 是一个标准 `Error` 的扩展，包含 `code` 和 `context` 属性。由于 WASM 边界限制，TypeScript 类型声明中这些函数的参数和返回值类型均为 `any`，实际数据结构以本文档为准。
:::

## 下一步

- [架构与兼容性规则](./architecture) — 了解兼容性判定算法的内部实现
- [构建指南](./build) — 构建和测试 WASM 模块
