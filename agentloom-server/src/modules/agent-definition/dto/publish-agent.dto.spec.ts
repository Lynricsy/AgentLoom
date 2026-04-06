import type { ArgumentMetadata } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { PublishAgentDto } from './publish-agent.dto';

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

describe('PublishAgentDto', () => {
  it('应接受 camelCase body', async () => {
    expect(
      transformWithDto(
        {
          label: '正式发布',
          releaseNotes: '补齐 Agent 顶部工具栏',
          versionId: '019d2a7c-c19c-7a9c-8233-db2b87a23de6',
        },
        PublishAgentDto,
        'body',
      ),
    ).toEqual({
      label: '正式发布',
      releaseNotes: '补齐 Agent 顶部工具栏',
      versionId: '019d2a7c-c19c-7a9c-8233-db2b87a23de6',
    });
  });

  it('应兼容 snake_case 与旧 changelog 字段', async () => {
    expect(
      transformWithDto(
        {
          release_notes: 'snake_case 发布说明',
          version_id: '019d2a7c-c19c-7a9c-8233-db2b87a23de6',
        },
        PublishAgentDto,
        'body',
      ),
    ).toEqual({
      label: undefined,
      releaseNotes: 'snake_case 发布说明',
      versionId: '019d2a7c-c19c-7a9c-8233-db2b87a23de6',
    });

    expect(
      transformWithDto(
        {
          changelog: 'legacy publish note',
        },
        PublishAgentDto,
        'body',
      ),
    ).toEqual({
      label: undefined,
      releaseNotes: 'legacy publish note',
      versionId: undefined,
    });
  });
});
