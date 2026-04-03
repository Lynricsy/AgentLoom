import type { ArgumentMetadata } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { CreateAgentDefinitionDto } from './create-agent-definition.dto';

const pipe = new ZodValidationPipe();

function transformWithDto<T>(
  value: unknown,
  metatype: new (...args: never[]) => T,
  type: ArgumentMetadata['type'],
): T {
  return pipe.transform(value, {
    type,
    metatype,
    data: undefined,
  }) as T;
}

describe('CreateAgentDefinitionDto', () => {
  it('应同时接受 camelCase 与 snake_case 的 runtimeMode', async () => {
    expect(
      transformWithDto(
        {
          name: 'No Sandbox Agent',
          runtimeMode: 'no_sandbox',
          globalSandboxConfig: {
            enabled: true,
          },
        },
        CreateAgentDefinitionDto,
        'body',
      ),
    ).toEqual({
      name: 'No Sandbox Agent',
      description: undefined,
      icon: undefined,
      runtimeMode: 'no_sandbox',
      globalSandboxConfig: {
        enabled: true,
      },
    });

    expect(
      transformWithDto(
        {
          name: 'Sandbox Agent',
          description: 'snake_case payload',
          runtime_mode: 'sandbox',
          global_sandbox_config: {
            enabled: true,
            timeoutSeconds: 600,
          },
        },
        CreateAgentDefinitionDto,
        'body',
      ),
    ).toEqual({
      name: 'Sandbox Agent',
      description: 'snake_case payload',
      icon: undefined,
      runtimeMode: 'sandbox',
      globalSandboxConfig: {
        enabled: true,
        timeoutSeconds: 600,
      },
    });
  });
});
