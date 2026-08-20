// 本文件验证 Generated App artifact service 的受控相对路径边界。

import { describe, expect, it } from 'vitest';

import { GeneratedAppArtifactService } from '../generated-app-artifact.service';
import { GeneratedAppArtifactNotFoundException } from '../generated-app.exceptions';

describe('GeneratedAppArtifactService', () => {
  const service = new GeneratedAppArtifactService();

  it('应把合法 artifact 相对路径解析到 workspace 内', () => {
    expect(
      service.resolveSafeRelativePathInside(
        '/tmp/generated-app',
        'artifacts/gate-3/build.html',
      ),
    ).toBe('/tmp/generated-app/artifacts/gate-3/build.html');
  });

  it.each(['../secret', '/etc/passwd', 'a\\b', './artifact', 'a//b']) (
    '应拒绝越界或非规范 artifact 路径 %s',
    (relativePath) => {
      expect(() =>
        service.resolveSafeRelativePathInside('/tmp/generated-app', relativePath),
      ).toThrow(GeneratedAppArtifactNotFoundException);
    },
  );
});
