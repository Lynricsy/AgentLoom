import { describe, expect, it } from 'vitest';

import type { DrizzleDB } from '../../../database/database.module';
import { GeneratedAppArtifactService } from '../generated-app-artifact.service';
import { GeneratedAppArtifactNotFoundException } from '../generated-app.exceptions';
import { GeneratedAppRepository } from '../generated-app.repository';
import {
  createConfigService,
  createStorageServiceMock,
  mockTenantDb,
} from './generated-app-test-support';

// 复用本模块既有 repository/storage mock 组合，避免绕过 service 的真实构造契约。
const repository = new GeneratedAppRepository(
  mockTenantDb as unknown as DrizzleDB,
  createConfigService(),
);
const service = new GeneratedAppArtifactService(
  repository,
  createStorageServiceMock(),
);
const PREFIX = 'tenants/t1/generated-apps/a1/runs/r1/gate-3';

describe('GeneratedAppArtifactService artifact path boundary', () => {
  it('应把合法 artifact 相对路径拼到工作区前缀下', () => {
    expect(
      service.resolveWorkspaceObjectKey(PREFIX, 'artifacts/gate-3/build.html'),
    ).toBe(`${PREFIX}/artifacts/gate-3/build.html`);
  });

  it.each(['', '../secret', '/etc/passwd', 'a\\b', './artifact', 'a//b', 'a/'])(
    '应拒绝越界或非规范 artifact 路径 %j',
    (relativePath) => {
      expect(() =>
        service.resolveWorkspaceObjectKey(PREFIX, relativePath),
      ).toThrow(GeneratedAppArtifactNotFoundException);
    },
  );
});
