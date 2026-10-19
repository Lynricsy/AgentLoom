import { describe, expect, it } from 'vitest';
import { CreateWorkflowDefinitionSchema } from '../dto/create-workflow-definition.dto';

describe('CreateWorkflowDefinitionSchema', () => {
  it('接受 snake_case 的模板来源', () => {
    expect(
      CreateWorkflowDefinitionSchema.parse({
        name: '从模板创建',
        template_slug: 'customer-feedback-classifier',
      }),
    ).toEqual({
      name: '从模板创建',
      template_slug: 'customer-feedback-classifier',
    });
  });

  it.each([
    ['templateSlug', { templateSlug: 'customer-feedback-classifier' }],
    ['nodes', { nodes: [] }],
  ])('拒绝未知键 %s，而不是静默剥离后建出空白工作流', (_key, extra) => {
    const result = CreateWorkflowDefinitionSchema.safeParse({
      name: '未知键',
      ...extra,
    });

    expect(result.success).toBe(false);
  });
});
