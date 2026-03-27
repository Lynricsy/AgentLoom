import {
  Type,
  TypeGuard,
  type TArray,
  type TLiteralValue,
  type TObject,
  type TSchema,
  type TUnion,
} from '@sinclair/typebox';
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
