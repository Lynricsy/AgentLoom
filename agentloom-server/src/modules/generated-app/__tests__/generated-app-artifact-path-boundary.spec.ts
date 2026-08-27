import { describe, expect, it } from 'vitest';

import type { DrizzleDB } from '../../../database/database.module';
import { GeneratedAppArtifactService } from '../generated-app-artifact.service';
import { GeneratedAppArtifactNotFoundException } from '../generated-app.exceptions';
import { GeneratedAppRepository } from '../generated-app.repository';
import {
  createConfigService,
  mockTenantDb,
} from './generated-app-test-support';

// 复用本模块既有 repository/config mock 组合，避免绕过 service 的真实构造契约。
const configService = createConfigService();
const repository = new GeneratedAppRepository(
  mockTenantDb as unknown as DrizzleDB,
  configService,
);
const service = new GeneratedAppArtifactService(repository, configService);

describe('GeneratedAppArtifactService artifact path boundary', () => {
  it('应把合法 artifact 相对路径解析到 workspace 内', () => {
    expect(
      service.resolveSafeRelativePathInside(
        '/tmp/generated-app',
        'artifacts/gate-3/build.html',
      ),
    ).toBe('/tmp/generated-app/artifacts/gate-3/build.html');
  });

  it.each(['../secret', '/etc/passwd', 'a\\b', './artifact', 'a//b'])(
    '应拒绝越界或非规范 artifact 路径 %s',
    (relativePath) => {
      expect(() =>
        service.resolveSafeRelativePathInside(
          '/tmp/generated-app',
          relativePath,
        ),
      ).toThrow(GeneratedAppArtifactNotFoundException);
    },
  );
});
