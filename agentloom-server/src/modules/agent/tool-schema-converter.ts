import {
  Type,
  TypeGuard,
  type TLiteralValue,
  type TSchema,
} from '@sinclair/typebox';
import { asSchema, type FlexibleSchema } from 'ai';
import { z } from 'zod';

type ZodAny = z.ZodType;

interface ZodDefBase {
  type: string;
}

interface ZodOptionalDef extends ZodDefBase {
  type: 'optional';
  innerType: ZodAny;
}

interface ZodNullableDef extends ZodDefBase {
  type: 'nullable';
  innerType: ZodAny;
}

interface ZodArrayDef extends ZodDefBase {
  type: 'array';
  element: ZodAny;
}

interface ZodObjectDef extends ZodDefBase {
  type: 'object';
  shape: Record<string, ZodAny>;
}

interface ZodEnumDef extends ZodDefBase {
  type: 'enum';
  entries: Record<string, string>;
}

type ZodDef =
  | ZodDefBase
  | ZodOptionalDef
  | ZodNullableDef
  | ZodArrayDef
  | ZodObjectDef
  | ZodEnumDef;

const DEFAULT_FLEXIBLE_SCHEMA_JSON = {
  type: 'object',
  properties: {},
  additionalProperties: true,
} satisfies Record<string, unknown>;

export function zodToTypeBox(schema: ZodAny): TSchema {
  const def = schema._def as ZodDef;
  const opts = schema.description ? { description: schema.description } : {};

  switch (def.type) {
    case 'string':
      return Type.String(opts);

    case 'number':
      return Type.Number(opts);

    case 'boolean':
      return Type.Boolean(opts);

    case 'optional': {
      const optDef = def as ZodOptionalDef;
      return Type.Optional(zodToTypeBox(optDef.innerType));
    }

    case 'nullable': {
      const nullDef = def as ZodNullableDef;
      const inner = zodToTypeBox(nullDef.innerType);
      return Type.Union([inner, Type.Null()]);
    }

    case 'array': {
      const arrDef = def as ZodArrayDef;
      const items = zodToTypeBox(arrDef.element);
      return Type.Array(items, opts);
    }

    case 'enum': {
      const enumDef = def as ZodEnumDef;
      const values = Object.keys(enumDef.entries);
      const literals = values.map((v) => Type.Literal(v));
      return Type.Union(literals as unknown as [TSchema, ...TSchema[]], opts);
    }

    case 'object': {
      const objDef = def as ZodObjectDef;
      const properties: Record<string, TSchema> = {};
      for (const [key, value] of Object.entries(objDef.shape)) {
        properties[key] = zodToTypeBox(value);
      }
      return Type.Object(properties, opts);
    }

    default:
      throw new Error(
        `zodToTypeBox: unsupported Zod schema type "${def.type}". ` +
          `Only declarative schemas are supported (no transform/refine/pipe).`,
      );
  }
}

/**
 * @param _skipOptional - Internal flag. TypeBox Optional schemas pass all type
 *   guard checks (e.g. IsString returns true for Optional<String>). Without
 *   this flag, the first recursive call would re-enter the IsOptional branch
 *   causing infinite recursion. Pass true to skip the Optional guard on the
 *   second call and let the underlying type checks handle conversion.
 */
export function typeBoxToZod(schema: TSchema, _skipOptional = false): ZodAny {
  if (!_skipOptional && TypeGuard.IsOptional(schema)) {
    return typeBoxToZod(schema, true).optional();
  }

  const desc = (schema as { description?: string }).description;
  const withDesc = <T extends ZodAny>(s: T): T => (desc ? s.describe(desc) : s);

  if (TypeGuard.IsString(schema)) {
    return withDesc(z.string());
  }

  if (TypeGuard.IsNumber(schema)) {
    return withDesc(z.number());
  }

  if (TypeGuard.IsBoolean(schema)) {
    return withDesc(z.boolean());
  }

  if (TypeGuard.IsNull(schema)) {
    return z.null();
  }

  if (TypeGuard.IsLiteral(schema)) {
    const value = (schema as { const: TLiteralValue }).const;
    return z.literal(value);
  }

  if (TypeGuard.IsArray(schema)) {
    const items = typeBoxToZod(schema.items);
    return withDesc(z.array(items));
  }

  if (TypeGuard.IsObject(schema)) {
    const objSchema = schema;
    const required: string[] = Array.isArray(objSchema.required)
      ? objSchema.required
      : [];
    const shape: Record<string, ZodAny> = {};
    for (const [key, val] of Object.entries(objSchema.properties)) {
      const converted = typeBoxToZod(val);
      if (TypeGuard.IsOptional(val)) {
        shape[key] = converted;
      } else {
        shape[key] = required.includes(key) ? converted : converted.optional();
      }
    }
    return withDesc(z.object(shape));
  }

  if (TypeGuard.IsUnion(schema)) {
    const unionSchema = schema;

    if (TypeGuard.IsUnionLiteral(schema)) {
      const values = unionSchema.anyOf.map((item) => {
        const lit = item as unknown as { const: string };
        if (typeof lit.const !== 'string') {
          throw new Error(
            `typeBoxToZod: union literal enum only supports string literals, got "${typeof lit.const}"`,
          );
        }
        return lit.const;
      }) as [string, ...string[]];
      return withDesc(z.enum(values));
    }

    const nullIndex = unionSchema.anyOf.findIndex((item) =>
      TypeGuard.IsNull(item),
    );
    if (nullIndex !== -1 && unionSchema.anyOf.length === 2) {
      const nonNullItem = unionSchema.anyOf[nullIndex === 0 ? 1 : 0];
      const inner = typeBoxToZod(nonNullItem);
      return withDesc(inner.nullable());
    }

    throw new Error(
      `typeBoxToZod: unsupported Union type. ` +
        `Only string literal unions (enum) and 2-member nullable unions are supported.`,
    );
  }

  throw new Error(
    `typeBoxToZod: unsupported TypeBox schema kind. ` +
      `Schema: ${JSON.stringify(schema)}`,
  );
}

/**
 * 把 flexible schema 归一化为 pi 工具 `parameters` 需要的**纯 JSON Schema** 对象。
 *
 * 这里刻意不套 `Type.Unsafe()`：pi-ai 0.84 的 `validateToolArguments` 只在
 * `parameters` 上**没有** `Symbol.for("TypeBox.Kind")` 时才走 `coerceWithJsonSchema`
 * 回退分支，而该分支正是 `"5" -> 5` 这类入参强制转换的唯一来源。
 * `@sinclair/typebox@0.34`（含 `Type.Unsafe`）会挂上这个 legacy symbol，
 * 于是 0.84 改用 `typebox@1` 的 `Value.Convert` 处理它——但 v1 认不出 0.34 的
 * 内部表示，转换静默失效，LLM 传字符串数字就会校验失败。
 * 0.62 用 Ajv（`coerceTypes`）做校验，本来是会转换的；返回纯 JSON Schema
 * 才能保住这个行为。
 */
export function flexibleSchemaToJsonSchema(
  schema?: FlexibleSchema<Record<string, unknown>> | null,
): Record<string, unknown> {
  if (!schema) {
    return { ...DEFAULT_FLEXIBLE_SCHEMA_JSON };
  }

  return normalizeFlexibleSchemaJson(asSchema(schema).jsonSchema);
}

export function normalizeFlexibleSchemaJson(
  schema: unknown,
): Record<string, unknown> {
  if (!isPlainObject(schema)) {
    return { ...DEFAULT_FLEXIBLE_SCHEMA_JSON };
  }

  return normalizeSchemaNode(schema);
}

function normalizeSchemaNode(
  node: Record<string, unknown>,
): Record<string, unknown> {
  const normalizedEntries = Object.entries(node)
    .filter(([key]) => key !== '$schema')
    .map(([key, value]) => [key, normalizeSchemaValue(value)] as const);

  return Object.fromEntries(normalizedEntries);
}

function normalizeSchemaValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) =>
      isPlainObject(item) ? normalizeSchemaNode(item) : item,
    );
  }

  if (isPlainObject(value)) {
    return normalizeSchemaNode(value);
  }

  return value;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
