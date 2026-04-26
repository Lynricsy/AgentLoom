import type {
  GeneratedAppGateResult,
  GeneratedAppGateStatus,
  GeneratedAppReadiness,
  GeneratedAppStatus,
} from '../../database/schema';

export interface GeneratedAppGateDefinition {
  gateId: string;
  order: number;
  name: string;
  blocking: boolean;
  pendingSummary: string;
}

export const GENERATED_APP_GATE_DEFINITIONS = [
  {
    gateId: 'gate-0',
    order: 0,
    name: '需求规格门禁',
    blocking: true,
    pendingSummary:
      '等待 AppSpec 完整性、风险分类和 acceptance scenarios 校验。',
  },
  {
    gateId: 'gate-1',
    order: 1,
    name: '架构计划门禁',
    blocking: true,
    pendingSummary: '等待实现计划覆盖 AppSpec、页面、编排、插件和测试计划。',
  },
  {
    gateId: 'gate-2',
    order: 2,
    name: '静态合约门禁',
    blocking: true,
    pendingSummary:
      '等待 TypeScript、API contract、图 schema、DAG 和插件 manifest 校验。',
  },
  {
    gateId: 'gate-3',
    order: 3,
    name: '构建与单元门禁',
    blocking: true,
    pendingSummary:
      '等待前端构建、插件构建、单元测试、组件测试和 golden tests。',
  },
  {
    gateId: 'gate-4',
    order: 4,
    name: '集成门禁',
    blocking: true,
    pendingSummary:
      '等待生成应用、Agent/Workflow dry-run 和插件沙箱 smoke test。',
  },
  {
    gateId: 'gate-5',
    order: 5,
    name: '浏览器验收门禁',
    blocking: true,
    pendingSummary:
      '等待 Playwright 核心 acceptance scenarios、console 和 network 验收。',
  },
  {
    gateId: 'gate-6',
    order: 6,
    name: '独立审查门禁',
    blocking: true,
    pendingSummary: '等待独立 verifier 审查 AppSpec、证据矩阵和运行结果。',
  },
  {
    gateId: 'gate-7',
    order: 7,
    name: '发布候选门禁',
    blocking: true,
    pendingSummary: '等待所有阻断门禁通过后生成发布候选。',
  },
] as const satisfies readonly GeneratedAppGateDefinition[];

const CANONICAL_GATES: ReadonlyMap<string, GeneratedAppGateDefinition> =
  new Map(GENERATED_APP_GATE_DEFINITIONS.map((gate) => [gate.gateId, gate]));

export function getGeneratedAppGateDefinition(
  gateId: string,
): GeneratedAppGateDefinition | undefined {
  return CANONICAL_GATES.get(gateId);
}

export function createInitialGeneratedAppGateResults(
  nowIso = new Date().toISOString(),
): GeneratedAppGateResult[] {
  return GENERATED_APP_GATE_DEFINITIONS.map((gate) => ({
    gateId: gate.gateId,
    order: gate.order,
    name: gate.name,
    blocking: gate.blocking,
    status: gate.gateId === 'gate-0' ? 'passed' : 'pending',
    summary:
      gate.gateId === 'gate-0'
        ? '初始 AppSpec 已生成，并包含至少一条可验证 acceptance scenario。'
        : gate.pendingSummary,
    evidence:
      gate.gateId === 'gate-0'
        ? [
            {
              id: 'app-spec-draft',
              label: 'AppSpec 初稿',
              kind: 'app_spec',
              url: null,
              summary: '由自然语言需求生成的结构化 AppSpec 初稿。',
            },
          ]
        : [],
    updatedAt: nowIso,
  }));
}

export function normalizeGeneratedAppGateResults(
  input: readonly GeneratedAppGateResult[],
  nowIso = new Date().toISOString(),
): GeneratedAppGateResult[] {
  const inputById = new Map(input.map((gate) => [gate.gateId, gate]));

  const canonical = GENERATED_APP_GATE_DEFINITIONS.map((definition) => {
    const provided = inputById.get(definition.gateId);

    return {
      gateId: definition.gateId,
      order: definition.order,
      name: definition.name,
      blocking: definition.blocking,
      status: provided?.status ?? 'pending',
      summary: provided?.summary ?? definition.pendingSummary,
      evidence: provided?.evidence ?? [],
      updatedAt: provided?.updatedAt ?? nowIso,
    } satisfies GeneratedAppGateResult;
  });

  const extensions = input
    .filter((gate) => !CANONICAL_GATES.has(gate.gateId))
    .map((gate, index) => ({
      ...gate,
      order: gate.order >= 100 ? gate.order : 100 + index,
      updatedAt: gate.updatedAt ?? nowIso,
    }));

  return [...canonical, ...extensions].sort((left, right) => {
    if (left.order !== right.order) {
      return left.order - right.order;
    }

    return left.gateId.localeCompare(right.gateId);
  });
}

export function evaluateGeneratedAppReadiness(
  gateResults: readonly GeneratedAppGateResult[],
): GeneratedAppReadiness {
  const blockers = gateResults
    .filter((gate) => gate.blocking && gate.status !== 'passed')
    .map((gate) => ({
      gateId: gate.gateId,
      name: gate.name,
      status: gate.status,
      summary: gate.summary,
    }));

  const blockingFailures = blockers.filter((gate) => gate.status === 'failed');

  const warnings = gateResults.filter(isWarningGateResult).map((gate) => ({
    gateId: gate.gateId,
    name: gate.name,
    status: gate.status,
    summary: gate.summary,
  }));

  if (blockingFailures.length > 0) {
    return {
      state: 'blocked',
      canCreatePublicShare: false,
      blockingIssueCount: blockers.length,
      warningCount: warnings.length,
      summary:
        '存在阻断门禁失败，不能生成 publish candidate，也不能创建或继续启用正式公开链接。',
      blockers,
      warnings,
    };
  }

  if (blockers.length > 0) {
    return {
      state: 'preview',
      canCreatePublicShare: false,
      blockingIssueCount: blockers.length,
      warningCount: warnings.length,
      summary:
        '阻断门禁尚未全部通过，当前生成结果只能作为创建者预览或开发中试运行。',
      blockers,
      warnings,
    };
  }

  if (warnings.length > 0) {
    return {
      state: 'trial',
      canCreatePublicShare: false,
      blockingIssueCount: 0,
      warningCount: warnings.length,
      summary:
        '阻断门禁已通过，但仍存在非阻断 warning，当前只能进入预览/试用态，不能成为 publish candidate。',
      blockers: [],
      warnings,
    };
  }

  return {
    state: 'publish_candidate',
    canCreatePublicShare: true,
    blockingIssueCount: 0,
    warningCount: 0,
    summary:
      '全部阻断门禁已通过且没有非阻断 warning，可以生成 publish candidate 并允许创建正式公开链接。',
    blockers: [],
    warnings: [],
  };
}

export function getGeneratedAppStatusForReadiness(
  readiness: GeneratedAppReadiness,
): GeneratedAppStatus {
  if (readiness.state === 'publish_candidate') {
    return 'publish_candidate';
  }

  if (readiness.state === 'trial') {
    return 'trial_ready';
  }

  if (readiness.state === 'blocked') {
    return 'failed';
  }

  return 'preview_ready';
}

function isWarningGateResult(gate: GeneratedAppGateResult): boolean {
  if (gate.status === 'warning') {
    return true;
  }

  return !gate.blocking && isUnhealthyNonBlockingStatus(gate.status);
}

function isUnhealthyNonBlockingStatus(status: GeneratedAppGateStatus): boolean {
  return status === 'failed' || status === 'running' || status === 'pending';
}
