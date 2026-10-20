import { describe, expect, it } from 'vitest';

import {
  buildGate0Checks,
  buildInitialAppSpec,
  evaluateGate0AppSpec,
} from '../generated-app.app-spec.util';
import type { GeneratedAppSpecV1 } from '../types/generated-app.types';

const PROMPT = '一个问答页面：输入问题，调用上述工作流返回答案与引用';

function failedCheckIds(appSpec: GeneratedAppSpecV1): string[] {
  return buildGate0Checks(appSpec)
    .filter((check) => !check.passed)
    .map((check) => check.id);
}

describe('evaluateGate0AppSpec：需求本身的验收场景', () => {
  it('模板 AppSpec 只有平台流程场景，Gate 0 不能通过', () => {
    const appSpec = buildInitialAppSpec(PROMPT);

    const evaluation = evaluateGate0AppSpec(appSpec);

    expect(evaluation.status).toBe('failed');
    expect(evaluation.summary).toContain('固定模板');
    expect(evaluation.repairInstructions).toContain('无法通过 Gate 0');
    expect(failedCheckIds(appSpec)).toEqual([
      'prompt-requirement-verification',
    ]);
    expect(evaluation.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'gate-0-prompt-requirement-verification',
          summary: expect.stringContaining('需求 req-1 只被平台流程场景引用'),
        }),
      ]),
    );
  });

  it('prompt 需求有业务验收场景时通过', () => {
    const template = buildInitialAppSpec(PROMPT);
    const appSpec: GeneratedAppSpecV1 = {
      ...template,
      acceptanceScenarios: [
        ...template.acceptanceScenarios,
        {
          id: 'scenario-qa',
          title: '终端用户提问后看到答案与引用',
          requirementIds: ['req-1'],
          given: ['公开运行页已打开'],
          when: ['终端用户输入问题并提交'],
          then: ['页面展示答案', '页面展示引用来源'],
        },
      ],
      traceability: template.traceability.map((entry) =>
        entry.requirementId === 'req-1'
          ? { ...entry, scenarioIds: [...entry.scenarioIds, 'scenario-qa'] }
          : entry,
      ),
    };

    expect(evaluateGate0AppSpec(appSpec).status).toBe('passed');
  });

  it('平台约束需求（source=platform）只有平台场景也可以通过该检查', () => {
    const appSpec = buildInitialAppSpec(PROMPT);

    expect(
      appSpec.coreRequirements.find((requirement) => requirement.id === 'req-2')
        ?.source,
    ).toBe('platform');
    expect(failedCheckIds(appSpec)).not.toContain('requirement-coverage');
  });
});
