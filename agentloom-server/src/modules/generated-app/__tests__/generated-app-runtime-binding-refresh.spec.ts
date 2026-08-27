import { describe, expect, it } from 'vitest';

import { createRuntimeBindingServiceForTest } from './generated-app-test-support';

// 复用本模块统一工厂，确保 focused 测试不会省略 repository/artifact 依赖。
const service = createRuntimeBindingServiceForTest();
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

describe('GeneratedAppRuntimeBindingService registration refresh', () => {
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
