import type {
  GeneratedAppGateEvidence,
  GeneratedAppGateRunFailure,
  GeneratedAppReadiness,
  GeneratedAppSpec,
  GeneratedAppStatus,
} from '../../database/schema';
import {
  getNonEmptyString,
  getRecordArray,
  getStringArray,
  isRecord,
} from './generated-app.plan-validation.util';
import { getGeneratedAppStatusForReadiness } from './generated-app.gates';

export interface Gate0Check {
  id: string;
  label: string;
  passed: boolean;
  summary: string;
  issues: string[];
}

export interface Gate0Evaluation {
  status: 'passed' | 'failed';
  summary: string;
  evidence: GeneratedAppGateEvidence[];
  failure: GeneratedAppGateRunFailure | null;
  repairInstructions: string | null;
}

export function buildInitialAppSpec(prompt: string): GeneratedAppSpec {
  const appName = buildAppName(prompt);

  return {
    version: 1,
    appName,
    summary: `围绕“${prompt}”生成的 AppSpec 初稿。`,
    userGoal: prompt,
    actors: ['创建者', '终端用户'],
    coreRequirements: [
      {
        id: 'req-1',
        text: prompt,
      },
      {
        id: 'req-2',
        text: '公开应用提交内容默认持久化，并提供给创建者查看。',
      },
    ],
    pages: [
      {
        id: 'page-creator-workbench',
        name: '创建者工作台',
        purpose: '查看生成记录、门禁结果、预览状态和发布状态。',
      },
      {
        id: 'page-public-runtime',
        name: '公开运行页',
        purpose: '让终端用户在不登录的情况下使用通过门禁的定制业务界面。',
      },
    ],
    dataPolicy: {
      publicSubmissionsPersisted: true,
      creatorCanDeleteSubmissions: true,
      endUserLoginRequired: false,
    },
    nonGoals: [
      '第一阶段不生成自定义后端服务、数据库 schema 或部署资产。',
      '第一阶段不绕过 AgentLoom 鉴权、租户隔离、资源配额或 API 权限模型。',
    ],
    acceptanceScenarios: [
      {
        id: 'scenario-1',
        title: '创建者可以从一句话进入可验证生成流程',
        requirementIds: ['req-1'],
        given: ['创建者已登录 AgentLoom Studio'],
        when: [`创建者提交需求“${prompt}”`],
        then: [
          '系统生成结构化 AppSpec 初稿',
          '系统初始化 Gate 0-7 门禁结果',
          '系统在阻断门禁未全绿时不允许创建正式公开链接',
        ],
      },
      {
        id: 'scenario-2',
        title: '终端用户数据保存策略可追踪',
        requirementIds: ['req-2'],
        given: ['生成应用进入公开运行面'],
        when: ['终端用户提交业务输入'],
        then: ['公开页面展示数据用途提示', '提交内容和运行结果归属创建者租户'],
      },
    ],
    traceability: [
      {
        requirementId: 'req-1',
        scenarioIds: ['scenario-1'],
        evidenceIds: ['app-spec-draft'],
      },
      {
        requirementId: 'req-2',
        scenarioIds: ['scenario-2'],
        evidenceIds: ['app-spec-draft'],
      },
    ],
  };
}

export function buildAppName(prompt: string): string {
  const compact = prompt.replace(/\s+/g, ' ').trim();
  const firstSentence = compact.split(/[。！？!?]/)[0]?.trim() ?? compact;
  const baseName = firstSentence.length > 0 ? firstSentence : '定制化应用';
  return baseName.length > 48 ? `${baseName.slice(0, 48)}...` : baseName;
}

export function buildPlanRoute(pageId: string): string {
  return `/${buildPlanSegment(pageId)}`;
}

export function buildPlanSegment(value: string): string {
  const segment = value
    .trim()
    .toLowerCase()
    .replace(/^page-/, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return segment.length > 0 ? segment : 'generated-app';
}

export function getPublicRuntimePages(
  appSpec: GeneratedAppSpec,
): GeneratedAppSpec['pages'] {
  return appSpec.pages.filter((page) => {
    const id = page.id.toLowerCase();
    const name = page.name.toLowerCase();
    const purpose = page.purpose.toLowerCase();

    return (
      id.includes('public') ||
      id.includes('runtime') ||
      name.includes('公开') ||
      name.includes('终端') ||
      purpose.includes('终端用户')
    );
  });
}

export function buildDataPolicyIssues(
  appSpec: Record<string, unknown>,
): string[] {
  const dataPolicy = appSpec.dataPolicy;
  const issues: string[] = [];

  if (!isRecord(dataPolicy)) {
    issues.push('dataPolicy 缺失');
  } else {
    for (const field of [
      'publicSubmissionsPersisted',
      'creatorCanDeleteSubmissions',
      'endUserLoginRequired',
    ]) {
      if (typeof dataPolicy[field] !== 'boolean') {
        issues.push(`dataPolicy.${field} 必须是 boolean`);
      }
    }
  }

  if (getStringArray(appSpec.nonGoals).length === 0) {
    issues.push('nonGoals 至少需要一条范围边界');
  }

  return issues;
}

export function buildScenarioIssues(
  scenario: Record<string, unknown>,
  index: number,
): string[] {
  const issues: string[] = [];

  for (const field of ['id', 'title']) {
    if (getNonEmptyString(scenario[field]) === null) {
      issues.push(`acceptanceScenarios[${index}].${field} 缺失`);
    }
  }

  if (getStringArray(scenario.requirementIds).length === 0) {
    issues.push(`acceptanceScenarios[${index}].requirementIds 不能为空`);
  }

  for (const field of ['given', 'when', 'then']) {
    if (getStringArray(scenario[field]).length === 0) {
      issues.push(`acceptanceScenarios[${index}].${field} 不能为空`);
    }
  }

  return issues;
}

export function resolveStatusForShareDisabled(
  readiness: GeneratedAppReadiness,
): GeneratedAppStatus {
  if (readiness.canCreatePublicShare) {
    return 'publish_candidate';
  }

  return getGeneratedAppStatusForReadiness(readiness);
}

export function buildGate0Checks(appSpec: unknown): Gate0Check[] {
  if (!isRecord(appSpec)) {
    return [
      {
        id: 'app-spec-object',
        label: 'AppSpec JSON 对象',
        passed: false,
        summary: 'AppSpec 必须是结构化 JSON 对象。',
        issues: ['appSpec 不是对象'],
      },
    ];
  }

  const coreRequirements = getRecordArray(appSpec.coreRequirements);
  const requirementIds = coreRequirements
    .map((requirement) => getNonEmptyString(requirement.id))
    .filter((id): id is string => id !== null);
  const pages = getRecordArray(appSpec.pages);
  const acceptanceScenarios = getRecordArray(appSpec.acceptanceScenarios);
  const scenarioIds = new Set(
    acceptanceScenarios
      .map((scenario) => getNonEmptyString(scenario.id))
      .filter((id): id is string => id !== null),
  );
  const coveredRequirementIds = new Set<string>();

  for (const scenario of acceptanceScenarios) {
    for (const requirementId of getStringArray(scenario.requirementIds)) {
      coveredRequirementIds.add(requirementId);
    }
  }

  const traceability = getRecordArray(appSpec.traceability);
  const traceabilityRequirementIds = new Set(
    traceability
      .filter((entry) => {
        const scenarioRefs = getStringArray(entry.scenarioIds);
        const evidenceRefs = getStringArray(entry.evidenceIds);
        return (
          scenarioRefs.length > 0 &&
          scenarioRefs.every((scenarioId) => scenarioIds.has(scenarioId)) &&
          evidenceRefs.length > 0
        );
      })
      .map((entry) => getNonEmptyString(entry.requirementId))
      .filter((id): id is string => id !== null),
  );

  const textIssues = ['appName', 'summary', 'userGoal'].filter(
    (field) => getNonEmptyString(appSpec[field]) === null,
  );
  const actorIssues =
    getStringArray(appSpec.actors).length === 0
      ? ['actors 至少需要一个角色']
      : [];
  const requirementIssues = [
    ...(coreRequirements.length === 0 ? ['coreRequirements 不能为空'] : []),
    ...coreRequirements.flatMap((requirement, index) => {
      const issues: string[] = [];

      if (getNonEmptyString(requirement.id) === null) {
        issues.push(`coreRequirements[${index}].id 缺失`);
      }

      if (getNonEmptyString(requirement.text) === null) {
        issues.push(`coreRequirements[${index}].text 缺失`);
      }

      return issues;
    }),
  ];
  const pageIssues = [
    ...(pages.length === 0 ? ['pages 不能为空'] : []),
    ...pages.flatMap((page, index) => {
      const issues: string[] = [];

      for (const field of ['id', 'name', 'purpose']) {
        if (getNonEmptyString(page[field]) === null) {
          issues.push(`pages[${index}].${field} 缺失`);
        }
      }

      return issues;
    }),
  ];
  const policyIssues = buildDataPolicyIssues(appSpec);
  const scenarioIssues = [
    ...(acceptanceScenarios.length === 0
      ? ['acceptanceScenarios 不能为空']
      : []),
    ...acceptanceScenarios.flatMap((scenario, index) =>
      buildScenarioIssues(scenario, index),
    ),
  ];
  const uncoveredRequirementIds = requirementIds.filter(
    (requirementId) => !coveredRequirementIds.has(requirementId),
  );
  const traceabilityIssues = [
    ...(traceability.length === 0 ? ['traceability 不能为空'] : []),
    ...requirementIds
      .filter((requirementId) => !traceabilityRequirementIds.has(requirementId))
      .map((requirementId) => `需求 ${requirementId} 缺少有效 traceability`),
  ];

  return [
    {
      id: 'identity',
      label: 'AppSpec 基本摘要',
      passed: textIssues.length === 0 && actorIssues.length === 0,
      summary: '检查 appName、summary、userGoal 与 actors 是否完整。',
      issues: [...textIssues.map((field) => `${field} 缺失`), ...actorIssues],
    },
    {
      id: 'core-requirements',
      label: '核心需求列表',
      passed: requirementIssues.length === 0,
      summary: `检查 ${coreRequirements.length} 条核心需求是否具备 id 和 text。`,
      issues: requirementIssues,
    },
    {
      id: 'pages',
      label: '页面/流程定义',
      passed: pageIssues.length === 0,
      summary: `检查 ${pages.length} 个页面或流程是否具备 id、name 和 purpose。`,
      issues: pageIssues,
    },
    {
      id: 'risk-boundary',
      label: '数据策略与范围边界',
      passed: policyIssues.length === 0,
      summary:
        '检查 dataPolicy 和 nonGoals 是否能表达数据保存、登录要求与初始风险/范围边界。',
      issues: policyIssues,
    },
    {
      id: 'acceptance-scenarios',
      label: '验收场景结构',
      passed: scenarioIssues.length === 0,
      summary: `检查 ${acceptanceScenarios.length} 条 acceptance scenario 是否可执行。`,
      issues: scenarioIssues,
    },
    {
      id: 'requirement-coverage',
      label: '需求到验收场景覆盖',
      passed: uncoveredRequirementIds.length === 0 && requirementIds.length > 0,
      summary: `检查 ${requirementIds.length} 条核心需求是否至少被一个 acceptance scenario 覆盖。`,
      issues:
        requirementIds.length === 0
          ? ['没有可覆盖的核心需求 id']
          : uncoveredRequirementIds.map(
              (requirementId) =>
                `需求 ${requirementId} 未被 acceptance scenario 引用`,
            ),
    },
    {
      id: 'traceability',
      label: '需求证据 traceability',
      passed: traceabilityIssues.length === 0 && requirementIds.length > 0,
      summary: `检查 ${traceability.length} 条 traceability 是否连接需求、场景和证据。`,
      issues: traceabilityIssues,
    },
  ];
}

export function evaluateGate0AppSpec(
  appSpec: GeneratedAppSpec,
): Gate0Evaluation {
  const checks = buildGate0Checks(appSpec);
  const failedChecks = checks.filter((check) => !check.passed);
  const evidence = checks.map((check) => ({
    id: `gate-0-${check.id}`,
    label: check.label,
    kind: 'app_spec' as const,
    url: null,
    summary:
      check.issues.length === 0
        ? check.summary
        : `${check.summary} 缺口：${check.issues.join('；')}`,
  }));

  if (failedChecks.length > 0) {
    const failure: GeneratedAppGateRunFailure = {
      code: 'app-spec-incomplete',
      message: `AppSpec 完整性检查失败：${failedChecks
        .map((check) => check.label)
        .join('、')}。`,
      details: {
        checks: checks.map((check) => ({
          id: check.id,
          label: check.label,
          passed: check.passed,
          issues: check.issues,
        })),
      },
    };

    return {
      status: 'failed',
      summary:
        'Gate 0 失败：AppSpec 缺少可验证生成所需的结构化字段或需求覆盖证据。',
      evidence,
      failure,
      repairInstructions:
        '补齐 AppSpec 的核心需求、页面/流程、数据策略、acceptance scenarios 与 traceability 后重新启动门禁运行器。',
    };
  }

  return {
    status: 'passed',
    summary:
      'Gate 0 通过：AppSpec 结构完整，核心需求均有 acceptance scenario 与 traceability 覆盖。',
    evidence,
    failure: null,
    repairInstructions: null,
  };
}
