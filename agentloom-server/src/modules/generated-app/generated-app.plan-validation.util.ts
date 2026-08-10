export const GENERATED_APP_PRIVATE_PLUGIN_HARD_GATES = [
  'manifest-validation',
  'build',
  'signature-verification',
  'permission-policy',
  'sandbox-smoke',
  'generation-safety-scan',
] as const;

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function getRecord(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null;
}

export function getRecordArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter((item) => isRecord(item)) : [];
}

export function getStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter(
        (item): item is string =>
          typeof item === 'string' && item.trim().length > 0,
      )
    : [];
}

export function getNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : null;
}

export function requireRecord(
  value: Record<string, unknown> | null,
  label: string,
): string[] {
  return value ? [] : [`${label} 必须是对象`];
}

export function buildMissingItemsIssues(
  label: string,
  actual: string[],
  expected: string[],
): string[] {
  return expected
    .filter((item) => !actual.includes(item))
    .map((item) => `${label} 缺少 ${item}`);
}

export function buildUnknownReferenceIssues(
  label: string,
  values: string[],
  knownValues: ReadonlySet<string>,
): string[] {
  return values
    .filter((value) => !knownValues.has(value))
    .map((value) => `${label} 引用了未知对象 ${formatIssueValue(value)}`);
}

export function buildDuplicateItemIssues(
  label: string,
  values: string[],
): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const value of values) {
    if (seen.has(value)) {
      duplicates.add(value);
    } else {
      seen.add(value);
    }
  }

  return [...duplicates].map(
    (value) => `${label} 存在重复值 ${formatIssueValue(value)}`,
  );
}

export function buildSafeRelativePathIssues(
  label: string,
  value: string | null,
): string[] {
  if (!value) {
    return [];
  }

  if (
    value.startsWith('/') ||
    value.startsWith('\\') ||
    value.includes('\0') ||
    value.includes('\\') ||
    /^[a-zA-Z]:/.test(value)
  ) {
    return [`${label} 必须是 workspace 相对路径且不能是绝对路径`];
  }

  const segments = value.split('/');

  if (
    segments.some(
      (segment) => segment.length === 0 || segment === '.' || segment === '..',
    )
  ) {
    return [`${label} 不能包含空路径段、. 或 .. traversal`];
  }

  return [];
}

export function buildControlledCommandIssues(
  label: string,
  value: string | null,
  expected: string,
): string[] {
  if (!value) {
    return [`${label} 缺失`];
  }

  return value === expected ? [] : [`${label} 必须为受控命令 ${expected}`];
}

export function buildPluginActivationPolicyIssues(
  label: string,
  policy: Record<string, unknown> | null,
): string[] {
  return [
    ...requireRecord(policy, label),
    ...(policy?.scope === 'tenant-private'
      ? []
      : [`${label}.scope 必须为 tenant-private`]),
    ...(policy?.autoActivateAfterHardGates === true
      ? []
      : [`${label}.autoActivateAfterHardGates 必须为 true`]),
    ...buildMissingItemsIssues(
      `${label}.requiredHardGates`,
      getStringArray(policy?.requiredHardGates),
      [...GENERATED_APP_PRIVATE_PLUGIN_HARD_GATES],
    ),
    ...buildUnknownReferenceIssues(
      `${label}.requiredHardGates`,
      getStringArray(policy?.requiredHardGates),
      new Set<string>([...GENERATED_APP_PRIVATE_PLUGIN_HARD_GATES]),
    ),
  ];
}

export function collectSensitiveTokenIssues(
  value: unknown,
  path = 'integrationPlan',
  depth = 0,
): string[] {
  if (depth > 8) {
    return [];
  }

  if (typeof value === 'string') {
    return isSensitiveTokenLike(value)
      ? [
          `${path} 含有疑似真实 token/secret，必须改为合成测试占位且不得写入 evidence`,
        ]
      : [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item, index) =>
      collectSensitiveTokenIssues(item, `${path}[${index}]`, depth + 1),
    );
  }

  if (!isRecord(value)) {
    return [];
  }

  return Object.entries(value).flatMap(([key, nestedValue]) => {
    const nextPath = `${path}.${key}`;
    const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
    const hasSensitiveKey =
      normalizedKey === 'token' ||
      normalizedKey.endsWith('token') ||
      normalizedKey.includes('apikey') ||
      normalizedKey.includes('secret') ||
      normalizedKey.includes('authorization') ||
      normalizedKey.includes('bearer');
    const sensitiveKeyIssue =
      hasSensitiveKey &&
      nestedValue !== null &&
      nestedValue !== undefined &&
      nestedValue !== false &&
      (!Array.isArray(nestedValue) || nestedValue.length > 0) &&
      (!isRecord(nestedValue) || Object.keys(nestedValue).length > 0)
        ? [
            `${nextPath} 不能包含真实 token/secret 字段；门禁测试资源必须使用合成无密钥上下文`,
          ]
        : [];

    return [
      ...sensitiveKeyIssue,
      ...collectSensitiveTokenIssues(nestedValue, nextPath, depth + 1),
    ];
  });
}

export function isSensitiveTokenLike(value: string): boolean {
  const trimmed = value.trim();

  return (
    /\b[a-f0-9]{64}\b/i.test(trimmed) ||
    /\b(sk|pk|pat|ghp|glpat|xox[baprs])[-_][A-Za-z0-9._-]+/i.test(trimmed) ||
    /\bbearer\s+\S+/i.test(trimmed)
  );
}

export function formatIssueValue(value: string): string {
  if (/\b[a-f0-9]{64}\b/i.test(value)) {
    return '[REDACTED_TOKEN]';
  }

  if (/\b(sk|pk|pat|ghp|glpat|xox[baprs])[-_][A-Za-z0-9._-]+/i.test(value)) {
    return '[REDACTED_SECRET]';
  }

  if (/\bbearer\s+\S+/i.test(value)) {
    return '[REDACTED_SECRET]';
  }

  return value;
}

export function buildBooleanMirrorIssue(
  source: Record<string, unknown> | null,
  field: string,
  expected: boolean,
): string[] {
  return source?.[field] === expected
    ? []
    : [`${field} 必须为 ${String(expected)}`];
}

export function isAcyclicGraph(
  nodeIds: string[],
  edges: Array<{ fromNodeId: string | null; toNodeId: string | null }>,
): boolean {
  const nodeSet = new Set(nodeIds);
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const adjacency = new Map<string, string[]>(
    nodeIds.map((nodeId) => [nodeId, []]),
  );

  for (const edge of edges) {
    if (
      edge.fromNodeId &&
      edge.toNodeId &&
      nodeSet.has(edge.fromNodeId) &&
      nodeSet.has(edge.toNodeId)
    ) {
      adjacency.get(edge.fromNodeId)?.push(edge.toNodeId);
    }
  }

  const visit = (nodeId: string): boolean => {
    if (visited.has(nodeId)) {
      return true;
    }

    if (visiting.has(nodeId)) {
      return false;
    }

    visiting.add(nodeId);

    for (const nextNodeId of adjacency.get(nodeId) ?? []) {
      if (!visit(nextNodeId)) {
        return false;
      }
    }

    visiting.delete(nodeId);
    visited.add(nodeId);
    return true;
  };

  return nodeIds.every((nodeId) => visit(nodeId));
}
