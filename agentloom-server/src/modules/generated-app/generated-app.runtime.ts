import type {
  GeneratedApp,
  GeneratedAppGenerationPlan,
  GeneratedAppSpec,
} from '../../database/schema';
import type {
  PublicGeneratedAppRuntimeFieldDto,
  PublicGeneratedAppRuntimeFormDto,
  PublicGeneratedAppRuntimeFormOptionDto,
  PublicGeneratedAppRuntimeFormSectionDto,
  PublicGeneratedAppResponseDto,
} from './dto';

export const GENERATED_APP_LOCAL_RUNTIME_KIND =
  'local-generated-app-deterministic-report' as const;

const REDACTED_VALUE = '[REDACTED]';
const REDACTED_TOKEN_VALUE = '[REDACTED_TOKEN]';
const REDACTED_PATH_VALUE = '[REDACTED_PATH]';
const REDACTED_INTERNAL_VALUE = '[REDACTED_INTERNAL]';
const UNSUPPORTED_VALUE = '[UNSUPPORTED_VALUE]';
const DEFAULT_PUBLIC_APP_NAME = 'Generated App';
const DEFAULT_PUBLIC_USER_GOAL = '整理公开提交内容并生成本地运行报告';
const DEFAULT_MEDICAL_USER_GOAL = '整理问诊提交信息、生成下一步问题和免责声明';
/** 以下四个上限由 evaluator 与公开提交入参校验共享，避免两处漂移。 */
export const MAX_INPUT_DEPTH = 6;
export const MAX_INPUT_FIELD_COUNT = 80;
export const MAX_ARRAY_ITEMS = 20;
export const FORBIDDEN_OBJECT_KEYS: ReadonlySet<string> = new Set([
  '__proto__',
  'constructor',
  'prototype',
]);
const MAX_STRING_LENGTH = 1000;
const MAX_PREVIEW_LENGTH = 180;

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
const MEDICAL_ADVICE_PATTERN =
  /诊断结论|诊断|处方|开药|用药方案|治疗方案|治疗建议|医嘱|建议服用|剂量|治愈|疗法/g;
const MEDICAL_ADVICE_TEXT_PATTERN =
  /diagnos|prescription|treatment|therapy|medication|medicine|drug|dosage|dose|medical[-_ ]?advice|care[-_ ]?plan|诊断结论|诊断|处方|开药|用药方案|治疗方案|治疗建议|医嘱|建议服用|药物|方剂|剂量|治愈|疗法/i;
const MEDICAL_ADVICE_FIELD_PATTERN =
  /diagnos|prescription|treatment|therapy|medication|medicine|drug|dosage|dose|medical[-_]?advice|care[-_]?plan|herb|remedy|诊断|处方|治疗|医嘱|用药|药物|药方|方剂|剂量/i;
const FIELD_ID_SAFE_PATTERN = /[^a-zA-Z0-9_-]+/g;

export interface GeneratedAppLocalRuntimeEvaluation {
  status: 'completed' | 'failed';
  input: Record<string, unknown>;
  result: Record<string, unknown> | null;
  report: Record<string, unknown> | null;
  errorMessage: string | null;
}

interface RuntimeInputEntry {
  path: string;
  valueType: string;
  valuePreview: string;
  redacted: boolean;
}

interface RuntimeInputInspection {
  valid: boolean;
  sanitizedInput: Record<string, unknown>;
  entries: RuntimeInputEntry[];
  redactedFieldCount: number;
  invalidReasons: string[];
  truncated: boolean;
}

interface RuntimeInputInspectionState {
  entries: RuntimeInputEntry[];
  redactedFieldCount: number;
  invalidReasons: string[];
  fieldCount: number;
  redactedKeyCount: number;
  unsupportedKeyCount: number;
  truncated: boolean;
}

interface RuntimeContractSummary {
  appSpecVersion: number | null;
  requiredInputFields: string[];
  outputDestinations: string[];
  reportRequired: boolean;
  scenarioIds: string[];
}

interface RuntimeRequirementMatch {
  id: string;
  text: string;
  status: 'matched' | 'needs_more_input';
  matchedInputFields: string[];
  matchReason: string;
}

interface RuntimeScenarioCoverage {
  id: string;
  title: string;
  requirementIds: string[];
  coverage: 'covered' | 'partially_covered' | 'needs_more_input';
  summary: string;
}

type RuntimeApp = Pick<
  GeneratedApp,
  'appName' | 'description' | 'appSpec' | 'generationPlan'
>;

export function buildPublicGeneratedAppRuntimeDescription(params: {
  appSpec: GeneratedAppSpec;
  description: string;
}): string {
  const medicalDomain = isMedicalAppSpec(params.appSpec);

  return sanitizePublicNarrativeText(
    params.description || params.appSpec.summary,
    medicalDomain
      ? '请填写问诊采集信息，提交后查看结构化摘要、下一步问题和非诊断边界说明。'
      : '请填写业务输入，提交后查看结构化报告和下一步建议。',
    medicalDomain,
  );
}

export function buildPublicGeneratedAppRuntimeSpec(params: {
  appSpec: GeneratedAppSpec;
  pages?: GeneratedAppSpec['pages'];
}): PublicGeneratedAppResponseDto['appSpec'] {
  const medicalDomain = isMedicalAppSpec(params.appSpec);
  const summaryFallback = medicalDomain
    ? '用于整理问诊提交信息、生成下一步问题和免责声明的公开应用。'
    : DEFAULT_PUBLIC_USER_GOAL;
  const userGoalFallback = medicalDomain
    ? DEFAULT_MEDICAL_USER_GOAL
    : DEFAULT_PUBLIC_USER_GOAL;

  return {
    version: params.appSpec.version,
    appName: sanitizePublicRuntimeText(
      params.appSpec.appName,
      DEFAULT_PUBLIC_APP_NAME,
    ),
    summary: sanitizePublicNarrativeText(
      params.appSpec.summary,
      summaryFallback,
      medicalDomain,
    ),
    userGoal: sanitizePublicNarrativeText(
      medicalDomain ? DEFAULT_MEDICAL_USER_GOAL : params.appSpec.userGoal,
      userGoalFallback,
      medicalDomain,
    ),
    actors: sanitizePublicRuntimeTextList(params.appSpec.actors, ['终端用户']),
    pages: (params.pages ?? params.appSpec.pages).map((page, index) => ({
      id: buildSafeIdentifier(page.id, `page-${index + 1}`),
      name: sanitizePublicNarrativeText(
        page.name,
        medicalDomain ? '问诊运行页' : '公开运行页',
        medicalDomain,
      ),
      purpose: sanitizePublicNarrativeText(
        page.purpose,
        medicalDomain
          ? '终端用户填写问诊信息并查看结构化摘要和边界说明。'
          : '终端用户填写业务输入并查看结构化报告。',
        medicalDomain,
      ),
    })),
  };
}

export function buildGeneratedAppRuntimeForm(params: {
  appSpec: GeneratedAppSpec;
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

export function evaluateGeneratedAppLocalRuntime(params: {
  app: RuntimeApp;
  input: unknown;
  now: Date;
}): GeneratedAppLocalRuntimeEvaluation {
  const inspection = inspectRuntimeInput(params.input);

  if (!inspection.valid) {
    return {
      status: 'failed',
      input: inspection.sanitizedInput,
      result: null,
      report: null,
      errorMessage:
        '提交内容包含当前本地 Generated App runtime 无法处理的结构，已保存失败状态，请调整输入后重新提交。',
    };
  }

  const createdAt = params.now.toISOString();
  const medicalDomain = isMedicalDomain(params.app.appSpec, inspection);
  const contractSummary = buildRuntimeContractSummary(
    params.app.generationPlan,
    { medicalDomain },
  );
  const inputSummary = buildInputSummary(inspection);
  const publicAppName = sanitizePublicRuntimeText(
    params.app.appName,
    DEFAULT_PUBLIC_APP_NAME,
  );
  const publicUserGoal = sanitizePublicRuntimeText(
    medicalDomain ? DEFAULT_MEDICAL_USER_GOAL : params.app.appSpec.userGoal,
    medicalDomain ? DEFAULT_MEDICAL_USER_GOAL : DEFAULT_PUBLIC_USER_GOAL,
  );
  const matchedRequirements = buildMatchedRequirements(
    params.app.appSpec,
    inspection,
    medicalDomain,
  );
  const scenarioCoverage = buildScenarioCoverage(
    params.app.appSpec,
    matchedRequirements,
    medicalDomain,
  );
  const nextStepQuestions = buildNextStepQuestions(
    params.app.appSpec,
    inspection,
    contractSummary,
    medicalDomain,
  );
  const followUpPrompts = buildFollowUpPrompts(
    params.app.appSpec,
    nextStepQuestions,
    medicalDomain,
  );
  const disclaimers = buildDisclaimers(medicalDomain);
  const reportSections = buildReportSections({
    appSpec: params.app.appSpec,
    inputSummary,
    matchedRequirements,
    scenarioCoverage,
    nextStepQuestions,
    disclaimers,
  });

  const runtimeNotice =
    '这是 AgentLoom Generated App 本地 deterministic runtime report；未调用外部模型、真实 Workflow、生产 sandbox 或插件执行。';
  const summary = medicalDomain
    ? `${publicAppName} 已整理公开提交内容，并生成下一步补充问题和免责声明。`
    : `${publicAppName} 已基于公开提交内容生成本地运行报告。`;

  return {
    status: 'completed',
    input: inspection.sanitizedInput,
    errorMessage: null,
    result: {
      runtimeKind: GENERATED_APP_LOCAL_RUNTIME_KIND,
      createdAt,
      appName: publicAppName,
      userGoal: publicUserGoal,
      summary,
      inputSummary,
      matchedRequirements,
      scenarioCoverage,
      nextStepQuestions,
      followUpPrompts,
      reportSections,
      contractSummary,
      runtimeNotice,
    },
    report: {
      runtimeKind: GENERATED_APP_LOCAL_RUNTIME_KIND,
      createdAt,
      title: `${publicAppName} 本地运行报告`,
      appName: publicAppName,
      userGoal: publicUserGoal,
      summary,
      sections: reportSections,
      nextStepQuestions,
      followUpPrompts,
      disclaimers,
      runtimeNotice,
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
  appSpec: GeneratedAppSpec,
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

function inspectRuntimeInput(input: unknown): RuntimeInputInspection {
  const state: RuntimeInputInspectionState = {
    entries: [],
    redactedFieldCount: 0,
    invalidReasons: [],
    fieldCount: 0,
    redactedKeyCount: 0,
    unsupportedKeyCount: 0,
    truncated: false,
  };

  if (!isPlainRecord(input)) {
    return {
      valid: false,
      sanitizedInput: {},
      entries: [],
      redactedFieldCount: 0,
      invalidReasons: ['input must be a plain JSON object'],
      truncated: false,
    };
  }

  const sanitizedInput = sanitizeRecord(input, [], 0, state);

  return {
    valid:
      state.invalidReasons.length === 0 &&
      state.fieldCount <= MAX_INPUT_FIELD_COUNT,
    sanitizedInput,
    entries: state.entries,
    redactedFieldCount: state.redactedFieldCount,
    invalidReasons: state.invalidReasons,
    truncated: state.truncated,
  };
}

function sanitizeRecord(
  input: Record<string, unknown>,
  path: string[],
  depth: number,
  state: RuntimeInputInspectionState,
): Record<string, unknown> {
  if (depth > MAX_INPUT_DEPTH) {
    state.invalidReasons.push('input nesting is too deep');
    return {};
  }

  const output: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(input)) {
    if (FORBIDDEN_OBJECT_KEYS.has(key)) {
      state.invalidReasons.push('input contains an unsupported object key');
      const safeKey = `unsupportedField${++state.unsupportedKeyCount}`;
      output[safeKey] = UNSUPPORTED_VALUE;
      continue;
    }

    const sensitiveKey = SENSITIVE_KEY_PATTERN.test(key);
    const safeKey = sensitiveKey
      ? `redactedField${++state.redactedKeyCount}`
      : key;
    const nextPath = [...path, safeKey];

    if (sensitiveKey) {
      state.redactedFieldCount += 1;
      output[safeKey] = REDACTED_VALUE;
      state.entries.push({
        path: nextPath.join('.'),
        valueType: getValueType(value),
        valuePreview: REDACTED_VALUE,
        redacted: true,
      });
      continue;
    }

    output[safeKey] = sanitizeValue(value, nextPath, depth + 1, state);
  }

  return output;
}

function sanitizeValue(
  value: unknown,
  path: string[],
  depth: number,
  state: RuntimeInputInspectionState,
): unknown {
  if (state.fieldCount > MAX_INPUT_FIELD_COUNT) {
    state.truncated = true;
    return '[TRUNCATED_FIELDS]';
  }

  if (
    value === null ||
    typeof value === 'boolean' ||
    typeof value === 'number'
  ) {
    recordInputEntry(path, value, false, state);
    return value;
  }

  if (typeof value === 'string') {
    const redacted = redactSensitiveText(value);
    const normalized = redacted.text.replace(/\s+/g, ' ').trim();
    const truncated =
      normalized.length > MAX_STRING_LENGTH
        ? `${normalized.slice(0, MAX_STRING_LENGTH)}...`
        : normalized;

    if (normalized.length > MAX_STRING_LENGTH) {
      state.truncated = true;
    }

    if (redacted.redacted) {
      state.redactedFieldCount += 1;
    }

    recordInputEntry(path, truncated, redacted.redacted, state);
    return truncated;
  }

  if (Array.isArray(value)) {
    if (depth > MAX_INPUT_DEPTH) {
      state.invalidReasons.push('input nesting is too deep');
      return [];
    }

    const items = value
      .slice(0, MAX_ARRAY_ITEMS)
      .map((item, index) =>
        sanitizeValue(item, [...path, String(index)], depth + 1, state),
      );

    if (value.length > MAX_ARRAY_ITEMS) {
      state.truncated = true;
      items.push(`[TRUNCATED_ARRAY_ITEMS:${value.length - MAX_ARRAY_ITEMS}]`);
    }

    return items;
  }

  if (isPlainRecord(value)) {
    return sanitizeRecord(value, path, depth, state);
  }

  state.invalidReasons.push('input contains a non-JSON-compatible value');
  recordInputEntry(path, UNSUPPORTED_VALUE, false, state);
  return UNSUPPORTED_VALUE;
}

function recordInputEntry(
  path: string[],
  value: unknown,
  redacted: boolean,
  state: RuntimeInputInspectionState,
) {
  state.fieldCount += 1;

  if (state.fieldCount > MAX_INPUT_FIELD_COUNT) {
    state.truncated = true;
    return;
  }

  state.entries.push({
    path: path.join('.'),
    valueType: getValueType(value),
    valuePreview: previewValue(value),
    redacted,
  });
}

function buildRuntimeContractSummary(
  generationPlan: RuntimeApp['generationPlan'],
  options: { medicalDomain?: boolean } = {},
): RuntimeContractSummary {
  if (!isGeneratedAppGenerationPlan(generationPlan)) {
    return {
      appSpecVersion: null,
      requiredInputFields: ['input'],
      outputDestinations: [
        'public-runtime-report',
        'creator-submission-detail',
      ],
      reportRequired: true,
      scenarioIds: [],
    };
  }

  const staticContracts = generationPlan?.staticContracts;
  const inputContract =
    staticContracts?.publicRuntime.input ??
    generationPlan?.orchestration.inputContract;
  const outputContract =
    staticContracts?.publicRuntime.output ??
    generationPlan?.orchestration.outputContract;
  const defaultOutputDestinations = [
    'public-runtime-report',
    'creator-submission-detail',
  ];

  return {
    appSpecVersion:
      staticContracts?.appSpecVersion ?? generationPlan?.appSpecVersion ?? null,
    requiredInputFields: sanitizeContractValues(
      inputContract?.requiredFields ?? ['input'],
      ['input'],
    ).filter((field) =>
      options.medicalDomain ? !MEDICAL_ADVICE_FIELD_PATTERN.test(field) : true,
    ),
    outputDestinations: sanitizeContractValues(
      outputContract?.destinations ?? defaultOutputDestinations,
      defaultOutputDestinations,
    ),
    reportRequired: outputContract?.reportRequired ?? true,
    scenarioIds: sanitizeContractValues(inputContract?.scenarioIds ?? [], []),
  };
}

function buildInputSummary(inspection: RuntimeInputInspection) {
  const visibleEntries = inspection.entries.filter((entry) => !entry.redacted);
  const highlights = visibleEntries
    .slice(0, 8)
    .map((entry) => `${entry.path}: ${entry.valuePreview}`);
  const textPreview =
    highlights.length > 0
      ? highlights.join('；')
      : inspection.entries.length > 0
        ? '提交内容只包含已脱敏字段。'
        : '未提供可分析字段。';

  return {
    empty: inspection.entries.length === 0,
    fieldCount: inspection.entries.length,
    redactedFieldCount: inspection.redactedFieldCount,
    truncated: inspection.truncated,
    textPreview,
    fields: inspection.entries.slice(0, 12).map((entry) => ({
      path: entry.path,
      valueType: entry.valueType,
      valuePreview: entry.valuePreview,
      redacted: entry.redacted,
    })),
  };
}

function buildMatchedRequirements(
  appSpec: GeneratedAppSpec,
  inspection: RuntimeInputInspection,
  medicalDomain: boolean,
): RuntimeRequirementMatch[] {
  const visibleEntries = inspection.entries.filter((entry) => !entry.redacted);
  const hasVisibleInput = visibleEntries.length > 0;

  return appSpec.coreRequirements.map((requirement) => {
    const keywords = extractKeywords(requirement.text);
    const matchedInputFields = visibleEntries
      .filter((entry) =>
        keywords.some((keyword) =>
          `${entry.path} ${entry.valuePreview}`
            .toLocaleLowerCase()
            .includes(keyword.toLocaleLowerCase()),
        ),
      )
      .map((entry) => entry.path)
      .slice(0, 6);
    const persistenceRequirement = /提交|保存|持久化|查看|报告|结果|数据/.test(
      requirement.text,
    );
    const status =
      hasVisibleInput || persistenceRequirement
        ? 'matched'
        : 'needs_more_input';

    return {
      id: requirement.id,
      text: sanitizeRequirementText(requirement.text, medicalDomain),
      status,
      matchedInputFields:
        matchedInputFields.length > 0
          ? matchedInputFields
          : visibleEntries.slice(0, 3).map((entry) => entry.path),
      matchReason:
        status === 'matched'
          ? '本地 runtime 已将提交内容映射到该需求的摘要、场景覆盖和后续问题；未执行真实 AI/Workflow/插件。'
          : '提交内容不足，当前只能生成待补充问题。',
    };
  });
}

function buildScenarioCoverage(
  appSpec: GeneratedAppSpec,
  matchedRequirements: RuntimeRequirementMatch[],
  medicalDomain: boolean,
): RuntimeScenarioCoverage[] {
  const matchByRequirementId = new Map(
    matchedRequirements.map((match) => [match.id, match.status]),
  );

  return appSpec.acceptanceScenarios.map((scenario) => {
    const matchedCount = scenario.requirementIds.filter(
      (requirementId) => matchByRequirementId.get(requirementId) === 'matched',
    ).length;
    const coverage =
      matchedCount === scenario.requirementIds.length &&
      scenario.requirementIds.length > 0
        ? 'covered'
        : matchedCount > 0
          ? 'partially_covered'
          : 'needs_more_input';

    return {
      id: scenario.id,
      title: sanitizePublicRuntimeText(
        medicalDomain ? '问诊信息提交与补充问题流程' : scenario.title,
        '公开运行场景',
      ),
      requirementIds: scenario.requirementIds,
      coverage,
      summary: buildScenarioCoverageSummary(scenario, coverage, medicalDomain),
    };
  });
}

function buildNextStepQuestions(
  appSpec: GeneratedAppSpec,
  inspection: RuntimeInputInspection,
  contractSummary: RuntimeContractSummary,
  medicalDomain: boolean,
): string[] {
  const topLevelFields = new Set(
    inspection.entries.map((entry) => entry.path.split('.')[0]).filter(Boolean),
  );
  const missingRequiredFields = contractSummary.requiredInputFields.filter(
    (field) => field !== 'input' && !topLevelFields.has(field),
  );
  const questions = missingRequiredFields.map(
    (field) => `请补充公开运行输入字段“${field}”。`,
  );

  if (medicalDomain) {
    questions.push(
      '主要不适从什么时候开始，持续多久，严重程度如何变化？',
      '是否伴随发热、胸痛、意识改变、持续剧烈疼痛等需要及时线下就医的警示情况？',
      '既往病史、正在使用的药物、过敏史和特殊人群情况是否需要补充？',
      '如需中医问诊摘要，可补充寒热、汗出、饮食睡眠、舌象或脉象等观察信息。',
    );
  } else {
    const primaryScenario = appSpec.acceptanceScenarios[0];
    const primaryPage = appSpec.pages.find((page) =>
      page.id.toLowerCase().includes('runtime'),
    );

    questions.push(
      `为了推进“${sanitizePublicRuntimeText(
        appSpec.userGoal,
        DEFAULT_PUBLIC_USER_GOAL,
      )}”，还需要补充哪些关键业务输入或判断标准？`,
    );

    if (primaryScenario) {
      questions.push(
        `验收场景“${sanitizePublicRuntimeText(
          primaryScenario.title,
          '公开运行场景',
        )}”的成功输出格式是什么？`,
      );
    }

    if (primaryPage) {
      questions.push(
        `在“${sanitizePublicRuntimeText(
          primaryPage.name,
          '公开运行页',
        )}”中，终端用户下一步最需要完成什么操作？`,
      );
    }
  }

  return uniqueNonEmpty(questions).slice(0, 6);
}

function buildFollowUpPrompts(
  appSpec: GeneratedAppSpec,
  nextStepQuestions: string[],
  medicalDomain: boolean,
): string[] {
  const prompts = [
    `请围绕“${sanitizePublicRuntimeText(
      medicalDomain ? DEFAULT_MEDICAL_USER_GOAL : appSpec.userGoal,
      medicalDomain ? DEFAULT_MEDICAL_USER_GOAL : DEFAULT_PUBLIC_USER_GOAL,
    )}”补充缺失信息后重新提交。`,
    '请确认最终报告需要面向谁、采用什么格式、以及下一步处理动作。',
  ];

  if (nextStepQuestions.length > 0) {
    prompts.push(`优先回答：${nextStepQuestions[0]}`);
  }

  if (medicalDomain) {
    prompts.push(
      '请只补充症状和背景信息；诊断、处方和治疗方案应咨询具备资质的专业人员。',
    );
  }

  return uniqueNonEmpty(prompts).slice(0, 5);
}

function buildReportSections(params: {
  appSpec: GeneratedAppSpec;
  inputSummary: ReturnType<typeof buildInputSummary>;
  matchedRequirements: RuntimeRequirementMatch[];
  scenarioCoverage: RuntimeScenarioCoverage[];
  nextStepQuestions: string[];
  disclaimers: string[];
}) {
  const submittedInformationSection = {
    id: 'submitted-information',
    title: '提交内容摘要',
    body: params.inputSummary.textPreview,
    items: params.inputSummary.fields.map(
      (field) => `${field.path}: ${field.valuePreview}`,
    ),
  };
  const recommendedNextStepsSection = {
    id: 'recommended-next-steps',
    title: '建议下一步问题',
    body: '这些问题由应用页面、验收场景、公开运行合约和提交内容确定性生成。',
    items: params.nextStepQuestions,
  };
  const runtimeBoundarySection = {
    id: 'runtime-boundary',
    title: '运行边界说明',
    body: '当前输出是本地 generated-app runtime report，不伪装为真实 AI、Workflow、插件或生产沙箱执行。',
    items: params.disclaimers,
  };
  const medicalDomain = params.disclaimers.some((disclaimer) =>
    MEDICAL_DOMAIN_PATTERN.test(disclaimer),
  );

  if (medicalDomain) {
    return [
      submittedInformationSection,
      recommendedNextStepsSection,
      runtimeBoundarySection,
    ];
  }

  return [
    submittedInformationSection,
    {
      id: 'requirement-mapping',
      title: '需求匹配',
      body: '本地 runtime 按应用核心需求生成可读映射。',
      items: params.matchedRequirements.map(
        (match) => `${match.id}: ${match.status} - ${match.text}`,
      ),
    },
    {
      id: 'scenario-coverage',
      title: '验收场景覆盖',
      body: '以下覆盖表示本地报告对场景的结构化映射，不代表真实浏览器或 Workflow 运行。',
      items: params.scenarioCoverage.map(
        (scenario) =>
          `${scenario.id}: ${scenario.coverage} - ${scenario.summary}`,
      ),
    },
    recommendedNextStepsSection,
    runtimeBoundarySection,
  ];
}

function buildDisclaimers(medicalDomain: boolean): string[] {
  const disclaimers = [
    '当前报告只用于业务流程预览和提交记录闭环，不代表外部模型、真实工作流或插件执行结果。',
  ];

  if (medicalDomain) {
    disclaimers.push(
      '医疗或中医问诊相关内容仅整理用户提交信息和下一步问题，不提供诊断结论、处方或治疗建议；如有急重症或持续不适，请及时线下就医。',
    );
  }

  return disclaimers;
}

function isMedicalDomain(
  appSpec: GeneratedAppSpec,
  inspection: RuntimeInputInspection,
): boolean {
  const corpus = [
    appSpec.appName,
    appSpec.summary,
    appSpec.userGoal,
    ...appSpec.coreRequirements.map((requirement) => requirement.text),
    ...inspection.entries.map((entry) => entry.valuePreview),
  ].join(' ');

  return MEDICAL_DOMAIN_PATTERN.test(corpus);
}

function isMedicalAppSpec(appSpec: GeneratedAppSpec): boolean {
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

function buildScenarioCoverageSummary(
  scenario: GeneratedAppSpec['acceptanceScenarios'][number],
  coverage: RuntimeScenarioCoverage['coverage'],
  medicalDomain: boolean,
): string {
  const scenarioAction = medicalDomain
    ? '问诊信息整理和下一步问题生成'
    : sanitizePublicRuntimeText(
        scenario.when[0] ??
          scenario.then[0] ??
          scenario.given[0] ??
          scenario.title,
        '公开运行场景',
      );

  if (coverage === 'covered') {
    return `已基于提交内容生成“${scenarioAction}”的本地报告映射。`;
  }

  if (coverage === 'partially_covered') {
    return `已部分覆盖“${scenarioAction}”，仍需要补充关键输入。`;
  }

  return `尚无足够输入覆盖“${scenarioAction}”。`;
}

function extractKeywords(value: string): string[] {
  const normalized = value.replace(/[，。！？；、,.!?;:()（）"'“”]/g, ' ');
  const tokens = normalized
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);

  if (tokens.length === 0 && value.trim().length > 0) {
    return [value.trim()];
  }

  return tokens.slice(0, 8);
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

function sanitizePublicNarrativeText(
  value: string,
  fallback: string,
  medicalDomain: boolean,
): string {
  const sanitized = sanitizePublicRuntimeText(value, fallback);

  if (
    medicalDomain &&
    (MEDICAL_ADVICE_TEXT_PATTERN.test(sanitized) ||
      MEDICAL_ADVICE_FIELD_PATTERN.test(sanitized))
  ) {
    return fallback;
  }

  return sanitized;
}

function sanitizePublicRuntimeTextList(
  values: string[],
  fallback: string[],
): string[] {
  const sanitized = uniqueNonEmpty(
    values
      .map((value) => sanitizePublicRuntimeText(value, ''))
      .filter((value) => !SENSITIVE_KEY_PATTERN.test(value)),
  );

  return sanitized.length > 0 ? sanitized : fallback;
}

function sanitizeRequirementText(
  value: string,
  medicalDomain: boolean,
): string {
  const sanitized = sanitizePublicRuntimeText(value, '公开运行需求');

  if (!medicalDomain) {
    return sanitized;
  }

  if (
    MEDICAL_ADVICE_TEXT_PATTERN.test(sanitized) ||
    MEDICAL_ADVICE_FIELD_PATTERN.test(sanitized)
  ) {
    return '问诊信息整理与下一步问题生成';
  }

  const medicalSafe = sanitized
    .replace(MEDICAL_ADVICE_PATTERN, '专业医疗判断')
    .replace(/\s+/g, ' ')
    .trim();

  return medicalSafe.length > 0 ? medicalSafe : '问诊信息整理与下一步问题生成';
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

function previewValue(value: unknown): string {
  if (value === null) {
    return 'null';
  }

  if (typeof value === 'string') {
    return value.length > MAX_PREVIEW_LENGTH
      ? `${value.slice(0, MAX_PREVIEW_LENGTH)}...`
      : value;
  }

  const serialized = JSON.stringify(value);
  return serialized.length > MAX_PREVIEW_LENGTH
    ? `${serialized.slice(0, MAX_PREVIEW_LENGTH)}...`
    : serialized;
}

function getValueType(value: unknown): string {
  if (Array.isArray(value)) {
    return 'array';
  }

  if (value === null) {
    return 'null';
  }

  return typeof value;
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
