import { describe, expect, it } from 'vitest';
import {
  coerceLoopItems,
  evaluateConditionBranch,
  evaluateConditionRule,
  evaluateExpression,
  evaluateLoopStopCondition,
  evaluateLoopStopExpression,
  extractLoopItemsCandidate,
  isConditionNode,
  normalizeConditionBranch,
  normalizeConditionGroup,
  normalizeConditionSourceHandle,
  normalizeLoopItemsInput,
  resolveConditionBranches,
  resolveConditionFieldValue,
  resolveLoopErrorStrategy,
  resolveLoopStopCondition,
  unwrapConditionBranchPayload,
  wrapLoopItemAsInput,
} from '../condition-evaluator.util';
import {
  buildExpressionPorts,
  extractCodeToolInputPayload,
  extractExecutionInputPayload,
  extractOutputValue,
  flattenInput,
  getRuntimeNodeData,
  isRecord,
  keyValuePairsToRecord,
  normalizeJsonOutputValue,
  normalizeTransformResult,
  parseJsonLikeValue,
  readEdgeHandle,
  readFirstDefined,
  readFirstString,
  readHttpMethod,
  readNumber,
  readOptionalNumber,
  readStringArray,
  resolveJsonPath,
  resolveTextNodeContent,
  setValueAtPath,
  stringifyOutputValue,
  stripExecOnlyInputs,
} from '../node-value.util';

describe('node-value.util', () => {
  it('严格读取基础输入并应用 fallback', () => {
    expect([isRecord({}), isRecord(null), isRecord([])]).toEqual([
      true,
      false,
      false,
    ]);
    expect(readNumber(3.5, 1)).toBe(3.5);
    expect(readNumber(' 8 ', 1)).toBe(8);
    expect(readNumber(Number.NaN, 2)).toBe(2);
    expect(readNumber('bad', 2)).toBe(2);
    expect(readOptionalNumber(undefined, 'bad', '9')).toBe(9);
    expect(readOptionalNumber(Infinity, null)).toBeUndefined();
    expect(readFirstString('', 2, '  chosen  ', 'later')).toBe('chosen');
    expect(readFirstString(null, '   ')).toBeUndefined();
    expect(readFirstDefined(undefined, null, 'later')).toBeNull();
    expect(readStringArray('bad', ['ok', '', 2, ' also '])).toEqual([
      'ok',
      ' also ',
    ]);
    expect(readStringArray('bad', null)).toEqual([]);
    expect(['POST', 'PUT', 'PATCH', 'DELETE'].map(readHttpMethod)).toEqual([
      'POST',
      'PUT',
      'PATCH',
      'DELETE',
    ]);
    expect(readHttpMethod('post')).toBe('GET');
  });

  it('顶层运行时数据覆盖 config，并按明确顺序选择文本', () => {
    expect(
      getRuntimeNodeData({
        config: { value: 'nested', keep: true },
        value: 'top',
      }),
    ).toEqual({
      value: 'top',
      keep: true,
      config: { value: 'nested', keep: true },
    });
    expect(
      resolveTextNodeContent({
        config: { text: '', value: 'fallback' },
        text: 'top',
      }),
    ).toBe('');
    expect(resolveTextNodeContent({ config: [], content: 'top content' })).toBe(
      'top content',
    );
    expect(resolveTextNodeContent({ content: 42 })).toBe('');
  });

  it('兼容 camelCase 与 snake_case edge handle', () => {
    expect(
      readEdgeHandle(
        { sourceHandle: ' camel ', source_handle: 'snake' } as never,
        'source',
      ),
    ).toBe('camel');
    expect(
      readEdgeHandle({ target_handle: ' snake ' } as never, 'target'),
    ).toBe('snake');
  });

  it('解析点路径、数组路径、空路径和不可遍历路径', () => {
    const value = { user: { names: [{ value: 'Ada' }] }, zero: 0 };
    expect(resolveJsonPath(value, 'user.names[0].value')).toBe('Ada');
    expect(resolveJsonPath(value, '.user..names.0.value')).toBe('Ada');
    expect(resolveJsonPath(value, '')).toBe(value);
    expect(resolveJsonPath(value, 'user.names.nope.value')).toBeUndefined();
    expect(resolveJsonPath(value, 'zero.missing')).toBeUndefined();
  });

  it('同路径写入聚合值，并替换非法中间节点', () => {
    const target: Record<string, unknown> = {
      nested: { value: 'first' },
      broken: [],
    };
    setValueAtPath(target, 'nested.value', 'second');
    setValueAtPath(target, 'nested.value', 'third');
    setValueAtPath(target, 'broken.deep', 1);
    setValueAtPath(target, '', 'ignored');
    expect(target).toEqual({
      nested: { value: ['first', 'second', 'third'] },
      broken: { deep: 1 },
    });
  });

  it('扁平化对象和数组且保留原端口值', () => {
    expect(
      flattenInput({ source: { items: [{ id: 1 }, null], flag: false } }),
    ).toEqual({
      source: { items: [{ id: 1 }, null], flag: false },
      'source.items': [{ id: 1 }, null],
      'source.items[0]': { id: 1 },
      'source.items[0].id': 1,
      'source.items[1]': null,
      'source.flag': false,
    });
    expect(
      buildExpressionPorts({
        'input-10': 'ten',
        misc: 0,
        'input-2': 'two',
        'input-1': 'one',
      }),
    ).toEqual({ 1: 'one', 2: 'two', 3: 'ten' });
  });

  it('规范化转换、执行输入和输出值', () => {
    const record = { answer: 42 };
    expect(normalizeTransformResult(record)).toBe(record);
    expect(normalizeTransformResult([1])).toEqual({ value: [1] });
    expect(normalizeTransformResult(null)).toEqual({ value: null });
    expect(
      extractExecutionInputPayload({ value: 1, _meta: { trace: true } }),
    ).toEqual({ value: 1 });
    expect(extractExecutionInputPayload(null)).toEqual({});
    expect(
      extractOutputValue({ 'content-in': undefined, content: 'later' }),
    ).toBeUndefined();
    expect(extractOutputValue({ content: null, value: 'later' })).toBeNull();
    expect(extractOutputValue({ json: { ok: true } })).toEqual({ ok: true });
    expect(extractOutputValue({ value: 0 })).toBe(0);
    expect(extractOutputValue({ only: 'single' })).toBe('single');
    expect(extractOutputValue({ a: 1, b: 2 })).toEqual({ a: 1, b: 2 });
    expect(stringifyOutputValue('text')).toBe('text');
    expect(stringifyOutputValue(undefined)).toBe('');
    expect(stringifyOutputValue(null)).toBe('null');
    expect(normalizeJsonOutputValue(record)).toBe(record);
    expect(normalizeJsonOutputValue(false)).toEqual({ value: false });
  });

  it('解析 JSON-like 字符串并过滤非法键值对', () => {
    expect(parseJsonLikeValue(' {"enabled":true} ')).toEqual({ enabled: true });
    expect(parseJsonLikeValue(' plain text ')).toBe('plain text');
    expect(parseJsonLikeValue('   ')).toBe('');
    expect(
      keyValuePairsToRecord(
        [
          null,
          { key: 'count', value: '2' },
          { key: '', value: 'x' },
          { key: 'bad', value: 3 },
        ],
        true,
      ),
    ).toEqual({ count: 2 });
    expect(keyValuePairsToRecord('invalid')).toEqual({});
  });

  it('代码工具端口优先且仅剥离执行信号', () => {
    expect(extractCodeToolInputPayload({ 'input-in': 0, input: 'later' })).toBe(
      0,
    );
    expect(extractCodeToolInputPayload({ input: false, other: 'later' })).toBe(
      false,
    );
    expect(
      extractCodeToolInputPayload({ 'exec-in': true, payload: { id: 1 } }),
    ).toEqual({ id: 1 });
    expect(extractCodeToolInputPayload({ exec_in: true, a: 1, b: 2 })).toEqual({
      a: 1,
      b: 2,
    });
    expect(extractCodeToolInputPayload({ 'exec-in': true })).toEqual({});
    expect(stripExecOnlyInputs({ exec_in: 1, 'exec-in': 2 })).toBeUndefined();
    expect(stripExecOnlyInputs({ exec_in: 1, keep: undefined })).toEqual({
      keep: undefined,
    });
  });
});

describe('condition-evaluator.util', () => {
  it('规范化新版多分支并丢弃非法分支与规则', () => {
    expect(
      resolveConditionBranches({
        branches: [
          null,
          {
            id: 'approved',
            mode: 'expression',
            expression: 'input.ok',
            conditions: null,
          },
          {
            conditions: {
              logic: 'or',
              rules: [{ field: 'age', operator: 'gte', value: '18' }, 1],
            },
          },
        ],
      }),
    ).toEqual([
      {
        id: 'approved',
        mode: 'expression',
        expression: 'input.ok',
        conditions: { rules: [], logic: 'and' },
      },
      {
        id: 'branch-1',
        mode: 'visual',
        expression: '',
        conditions: {
          logic: 'or',
          rules: [
            {
              sourcePortId: 'input-0',
              fieldPath: 'age',
              operator: 'gte',
              value: '18',
            },
          ],
        },
      },
    ]);
  });

  it('兼容旧 expression、field-comparison 与隐式配置', () => {
    expect(
      resolveConditionBranches({
        mode: 'expression',
        expression: ' input.ok ',
      })[0],
    ).toMatchObject({ mode: 'expression', expression: 'input.ok' });
    expect(
      resolveConditionBranches({
        mode: 'field-comparison',
        condition_field: 'state',
        expected_value: false,
      })[0],
    ).toMatchObject({
      conditions: { rules: [{ fieldPath: 'state', value: 'false' }] },
    });
    expect(
      resolveConditionBranches({ expression: 'ports[1] > 0' })[0].mode,
    ).toBe('expression');
    expect(
      resolveConditionBranches({ conditionField: 'kind', expectedValue: 3 })[0],
    ).toMatchObject({
      conditions: { rules: [{ fieldPath: 'kind', value: '3' }] },
    });
    expect(resolveConditionBranches({})).toEqual([]);
  });

  it('规则默认值正确且保留显式 source port', () => {
    expect(
      normalizeConditionGroup({
        rules: [
          { sourcePortId: '', fieldPath: 1 },
          { sourcePortId: 'input-2', field: 'name', operator: 3, value: 4 },
        ],
      }),
    ).toEqual({
      logic: 'and',
      rules: [
        {
          sourcePortId: 'input-0',
          fieldPath: '',
          operator: 'equals',
          value: '',
        },
        {
          sourcePortId: 'input-2',
          fieldPath: 'name',
          operator: 'equals',
          value: '',
        },
      ],
    });
  });

  it('表达式与 visual 分支区分空值并正确执行 and/or', () => {
    const empty = { rules: [], logic: 'and' as const };
    expect(
      evaluateConditionBranch(
        { mode: 'expression', expression: ' ', conditions: empty },
        {},
        {},
      ),
    ).toBe(false);
    expect(
      evaluateConditionBranch(
        {
          mode: 'expression',
          expression: 'input.count === 2',
          conditions: empty,
        },
        { count: 2 },
        {},
      ),
    ).toBe(true);
    expect(
      evaluateConditionBranch(
        { mode: 'expression', expression: '0', conditions: empty },
        {},
        {},
      ),
    ).toBe(false);
    const rules = [
      {
        sourcePortId: 'input-0',
        fieldPath: 'age',
        operator: 'gte',
        value: '18',
      },
      {
        sourcePortId: 'input-0',
        fieldPath: 'active',
        operator: 'equals',
        value: 'true',
      },
    ];
    const input = { 'input-0': { age: 20, active: false } };
    expect(
      evaluateConditionBranch(
        { mode: 'visual', expression: '', conditions: { rules, logic: 'and' } },
        input,
        flattenInput(input),
      ),
    ).toBe(false);
    expect(
      evaluateConditionBranch(
        { mode: 'visual', expression: '', conditions: { rules, logic: 'or' } },
        input,
        flattenInput(input),
      ),
    ).toBe(true);
    expect(
      evaluateConditionBranch(
        { mode: 'visual', expression: '', conditions: empty },
        input,
        {},
      ),
    ).toBe(false);
  });

  it.each([
    ['equals', 'alpha', 'alpha'],
    ['not_equals', 'alpha', 'beta'],
    ['contains', 'alphabet', 'pha'],
    ['not_contains', 'alphabet', 'zzz'],
    ['gt', 3, '2'],
    ['gte', 3, '3'],
    ['lt', 2, '3'],
    ['lte', 3, '3'],
    ['starts_with', 'alphabet', 'alpha'],
    ['ends_with', 'alphabet', 'bet'],
    ['regex_match', 'abc-42', '^abc-\\d+$'],
    ['unknown', 'same', 'same'],
  ])('运算符 %s 正确匹配', (operator, actual, expected) => {
    expect(
      evaluateConditionRule(
        {
          sourcePortId: 'input-0',
          fieldPath: 'value',
          operator: String(operator),
          value: String(expected),
        },
        { 'input-0': { value: actual } },
        {},
      ),
    ).toBe(true);
  });

  it('空值、非法 regex 与 expression operator 有可观察 fallback', () => {
    for (const value of [null, undefined, '', []]) {
      expect(
        evaluateConditionRule(
          {
            sourcePortId: 'input-0',
            fieldPath: 'value',
            operator: 'is_empty',
            value: '',
          },
          { 'input-0': { value } },
          {},
        ),
      ).toBe(true);
    }
    for (const value of [0, false, {}]) {
      expect(
        evaluateConditionRule(
          {
            sourcePortId: 'input-0',
            fieldPath: 'value',
            operator: 'is_not_empty',
            value: '',
          },
          { 'input-0': { value } },
          {},
        ),
      ).toBe(true);
    }
    expect(
      evaluateConditionRule(
        {
          sourcePortId: 'input-0',
          fieldPath: 'value',
          operator: 'regex_match',
          value: '[',
        },
        { 'input-0': { value: 'x' } },
        {},
      ),
    ).toBe(false);
    expect(
      evaluateConditionRule(
        {
          sourcePortId: '',
          fieldPath: '',
          operator: 'expression',
          value: '  ',
        },
        {},
        {},
      ),
    ).toBe(false);
    expect(
      evaluateConditionRule(
        {
          sourcePortId: '',
          fieldPath: '',
          operator: 'expression',
          value: 'ports[1] === 2 && flatInput["input-10"] === 10',
        },
        { 'input-10': 10, 'input-2': 2 },
        {},
      ),
    ).toBe(true);
    expect(
      evaluateExpression('input.value + ports[1]', { value: 3, 'input-0': 4 }),
    ).toBe(7);
  });

  it('字段值优先取 flatInput 并支持数组开头路径', () => {
    const input = { 'input-0': [{ id: 'runtime' }] };
    expect(
      resolveConditionFieldValue('input-0', '[0].id', input, {
        'input-0[0].id': 'flat',
      }),
    ).toBe('flat');
    expect(resolveConditionFieldValue('input-0', '[0].id', input, {})).toBe(
      'runtime',
    );
    expect(resolveConditionFieldValue('input-0', '', input, {})).toBe(
      input['input-0'],
    );
    expect(resolveConditionFieldValue('', 'id', input, {})).toBeUndefined();
  });

  it('规范化 node type、branch handle 且仅解包单键载荷', () => {
    expect([
      isConditionNode('condition'),
      isConditionNode('conditional'),
      isConditionNode('if'),
    ]).toEqual([true, true, false]);
    expect(
      ['branch-2', 'else', 'true', 'matched', 'false', 'anything'].map(
        normalizeConditionBranch,
      ),
    ).toEqual(['branch-2', 'else', 'branch-0', 'branch-0', 'else', 'else']);
    expect(
      [
        undefined,
        'branch-2',
        'matched-out',
        'true',
        'unmatched',
        'false',
        'other',
      ].map(normalizeConditionSourceHandle),
    ).toEqual([
      undefined,
      'branch-2',
      'branch-0',
      'branch-0',
      'else',
      'else',
      undefined,
    ]);
    expect(
      unwrapConditionBranchPayload('branch-0', { 'input-in': { id: 1 } }),
    ).toEqual({ id: 1 });
    expect(unwrapConditionBranchPayload('else', { input: 0 })).toBe(0);
    expect(
      unwrapConditionBranchPayload('branch-0', { input: 1, meta: 2 }),
    ).toEqual({ input: 1, meta: 2 });
    expect(unwrapConditionBranchPayload('other', { input: 1 })).toEqual({
      input: 1,
    });
    expect(unwrapConditionBranchPayload('true', 'primitive')).toBe('primitive');
  });

  it('解析循环停止条件与错误策略 fallback', () => {
    expect(
      resolveLoopStopCondition({
        stop_condition: {
          logic: 'or',
          rules: [null, { field: 'done', operator: 'equals', value: 'true' }],
        },
      }),
    ).toEqual({
      logic: 'or',
      rules: [
        {
          sourcePortId: 'input-0',
          fieldPath: 'done',
          operator: 'equals',
          value: 'true',
        },
      ],
    });
    expect(
      resolveLoopStopCondition({ stopCondition: { rules: [] } }),
    ).toBeUndefined();
    expect(resolveLoopStopCondition({ stopCondition: 'bad' })).toBeUndefined();
    expect(resolveLoopErrorStrategy({ errorStrategy: 'skip' })).toBe('skip');
    expect(resolveLoopErrorStrategy({ error_strategy: 'collect' })).toBe(
      'collect',
    );
    expect(resolveLoopErrorStrategy({ errorStrategy: 'continue' })).toBe(
      'stop',
    );
  });

  it('循环条件和列表保留端口优先级、真假与空列表语义', () => {
    const conditions = {
      rules: [
        {
          sourcePortId: 'input-0',
          fieldPath: 'score',
          operator: 'gte',
          value: '10',
        },
      ],
      logic: 'and' as const,
    };
    expect(
      evaluateLoopStopCondition(conditions, { 'input-0': { score: 10 } }),
    ).toBe(true);
    expect(evaluateLoopStopExpression('input.value === 5', 5)).toBe(true);
    expect(wrapLoopItemAsInput({ id: 1 })).toEqual({ id: 1 });
    expect(wrapLoopItemAsInput(null)).toEqual({ value: null });
    expect(normalizeLoopItemsInput({ 'items-in': [], items: [2] })).toEqual([]);
    expect(normalizeLoopItemsInput({ items: { payload: [1, 2] } })).toEqual([
      1, 2,
    ]);
    expect(normalizeLoopItemsInput({ 'exec-in': true, only: 'one' })).toEqual([
      'one',
    ]);
    expect(
      normalizeLoopItemsInput({ a: { none: true }, b: { content: [3] } }),
    ).toEqual([3]);
    expect(normalizeLoopItemsInput({ 'exec-in': true })).toEqual([]);
    expect(extractLoopItemsCandidate(false)).toEqual([false]);
    expect(extractLoopItemsCandidate(null)).toBeUndefined();
    expect(extractLoopItemsCandidate({ value: [] })).toEqual([]);
    expect(extractLoopItemsCandidate({ value: 'not-array' })).toBeUndefined();
    expect(coerceLoopItems(undefined)).toEqual([]);
    expect(coerceLoopItems([1])).toEqual([1]);
    expect(coerceLoopItems(0)).toEqual([0]);
  });
});
