import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const FactorIdSchema = z.string().uuid('无效的因子 ID');
const VerificationCodeSchema = z
  .string()
  .length(6, 'TOTP 验证码必须为 6 位')
  .regex(/^\d{6}$/, 'TOTP 验证码必须为 6 位数字');

const MfaVerifySchema = z.object({
  factor_id: FactorIdSchema.optional(),
  factorId: FactorIdSchema.optional(),
  code: VerificationCodeSchema,
}).superRefine((value, ctx) => {
  if (!value.factor_id && !value.factorId) {
    ctx.addIssue({
      code: 'custom',
      path: ['factor_id'],
      message: '无效的因子 ID',
    });
  }
});

export class MfaVerifyDto extends createZodDto(MfaVerifySchema) {}

const MfaDisableSchema = z.object({
  code: VerificationCodeSchema,
});

export class MfaDisableDto extends createZodDto(MfaDisableSchema) {}

const MfaLoginVerifySchema = z.object({
  mfa_token: z.string().min(1, 'MFA 令牌不能为空').optional(),
  mfaToken: z.string().min(1, 'MFA 令牌不能为空').optional(),
  factor_id: FactorIdSchema.optional(),
  factorId: FactorIdSchema.optional(),
  code: VerificationCodeSchema,
}).superRefine((value, ctx) => {
  if (!value.mfa_token && !value.mfaToken) {
    ctx.addIssue({
      code: 'custom',
      path: ['mfa_token'],
      message: 'MFA 令牌不能为空',
    });
  }

  if (!value.factor_id && !value.factorId) {
    ctx.addIssue({
      code: 'custom',
      path: ['factor_id'],
      message: '无效的因子 ID',
    });
  }
});

export class MfaLoginVerifyDto extends createZodDto(MfaLoginVerifySchema) {}
