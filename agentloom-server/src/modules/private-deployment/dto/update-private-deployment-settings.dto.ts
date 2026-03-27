import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const SMTP_PASSWORD_SECRET_REF_PATTERN =
  /^private-deployment:\/\/organizations\/[0-9a-f-]+\/smtp\/password$/;
const LLM_PROXY_API_KEY_SECRET_REF_PATTERN =
  /^private-deployment:\/\/organizations\/[0-9a-f-]+\/llm-proxy\/api-key$/;

const NullableIsoDatetimeSchema = z
  .string()
  .trim()
  .min(1, '时间不能为空')
  .refine((value) => !Number.isNaN(Date.parse(value)), {
    message: '时间格式不正确',
  })
  .nullable();

const UpdatePrivateDeploymentSmtpSchema = z
  .object({
    host: z.string().trim().min(1, 'SMTP 主机不能为空').nullable(),
    port: z
      .int({ message: 'SMTP 端口必须是整数' })
      .positive('SMTP 端口必须大于 0')
      .nullable(),
    username: z.string().trim().min(1, 'SMTP 用户名不能为空').nullable(),
    passwordSecretRef: z
      .string()
      .trim()
      .min(1, 'SMTP 密码引用不能为空')
      .regex(SMTP_PASSWORD_SECRET_REF_PATTERN, 'SMTP 密码引用格式不正确')
      .nullable()
      .optional(),
    fromEmail: z.string().email('发件邮箱格式不正确').nullable(),
    useTls: z.boolean(),
    password: z
      .string()
      .trim()
      .min(1, 'SMTP 密码不能为空')
      .nullable()
      .optional(),
  })
  .strict();

const UpdatePrivateDeploymentLlmProxySchema = z
  .object({
    mode: z.enum(['direct', 'private_cloud', 'enterprise_proxy']),
    baseUrl: z.string().url('LLM 代理地址格式不正确').nullable(),
    apiKeySecretRef: z
      .string()
      .trim()
      .min(1, 'LLM API Key 引用不能为空')
      .regex(LLM_PROXY_API_KEY_SECRET_REF_PATTERN, 'LLM API Key 引用格式不正确')
      .nullable()
      .optional(),
    allowExternalEgress: z.boolean(),
    apiKey: z
      .string()
      .trim()
      .min(1, 'LLM API Key 不能为空')
      .nullable()
      .optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      (value.mode === 'private_cloud' || value.mode === 'enterprise_proxy') &&
      !value.baseUrl
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'LLM 代理地址不能为空',
        path: ['baseUrl'],
      });
    }

    if (value.mode === 'enterprise_proxy' && !value.allowExternalEgress) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'enterprise_proxy 模式必须允许外部出口',
        path: ['allowExternalEgress'],
      });
    }
  });

const UpdatePrivateDeploymentCertificatesSchema = z
  .object({
    source: z.enum(['uploaded', 'secretRef', 'ingress-managed']),
    tlsSecretRef: z
      .string()
      .trim()
      .min(1, 'TLS Secret 引用不能为空')
      .nullable(),
    expiresAt: NullableIsoDatetimeSchema,
    certificatePem: z
      .string()
      .trim()
      .min(1, '证书内容不能为空')
      .nullable()
      .optional(),
    privateKeyPem: z
      .string()
      .trim()
      .min(1, '证书私钥不能为空')
      .nullable()
      .optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.source === 'secretRef' && !value.tlsSecretRef) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'TLS Secret 引用不能为空',
        path: ['tlsSecretRef'],
      });
    }
  });

const UpdatePrivateDeploymentLicenseSchema = z
  .object({
    licenseKey: z.string().trim().min(1, 'License Key 不能为空').nullable(),
  })
  .strict();

export const UpdatePrivateDeploymentSettingsSchema = z
  .object({
    smtp: UpdatePrivateDeploymentSmtpSchema.optional(),
    llmProxy: UpdatePrivateDeploymentLlmProxySchema.optional(),
    certificates: UpdatePrivateDeploymentCertificatesSchema.optional(),
    license: UpdatePrivateDeploymentLicenseSchema.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: '至少提供一个私有部署设置分组',
  });

export type UpdatePrivateDeploymentSettingsDto = z.infer<
  typeof UpdatePrivateDeploymentSettingsSchema
>;

export class UpdatePrivateDeploymentSettingsRequestDto extends createZodDto(
  UpdatePrivateDeploymentSettingsSchema,
) {}
