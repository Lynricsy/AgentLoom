import { describe, expect, it } from 'vitest';

import { resolveEdgePortTypes } from '../../execution/edge-port-type.util';
import { isPortTypeCompatible } from '../../execution/execution.exceptions';
import { collectWorkflowGraphStructureErrors } from '../../workflow-definition/utils/validate-workflow-graph-structure.utils';
import {
  GENERATED_APP_AGENT_WRAPPER_NODE_IDS,
  buildAgentWrapperWorkflowGraph,
  extractGeneratedAppRuntimeResult,
  isAgentWrapperSnapshotCurrent,
  mapGeneratedAppSubmission,
} from '../generated-app.runtime-binding.util';
import type { GeneratedAppSpecV2 } from '../types/app-spec-v2.schema';
import {
  APP_ID,
  V2_AGENT_DEFINITION_ID,
  V2_AGENT_VERSION_ID,
  WORKFLOW_DEFINITION_ID,
  WORKFLOW_VERSION_ID,
  createAgentAppSpecV2Fixture,
  createAppSpecV2Fixture,
} from './generated-app-test-support';

const RUNTIME = {
  workflowDefinitionId: WORKFLOW_DEFINITION_ID,
  workflowVersionId: WORKFLOW_VERSION_ID,
  inputSchemaVersion: 4,
};

function completedStep(nodeId: string, result: Record<string, unknown>) {
  return { nodeId, status: 'completed', result };
}

describe('mapGeneratedAppSubmission', () => {
  it('工作流绑定按 inputMapping 改键，只传映射到且已填写的字段，并带固定版本与契约版本', () => {
    const base = createAppSpecV2Fixture();
    const spec: GeneratedAppSpecV2 = {
      ...base,
      binding: {
        ...base.binding,
        kind: 'workflow',
        workflowDefinitionId: WORKFLOW_DEFINITION_ID,
        workflowVersionId: WORKFLOW_VERSION_ID,
        inputMapping: [
          { fieldId: 'question', workflowInputFieldId: 'query' },
          { fieldId: 'tone', workflowInputFieldId: 'style' },
        ],
        outputMapping: [{ sectionId: 'answer', nodeId: 'out-answer' }],
      },
    };

    expect(
      mapGeneratedAppSubmission(spec, RUNTIME, {
        question: '最多几个子 Agent？',
        unmapped: 'x',
      }),
    ).toEqual({
      workflowDefinitionId: WORKFLOW_DEFINITION_ID,
      workflowVersionId: WORKFLOW_VERSION_ID,
      inputParams: { query: '最多几个子 Agent？' },
      schemaVersion: 4,
    });
  });

  it('Agent 绑定的包装工作流输入字段与表单同 id，表单值原样传入', () => {
    const request = mapGeneratedAppSubmission(
      createAgentAppSpecV2Fixture(),
      { ...RUNTIME, inputSchemaVersion: undefined },
      { question: '你好', topics: ['a', 'b'] },
    );

    expect(request.inputParams).toEqual({
      question: '你好',
      topics: ['a', 'b'],
    });
    expect(request.schemaVersion).toBeUndefined();
  });
});

describe('extractGeneratedAppRuntimeResult', () => {
  const spec = createAppSpecV2Fixture();

  it('text-output 取答案，json-output 按 path 取引用并统一为 title/quote/source', () => {
    const result = extractGeneratedAppRuntimeResult(spec, {
      status: 'completed',
      steps: [
        completedStep('trigger', { payload: { question: 'q' } }),
        completedStep('out-answer', {
          content: '最多可以同时运行 10 个子 Agent。',
        }),
        completedStep('out-structured', {
          json: {
            answer: '10 个',
            citations: [
              {
                doc: 'AgentLoom-系统介绍.pdf',
                quote: '最多同时运行 10 个子 Agent',
              },
              '委派深度上限 5 层',
              { unrelated: true },
            ],
          },
        }),
      ],
    });

    expect(result).toEqual({
      status: 'completed',
      publicError: null,
      sections: [
        {
          sectionId: 'answer',
          label: '答案',
          format: 'markdown',
          value: '最多可以同时运行 10 个子 Agent。',
        },
        {
          sectionId: 'citations',
          label: '引用',
          format: 'citations',
          value: [
            {
              title: 'AgentLoom-系统介绍.pdf',
              quote: '最多同时运行 10 个子 Agent',
            },
            { quote: '委派深度上限 5 层' },
          ],
        },
      ],
    });
  });

  it('缺少某个分区的输出时判失败并说明缺哪部分，已取到的分区照常返回', () => {
    const result = extractGeneratedAppRuntimeResult(spec, {
      status: 'completed',
      steps: [
        completedStep('out-answer', { content: '答案' }),
        // 结构化输出没有 citations 键
        completedStep('out-structured', { json: { answer: '答案' } }),
      ],
    });

    expect(result.status).toBe('failed');
    expect(result.publicError).toBe('应用没有生成以下结果：引用。');
    expect(result.sections.map((section) => section.sectionId)).toEqual([
      'answer',
    ]);
  });

  it('输出节点未完成（失败或未执行）时同样视为缺失', () => {
    const result = extractGeneratedAppRuntimeResult(spec, {
      status: 'completed',
      steps: [
        { nodeId: 'out-answer', status: 'failed', result: { content: '半截' } },
      ],
    });

    expect(result).toMatchObject({
      status: 'failed',
      sections: [],
      publicError: '应用没有生成以下结果：答案、引用。',
    });
  });

  it('执行失败或取消只给公开可见的通用原因，不带节点与错误细节', () => {
    const failed = extractGeneratedAppRuntimeResult(spec, {
      status: 'failed',
      steps: [
        {
          nodeId: 'agent-1',
          status: 'failed',
          result: { error: 'ECONNREFUSED /root/secrets.json' },
        },
      ],
    });
    const cancelled = extractGeneratedAppRuntimeResult(spec, {
      status: 'cancelled',
      steps: [],
    });

    expect(failed).toEqual({
      status: 'failed',
      sections: [],
      publicError: '本次处理未能完成，请稍后重试。',
    });
    expect(JSON.stringify(failed)).not.toContain('agent-1');
    expect(cancelled.publicError).toBe('本次处理已取消，请重新提交。');
  });

  it('执行中返回 running 且没有分区', () => {
    for (const status of ['pending', 'running', 'paused']) {
      expect(
        extractGeneratedAppRuntimeResult(spec, { status, steps: [] }),
      ).toEqual({ status: 'running', sections: [], publicError: null });
    }
  });

  it('公开结果里的凭据与宿主机路径逐段替换，不整段丢弃答案', () => {
    const result = extractGeneratedAppRuntimeResult(spec, {
      status: 'completed',
      steps: [
        completedStep('out-answer', {
          content:
            '配置文件在 /root/.config/agentloom/local.env，请求头 Bearer abcdefghijklmnop，其余步骤见文档。',
        }),
        completedStep('out-structured', { json: { citations: [] } }),
      ],
    });

    const answer = result.sections[0]?.value as string;
    expect(answer).toContain('其余步骤见文档');
    expect(answer).not.toContain('/root/');
    expect(answer).not.toContain('abcdefghijklmnop');
    // 空引用数组是有效输出（模型没有找到出处），不判缺失
    expect(result.status).toBe('completed');
  });

  it('json-output 包装的数组与 text-output 中的 JSON 字符串都能取到引用', () => {
    const base = createAppSpecV2Fixture();
    const textJsonSpec: GeneratedAppSpecV2 = {
      ...base,
      binding: {
        ...base.binding,
        kind: 'workflow',
        workflowDefinitionId: WORKFLOW_DEFINITION_ID,
        workflowVersionId: WORKFLOW_VERSION_ID,
        inputMapping: [
          { fieldId: 'question', workflowInputFieldId: 'question' },
        ],
        outputMapping: [
          { sectionId: 'answer', nodeId: 'out-text', path: 'answer' },
          { sectionId: 'citations', nodeId: 'out-array' },
        ],
      },
    };

    const result = extractGeneratedAppRuntimeResult(textJsonSpec, {
      status: 'completed',
      steps: [
        completedStep('out-text', {
          content: JSON.stringify({ answer: '10 个' }),
        }),
        completedStep('out-array', {
          json: { value: [{ title: '宣传册', source: 'p.7' }] },
        }),
      ],
    });

    expect(result.status).toBe('completed');
    expect(result.sections.map((section) => section.value)).toEqual([
      '10 个',
      [{ title: '宣传册', source: 'p.7' }],
    ]);
  });

  it('Agent 绑定从包装工作流的回复节点取结果', () => {
    const result = extractGeneratedAppRuntimeResult(
      createAgentAppSpecV2Fixture(),
      {
        status: 'completed',
        steps: [
          completedStep(GENERATED_APP_AGENT_WRAPPER_NODE_IDS.reply, {
            content: '你好，我是宣传册助手。',
          }),
        ],
      },
    );

    expect(result).toEqual({
      status: 'completed',
      publicError: null,
      sections: [
        {
          sectionId: 'reply',
          label: '回复',
          format: 'markdown',
          value: '你好，我是宣传册助手。',
        },
      ],
    });
  });
});

describe('buildAgentWrapperWorkflowGraph', () => {
  it('trigger → agent → text-output 通过发布前的图结构与端口类型校验', () => {
    const graph = buildAgentWrapperWorkflowGraph(
      createAgentAppSpecV2Fixture(),
      {
        appId: APP_ID,
      },
    );

    expect(
      collectWorkflowGraphStructureErrors(graph.nodes, graph.edges),
    ).toEqual([]);
    for (const edge of graph.edges) {
      const detail = resolveEdgePortTypes(edge, graph.nodes);
      if (detail) {
        expect(
          isPortTypeCompatible(detail.sourceType, detail.targetType),
          `${edge.id}: ${detail.sourceType} → ${detail.targetType}`,
        ).toBe(true);
      }
    }
    const agentNode = graph.nodes.find(
      (node) => node.id === GENERATED_APP_AGENT_WRAPPER_NODE_IDS.agent,
    );
    expect(agentNode?.data).toMatchObject({
      nodeType: 'agent',
      agentDefinitionId: V2_AGENT_DEFINITION_ID,
      agentVersionId: V2_AGENT_VERSION_ID,
      agentRuntimeMode: 'no_sandbox',
      generatedAppId: APP_ID,
    });
    expect(graph.inputSchema).toEqual({
      version: 1,
      collectionMode: 'form',
      fields: [
        {
          id: 'question',
          type: 'text',
          label: '问题',
          required: true,
          validation: { maxLength: 2000 },
        },
      ],
    });
  });

  it('版本快照的指纹随绑定的 Agent 版本与表单字段变化', () => {
    const spec = createAgentAppSpecV2Fixture();
    const { nodes } = buildAgentWrapperWorkflowGraph(spec, { appId: APP_ID });

    expect(isAgentWrapperSnapshotCurrent(spec, nodes)).toBe(true);
    expect(
      isAgentWrapperSnapshotCurrent(
        {
          ...spec,
          binding: {
            ...spec.binding,
            kind: 'agent',
            agentDefinitionId: V2_AGENT_DEFINITION_ID,
            agentVersionId: '99999999-9999-4999-8999-999999999993',
            replySectionId: 'reply',
          },
        },
        nodes,
      ),
    ).toBe(false);
    expect(
      isAgentWrapperSnapshotCurrent(
        {
          ...spec,
          inputForm: {
            ...spec.inputForm,
            fields: [{ ...spec.inputForm.fields[0], required: false }],
          },
        },
        nodes,
      ),
    ).toBe(false);
    expect(isAgentWrapperSnapshotCurrent(spec, [])).toBe(false);
  });

  it('工作流绑定不构建包装工作流', () => {
    expect(() =>
      buildAgentWrapperWorkflowGraph(createAppSpecV2Fixture(), {
        appId: APP_ID,
      }),
    ).toThrow('只有 Agent 绑定');
  });
});
