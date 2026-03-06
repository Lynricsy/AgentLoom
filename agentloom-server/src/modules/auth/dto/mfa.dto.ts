import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const MfaVerifySchema = z.object({
  factorId: z.uuid('无效的因子 ID'),
  code: z
    .string()
    .length(6, 'TOTP 验证码必须为 6 位')
    .regex(/^\d{6}$/, 'TOTP 验证码必须为 6 位数字'),
});

export class MfaVerifyDto extends createZodDto(MfaVerifySchema) {}

const MfaDisableSchema = z.object({
  factorId: z.uuid('无效的因子 ID'),
  code: z
    .string()
    .length(6, 'TOTP 验证码必须为 6 位')
    .regex(/^\d{6}$/, 'TOTP 验证码必须为 6 位数字'),
});

export class MfaDisableDto extends createZodDto(MfaDisableSchema) {}

const MfaLoginVerifySchema = z.object({
  mfaToken: z.string().min(1, 'MFA 令牌不能为空'),
  factorId: z.uuid('无效的因子 ID'),
  code: z
    .string()
    .length(6, 'TOTP 验证码必须为 6 位')
    .regex(/^\d{6}$/, 'TOTP 验证码必须为 6 位数字'),
});

export class MfaLoginVerifyDto extends createZodDto(MfaLoginVerifySchema) {}
