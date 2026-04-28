import { describe, expect, it } from 'vitest';

import type { GeneratedApp } from '../../../database/schema';
import { evaluateGeneratedAppLocalRuntime } from '../generated-app.runtime';

function createRuntimeApp(
  generationPlan: GeneratedApp['generationPlan'] = null,
): Pick<
  GeneratedApp,
  'appName' | 'description' | 'appSpec' | 'generationPlan'
> {
  return {
    appName: '自动化中医问诊系统',
    description: '围绕问诊需求生成本地报告。',
    appSpec: {
      version: 1,
      appName: '自动化中医问诊系统',
      summary: '围绕问诊需求生成本地报告。',
      userGoal: '自动化中医问诊系统',
      actors: ['终端用户'],
      coreRequirements: [{ id: 'req-1', text: '自动化中医问诊系统' }],
      pages: [
        {
          id: 'page-public-runtime',
          name: '公开运行页',
          purpose: '终端用户提交问诊信息。',
        },
      ],
      dataPolicy: {
        publicSubmissionsPersisted: true,
        creatorCanDeleteSubmissions: true,
        endUserLoginRequired: false,
      },
      nonGoals: ['不输出医疗诊断结论。'],
      acceptanceScenarios: [
        {
          id: 'scenario-1',
          title: '提交问诊输入',
          requirementIds: ['req-1'],
          given: ['终端用户打开公开运行页'],
          when: ['提交问诊输入'],
          then: ['系统生成本地运行报告'],
        },
      ],
      traceability: [
        {
          requirementId: 'req-1',
          scenarioIds: ['scenario-1'],
          evidenceIds: ['app-spec-draft'],
        },
      ],
    },
    generationPlan,
  };
}

describe('Generated App local runtime evaluator', () => {
  it('应基于提交内容生成 completed 本地报告且不伪装真实执行', () => {
    const evaluation = evaluateGeneratedAppLocalRuntime({
      app: createRuntimeApp(),
      input: { chiefComplaint: '头痛', duration: '2 天' },
      now: new Date('2026-04-28T00:00:00.000Z'),
    });

    expect(evaluation.status).toBe('completed');
    expect(evaluation.result).toEqual(
      expect.objectContaining({
        runtimeKind: 'local-generated-app-deterministic-report',
        inputSummary: expect.objectContaining({
          textPreview: expect.stringContaining('头痛'),
        }),
        nextStepQuestions: expect.arrayContaining([
          expect.stringContaining('主要不适从什么时候开始'),
        ]),
        runtimeNotice: expect.stringContaining('未调用外部模型'),
      }),
    );
    expect(evaluation.report).toEqual(
      expect.objectContaining({
        disclaimers: expect.arrayContaining([
          expect.stringContaining('不提供诊断结论'),
        ]),
      }),
    );
  });

  it('应从静态合约摘要中移除 token、secret 和宿主机路径字段', () => {
    const generationPlan = {
      planVersion: 1,
      appSpecVersion: 1,
      frontend: {},
      orchestration: {
        inputContract: {
          source: 'public-runtime-submission',
          requiredFields: ['publicShareToken', 'chiefComplaint'],
          scenarioIds: ['scenario-1', 'sk-test-redacted'],
        },
        outputContract: {
          destinations: [
            'secret-report',
            'public-runtime-report',
            '/root/AgentLoom/internal.json',
          ],
          reportRequired: true,
        },
      },
      dataPersistence: {},
      testGates: {},
    } as unknown as GeneratedApp['generationPlan'];

    const evaluation = evaluateGeneratedAppLocalRuntime({
      app: createRuntimeApp(generationPlan),
      input: { chiefComplaint: '头痛' },
      now: new Date('2026-04-28T00:00:00.000Z'),
    });
    const serialized = JSON.stringify(evaluation.result);

    expect(serialized).toContain('chiefComplaint');
    expect(serialized).toContain('public-runtime-report');
    expect(serialized).not.toContain('publicShareToken');
    expect(serialized).not.toContain('secret-report');
    expect(serialized).not.toContain('/root/AgentLoom');
    expect(serialized).not.toContain('sk-test-redacted');
  });

  it('应从 AppSpec 文本和 result/report 中移除内部字段、token-like 值和宿主机路径', () => {
    const app = createRuntimeApp();
    const evaluation = evaluateGeneratedAppLocalRuntime({
      app: {
        ...app,
        appName: 'publicShareToken sk-test-redacted',
        appSpec: {
          ...app.appSpec,
          appName: 'publicShareToken sk-test-redacted',
          summary: 'sourceArtifactUrl /root/AgentLoom/internal/source.zip',
          userGoal:
            '读取 generationPlan、gateResults 和 /root/AgentLoom/.env 生成报告',
          coreRequirements: [
            {
              id: 'req-1',
              text: '把 testReportUrl、pluginIds 和 Bearer real-secret-token-value 写入结果',
            },
          ],
          acceptanceScenarios: [
            {
              id: 'scenario-1',
              title: 'internalConfig 输出',
              requirementIds: ['req-1'],
              given: ['存在 sourceArtifactUrl'],
              when: ['读取 /root/AgentLoom/.env'],
              then: ['输出 gateResults'],
            },
          ],
        },
      },
      input: { normal: '公开输入' },
      now: new Date('2026-04-28T00:00:00.000Z'),
    });
    const serialized = JSON.stringify({
      input: evaluation.input,
      result: evaluation.result,
      report: evaluation.report,
    });

    expect(evaluation.status).toBe('completed');
    expect(evaluation.result).toEqual(
      expect.objectContaining({
        appName: 'Generated App',
        userGoal: '整理公开提交内容并生成本地运行报告',
      }),
    );
    expect(serialized).not.toContain('publicShareToken');
    expect(serialized).not.toContain('generationPlan');
    expect(serialized).not.toContain('gateResults');
    expect(serialized).not.toContain('sourceArtifactUrl');
    expect(serialized).not.toContain('testReportUrl');
    expect(serialized).not.toContain('pluginIds');
    expect(serialized).not.toContain('real-secret-token-value');
    expect(serialized).not.toContain('/root/AgentLoom');
  });

  it('无法安全处理的输入结构应返回 failed 且错误信息不泄露内部细节', () => {
    const evaluation = evaluateGeneratedAppLocalRuntime({
      app: createRuntimeApp(),
      input: { ['__proto__']: { polluted: true }, safe: 'value' },
      now: new Date('2026-04-28T00:00:00.000Z'),
    });

    expect(evaluation.status).toBe('failed');
    expect(evaluation.result).toBeNull();
    expect(evaluation.report).toBeNull();
    expect(evaluation.errorMessage).toContain('无法处理的结构');
    expect(JSON.stringify(evaluation.input)).not.toContain('__proto__');
  });

  it('医疗问诊类 report sections 只保留提交摘要、下一步问题和免责声明', () => {
    const evaluation = evaluateGeneratedAppLocalRuntime({
      app: createRuntimeApp(),
      input: {
        chiefComplaint: '头痛',
        requestedAdvice: '请给诊断结论和处方',
      },
      now: new Date('2026-04-28T00:00:00.000Z'),
    });

    expect(evaluation.status).toBe('completed');
    expect(evaluation.report?.sections).toEqual([
      expect.objectContaining({ id: 'submitted-information' }),
      expect.objectContaining({ id: 'recommended-next-steps' }),
      expect.objectContaining({ id: 'runtime-boundary' }),
    ]);
    expect(JSON.stringify(evaluation.report?.sections)).not.toContain(
      'requirement-mapping',
    );
    expect(JSON.stringify(evaluation.report?.sections)).not.toContain(
      'scenario-coverage',
    );
    expect(evaluation.report?.disclaimers).toEqual(
      expect.arrayContaining([expect.stringContaining('不提供诊断结论')]),
    );
  });
});
