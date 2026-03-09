import { z } from 'zod';

// ── 核心枚举 Schema ──────────────────────────────────────────────

export const OutputStrictnessSchema = z.enum(['strict', 'flexible', 'lenient']);
export type OutputStrictness = z.infer<typeof OutputStrictnessSchema>;

export const RepairPolicySchema = z.enum(['auto', 'none', 'manual']);
export type RepairPolicy = z.infer<typeof RepairPolicySchema>;

export const OutputFormatLevelSchema = z.enum(['L1', 'L2', 'L3', 'L4']);
export type OutputFormatLevel = z.infer<typeof OutputFormatLevelSchema>;

// ── 策略配置 Schema ──────────────────────────────────────────────

export const OutputFormatStrategySchema = z.object({
  outputSchema: z.string().default(''),
  strictness: OutputStrictnessSchema.default('flexible'),
  allowDegrade: z.boolean().default(true),
  repairPolicy: RepairPolicySchema.default('auto'),
});
export type OutputFormatStrategy = z.infer<typeof OutputFormatStrategySchema>;

export const DEFAULT_OUTPUT_FORMAT_STRATEGY: OutputFormatStrategy = {
  outputSchema: '',
  strictness: 'flexible',
  allowDegrade: true,
  repairPolicy: 'auto',
};

// ── 运行时元数据 Schema ──────────────────────────────────────────

export const FormatAttemptSchema = z.object({
  level: OutputFormatLevelSchema,
  durationMs: z.number(),
  success: z.boolean(),
  error: z.string().optional(),
  rawOutput: z.string().optional(),
});
export type FormatAttempt = z.infer<typeof FormatAttemptSchema>;

export const FormatResultSchema = z.object({
  outputFormatLevel: OutputFormatLevelSchema,
  degraded: z.boolean(),
  data: z.unknown(),
  attempts: z.array(FormatAttemptSchema),
  rawText: z.string().optional(),
});
export type FormatResult = z.infer<typeof FormatResultSchema>;
