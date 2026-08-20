// 本文件验证 Generated App runtime binding 对私有插件注册漂移的判断。

import { describe, expect, it } from 'vitest';

import { GeneratedAppRuntimeBindingService } from '../generated-app-runtime-binding.service';

describe('GeneratedAppRuntimeBindingService', () => {
  const service = new GeneratedAppRuntimeBindingService();
  const app = { id: 'app-1', appSpec: { version: 1 } };
  const bundle = {
    storageKey: 'plugins/app-1/tool.alp',
    signature: 'signature',
    contentHash: 'hash',
    wasmEntry: 'dist/plugin.wasm',
  };
  const record = {
    storageKey: bundle.storageKey,
    signature: bundle.signature,
    contentHash: bundle.contentHash,
    wasmBundleUrl: 'plugins/app-1/tool.wasm',
    metadata: {
      source: 'generated-app-private-plugin',
      activationScope: 'tenant-private',
      generatedAppId: app.id,
      appSpecVersion: app.appSpec.version,
      toolId: 'tool-1',
      wasmEntry: bundle.wasmEntry,
      wasmBundleUrl: 'plugins/app-1/tool.wasm',
    },
  };

  it('注册信息与当前 artifact 一致时不应刷新', () => {
    expect(
      service.mustRefreshPrivatePluginRegistration(
        app,
        'tool-1',
        record,
        bundle,
        'plugins/app-1/tool.wasm',
      ),
    ).toBe(false);
  });

  it('content hash 漂移时应刷新注册', () => {
    expect(
      service.mustRefreshPrivatePluginRegistration(
        app,
        'tool-1',
        { ...record, contentHash: 'stale-hash' },
        bundle,
        'plugins/app-1/tool.wasm',
      ),
    ).toBe(true);
  });
});
