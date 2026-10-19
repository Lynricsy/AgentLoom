import { describe, expect, it } from 'vitest';

import { CreateInterventionPolicySchema } from '../dto/create-intervention-policy.dto';
import { ListInterventionPoliciesQuerySchema } from '../dto/list-intervention-policies-query.dto';
import { UpdateInterventionPolicySchema } from '../dto/update-intervention-policy.dto';

describe('InterventionPolicy DTO schemas', () => {
  it('创建策略时拒绝非法 escalateToRole', () => {
    expect(() =>
      CreateInterventionPolicySchema.parse({
        nodeId: null,
        allowedRoles: ['owner'],
        timeoutSeconds: 900,
        timeoutAction: 'escalate',
        escalateToRole: 'not-a-role',
        notifyChannels: ['in_app'],
      }),
    ).toThrowError();
  });

  it('更新策略时拒绝非法 escalateToRole', () => {
    expect(() =>
      UpdateInterventionPolicySchema.parse({
        timeoutAction: 'escalate',
        escalateToRole: 'not-a-role',
        version: 1,
      }),
    ).toThrowError();
  });

  it('创建策略时剥离 body 中的 workflowId，目标工作流只取自路由', () => {
    const parsed = CreateInterventionPolicySchema.parse({
      workflowId: '019577a0-0000-7000-8000-000000000100',
    });

    expect(parsed).not.toHaveProperty('workflowId');
    expect(parsed.allowedRoles).toEqual(['owner', 'admin']);
  });

  it.each([
    [{ pageSize: '0' }],
    [{ page: 'abc' }],
    [{ page: '0' }],
    [{ pageSize: '1000' }],
    [{ pageSize: '1.5' }],
  ])('列表分页参数 %j 不合法时拒绝', (query) => {
    expect(ListInterventionPoliciesQuerySchema.safeParse(query).success).toBe(
      false,
    );
  });

  it('列表分页参数缺省为 page=1、pageSize=20，并把字符串转为数字', () => {
    expect(ListInterventionPoliciesQuerySchema.parse({})).toEqual({
      page: 1,
      pageSize: 20,
    });
    expect(
      ListInterventionPoliciesQuerySchema.parse({ page: '3', pageSize: '100' }),
    ).toEqual({ page: 3, pageSize: 100 });
  });
});
