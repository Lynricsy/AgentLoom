/**
 * v1 固定字段表单（过渡期遗留）。
 *
 * 只剩 v1 Gate 3 工作区物化与 Gate 4 集成计划在用；公开运行时已改用 AppSpec v2 表单
 * （generated-app.runtime.ts）。集成切片改写 Gate 3/4 时整文件删除。
 */
import type {
  GeneratedAppGenerationPlan,
  GeneratedAppSpecV1,
} from '../../database/schema';
import type { GeneratedAppRecordV1 } from './generated-app.internal';


export type PublicGeneratedAppRuntimeFieldType =
  'text' | 'textarea' | 'single_select' | 'multi_select' | 'number' | 'range';

export interface PublicGeneratedAppRuntimeFormOptionDto {
  value: string;
  label: string;
}

export interface PublicGeneratedAppRuntimeFieldDto {
  id: string;
  label: string;
  type: PublicGeneratedAppRuntimeFieldType;
  required: boolean;
  placeholder: string;
  helpText: string;
  options: PublicGeneratedAppRuntimeFormOptionDto[];
  min?: number;
  max?: number;
  step?: number;
}

export interface PublicGeneratedAppRuntimeFormSectionDto {
  id: string;
  title: string;
  description: string;
  fieldIds: string[];
}

export interface PublicGeneratedAppRuntimeResultViewDto {
  title: string;
  description: string;
  emptyState: string;
  successTitle: string;
  nextStepHint: string;
}

export interface PublicGeneratedAppRuntimeFormDto {
  formId: string;
  title: string;
  description: string;
  submitLabel: string;
  sections: PublicGeneratedAppRuntimeFormSectionDto[];
  fields: PublicGeneratedAppRuntimeFieldDto[];
  resultView: PublicGeneratedAppRuntimeResultViewDto;
}

const REDACTED_TOKEN_VALUE = '[REDACTED_TOKEN]';

const REDACTED_PATH_VALUE = '[REDACTED_PATH]';

const REDACTED_INTERNAL_VALUE = '[REDACTED_INTERNAL]';

const DEFAULT_PUBLIC_APP_NAME = 'Generated App';

const MAX_STRING_LENGTH = 1000;

const SENSITIVE_KEY_PATTERN =
  /(authorization|api[-_]?key|token|secret|password|passwd|credential|private[-_]?key|cookie|session|public[-_]?share|readiness|gate[-_]?results?|generation[-_]?plan|source[-_]?artifact|test[-_]?report|plugin[-_]?ids?|internal)/i;

const TOKEN_LIKE_VALUE_PATTERN =
  /\b(?:Bearer\s+[A-Za-z0-9._~+/-]{8,}|sk-[A-Za-z0-9_-]{8,}|[A-Za-z0-9_-]{32,})\b/g;

const ABSOLUTE_PATH_PATTERN =
  /(?:\/(?:root|home|users|var|tmp|etc|workspace)\/[^\s"'<>]+|[A-Za-z]:\\[^\s"'<>]+)/gi;

const INTERNAL_FIELD_NAME_PATTERN =
  /\b(?:publicShareToken|public_share_token|readiness|gateResults|gate_results|generationPlan|generation_plan|sourceArtifactUrl|source_artifact_url|testReportUrl|test_report_url|pluginIds|plugin_ids|internal[A-Za-z0-9_-]*|creatorOnly[A-Za-z0-9_-]*)\b/gi;

const MEDICAL_DOMAIN_PATTERN =
  /中医|问诊|医疗|医嘱|患者|症状|疼痛|头痛|发热|诊断|处方|药|舌|脉|病史|就医|医生/;

const MEDICAL_ADVICE_FIELD_PATTERN =
  /diagnos|prescription|treatment|therapy|medication|medicine|drug|dosage|dose|medical[-_]?advice|care[-_]?plan|herb|remedy|诊断|处方|治疗|医嘱|用药|药物|药方|方剂|剂量/i;

const FIELD_ID_SAFE_PATTERN = /[^a-zA-Z0-9_-]+/g;

type RuntimeApp = Pick<
  GeneratedAppRecordV1,
  'appName' | 'description' | 'appSpec' | 'generationPlan'
>;

export function buildGeneratedAppRuntimeForm(params: {
  appSpec: GeneratedAppSpecV1;
  generationPlan: RuntimeApp['generationPlan'];
  description: string;
}): PublicGeneratedAppRuntimeFormDto {
  const medicalDomain = isMedicalAppSpec(params.appSpec);
  const contractFieldIds = getPublicRuntimeRequiredFieldIds(
    params.generationPlan,
    medicalDomain,
  );
  const baseFields = medicalDomain
    ? buildMedicalRuntimeFields()
    : buildGeneralRuntimeFields(params.appSpec);
  const contractFields = buildContractRuntimeFields(
    contractFieldIds,
    baseFields.map((field) => field.id),
  );
  const fields = uniqueRuntimeFields([...baseFields, ...contractFields]);
  const publicAppName = sanitizePublicRuntimeText(
    params.appSpec.appName,
    DEFAULT_PUBLIC_APP_NAME,
  );
  const description = sanitizePublicRuntimeText(
    params.description || params.appSpec.summary,
    medicalDomain
      ? '请填写问诊采集信息，提交后查看结构化摘要、下一步问题和非诊断边界说明。'
      : '请填写业务输入，提交后查看结构化报告和下一步建议。',
  );
  const baseSection = medicalDomain
    ? [
        buildRuntimeFormSection({
          id: 'consultation-basic',
          title: '问诊信息',
          description: '采集主诉、持续时间、症状和严重程度。',
          fieldIds: ['chiefComplaint', 'duration', 'symptoms', 'severity'],
        }),
        buildRuntimeFormSection({
          id: 'consultation-context',
          title: '背景补充',
          description: '补充既往处理、健康背景和其他说明。',
          fieldIds: ['priorCare', 'medicalHistory', 'additionalNotes'],
        }),
      ]
    : [
        buildRuntimeFormSection({
          id: 'business-context',
          title: '业务场景',
          description: '明确本次要处理的场景、目标和对象。',
          fieldIds: [
            'workflowStep',
            'primaryGoal',
            'businessContext',
            'targetAudience',
          ],
        }),
        buildRuntimeFormSection({
          id: 'report-preferences',
          title: '报告偏好',
          description: '选择输出重点、优先级和补充约束。',
          fieldIds: [
            'scenarioFocus',
            'expectedOutput',
            'priority',
            'additionalNotes',
          ],
        }),
      ];
  const contractFieldSection = buildContractFieldSection(contractFields);
  const sections = filterRuntimeFormSections(
    contractFieldSection ? [...baseSection, contractFieldSection] : baseSection,
    fields,
  );

  return {
    formId: buildSafeIdentifier(params.appSpec.appName, 'generated-app-form'),
    title: medicalDomain
      ? `${publicAppName}问诊采集表`
      : `${publicAppName}业务表单`,
    description,
    submitLabel: medicalDomain ? '提交问诊信息' : '提交并生成报告',
    sections,
    fields,
    resultView: {
      title: medicalDomain ? '问诊信息报告' : '业务处理报告',
      description: medicalDomain
        ? '提交后展示问诊信息摘要、下一步补充问题和非诊断免责声明。'
        : '提交后展示结构化摘要、需求匹配、场景覆盖和下一步建议。',
      emptyState: '提交后会在这里显示结构化报告。',
      successTitle: medicalDomain ? '已生成问诊摘要' : '已生成业务报告',
      nextStepHint: medicalDomain
        ? '如有急重症或持续不适，请及时线下就医。'
        : '可根据报告中的下一步建议补充信息后重新提交。',
    },
  };
}

function buildMedicalRuntimeFields(): PublicGeneratedAppRuntimeFieldDto[] {
  return [
    {
      id: 'chiefComplaint',
      label: '主诉',
      type: 'text',
      required: true,
      placeholder: '例如：反复头痛、胃部不适、睡眠差',
      helpText: '请用自己的话描述当前最主要的不适。',
      options: [],
    },
    {
      id: 'duration',
      label: '持续时间',
      type: 'text',
      required: true,
      placeholder: '例如：2 天、半个月、反复 3 年',
      helpText: '请说明不适开始时间、持续多久，以及是否反复出现。',
      options: [],
    },
    {
      id: 'symptoms',
      label: '症状或感受',
      type: 'multi_select',
      required: true,
      placeholder: '',
      helpText: '可多选；如没有合适选项，可在补充说明中描述。',
      options: [
        { value: 'pain', label: '疼痛' },
        { value: 'fever', label: '发热' },
        { value: 'fatigue', label: '乏力' },
        { value: 'sleep_or_appetite', label: '睡眠或饮食异常' },
        { value: 'digestive_discomfort', label: '消化不适' },
        { value: 'other', label: '其他' },
      ],
    },
    {
      id: 'severity',
      label: '严重程度',
      type: 'range',
      required: true,
      placeholder: '',
      helpText: '1 表示轻微，10 表示非常严重；该字段只用于信息整理。',
      options: [],
      min: 1,
      max: 10,
      step: 1,
    },
    {
      id: 'priorCare',
      label: '既往处理',
      type: 'textarea',
      required: false,
      placeholder: '例如：已休息、饮水、线下就医、使用过的处理方式',
      helpText: '请只填写客观经历，不需要填写专业判断结论。',
      options: [],
    },
    {
      id: 'medicalHistory',
      label: '健康背景',
      type: 'textarea',
      required: false,
      placeholder: '例如：既往病史、过敏史、正在使用的药物、特殊人群情况',
      helpText: '这些信息有助于生成更完整的问诊摘要。',
      options: [],
    },
    {
      id: 'additionalNotes',
      label: '补充说明',
      type: 'textarea',
      required: false,
      placeholder: '可补充寒热、汗出、饮食睡眠、舌象或其他观察信息',
      helpText: '输出仍仅为信息整理和下一步问题，不提供诊断或治疗方案。',
      options: [],
    },
  ];
}

function buildGeneralRuntimeFields(
  appSpec: GeneratedAppSpecV1,
): PublicGeneratedAppRuntimeFieldDto[] {
  const runtimePage =
    appSpec.pages.find((page) => page.id.toLowerCase().includes('runtime')) ??
    appSpec.pages[0];
  const pageOptions = toRuntimeOptions(
    appSpec.pages.map((page) => ({
      id: page.id,
      label: `${page.name}：${page.purpose}`,
    })),
    [{ id: 'main-flow', label: '主要业务流程' }],
  );
  const scenarioOptions = toRuntimeOptions(
    appSpec.acceptanceScenarios.map((scenario) => ({
      id: scenario.id,
      label: scenario.title,
    })),
    [{ id: 'main-scenario', label: '核心业务场景' }],
  );
  const actorOptions = toRuntimeOptions(
    appSpec.actors.map((actor) => ({
      id: actor,
      label: actor,
    })),
    [
      { id: 'end-user', label: '终端用户' },
      { id: 'business-owner', label: '业务负责人' },
      { id: 'other', label: '其他' },
    ],
  );

  return [
    {
      id: 'workflowStep',
      label: '本次使用的业务流程',
      type: 'single_select',
      required: true,
      placeholder: '',
      helpText: '从应用页面和流程中选择本次要执行的入口。',
      options: pageOptions,
    },
    {
      id: 'primaryGoal',
      label: '本次目标',
      type: 'text',
      required: true,
      placeholder: sanitizePublicRuntimeText(
        appSpec.userGoal,
        '请描述希望应用完成的目标',
      ),
      helpText: '请用一句话说明这次提交希望应用帮助完成什么。',
      options: [],
    },
    {
      id: 'businessContext',
      label: '业务背景',
      type: 'textarea',
      required: true,
      placeholder: sanitizePublicRuntimeText(
        runtimePage?.purpose ?? appSpec.summary,
        '请补充当前场景、已知信息和判断依据',
      ),
      helpText: '请补充与本次业务处理相关的事实、上下文和限制。',
      options: [],
    },
    {
      id: 'targetAudience',
      label: '使用角色',
      type: 'single_select',
      required: true,
      placeholder: '',
      helpText: '选择本次报告主要服务的角色。',
      options: actorOptions,
    },
    {
      id: 'scenarioFocus',
      label: '验收场景',
      type: 'single_select',
      required: true,
      placeholder: '',
      helpText: '从业务验收场景中选择本次最接近的业务路径。',
      options: scenarioOptions,
    },
    {
      id: 'expectedOutput',
      label: '期望输出',
      type: 'single_select',
      required: true,
      placeholder: '',
      helpText: '选择报告最需要突出的输出形态。',
      options: [
        { value: 'structured_report', label: '结构化报告' },
        { value: 'next_step_suggestions', label: '下一步建议' },
        { value: 'task_summary', label: '任务摘要' },
      ],
    },
    {
      id: 'priority',
      label: '优先级',
      type: 'range',
      required: false,
      placeholder: '',
      helpText: '1 表示普通，5 表示需要优先处理。',
      options: [],
      min: 1,
      max: 5,
      step: 1,
    },
    {
      id: 'additionalNotes',
      label: '补充说明',
      type: 'textarea',
      required: false,
      placeholder: '可补充输出格式、注意事项、限制条件或希望避免的内容',
      helpText: '这些信息会进入提交摘要和下一步建议。',
      options: [],
    },
  ];
}

function getPublicRuntimeRequiredFieldIds(
  generationPlan: RuntimeApp['generationPlan'],
  medicalDomain: boolean,
): string[] {
  if (!isGeneratedAppGenerationPlan(generationPlan)) {
    return [];
  }

  const staticContracts = generationPlan.staticContracts;
  const requiredFields =
    staticContracts?.publicRuntime.input.requiredFields ??
    generationPlan.orchestration.inputContract.requiredFields;

  return sanitizeContractValues(requiredFields, [])
    .filter((field) => field !== 'input')
    .filter((field) =>
      medicalDomain ? !MEDICAL_ADVICE_FIELD_PATTERN.test(field) : true,
    )
    .map((field) => buildSafeIdentifier(field, 'field'))
    .filter((field) => !SENSITIVE_KEY_PATTERN.test(field));
}

function buildContractRuntimeFields(
  fieldIds: string[],
  existingFieldIds: string[],
): PublicGeneratedAppRuntimeFieldDto[] {
  const existing = new Set(existingFieldIds);

  return fieldIds
    .filter((fieldId) => !existing.has(fieldId))
    .slice(0, 6)
    .map((fieldId) => {
      const label = humanizeRuntimeFieldId(fieldId);
      const type = inferRuntimeFieldType(fieldId);

      return {
        id: fieldId,
        label,
        type,
        required: true,
        placeholder: `请填写${label}`,
        helpText: '该字段由公开运行输入合约要求，用于生成结构化报告。',
        options: buildInferredRuntimeFieldOptions(type),
        ...(type === 'range' ? { min: 1, max: 10, step: 1 } : {}),
        ...(type === 'number' ? { min: 0, step: 1 } : {}),
      };
    });
}

function buildInferredRuntimeFieldOptions(
  type: PublicGeneratedAppRuntimeFieldDto['type'],
): PublicGeneratedAppRuntimeFormOptionDto[] {
  if (type === 'single_select') {
    return [
      { value: 'yes', label: '是' },
      { value: 'no', label: '否' },
      { value: 'unknown', label: '暂不确定' },
    ];
  }

  if (type === 'multi_select') {
    return [
      { value: 'primary', label: '主要项' },
      { value: 'secondary', label: '补充项' },
      { value: 'other', label: '其他' },
    ];
  }

  return [];
}

function buildContractFieldSection(
  fields: PublicGeneratedAppRuntimeFieldDto[],
): PublicGeneratedAppRuntimeFormSectionDto | null {
  if (fields.length === 0) {
    return null;
  }

  return buildRuntimeFormSection({
    id: 'contract-fields',
    title: '应用必填项',
    description: '这些字段来自公开运行输入合约。',
    fieldIds: fields.map((field) => field.id),
  });
}

function buildRuntimeFormSection(params: {
  id: string;
  title: string;
  description: string;
  fieldIds: string[];
}): PublicGeneratedAppRuntimeFormSectionDto {
  return {
    id: buildSafeIdentifier(params.id, 'section'),
    title: sanitizePublicRuntimeText(params.title, '表单分区'),
    description: sanitizePublicRuntimeText(
      params.description,
      '请填写以下字段。',
    ),
    fieldIds: uniqueNonEmpty(params.fieldIds),
  };
}

function filterRuntimeFormSections(
  sections: PublicGeneratedAppRuntimeFormSectionDto[],
  fields: PublicGeneratedAppRuntimeFieldDto[],
): PublicGeneratedAppRuntimeFormSectionDto[] {
  const fieldIds = new Set(fields.map((field) => field.id));

  return sections
    .map((section) => ({
      ...section,
      fieldIds: section.fieldIds.filter((fieldId) => fieldIds.has(fieldId)),
    }))
    .filter((section) => section.fieldIds.length > 0);
}

function uniqueRuntimeFields(
  fields: PublicGeneratedAppRuntimeFieldDto[],
): PublicGeneratedAppRuntimeFieldDto[] {
  const seen = new Set<string>();
  const output: PublicGeneratedAppRuntimeFieldDto[] = [];

  for (const field of fields) {
    if (seen.has(field.id) || SENSITIVE_KEY_PATTERN.test(field.id)) {
      continue;
    }

    seen.add(field.id);
    output.push({
      ...field,
      label: sanitizePublicRuntimeText(field.label, '字段'),
      placeholder: sanitizePublicRuntimeText(field.placeholder, ''),
      helpText: sanitizePublicRuntimeText(field.helpText, '请填写该字段。'),
      options: field.options.map((option) => ({
        value: buildSafeIdentifier(option.value, 'option'),
        label: sanitizePublicRuntimeText(option.label, '选项'),
      })),
    });
  }

  return output;
}

function toRuntimeOptions(
  values: Array<{ id: string; label: string }>,
  fallback: Array<{ id: string; label: string }>,
): PublicGeneratedAppRuntimeFormOptionDto[] {
  const sanitizeOptions = (source: Array<{ id: string; label: string }>) =>
    source
      .map((entry, index) => ({
        value: buildSafeIdentifier(entry.id, `option-${index + 1}`),
        label: sanitizePublicRuntimeText(entry.label, ''),
      }))
      .filter(
        (entry) =>
          entry.label.length > 0 &&
          !SENSITIVE_KEY_PATTERN.test(entry.value) &&
          !SENSITIVE_KEY_PATTERN.test(entry.label),
      );
  const sanitizedValues = sanitizeOptions(values);
  const source =
    sanitizedValues.length > 0 ? sanitizedValues : sanitizeOptions(fallback);

  return source.slice(0, 8);
}

function inferRuntimeFieldType(
  fieldId: string,
): PublicGeneratedAppRuntimeFieldDto['type'] {
  if (/severity|level|score|priority|rating/i.test(fieldId)) {
    return 'range';
  }

  if (/count|number|amount|quantity|age|durationDays/i.test(fieldId)) {
    return 'number';
  }

  if (/type|category|status|mode|choice|select|confirmed/i.test(fieldId)) {
    return 'single_select';
  }

  if (/tags?|items?|features?|topics?|channels?|symptoms?/i.test(fieldId)) {
    return 'multi_select';
  }

  if (/notes|description|details|context|summary/i.test(fieldId)) {
    return 'textarea';
  }

  return 'text';
}

function humanizeRuntimeFieldId(fieldId: string): string {
  const text = fieldId
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[-_]+/g, ' ')
    .trim();

  return sanitizePublicRuntimeText(text, '字段');
}

function buildSafeIdentifier(value: string, fallback: string): string {
  const sanitized = redactSensitiveText(value)
    .text.replace(FIELD_ID_SAFE_PATTERN, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);

  if (
    sanitized.length === 0 ||
    sanitized.includes(REDACTED_TOKEN_VALUE) ||
    sanitized.includes(REDACTED_PATH_VALUE) ||
    sanitized.includes(REDACTED_INTERNAL_VALUE) ||
    SENSITIVE_KEY_PATTERN.test(sanitized)
  ) {
    return fallback;
  }

  return sanitized;
}

function isMedicalAppSpec(appSpec: GeneratedAppSpecV1): boolean {
  const corpus = [
    appSpec.appName,
    appSpec.summary,
    appSpec.userGoal,
    ...appSpec.coreRequirements.map((requirement) => requirement.text),
    ...appSpec.pages.flatMap((page) => [page.name, page.purpose]),
    ...appSpec.nonGoals,
  ].join(' ');

  return MEDICAL_DOMAIN_PATTERN.test(corpus);
}

function redactSensitiveText(value: string): {
  text: string;
  redacted: boolean;
} {
  const tokenRedacted = value.replace(
    TOKEN_LIKE_VALUE_PATTERN,
    REDACTED_TOKEN_VALUE,
  );
  const pathRedacted = tokenRedacted.replace(
    ABSOLUTE_PATH_PATTERN,
    REDACTED_PATH_VALUE,
  );
  const internalRedacted = pathRedacted.replace(
    INTERNAL_FIELD_NAME_PATTERN,
    REDACTED_INTERNAL_VALUE,
  );

  return {
    text: internalRedacted,
    redacted: internalRedacted !== value,
  };
}

function sanitizePublicRuntimeText(value: string, fallback: string): string {
  const sanitized = redactSensitiveText(value).text.replace(/\s+/g, ' ').trim();

  if (
    sanitized.length === 0 ||
    sanitized.includes(REDACTED_TOKEN_VALUE) ||
    sanitized.includes(REDACTED_PATH_VALUE) ||
    sanitized.includes(REDACTED_INTERNAL_VALUE)
  ) {
    return fallback;
  }

  return sanitized.length > MAX_STRING_LENGTH
    ? `${sanitized.slice(0, MAX_STRING_LENGTH)}...`
    : sanitized;
}

function sanitizeContractValues(
  values: string[],
  fallback: string[],
): string[] {
  const sanitized = uniqueNonEmpty(
    values
      .filter((value) => !SENSITIVE_KEY_PATTERN.test(value))
      .map((value) => redactSensitiveText(value).text)
      .filter(
        (value) =>
          !value.includes(REDACTED_TOKEN_VALUE) &&
          !value.includes(REDACTED_PATH_VALUE),
      ),
  );

  return sanitized.length > 0 ? sanitized : fallback;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isGeneratedAppGenerationPlan(
  value: unknown,
): value is GeneratedAppGenerationPlan {
  return (
    isPlainRecord(value) &&
    value.planVersion === 1 &&
    typeof value.appSpecVersion === 'number' &&
    isPlainRecord(value.frontend) &&
    isPlainRecord(value.orchestration) &&
    isPlainRecord(value.dataPersistence) &&
    isPlainRecord(value.testGates)
  );
}

function uniqueNonEmpty(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}
