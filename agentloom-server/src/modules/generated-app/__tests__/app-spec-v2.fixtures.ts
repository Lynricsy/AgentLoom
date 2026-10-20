/**
 * AppSpec v2 测试数据：「问答页面：输入问题，调用文档问答工作流返回答案与引用」。
 * 草稿是模型输出形状（带默认值的字段可省略），完整规格经 `buildAppSpecV2FromDraft` 补全。
 */
import type { z } from 'zod';

import { buildAppSpecV2FromDraft } from '../generated-app.app-spec.util';
import {
  GeneratedAppSpecDraftSchema,
  type GeneratedAppSpecV2,
} from '../types/app-spec-v2.schema';
import type {
  AgentBindingCandidate,
  WorkflowBindingCandidate,
} from '../types/generation-v2.ports';

export const QA_TENANT_ID = '11111111-1111-4111-8111-111111111111';
export const QA_USER_ID = '22222222-2222-4222-8222-222222222222';
export const QA_APP_ID = '33333333-3333-4333-8333-333333333333';
export const QA_WORKFLOW_ID = '01a15536-d0cb-72a0-b687-72b9d721f193';
export const QA_WORKFLOW_VERSION_ID = '01a15536-d0cb-72a0-b687-72b9d721f194';
export const QA_AGENT_ID = '01a15536-4a63-757d-9077-0bbd88bfc037';
export const QA_AGENT_VERSION_ID = '01a15536-4a63-757d-9077-0bbd88bfc038';
export const QA_MODEL_ID = '01a154d7-8c8f-7c7b-87f3-a94220c05251';
export const QA_PROMPT = '一个问答页面：输入问题，调用上述工作流返回答案与引用';

/** 已发布的文档问答工作流：必填 text 输入 question；text-output 答案 + json-output 结构化结果 */
export function qaWorkflowCandidate(
  overrides: Partial<WorkflowBindingCandidate> = {},
): WorkflowBindingCandidate {
  return {
    kind: 'workflow',
    workflowDefinitionId: QA_WORKFLOW_ID,
    workflowVersionId: QA_WORKFLOW_VERSION_ID,
    name: 'e2e 文档问答',
    description: '在产品文档知识库中检索并回答问题，给出引用',
    inputSchema: {
      version: 2,
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
    },
    outputNodes: [
      { nodeId: 'out-answer', nodeType: 'text-output', label: '答案' },
      { nodeId: 'out-structured', nodeType: 'json-output', label: '结构化答案' },
    ],
    ...overrides,
  };
}

export function qaAgentCandidate(): AgentBindingCandidate {
  return {
    kind: 'agent',
    agentDefinitionId: QA_AGENT_ID,
    agentVersionId: QA_AGENT_VERSION_ID,
    name: 'e2e 文档问答 Agent',
    description: null,
  };
}

/** 模型输出的草稿（结构化输出的 data） */
export function qaDraft(): z.input<typeof GeneratedAppSpecDraftSchema> {
  return {
    appName: '文档问答',
    summary: '输入问题，调用文档问答工作流返回答案与引用。',
    userGoal: '终端用户提问并得到带引用的答案',
    actors: ['终端用户'],
    requirements: [
      {
        id: 'req-ask',
        text: '输入问题后返回答案与引用',
        source: 'prompt',
      },
    ],
    inputForm: {
      title: '提问',
      submitLabel: '提问',
      fields: [
        { id: 'question', label: '问题', type: 'textarea', required: true },
      ],
    },
    resultView: {
      title: '回答',
      sections: [
        { id: 'answer', label: '答案', format: 'markdown' },
        { id: 'citations', label: '引用', format: 'citations' },
      ],
    },
    binding: {
      kind: 'workflow',
      workflowDefinitionId: QA_WORKFLOW_ID,
      inputMapping: [{ fieldId: 'question', workflowInputFieldId: 'question' }],
      outputMapping: [
        { sectionId: 'answer', nodeId: 'out-answer' },
        { sectionId: 'citations', nodeId: 'out-structured', path: 'citations' },
      ],
    },
    acceptanceScenarios: [
      {
        id: 'scenario-ask',
        title: '提问后看到答案与引用',
        scope: 'requirement',
        requirementIds: ['req-ask'],
        given: ['公开页已打开'],
        when: ['输入问题并提交'],
        then: ['展示答案', '展示引用'],
        browserSteps: [
          {
            action: 'fill',
            fieldId: 'question',
            value: '最多可以同时运行几个子 Agent？',
          },
          { action: 'submit' },
          { action: 'expectResult', sectionId: 'answer', assertion: 'nonEmpty' },
          {
            action: 'expectResult',
            sectionId: 'citations',
            assertion: 'nonEmpty',
          },
        ],
      },
    ],
  };
}

/** 固定到 QA_WORKFLOW_VERSION_ID 的完整 AppSpec v2 */
export function qaAppSpecV2(): GeneratedAppSpecV2 {
  const draft = GeneratedAppSpecDraftSchema.parse(qaDraft());
  if (draft.binding.kind !== 'workflow') {
    throw new Error('qaDraft 绑定的是工作流');
  }
  return buildAppSpecV2FromDraft(draft, {
    binding: { ...draft.binding, workflowVersionId: QA_WORKFLOW_VERSION_ID },
    modelConfigId: QA_MODEL_ID,
    attempt: 1,
    prompt: QA_PROMPT,
    generatedAt: new Date('2026-10-20T00:00:00.000Z'),
  });
}
