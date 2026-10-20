/**
 * 生成应用 AppSpec v2 契约（ADR-0007）。
 *
 * 两个层次：
 * - `GeneratedAppSpecDraftSchema`：模型输出。只包含必须从需求推导的部分（需求、表单、绑定选择、
 *   结果视图、带浏览器步骤的验收场景），作为结构化输出 schema 交给模型。
 * - `GeneratedAppSpecV2Schema`：持久化到 `generated_apps.app_spec` 并经 API 返回的完整形状。
 *   服务端在草稿之上补充平台需求、页面、数据策略、范围边界、traceability、固定的绑定版本与生成元数据，
 *   再整体校验（含跨字段引用）。
 *
 * 两个 schema 的跨字段规则共用 `collectAppSpecReferenceIssues`，草稿阶段的问题列表直接作为
 * 模型自我修复的反馈。
 */
import { z } from 'zod';

// ─── 上限 ─────────────────────────────────────────────────────────

export const GENERATED_APP_SPEC_LIMITS = {
  promptMaxLength: 4000,
  appNameMaxLength: 48,
  summaryMaxLength: 400,
  requirementsMax: 12,
  fieldsMax: 20,
  fieldLabelMaxLength: 40,
  fieldHelpTextMaxLength: 200,
  textMaxLengthCeiling: 4000,
  optionsMax: 30,
  optionValueMaxLength: 64,
  resultSectionsMax: 6,
  scenariosMax: 8,
  /** Gate 5 实际执行的 requirement 场景上限（每个视口） */
  browserScenariosMax: 5,
  browserStepsMax: 30,
} as const;

/** 同一次 Gate 0 内「模型生成 → 校验 → 带问题列表重试」的最大尝试次数 */
export const GENERATED_APP_SPEC_MAX_ATTEMPTS = 3;

const ID_PATTERN = /^[a-z][a-z0-9-]{0,47}$/;
/** 表单字段 id 同时是提交 JSON 的键与 Playwright 定位用的 data-field-id */
export const GENERATED_APP_FIELD_ID_PATTERN = /^[a-z][a-zA-Z0-9_]{0,39}$/;

const idSchema = z
  .string()
  .regex(ID_PATTERN, 'id 只能是小写字母开头的 kebab-case');
const requirementIdSchema = z
  .string()
  .regex(/^req-[a-z0-9-]{1,40}$/, '需求 id 必须形如 req-xxx');
const scenarioIdSchema = z
  .string()
  .regex(/^scenario-[a-z0-9-]{1,40}$/, '场景 id 必须形如 scenario-xxx');
const fieldIdSchema = z
  .string()
  .regex(GENERATED_APP_FIELD_ID_PATTERN, '字段 id 必须是 camelCase 标识符');
const shortText = (max: number) => z.string().trim().min(1).max(max);

// ─── 表单字段 ─────────────────────────────────────────────────────

export const GENERATED_APP_FIELD_TYPES = [
  'text',
  'textarea',
  'number',
  'single_select',
  'multi_select',
] as const;

const fieldBase = {
  id: fieldIdSchema,
  label: shortText(GENERATED_APP_SPEC_LIMITS.fieldLabelMaxLength),
  required: z.boolean(),
  helpText: z
    .string()
    .trim()
    .max(GENERATED_APP_SPEC_LIMITS.fieldHelpTextMaxLength)
    .default(''),
  placeholder: z.string().trim().max(120).default(''),
};

export const GeneratedAppFieldOptionSchema = z.object({
  value: shortText(GENERATED_APP_SPEC_LIMITS.optionValueMaxLength),
  label: shortText(GENERATED_APP_SPEC_LIMITS.optionValueMaxLength),
});

const textLengthSchema = z
  .number()
  .int()
  .positive()
  .max(GENERATED_APP_SPEC_LIMITS.textMaxLengthCeiling);

export const GeneratedAppFieldSchema = z.discriminatedUnion('type', [
  z.object({
    ...fieldBase,
    type: z.literal('text'),
    maxLength: textLengthSchema.default(200),
  }),
  z.object({
    ...fieldBase,
    type: z.literal('textarea'),
    maxLength: textLengthSchema.default(2000),
  }),
  z.object({
    ...fieldBase,
    type: z.literal('number'),
    min: z.number().optional(),
    max: z.number().optional(),
  }),
  z.object({
    ...fieldBase,
    type: z.literal('single_select'),
    options: z
      .array(GeneratedAppFieldOptionSchema)
      .min(1)
      .max(GENERATED_APP_SPEC_LIMITS.optionsMax),
  }),
  z.object({
    ...fieldBase,
    type: z.literal('multi_select'),
    options: z
      .array(GeneratedAppFieldOptionSchema)
      .min(1)
      .max(GENERATED_APP_SPEC_LIMITS.optionsMax),
  }),
]);

export const GeneratedAppInputFormSchema = z.object({
  title: shortText(60),
  description: z.string().trim().max(300).default(''),
  submitLabel: shortText(20),
  fields: z
    .array(GeneratedAppFieldSchema)
    .min(1)
    .max(GENERATED_APP_SPEC_LIMITS.fieldsMax),
});

// ─── 结果视图 ─────────────────────────────────────────────────────

export const GENERATED_APP_RESULT_FORMATS = [
  'text',
  'markdown',
  /** 数组，每项 { title?, quote?, source? }，用于答案引用 */
  'citations',
  'json',
] as const;

export const GeneratedAppResultSectionSchema = z.object({
  id: idSchema,
  label: shortText(40),
  format: z.enum(GENERATED_APP_RESULT_FORMATS),
});

export const GeneratedAppResultViewSchema = z.object({
  title: shortText(60),
  emptyState: z.string().trim().max(120).default('提交后在这里显示结果。'),
  sections: z
    .array(GeneratedAppResultSectionSchema)
    .min(1)
    .max(GENERATED_APP_SPEC_LIMITS.resultSectionsMax),
});

// ─── 绑定 ─────────────────────────────────────────────────────────

export const GeneratedAppWorkflowInputMappingSchema = z.object({
  fieldId: fieldIdSchema,
  /** 工作流 inputSchema 字段 id；工作流无 inputSchema 时为写入 inputParams 的顶层键 */
  workflowInputFieldId: z.string().trim().min(1).max(64),
});

export const GeneratedAppWorkflowOutputMappingSchema = z.object({
  sectionId: idSchema,
  /** 固定版本快照中 text-output / json-output 节点的 id */
  nodeId: z.string().trim().min(1).max(128),
  /** json-output 时可取结果对象中的一个键；省略取整个输出 */
  path: z.string().trim().min(1).max(64).optional(),
});

/** 模型在候选里选择的绑定（id 必须来自服务端提供的候选清单） */
export const GeneratedAppBindingDraftSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('workflow'),
    workflowDefinitionId: z.string().uuid(),
    inputMapping: z
      .array(GeneratedAppWorkflowInputMappingSchema)
      .max(GENERATED_APP_SPEC_LIMITS.fieldsMax),
    outputMapping: z
      .array(GeneratedAppWorkflowOutputMappingSchema)
      .min(1)
      .max(GENERATED_APP_SPEC_LIMITS.resultSectionsMax),
  }),
  z.object({
    kind: z.literal('agent'),
    agentDefinitionId: z.string().uuid(),
    /** 承接 Agent 回复的结果分区 */
    replySectionId: idSchema,
  }),
]);

/** 持久化的绑定：在草稿上固定生成时解析到的已发布版本 */
export const GeneratedAppBindingSchema = z.discriminatedUnion('kind', [
  GeneratedAppBindingDraftSchema.options[0].extend({
    workflowVersionId: z.string().uuid(),
  }),
  GeneratedAppBindingDraftSchema.options[1].extend({
    agentVersionId: z.string().uuid(),
  }),
]);

// ─── 验收场景与浏览器步骤 ───────────────────────────────────────

export const GeneratedAppBrowserStepSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('fill'),
    fieldId: fieldIdSchema,
    /** text/textarea/number 的输入值（number 以十进制字符串表示） */
    value: z.string().max(GENERATED_APP_SPEC_LIMITS.textMaxLengthCeiling),
  }),
  z.object({
    action: z.literal('select'),
    fieldId: fieldIdSchema,
    /** single_select 取一个，multi_select 取一到多个 option value */
    values: z.array(z.string().min(1)).min(1),
  }),
  z.object({ action: z.literal('submit') }),
  z.object({
    action: z.literal('expectResult'),
    sectionId: idSchema,
    assertion: z.enum(['nonEmpty', 'contains']),
    /** assertion=contains 时必填：结果分区文本应包含的片段 */
    text: z.string().trim().min(1).max(200).optional(),
  }),
]);

export const GENERATED_APP_SCENARIO_SCOPES = [
  'requirement',
  'platform',
] as const;

export const GeneratedAppAcceptanceScenarioV2Schema = z.object({
  id: scenarioIdSchema,
  title: shortText(80),
  scope: z.enum(GENERATED_APP_SCENARIO_SCOPES),
  requirementIds: z.array(requirementIdSchema).min(1),
  given: z.array(shortText(200)).min(1),
  when: z.array(shortText(200)).min(1),
  then: z.array(shortText(200)).min(1),
  /** requirement 场景必须给出可在浏览器中执行的步骤；platform 场景为空数组 */
  browserSteps: z
    .array(GeneratedAppBrowserStepSchema)
    .max(GENERATED_APP_SPEC_LIMITS.browserStepsMax),
});

// ─── 需求 ─────────────────────────────────────────────────────────

export const GENERATED_APP_REQUIREMENT_SOURCES = [
  'prompt',
  'platform',
] as const;

export const GeneratedAppRequirementSchema = z.object({
  id: requirementIdSchema,
  text: shortText(400),
  source: z.enum(GENERATED_APP_REQUIREMENT_SOURCES),
});

// ─── 模型草稿 ─────────────────────────────────────────────────────

const draftShape = {
  appName: shortText(GENERATED_APP_SPEC_LIMITS.appNameMaxLength),
  summary: shortText(GENERATED_APP_SPEC_LIMITS.summaryMaxLength),
  userGoal: shortText(400),
  actors: z.array(shortText(40)).min(1).max(6),
  /** 模型只产出 source=prompt 的需求；平台需求由服务端追加 */
  requirements: z
    .array(
      GeneratedAppRequirementSchema.extend({ source: z.literal('prompt') }),
    )
    .min(1)
    .max(GENERATED_APP_SPEC_LIMITS.requirementsMax),
  inputForm: GeneratedAppInputFormSchema,
  resultView: GeneratedAppResultViewSchema,
  binding: GeneratedAppBindingDraftSchema,
  acceptanceScenarios: z
    .array(
      GeneratedAppAcceptanceScenarioV2Schema.extend({
        scope: z.literal('requirement'),
      }),
    )
    .min(1)
    .max(GENERATED_APP_SPEC_LIMITS.scenariosMax),
};

export const GeneratedAppSpecDraftSchema = z
  .object(draftShape)
  .superRefine((draft, ctx) => {
    for (const issue of collectAppSpecReferenceIssues({
      requirements: draft.requirements,
      inputForm: draft.inputForm,
      resultView: draft.resultView,
      binding: draft.binding,
      acceptanceScenarios: draft.acceptanceScenarios,
    })) {
      ctx.addIssue({
        code: 'custom',
        path: issue.path,
        message: issue.message,
      });
    }
  });

// ─── 持久化 AppSpec v2 ───────────────────────────────────────────

export const GeneratedAppSpecV2Schema = z
  .object({
    version: z.literal(2),
    appName: draftShape.appName,
    summary: draftShape.summary,
    userGoal: draftShape.userGoal,
    actors: draftShape.actors,
    coreRequirements: z
      .array(GeneratedAppRequirementSchema)
      .min(1)
      .max(GENERATED_APP_SPEC_LIMITS.requirementsMax + 2),
    pages: z
      .array(
        z.object({
          id: idSchema,
          name: shortText(40),
          purpose: shortText(200),
        }),
      )
      .min(1),
    inputForm: GeneratedAppInputFormSchema,
    resultView: GeneratedAppResultViewSchema,
    binding: GeneratedAppBindingSchema,
    dataPolicy: z.object({
      publicSubmissionsPersisted: z.boolean(),
      creatorCanDeleteSubmissions: z.boolean(),
      endUserLoginRequired: z.boolean(),
    }),
    nonGoals: z.array(shortText(200)).min(1),
    acceptanceScenarios: z
      .array(GeneratedAppAcceptanceScenarioV2Schema)
      .min(1)
      .max(GENERATED_APP_SPEC_LIMITS.scenariosMax + 2),
    traceability: z
      .array(
        z.object({
          requirementId: requirementIdSchema,
          scenarioIds: z.array(scenarioIdSchema).min(1),
          fieldIds: z.array(fieldIdSchema),
          sectionIds: z.array(idSchema),
        }),
      )
      .min(1),
    generation: z.object({
      modelConfigId: z.string().uuid(),
      generatedAt: z.iso.datetime(),
      /** 第几次生成尝试得到该 AppSpec（1 起，含 Gate 0 自我修复） */
      attempt: z.number().int().min(1),
      /** prompt 原文的 sha256，复跑时判断需求是否变化 */
      promptSha256: z.string().regex(/^[0-9a-f]{64}$/),
    }),
  })
  .superRefine((spec, ctx) => {
    for (const issue of collectAppSpecReferenceIssues({
      requirements: spec.coreRequirements,
      inputForm: spec.inputForm,
      resultView: spec.resultView,
      binding: spec.binding,
      acceptanceScenarios: spec.acceptanceScenarios,
    })) {
      ctx.addIssue({
        code: 'custom',
        path: issue.path,
        message: issue.message,
      });
    }

    const requirementIds = new Set(spec.coreRequirements.map((r) => r.id));
    spec.traceability.forEach((entry, index) => {
      if (!requirementIds.has(entry.requirementId)) {
        ctx.addIssue({
          code: 'custom',
          path: ['traceability', index, 'requirementId'],
          message: `traceability 引用了不存在的需求 ${entry.requirementId}`,
        });
      }
    });
    for (const requirement of spec.coreRequirements) {
      if (!spec.traceability.some((e) => e.requirementId === requirement.id)) {
        ctx.addIssue({
          code: 'custom',
          path: ['traceability'],
          message: `需求 ${requirement.id} 缺少 traceability`,
        });
      }
    }
  });

export type GeneratedAppField = z.infer<typeof GeneratedAppFieldSchema>;
export type GeneratedAppFieldType = (typeof GENERATED_APP_FIELD_TYPES)[number];
export type GeneratedAppInputForm = z.infer<typeof GeneratedAppInputFormSchema>;
export type GeneratedAppResultSection = z.infer<
  typeof GeneratedAppResultSectionSchema
>;
export type GeneratedAppResultView = z.infer<
  typeof GeneratedAppResultViewSchema
>;
export type GeneratedAppBindingDraft = z.infer<
  typeof GeneratedAppBindingDraftSchema
>;
export type GeneratedAppBinding = z.infer<typeof GeneratedAppBindingSchema>;
export type GeneratedAppBrowserStep = z.infer<
  typeof GeneratedAppBrowserStepSchema
>;
export type GeneratedAppAcceptanceScenarioV2 = z.infer<
  typeof GeneratedAppAcceptanceScenarioV2Schema
>;
export type GeneratedAppRequirement = z.infer<
  typeof GeneratedAppRequirementSchema
>;
export type GeneratedAppSpecDraft = z.infer<typeof GeneratedAppSpecDraftSchema>;
export type GeneratedAppSpecV2 = z.infer<typeof GeneratedAppSpecV2Schema>;

// ─── 跨字段引用规则 ───────────────────────────────────────────────

export interface AppSpecReferenceIssue {
  path: Array<string | number>;
  message: string;
}

interface AppSpecReferenceInput {
  requirements: ReadonlyArray<{ id: string; source: string }>;
  inputForm: GeneratedAppInputForm;
  resultView: GeneratedAppResultView;
  binding: GeneratedAppBindingDraft;
  acceptanceScenarios: readonly GeneratedAppAcceptanceScenarioV2[];
}

/**
 * 只依赖 AppSpec 自身的引用一致性规则。依赖租户数据的规则（绑定目标存在且已发布、
 * 输入映射与工作流 inputSchema 兼容、输出节点存在）由绑定解析器在 Gate 0 检查。
 */
export function collectAppSpecReferenceIssues(
  input: AppSpecReferenceInput,
): AppSpecReferenceIssue[] {
  const issues: AppSpecReferenceIssue[] = [];
  const fields = new Map<string, GeneratedAppField>();
  input.inputForm.fields.forEach((field, index) => {
    if (fields.has(field.id)) {
      issues.push({
        path: ['inputForm', 'fields', index, 'id'],
        message: `字段 id ${field.id} 重复`,
      });
    }
    fields.set(field.id, field);
    if (
      (field.type === 'single_select' || field.type === 'multi_select') &&
      new Set(field.options.map((o) => o.value)).size !== field.options.length
    ) {
      issues.push({
        path: ['inputForm', 'fields', index, 'options'],
        message: `字段 ${field.id} 的选项 value 重复`,
      });
    }
    if (
      field.type === 'number' &&
      field.min !== undefined &&
      field.max !== undefined &&
      field.min > field.max
    ) {
      issues.push({
        path: ['inputForm', 'fields', index, 'min'],
        message: `字段 ${field.id} 的 min 大于 max`,
      });
    }
  });

  const sectionIds = new Set<string>();
  input.resultView.sections.forEach((section, index) => {
    if (sectionIds.has(section.id)) {
      issues.push({
        path: ['resultView', 'sections', index, 'id'],
        message: `结果分区 id ${section.id} 重复`,
      });
    }
    sectionIds.add(section.id);
  });

  const requirementIds = new Set<string>();
  input.requirements.forEach((requirement, index) => {
    if (requirementIds.has(requirement.id)) {
      issues.push({
        path: ['requirements', index, 'id'],
        message: `需求 id ${requirement.id} 重复`,
      });
    }
    requirementIds.add(requirement.id);
  });

  const binding = input.binding;
  if (binding.kind === 'workflow') {
    const mappedFields = new Set<string>();
    const mappedTargets = new Set<string>();
    binding.inputMapping.forEach((mapping, index) => {
      if (!fields.has(mapping.fieldId)) {
        issues.push({
          path: ['binding', 'inputMapping', index, 'fieldId'],
          message: `输入映射引用了不存在的字段 ${mapping.fieldId}`,
        });
      }
      if (mappedFields.has(mapping.fieldId)) {
        issues.push({
          path: ['binding', 'inputMapping', index, 'fieldId'],
          message: `字段 ${mapping.fieldId} 被映射了多次`,
        });
      }
      if (mappedTargets.has(mapping.workflowInputFieldId)) {
        issues.push({
          path: ['binding', 'inputMapping', index, 'workflowInputFieldId'],
          message: `工作流输入 ${mapping.workflowInputFieldId} 被多个字段映射`,
        });
      }
      mappedFields.add(mapping.fieldId);
      mappedTargets.add(mapping.workflowInputFieldId);
    });
    for (const fieldId of fields.keys()) {
      if (!mappedFields.has(fieldId)) {
        issues.push({
          path: ['binding', 'inputMapping'],
          message: `字段 ${fieldId} 没有映射到工作流输入，提交后会被丢弃`,
        });
      }
    }
    const mappedSections = new Set<string>();
    binding.outputMapping.forEach((mapping, index) => {
      if (!sectionIds.has(mapping.sectionId)) {
        issues.push({
          path: ['binding', 'outputMapping', index, 'sectionId'],
          message: `输出映射引用了不存在的结果分区 ${mapping.sectionId}`,
        });
      }
      mappedSections.add(mapping.sectionId);
    });
    for (const sectionId of sectionIds) {
      if (!mappedSections.has(sectionId)) {
        issues.push({
          path: ['binding', 'outputMapping'],
          message: `结果分区 ${sectionId} 没有对应的工作流输出`,
        });
      }
    }
  } else {
    if (!sectionIds.has(binding.replySectionId)) {
      issues.push({
        path: ['binding', 'replySectionId'],
        message: `Agent 回复分区 ${binding.replySectionId} 不存在`,
      });
    }
    if (sectionIds.size !== 1) {
      issues.push({
        path: ['resultView', 'sections'],
        message: 'Agent 绑定只有一路回复，结果视图必须恰好一个分区',
      });
    }
  }

  const scenarioIds = new Set<string>();
  const verifiedRequirements = new Set<string>();
  input.acceptanceScenarios.forEach((scenario, index) => {
    const path = ['acceptanceScenarios', index];
    if (scenarioIds.has(scenario.id)) {
      issues.push({
        path: [...path, 'id'],
        message: `场景 id ${scenario.id} 重复`,
      });
    }
    scenarioIds.add(scenario.id);
    for (const requirementId of scenario.requirementIds) {
      if (!requirementIds.has(requirementId)) {
        issues.push({
          path: [...path, 'requirementIds'],
          message: `场景 ${scenario.id} 引用了不存在的需求 ${requirementId}`,
        });
      }
    }

    if (scenario.scope === 'platform') {
      if (scenario.browserSteps.length > 0) {
        issues.push({
          path: [...path, 'browserSteps'],
          message: `平台流程场景 ${scenario.id} 不应包含浏览器步骤`,
        });
      }
      return;
    }

    issues.push(
      ...collectBrowserStepIssues(scenario, fields, sectionIds).map(
        (message) => ({ path: [...path, 'browserSteps'], message }),
      ),
    );
    for (const requirementId of scenario.requirementIds) {
      verifiedRequirements.add(requirementId);
    }
  });

  for (const requirement of input.requirements) {
    if (
      requirement.source === 'prompt' &&
      !verifiedRequirements.has(requirement.id)
    ) {
      issues.push({
        path: ['acceptanceScenarios'],
        message: `需求 ${requirement.id} 没有 requirement 验收场景`,
      });
    }
  }

  return issues;
}

function collectBrowserStepIssues(
  scenario: GeneratedAppAcceptanceScenarioV2,
  fields: ReadonlyMap<string, GeneratedAppField>,
  sectionIds: ReadonlySet<string>,
): string[] {
  const issues: string[] = [];
  const touched = new Set<string>();
  let submitIndex = -1;
  let expectAfterSubmit = false;

  scenario.browserSteps.forEach((step, index) => {
    switch (step.action) {
      case 'fill': {
        const field = fields.get(step.fieldId);
        if (!field) {
          issues.push(`步骤 ${index} 填写了不存在的字段 ${step.fieldId}`);
          break;
        }
        if (field.type === 'single_select' || field.type === 'multi_select') {
          issues.push(`步骤 ${index} 对选择字段 ${step.fieldId} 应使用 select`);
        } else if (
          field.type === 'number' &&
          !Number.isFinite(Number(step.value))
        ) {
          issues.push(`步骤 ${index} 给数字字段 ${step.fieldId} 填了非数字`);
        } else if (
          field.type !== 'number' &&
          step.value.length > field.maxLength
        ) {
          issues.push(`步骤 ${index} 的值超过字段 ${step.fieldId} 的长度上限`);
        }
        touched.add(step.fieldId);
        break;
      }
      case 'select': {
        const field = fields.get(step.fieldId);
        if (
          !field ||
          (field.type !== 'single_select' && field.type !== 'multi_select')
        ) {
          issues.push(`步骤 ${index} 选择了不存在的选择字段 ${step.fieldId}`);
          break;
        }
        if (field.type === 'single_select' && step.values.length !== 1) {
          issues.push(`步骤 ${index} 单选字段 ${step.fieldId} 只能选一个值`);
        }
        const allowed = new Set(field.options.map((o) => o.value));
        for (const value of step.values) {
          if (!allowed.has(value)) {
            issues.push(
              `步骤 ${index} 的值 ${value} 不在字段 ${step.fieldId} 的选项中`,
            );
          }
        }
        touched.add(step.fieldId);
        break;
      }
      case 'submit':
        if (submitIndex >= 0) issues.push(`步骤 ${index} 重复提交`);
        submitIndex = index;
        break;
      case 'expectResult':
        if (!sectionIds.has(step.sectionId)) {
          issues.push(`步骤 ${index} 断言了不存在的结果分区 ${step.sectionId}`);
        }
        if (step.assertion === 'contains' && !step.text) {
          issues.push(`步骤 ${index} 的 contains 断言缺少 text`);
        }
        if (submitIndex < 0) {
          issues.push(`步骤 ${index} 的结果断言出现在提交之前`);
        } else {
          expectAfterSubmit = true;
        }
        break;
    }
  });

  for (const [fieldId, field] of fields) {
    if (field.required && !touched.has(fieldId)) {
      issues.push(`场景没有填写必填字段 ${fieldId}`);
    }
  }
  if (submitIndex < 0) issues.push('场景缺少 submit 步骤');
  if (!expectAfterSubmit) issues.push('场景缺少提交后的 expectResult 断言');
  return issues;
}
