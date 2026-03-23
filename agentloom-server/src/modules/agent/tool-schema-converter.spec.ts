import { Type, TypeGuard } from '@sinclair/typebox';
import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import { typeBoxToZod, zodToTypeBox } from './tool-schema-converter';

describe('zodToTypeBox', () => {
  it('converts z.string() to Type.String()', () => {
    const result = zodToTypeBox(z.string());
    expect(TypeGuard.IsString(result)).toBe(true);
  });

  it('converts z.number() to Type.Number()', () => {
    const result = zodToTypeBox(z.number());
    expect(TypeGuard.IsNumber(result)).toBe(true);
  });

  it('converts z.boolean() to Type.Boolean()', () => {
    const result = zodToTypeBox(z.boolean());
    expect(TypeGuard.IsBoolean(result)).toBe(true);
  });

  it('converts z.array(z.string()) to Type.Array(Type.String())', () => {
    const result = zodToTypeBox(z.array(z.string()));
    expect(TypeGuard.IsArray(result)).toBe(true);
    expect(TypeGuard.IsString((result as ReturnType<typeof Type.Array>).items)).toBe(true);
  });

  it('converts z.enum([...]) to Type.Union([Type.Literal(...)])', () => {
    const result = zodToTypeBox(z.enum(['foo', 'bar', 'baz']));
    expect(TypeGuard.IsUnionLiteral(result)).toBe(true);
    const union = result as ReturnType<typeof Type.Union>;
    expect(union.anyOf).toHaveLength(3);
    const consts = union.anyOf.map((item) => (item as { const: string }).const);
    expect(consts).toEqual(['foo', 'bar', 'baz']);
  });

  it('converts z.string().optional() to Type.Optional(Type.String())', () => {
    const result = zodToTypeBox(z.string().optional());
    expect(TypeGuard.IsOptional(result)).toBe(true);
    expect(TypeGuard.IsString(result)).toBe(true);
  });

  it('converts z.string().nullable() to Type.Union([Type.String(), Type.Null()])', () => {
    const result = zodToTypeBox(z.string().nullable());
    expect(TypeGuard.IsUnion(result)).toBe(true);
    const union = result as ReturnType<typeof Type.Union>;
    const hasNull = union.anyOf.some((item) => TypeGuard.IsNull(item as Parameters<typeof TypeGuard.IsNull>[0]));
    const hasString = union.anyOf.some((item) => TypeGuard.IsString(item as Parameters<typeof TypeGuard.IsString>[0]));
    expect(hasNull).toBe(true);
    expect(hasString).toBe(true);
  });

  it('converts z.object({...}) to Type.Object({...})', () => {
    const result = zodToTypeBox(z.object({ name: z.string(), age: z.number() }));
    expect(TypeGuard.IsObject(result)).toBe(true);
    const obj = result as ReturnType<typeof Type.Object>;
    expect(TypeGuard.IsString(obj.properties.name)).toBe(true);
    expect(TypeGuard.IsNumber(obj.properties.age)).toBe(true);
    expect(obj.required).toContain('name');
    expect(obj.required).toContain('age');
  });

  it('handles nested object with mixed types', () => {
    const schema = z.object({
      user: z.object({ id: z.number(), email: z.string() }),
      active: z.boolean(),
    });
    const result = zodToTypeBox(schema);
    expect(TypeGuard.IsObject(result)).toBe(true);
    const obj = result as ReturnType<typeof Type.Object>;
    expect(TypeGuard.IsObject(obj.properties.user)).toBe(true);
    expect(TypeGuard.IsBoolean(obj.properties.active)).toBe(true);
  });

  it('marks optional object properties as not required', () => {
    const schema = z.object({ required: z.string(), opt: z.number().optional() });
    const result = zodToTypeBox(schema) as ReturnType<typeof Type.Object>;
    expect(result.required).toContain('required');
    expect(result.required).not.toContain('opt');
  });

  it('forwards .describe() as description option', () => {
    const result = zodToTypeBox(z.string().describe('a user name'));
    expect((result as { description?: string }).description).toBe('a user name');
  });

  it('converts z.array(z.object({...})) to nested array of objects', () => {
    const result = zodToTypeBox(z.array(z.object({ id: z.number() })));
    expect(TypeGuard.IsArray(result)).toBe(true);
    const items = (result as ReturnType<typeof Type.Array>).items;
    expect(TypeGuard.IsObject(items)).toBe(true);
  });

  it('throws on unsupported types like z.transform', () => {
    const schema = z.string().transform((s) => s.toUpperCase());
    expect(() => zodToTypeBox(schema)).toThrow(/unsupported/i);
  });
});

describe('typeBoxToZod', () => {
  it('converts Type.String() to z.string()', () => {
    const result = typeBoxToZod(Type.String());
    expect(result._def.type).toBe('string');
  });

  it('converts Type.Number() to z.number()', () => {
    const result = typeBoxToZod(Type.Number());
    expect(result._def.type).toBe('number');
  });

  it('converts Type.Boolean() to z.boolean()', () => {
    const result = typeBoxToZod(Type.Boolean());
    expect(result._def.type).toBe('boolean');
  });

  it('converts Type.Array(Type.String()) to z.array(z.string())', () => {
    const result = typeBoxToZod(Type.Array(Type.String()));
    expect(result._def.type).toBe('array');
    expect((result._def as { element: { _def: { type: string } } }).element._def.type).toBe('string');
  });

  it('converts Type.Union([Type.Literal(...)]) to z.enum([...])', () => {
    const result = typeBoxToZod(Type.Union([Type.Literal('a'), Type.Literal('b'), Type.Literal('c')]));
    expect(result._def.type).toBe('enum');
    const entries = (result._def as { entries: Record<string, string> }).entries;
    expect(Object.keys(entries)).toEqual(['a', 'b', 'c']);
  });

  it('converts Type.Union([T, Type.Null()]) to z.nullable()', () => {
    const result = typeBoxToZod(Type.Union([Type.Number(), Type.Null()]));
    expect(result._def.type).toBe('nullable');
    expect((result._def as { innerType: { _def: { type: string } } }).innerType._def.type).toBe('number');
  });

  it('converts Type.Object({...}) to z.object({...})', () => {
    const result = typeBoxToZod(Type.Object({ x: Type.String(), y: Type.Number() }));
    expect(result._def.type).toBe('object');
    const shape = (result._def as { shape: Record<string, { _def: { type: string } }> }).shape;
    expect(shape.x._def.type).toBe('string');
    expect(shape.y._def.type).toBe('number');
  });

  it('marks missing-from-required properties as optional', () => {
    const result = typeBoxToZod(Type.Object({ x: Type.String(), y: Type.Optional(Type.Number()) }));
    const shape = (result._def as { shape: Record<string, { _def: { type: string } }> }).shape;
    expect(shape.x._def.type).toBe('string');
    expect(shape.y._def.type).toBe('optional');
  });

  it('converts Type.Optional(Type.String()) to z.string().optional()', () => {
    const result = typeBoxToZod(Type.Optional(Type.String()));
    expect(result._def.type).toBe('optional');
    expect((result._def as { innerType: { _def: { type: string } } }).innerType._def.type).toBe('string');
  });

  it('forwards description to Zod schema', () => {
    const result = typeBoxToZod(Type.String({ description: 'hello world' }));
    expect(result.description).toBe('hello world');
  });

  it('converts nested object', () => {
    const schema = Type.Object({
      user: Type.Object({ id: Type.Number(), name: Type.String() }),
      tags: Type.Array(Type.String()),
    });
    const result = typeBoxToZod(schema);
    expect(result._def.type).toBe('object');
    const shape = (result._def as { shape: Record<string, { _def: { type: string } }> }).shape;
    expect(shape.user._def.type).toBe('object');
    expect(shape.tags._def.type).toBe('array');
  });
});

describe('round-trip', () => {
  it('zodToTypeBox → typeBoxToZod produces equivalent object schema', () => {
    const original = z.object({
      name: z.string().describe('the name'),
      count: z.number(),
      active: z.boolean().optional(),
      tags: z.array(z.string()),
    });
    const typeBox = zodToTypeBox(original);
    const roundTripped = typeBoxToZod(typeBox);
    const shape = (roundTripped._def as { shape: Record<string, { _def: { type: string }; description?: string }> }).shape;
    expect(shape.name._def.type).toBe('string');
    expect(shape.name.description).toBe('the name');
    expect(shape.count._def.type).toBe('number');
    expect(shape.active._def.type).toBe('optional');
    expect(shape.tags._def.type).toBe('array');
  });

  it('zodToTypeBox → typeBoxToZod preserves enum values', () => {
    const original = z.enum(['red', 'green', 'blue']);
    const roundTripped = typeBoxToZod(zodToTypeBox(original));
    expect(roundTripped._def.type).toBe('enum');
    const entries = (roundTripped._def as { entries: Record<string, string> }).entries;
    expect(Object.keys(entries)).toEqual(['red', 'green', 'blue']);
  });

  it('zodToTypeBox → typeBoxToZod preserves nullable', () => {
    const original = z.string().nullable();
    const roundTripped = typeBoxToZod(zodToTypeBox(original));
    expect(roundTripped._def.type).toBe('nullable');
  });
});
