import { describe, expect, it } from 'vitest';

import { CreateInterventionPolicySchema } from '../dto/create-intervention-policy.dto';
import { UpdateInterventionPolicySchema } from '../dto/update-intervention-policy.dto';

describe('InterventionPolicy DTO schemas', () => {
  it('创建策略时拒绝非法 escalateToRole', () => {
    expect(() =>
      CreateInterventionPolicySchema.parse({
        workflowId: '019577a0-0000-7000-8000-000000000100',
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
});
