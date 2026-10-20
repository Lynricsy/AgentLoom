import type { GeneratedAppSpec } from '../types'

/** 测试共用的 AppSpec v2：一个文档问答应用，绑定工作流的固定版本 */
export function makeGeneratedAppSpecV2(
  overrides: Partial<GeneratedAppSpec> = {},
): GeneratedAppSpec {
  return {
    version: 2,
    appName: '文档问答助手',
    summary: '输入问题，返回答案与文档引用。',
    userGoal: '快速从产品文档中找到答案。',
    actors: ['终端用户', '应用创建者'],
    coreRequirements: [
      { id: 'req-answer', text: '根据问题返回答案与引用。', source: 'prompt' },
      {
        id: 'req-platform-persist',
        text: '公开提交被保存，创建者可查看和删除。',
        source: 'platform',
      },
    ],
    pages: [
      {
        id: 'public-runtime',
        name: '问答页',
        purpose: '终端用户提问并查看答案。',
      },
    ],
    inputForm: {
      title: '文档问答',
      description: '',
      submitLabel: '提问',
      fields: [
        {
          id: 'question',
          label: '问题',
          type: 'textarea',
          required: true,
          placeholder: '',
          helpText: '',
          maxLength: 500,
        },
      ],
    },
    resultView: {
      title: '回答',
      emptyState: '提交后在这里显示结果。',
      sections: [
        { id: 'answer', label: '答案', format: 'markdown' },
        { id: 'citations', label: '引用', format: 'citations' },
      ],
    },
    binding: {
      kind: 'workflow',
      workflowDefinitionId: 'workflow-qa',
      workflowVersionId: 'workflow-qa-v1',
      inputMapping: [{ fieldId: 'question', workflowInputFieldId: 'question' }],
      outputMapping: [
        { sectionId: 'answer', nodeId: 'out', path: 'answer' },
        { sectionId: 'citations', nodeId: 'out', path: 'citations' },
      ],
    },
    dataPolicy: {
      publicSubmissionsPersisted: true,
      creatorCanDeleteSubmissions: true,
      endUserLoginRequired: false,
    },
    nonGoals: ['不回答文档以外的问题。'],
    acceptanceScenarios: [
      {
        id: 'scenario-answer',
        title: '提问后得到答案',
        scope: 'requirement',
        requirementIds: ['req-answer'],
        given: ['打开公开页'],
        when: ['输入问题并提交'],
        then: ['答案分区非空'],
        browserSteps: [
          { action: 'fill', fieldId: 'question', value: '工作流有哪几种状态？' },
          { action: 'submit' },
          { action: 'expectResult', sectionId: 'answer', assertion: 'nonEmpty' },
        ],
      },
    ],
    traceability: [
      {
        requirementId: 'req-answer',
        scenarioIds: ['scenario-answer'],
        fieldIds: ['question'],
        sectionIds: ['answer', 'citations'],
      },
    ],
    generation: {
      modelConfigId: 'model-config-1',
      generatedAt: '2026-10-20T00:00:00.000Z',
      attempt: 1,
      promptSha256: 'a'.repeat(64),
    },
    ...overrides,
  }
}
