import { describe, expect, it } from 'vitest';

import {
  APP_SPEC_CANDIDATE_KNOWLEDGE_DOCUMENTS_MAX,
  APP_SPEC_CANDIDATE_KNOWLEDGE_MAX,
  buildAppSpecCandidateCatalog,
  GENERATED_APP_SPEC_SYSTEM_PROMPT,
} from '../generated-app.app-spec-prompt';
import {
  createAgentBindingCandidateFixture,
  createWorkflowBindingCandidateFixture,
} from './generated-app-test-support';

describe('AppSpec 提示词', () => {
  it('候选目录带知识库名称、描述与文档名，按上限截断，供模型写出知识范围内的验收输入', () => {
    const documentNames = Array.from(
      { length: APP_SPEC_CANDIDATE_KNOWLEDGE_DOCUMENTS_MAX + 2 },
      (_, index) => `doc-${index}.md`,
    );
    const knowledge = Array.from(
      { length: APP_SPEC_CANDIDATE_KNOWLEDGE_MAX + 1 },
      (_, index) => ({
        name: `知识库 ${index}`,
        description: index === 0 ? '系统介绍宣传册' : null,
        documentNames,
      }),
    );

    const catalog = JSON.parse(
      buildAppSpecCandidateCatalog([
        { ...createWorkflowBindingCandidateFixture(), knowledge },
        { ...createAgentBindingCandidateFixture(), knowledge: [] },
      ]).json,
    );

    expect(catalog[0].knowledge).toHaveLength(APP_SPEC_CANDIDATE_KNOWLEDGE_MAX);
    expect(catalog[0].knowledge[0]).toEqual({
      name: '知识库 0',
      description: '系统介绍宣传册',
      documentNames: documentNames.slice(
        0,
        APP_SPEC_CANDIDATE_KNOWLEDGE_DOCUMENTS_MAX,
      ),
    });
    expect(catalog[1]).toMatchObject({ kind: 'agent', knowledge: [] });
  });

  it('系统提示要求验收输入落在知识范围内，结果断言只用 nonEmpty', () => {
    expect(GENERATED_APP_SPEC_SYSTEM_PROMPT).toContain('knowledge');
    expect(GENERATED_APP_SPEC_SYSTEM_PROMPT).toContain(
      '不要把工作流、Agent、知识库或文档的名称写进问题',
    );
    expect(GENERATED_APP_SPEC_SYSTEM_PROMPT).toContain(
      'expectResult 只有 assertion=nonEmpty 一种',
    );
    expect(GENERATED_APP_SPEC_SYSTEM_PROMPT).not.toMatch(/contains/);
  });
});
