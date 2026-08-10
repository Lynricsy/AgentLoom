import { Script } from 'node:vm';
import {
  buildExpressionPorts,
  flattenInput,
  isRecord,
  readFirstDefined,
  readFirstString,
  resolveJsonPath,
} from './node-value.util';

// ── N-way 条件分支评估 ─────────────────────────────────────

/**
 * 条件分支描述（统一新旧格式后的内部表示）
 */
export function resolveConditionBranches(
  nodeData: Record<string, unknown>,
): Array<{
  id: string;
  mode: 'visual' | 'expression';
  expression: string;
  conditions: {
    rules: Array<{
      sourcePortId: string;
      fieldPath: string;
      operator: string;
      value: string;
    }>;
    logic: 'and' | 'or';
  };
}> {
  // 新格式: branches 数组
  if (Array.isArray(nodeData.branches)) {
    return nodeData.branches
      .filter((b) => isRecord(b))
      .map((b, index) => ({
        id: typeof b.id === 'string' ? b.id : `branch-${index}`,
        mode: b.mode === 'expression' ? 'expression' : 'visual',
        expression: typeof b.expression === 'string' ? b.expression : '',
        conditions: normalizeConditionGroup(b.conditions),
      }));
  }

  // 旧格式: mode + expression/conditionField
  const mode = nodeData.mode;

  if (mode === 'expression') {
    const expression =
      typeof nodeData.expression === 'string' ? nodeData.expression.trim() : '';
    return [
      {
        id: 'branch-0',
        mode: 'expression',
        expression,
        conditions: { rules: [], logic: 'and' },
      },
    ];
  }

  if (mode === 'field-comparison') {
    const field = readFirstString(
      nodeData.conditionField,
      nodeData.condition_field,
    );
    const value =
      nodeData.expectedValue != null
        ? String(nodeData.expectedValue)
        : nodeData.expected_value != null
          ? String(nodeData.expected_value)
          : '';
    return [
      {
        id: 'branch-0',
        mode: 'visual' as const,
        expression: '',
        conditions: {
          rules: [
            {
              sourcePortId: 'input-0',
              fieldPath: field ?? '',
              operator: 'equals',
              value,
            },
          ],
          logic: 'and' as const,
        },
      },
    ];
  }

  // 无条件配置但有 expression 或 conditionField（旧版兼容 fallback）
  const fallbackExpression = readFirstString(nodeData.expression);
  const fallbackField = readFirstString(
    nodeData.conditionField,
    nodeData.condition_field,
  );

  if (fallbackExpression) {
    return [
      {
        id: 'branch-0',
        mode: 'expression',
        expression: fallbackExpression,
        conditions: { rules: [], logic: 'and' },
      },
    ];
  }

  if (fallbackField) {
    const value =
      nodeData.expectedValue != null
        ? String(nodeData.expectedValue)
        : nodeData.expected_value != null
          ? String(nodeData.expected_value)
          : '';
    return [
      {
        id: 'branch-0',
        mode: 'visual',
        expression: '',
        conditions: {
          rules: [
            {
              sourcePortId: 'input-0',
              fieldPath: fallbackField,
              operator: 'equals',
              value,
            },
          ],
          logic: 'and',
        },
      },
    ];
  }

  // 完全空配置
  return [];
}

export function normalizeConditionGroup(value: unknown): {
  rules: Array<{
    sourcePortId: string;
    fieldPath: string;
    operator: string;
    value: string;
  }>;
  logic: 'and' | 'or';
} {
  if (!isRecord(value)) {
    return { rules: [], logic: 'and' };
  }

  const logic = value.logic === 'or' ? 'or' : 'and';
  const rawRules = Array.isArray(value.rules) ? value.rules : [];
  const rules = rawRules
    .filter((r) => isRecord(r))
    .map((r) => ({
      sourcePortId:
        typeof r.sourcePortId === 'string' && r.sourcePortId.length > 0
          ? r.sourcePortId
          : 'input-0',
      fieldPath:
        typeof r.fieldPath === 'string'
          ? r.fieldPath
          : typeof r.field === 'string'
            ? r.field
            : '',
      operator: typeof r.operator === 'string' ? r.operator : 'equals',
      value: typeof r.value === 'string' ? r.value : '',
    }));

  return { rules, logic };
}

/**
 * 评估单个分支是否匹配
 */
export function evaluateConditionBranch(
  branch: {
    mode: 'visual' | 'expression';
    expression: string;
    conditions: {
      rules: Array<{
        sourcePortId: string;
        fieldPath: string;
        operator: string;
        value: string;
      }>;
      logic: 'and' | 'or';
    };
  },
  input: Record<string, unknown>,
  flatInput: Record<string, unknown>,
): boolean {
  if (branch.mode === 'expression') {
    if (!branch.expression.trim()) {
      return false;
    }

    return !!evaluateExpression(branch.expression, input);
  }

  // 可视化模式: 评估条件规则组
  const { rules, logic } = branch.conditions;
  if (rules.length === 0) {
    return false;
  }

  if (logic === 'and') {
    return rules.every((rule) => evaluateConditionRule(rule, input, flatInput));
  }

  return rules.some((rule) => evaluateConditionRule(rule, input, flatInput));
}

/**
 * 评估单条规则（11 种运算符 + 向后兼容 expression 运算符）
 */
export function evaluateConditionRule(
  rule: {
    sourcePortId: string;
    fieldPath: string;
    operator: string;
    value: string;
  },
  input: Record<string, unknown>,
  flatInput: Record<string, unknown>,
): boolean {
  // expression 运算符: 整个 value 作为 JS 表达式
  if (rule.operator === 'expression') {
    const expr = rule.value.trim();
    if (!expr) {
      return false;
    }

    return !!evaluateExpression(expr, input);
  }

  const fieldValue = resolveConditionFieldValue(
    rule.sourcePortId,
    rule.fieldPath,
    input,
    flatInput,
  );
  const expected = rule.value;

  switch (rule.operator) {
    case 'equals':
      return String(fieldValue ?? '') === expected;
    case 'not_equals':
      return String(fieldValue ?? '') !== expected;
    case 'contains':
      return String(fieldValue ?? '').includes(expected);
    case 'not_contains':
      return !String(fieldValue ?? '').includes(expected);
    case 'gt':
      return Number(fieldValue) > Number(expected);
    case 'gte':
      return Number(fieldValue) >= Number(expected);
    case 'lt':
      return Number(fieldValue) < Number(expected);
    case 'lte':
      return Number(fieldValue) <= Number(expected);
    case 'starts_with':
      return String(fieldValue ?? '').startsWith(expected);
    case 'ends_with':
      return String(fieldValue ?? '').endsWith(expected);
    case 'is_empty':
      return (
        fieldValue === null ||
        fieldValue === undefined ||
        fieldValue === '' ||
        (Array.isArray(fieldValue) && fieldValue.length === 0)
      );
    case 'is_not_empty':
      return !(
        fieldValue === null ||
        fieldValue === undefined ||
        fieldValue === '' ||
        (Array.isArray(fieldValue) && fieldValue.length === 0)
      );
    case 'regex_match':
      try {
        return new RegExp(expected).test(String(fieldValue ?? ''));
      } catch {
        return false;
      }
    default:
      return String(fieldValue ?? '') === expected;
  }
}

/**
 * 解析条件规则中的字段值：先在 flatInput 中查找，再在 input 中做路径解析
 */
export function resolveConditionFieldValue(
  sourcePortId: string,
  fieldPath: string,
  input: Record<string, unknown>,
  flatInput: Record<string, unknown>,
): unknown {
  if (!sourcePortId) {
    return undefined;
  }

  const portValue = input[sourcePortId];
  if (!fieldPath) {
    return portValue;
  }

  const normalizedPath = fieldPath.startsWith('[')
    ? `${sourcePortId}${fieldPath}`
    : `${sourcePortId}.${fieldPath}`;

  // 直接查 flatInput
  if (Object.prototype.hasOwnProperty.call(flatInput, normalizedPath)) {
    return flatInput[normalizedPath];
  }

  // 路径解析
  return resolveJsonPath(input, normalizedPath);
}

export function isConditionNode(nodeType: string | null | undefined): boolean {
  return nodeType === 'condition' || nodeType === 'conditional';
}

export function unwrapConditionBranchPayload(
  sourceHandle: string,
  value: unknown,
): unknown {
  // 识别条件分支 handle（新格式 branch-N/else + 旧格式 matched/unmatched）
  const isConditionHandle =
    sourceHandle.startsWith('branch-') ||
    sourceHandle === 'else' ||
    sourceHandle === 'matched-out' ||
    sourceHandle === 'unmatched-out' ||
    sourceHandle === 'matched' ||
    sourceHandle === 'unmatched' ||
    sourceHandle === 'true' ||
    sourceHandle === 'false';

  if (!isConditionHandle) {
    return value;
  }

  if (!isRecord(value)) {
    return value;
  }

  const keys = Object.keys(value);
  if (keys.length === 1 && (keys[0] === 'input-in' || keys[0] === 'input')) {
    return value[keys[0]];
  }

  return value;
}

export function normalizeConditionBranch(branch: string): string {
  // 新格式: branch-0, branch-1, ..., else
  if (branch.startsWith('branch-') || branch === 'else') {
    return branch;
  }

  // 旧格式: matched/true → branch-0, unmatched/false → else
  if (branch === 'true' || branch === 'matched') {
    return 'branch-0';
  }

  return 'else';
}

export function normalizeConditionSourceHandle(
  sourceHandle?: string,
): string | undefined {
  if (!sourceHandle) {
    return undefined;
  }

  // 新格式 handle: branch-0, branch-1, ..., else
  if (sourceHandle.startsWith('branch-') || sourceHandle === 'else') {
    return sourceHandle;
  }

  // 旧格式 handle → 映射到新格式
  if (
    sourceHandle === 'matched-out' ||
    sourceHandle === 'true' ||
    sourceHandle === 'matched'
  ) {
    return 'branch-0';
  }

  if (
    sourceHandle === 'unmatched-out' ||
    sourceHandle === 'false' ||
    sourceHandle === 'unmatched'
  ) {
    return 'else';
  }

  return undefined;
}

// ── Loop 停止条件辅助方法 ─────────────────────────────────────

/**
 * 从 nodeData 解析循环停止条件（visual 模式下的 ConditionGroup）
 */
export function resolveLoopStopCondition(nodeData: Record<string, unknown>):
  | {
      rules: Array<{
        sourcePortId: string;
        fieldPath: string;
        operator: string;
        value: string;
      }>;
      logic: 'and' | 'or';
    }
  | undefined {
  const raw = readFirstDefined(nodeData.stopCondition, nodeData.stop_condition);

  if (!isRecord(raw)) {
    return undefined;
  }

  const logic = raw.logic === 'or' ? 'or' : 'and';
  const rawRules = Array.isArray(raw.rules) ? raw.rules : [];
  const rules = rawRules
    .filter((r) => isRecord(r))
    .map((r) => ({
      sourcePortId: 'input-0',
      fieldPath:
        typeof r.fieldPath === 'string'
          ? r.fieldPath
          : typeof r.field === 'string'
            ? r.field
            : '',
      operator: typeof r.operator === 'string' ? r.operator : 'equals',
      value: typeof r.value === 'string' ? r.value : '',
    }));

  if (rules.length === 0) {
    return undefined;
  }

  return { rules, logic };
}

/**
 * 从 nodeData 解析循环错误处理策略
 */
export function resolveLoopErrorStrategy(
  nodeData: Record<string, unknown>,
): 'stop' | 'skip' | 'collect' {
  const raw = readFirstString(nodeData.errorStrategy, nodeData.error_strategy);

  return raw === 'skip' || raw === 'collect' ? raw : 'stop';
}

/**
 * 评估循环停止条件（visual 模式）
 *
 * 将当前迭代项包装为 input 对象后复用 evaluateConditionBranch
 */
export function evaluateLoopStopCondition(
  conditions: {
    rules: Array<{
      sourcePortId: string;
      fieldPath: string;
      operator: string;
      value: string;
    }>;
    logic: 'and' | 'or';
  },
  currentItem: unknown,
): boolean {
  const wrappedInput = wrapLoopItemAsInput(currentItem);
  const flatInput = flattenInput(wrappedInput);

  return evaluateConditionBranch(
    {
      mode: 'visual',
      expression: '',
      conditions,
    },
    wrappedInput,
    flatInput,
  );
}

/**
 * 评估循环停止表达式（expression 模式）
 */
export function evaluateLoopStopExpression(
  expression: string,
  currentItem: unknown,
): boolean {
  const wrappedInput = wrapLoopItemAsInput(currentItem);
  return !!evaluateExpression(expression, wrappedInput);
}

/**
 * 将循环迭代项包装为 evaluateConditionBranch 期望的 input 格式
 */
export function wrapLoopItemAsInput(item: unknown): Record<string, unknown> {
  if (isRecord(item)) {
    return item;
  }

  return { value: item };
}

export function normalizeLoopItemsInput(
  input: Record<string, unknown>,
): unknown[] {
  const directCandidates = [
    input['items-in'],
    input.items,
    input.json,
    input.value,
    input.content,
    flattenInput(input)['items-in'],
    flattenInput(input).items,
    flattenInput(input).json,
    flattenInput(input).value,
    flattenInput(input).content,
  ];

  for (const candidate of directCandidates) {
    const normalized = extractLoopItemsCandidate(candidate);
    if (normalized) {
      return normalized;
    }
  }

  const fallbackEntries = Object.entries(input).filter(
    ([key]) => key !== 'exec-in' && key !== 'exec_in',
  );

  if (fallbackEntries.length === 1) {
    return coerceLoopItems(fallbackEntries[0][1]);
  }

  for (const [, value] of fallbackEntries) {
    const normalized = extractLoopItemsCandidate(value);
    if (normalized) {
      return normalized;
    }
  }

  return [];
}

export function extractLoopItemsCandidate(
  value: unknown,
): unknown[] | undefined {
  if (Array.isArray(value)) {
    return value;
  }

  if (!isRecord(value)) {
    return value === undefined || value === null ? undefined : [value];
  }

  const nestedCandidates = [
    value.items,
    value.json,
    value.value,
    value.content,
    value.payload,
  ];

  for (const candidate of nestedCandidates) {
    if (Array.isArray(candidate)) {
      return candidate;
    }
  }

  return undefined;
}

export function coerceLoopItems(value: unknown): unknown[] {
  if (Array.isArray(value)) {
    return value;
  }

  if (value === undefined || value === null) {
    return [];
  }

  return [value];
}

export function evaluateExpression(
  expression: string,
  input: Record<string, unknown>,
): unknown {
  const script = new Script(`(${expression})`);

  return script.runInNewContext(
    {
      input,
      flatInput: flattenInput(input),
      ports: buildExpressionPorts(input),
    },
    { timeout: 1000 },
  );
}
