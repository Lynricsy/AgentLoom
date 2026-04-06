import type { ArgumentMetadata } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { CreateAgentVersionDto } from './create-agent-version.dto';

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

describe('CreateAgentVersionDto', () => {
  it('应接受 label 与 releaseNotes', async () => {
    expect(
      transformWithDto(
        {
          label: '稳定快照',
          releaseNotes: '补齐顶部版本工具栏',
        },
        CreateAgentVersionDto,
        'body',
      ),
    ).toEqual({
      label: '稳定快照',
      releaseNotes: '补齐顶部版本工具栏',
    });
  });

  it('应兼容 snake_case release_notes 与旧 changelog 字段', async () => {
    expect(
      transformWithDto(
        {
          release_notes: 'snake_case 说明',
        },
        CreateAgentVersionDto,
        'body',
      ),
    ).toEqual({
      label: undefined,
      releaseNotes: 'snake_case 说明',
    });

    expect(
      transformWithDto(
        {
          changelog: 'legacy changelog',
        },
        CreateAgentVersionDto,
        'body',
      ),
    ).toEqual({
      label: undefined,
      releaseNotes: 'legacy changelog',
    });
  });
});
