import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const nodeStatusSchema = z.enum(['active', 'draining', 'disabled']);

const nodeIdSchema = z
  .string()
  .regex(
    /^[a-z0-9][a-z0-9-]{0,31}$/,
    'Node id must be 1-32 chars of [a-z0-9-] starting with alphanumeric',
  );

// https 是硬要求：manager 只接受 mTLS，明文 http 只会在连接期才失败。
const nodeBaseUrlSchema = z
  .string()
  .url()
  .max(256)
  .refine(
    (value) => value.startsWith('https://'),
    'Node baseUrl must use https (mTLS is mandatory)',
  );

const nodeServerNameSchema = z.string().min(1).max(128);

export const createSandboxNodeSchema = z.object({
  id: nodeIdSchema,
  baseUrl: nodeBaseUrlSchema,
  serverName: nodeServerNameSchema.optional(),
  status: nodeStatusSchema.optional(),
});

export class CreateSandboxNodeDto extends createZodDto(
  createSandboxNodeSchema,
) {}

export const updateSandboxNodeSchema = z.object({
  baseUrl: nodeBaseUrlSchema.optional(),
  serverName: nodeServerNameSchema.nullable().optional(),
  status: nodeStatusSchema.optional(),
});

export class UpdateSandboxNodeDto extends createZodDto(
  updateSandboxNodeSchema,
) {}

export const deleteSandboxNodeQuerySchema = z
  .object({ force: z.enum(['true', 'false']).optional() })
  .transform((value) => ({ force: value.force === 'true' }));

export class DeleteSandboxNodeQueryDto extends createZodDto(
  deleteSandboxNodeQuerySchema,
) {}

// 响应契约独立建模，不复用请求 schema（后者带 optional/transform，会让生成的
// 客户端错误放宽真实 wire 形状）。
export const SandboxNodeCapacitySwaggerSchema = z.object({
  vmsUsed: z.number(),
  vmsLimit: z.number(),
  vcpuUsed: z.number(),
  vcpuLimit: z.number(),
  memoryMiBUsed: z.number(),
  memoryMiBLimit: z.number(),
  diskGiBUsed: z.number(),
  diskGiBLimit: z.number(),
});

export const SandboxNodeResponseSwaggerSchema = z.object({
  id: z.string(),
  baseUrl: z.string(),
  serverName: z.string().nullable(),
  status: z.enum(['active', 'draining', 'disabled']),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const SandboxNodeStatusResponseSwaggerSchema =
  SandboxNodeResponseSwaggerSchema.extend({
    healthy: z.boolean(),
    capacity: SandboxNodeCapacitySwaggerSchema.nullable(),
  });

export const SandboxNodeListResponseSwaggerSchema = z.object({
  data: z.array(SandboxNodeStatusResponseSwaggerSchema),
});

export const SandboxNodeEnvelopeSwaggerSchema = z.object({
  data: SandboxNodeResponseSwaggerSchema,
});

export class SandboxNodeListResponseSwaggerDto extends createZodDto(
  SandboxNodeListResponseSwaggerSchema,
) {}

export class SandboxNodeEnvelopeSwaggerDto extends createZodDto(
  SandboxNodeEnvelopeSwaggerSchema,
) {}

export type SandboxNodeCapacityDto = z.infer<
  typeof SandboxNodeCapacitySwaggerSchema
>;
export type SandboxNodeResponseDto = z.infer<
  typeof SandboxNodeResponseSwaggerSchema
>;
export type SandboxNodeStatusResponseDto = z.infer<
  typeof SandboxNodeStatusResponseSwaggerSchema
>;
export type SandboxNodeListResponseDto = z.infer<
  typeof SandboxNodeListResponseSwaggerSchema
>;
export type SandboxNodeEnvelopeDto = z.infer<
  typeof SandboxNodeEnvelopeSwaggerSchema
>;
