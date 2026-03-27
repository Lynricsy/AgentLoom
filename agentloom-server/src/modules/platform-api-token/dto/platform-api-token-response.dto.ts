import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export interface PlatformApiTokenResponse {
  id: string;
  name: string;
  tokenPrefix: string;
  scopes: string | null;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  isRevoked: boolean;
  createdAt: Date;
}

/** 仅在创建时一次性返回完整明文 token */
export interface PlatformApiTokenCreateResponse extends PlatformApiTokenResponse {
  token: string;
}

const IsoDatetimeSchema = z.iso.datetime();

export const PlatformApiTokenResponseSwaggerSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  tokenPrefix: z.string(),
  scopes: z.string().nullable(),
  lastUsedAt: IsoDatetimeSchema.nullable(),
  expiresAt: IsoDatetimeSchema.nullable(),
  isRevoked: z.boolean(),
  createdAt: IsoDatetimeSchema,
});

export const PlatformApiTokenCreateResponseSwaggerSchema =
  PlatformApiTokenResponseSwaggerSchema.extend({
    token: z.string(),
  });

export const PlatformApiTokenListMetaSwaggerSchema = z.object({
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
  total: z.number().int().min(0),
});

export const PlatformApiTokenCreateEnvelopeSwaggerSchema = z.object({
  data: PlatformApiTokenCreateResponseSwaggerSchema,
});

export const PlatformApiTokenListResponseSwaggerSchema = z.object({
  data: z.array(PlatformApiTokenResponseSwaggerSchema),
  meta: PlatformApiTokenListMetaSwaggerSchema,
});

export class PlatformApiTokenCreateResponseSwaggerDto extends createZodDto(
  PlatformApiTokenCreateResponseSwaggerSchema,
) {}

export class PlatformApiTokenCreateEnvelopeSwaggerDto extends createZodDto(
  PlatformApiTokenCreateEnvelopeSwaggerSchema,
) {}

export class PlatformApiTokenListResponseSwaggerDto extends createZodDto(
  PlatformApiTokenListResponseSwaggerSchema,
) {}
