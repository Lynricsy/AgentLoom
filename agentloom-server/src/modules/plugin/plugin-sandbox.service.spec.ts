import { Logger } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  PluginExecutionTimeoutException,
  PluginPermissionDeniedException,
  PluginResourceExhaustedException,
  PluginSandboxException,
} from './plugin.exceptions';
import { PluginSandboxService } from './plugin-sandbox.service';

const mocks = vi.hoisted(() => ({
  createPlugin: vi.fn(),
  plugin: {
    call: vi.fn(),
    close: vi.fn(),
  },
}));

vi.mock('@extism/extism', () => ({
  default: mocks.createPlugin,
}));

describe('PluginSandboxService', () => {
  let service: PluginSandboxService;

  const testWasm = Buffer.from([0x00, 0x61, 0x73, 0x6d]);
  const pluginId = 'com.example.test-plugin';

  beforeEach(() => {
    service = new PluginSandboxService();

    mocks.createPlugin.mockReset();
    mocks.plugin.call.mockReset();
    mocks.plugin.close.mockReset();

    mocks.createPlugin.mockResolvedValue(mocks.plugin);
    mocks.plugin.call.mockResolvedValue({
      json: () => ({ result: 'ok' }),
      text: () => '{"result":"ok"}',
    });
    mocks.plugin.close.mockResolvedValue(undefined);

    vi.restoreAllMocks();
  });

  describe('execute', () => {
    it('应执行 WASM 函数并返回 JSON 结果', async () => {
      const result = await service.execute(
        testWasm,
        'transform',
        { input: 'test' },
        undefined,
        pluginId,
      );

      expect(result.success).toBe(true);
      expect(result.output).toEqual({ result: 'ok' });
      expect(result.executionTimeMs).toBeGreaterThanOrEqual(0);
      expect(mocks.plugin.call).toHaveBeenCalledWith(
        'transform',
        JSON.stringify({ input: 'test' }),
      );
    });

    it('应处理 null 返回值', async () => {
      mocks.plugin.call.mockResolvedValue(null);

      const result = await service.execute(
        testWasm,
        'transform',
        'input',
        undefined,
        pluginId,
      );

      expect(result.success).toBe(true);
      expect(result.output).toBeNull();
    });

    it('应透传字符串输入', async () => {
      await service.execute(
        testWasm,
        'transform',
        'plain string',
        undefined,
        pluginId,
      );

      expect(mocks.plugin.call).toHaveBeenCalledWith('transform', 'plain string');
    });

    it('应透传 Uint8Array 输入', async () => {
      const bytes = new Uint8Array([1, 2, 3]);

      await service.execute(testWasm, 'transform', bytes, undefined, pluginId);

      expect(mocks.plugin.call).toHaveBeenCalledWith('transform', bytes);
    });

    it('JSON 解析失败时应回退到文本输出', async () => {
      mocks.plugin.call.mockResolvedValue({
        json: () => {
          throw new Error('not JSON');
        },
        text: () => 'plain text result',
      });

      const result = await service.execute(
        testWasm,
        'transform',
        'input',
        undefined,
        pluginId,
      );

      expect(result.output).toBe('plain text result');
    });

    it('成功执行后也应关闭插件实例', async () => {
      await service.execute(testWasm, 'transform', 'input', undefined, pluginId);

      expect(mocks.plugin.close).toHaveBeenCalledTimes(1);
    });

    it('执行失败时也应关闭插件实例', async () => {
      mocks.plugin.call.mockRejectedValue(new Error('some error'));

      await expect(
        service.execute(testWasm, 'transform', 'input', undefined, pluginId),
      ).rejects.toThrow(PluginSandboxException);

      expect(mocks.plugin.close).toHaveBeenCalledTimes(1);
    });

    it('关闭插件失败时应记录告警但仍返回结果', async () => {
      const warnSpy = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
      mocks.plugin.close.mockRejectedValue(new Error('close failed'));

      const result = await service.execute(
        testWasm,
        'transform',
        'input',
        undefined,
        pluginId,
      );

      expect(result.success).toBe(true);
      expect(warnSpy).toHaveBeenCalledWith(
        `关闭插件 "${pluginId}" 的 WASM 实例时出错: close failed`,
      );
    });

    it('插件调用超时时应抛出 PluginExecutionTimeoutException', async () => {
      mocks.plugin.call.mockRejectedValue(
        new Error('EXTISM: call canceled due to timeout'),
      );

      await expect(
        service.execute(testWasm, 'transform', 'input', undefined, pluginId),
      ).rejects.toThrow(PluginExecutionTimeoutException);
    });

    it('插件实例化超时时应抛出 PluginExecutionTimeoutException', async () => {
      mocks.createPlugin.mockRejectedValue(
        new Error('timed out while waiting for plugin to instantiate'),
      );

      await expect(
        service.execute(testWasm, 'transform', 'input', undefined, pluginId),
      ).rejects.toThrow(PluginExecutionTimeoutException);

      expect(mocks.plugin.close).not.toHaveBeenCalled();
    });

    it('访问未授权主机时应抛出 PluginPermissionDeniedException', async () => {
      mocks.plugin.call.mockRejectedValue(
        new Error(
          'HTTP request to "https://evil.com" is not allowed (no allowedHosts match "evil.com")',
        ),
      );

      await expect(
        service.execute(testWasm, 'transform', 'input', undefined, pluginId),
      ).rejects.toThrow(PluginPermissionDeniedException);
    });

    it('内存超限时应抛出 PluginResourceExhaustedException', async () => {
      mocks.plugin.call.mockRejectedValue(new Error('var memory limit exceeded'));

      await expect(
        service.execute(testWasm, 'transform', 'input', undefined, pluginId),
      ).rejects.toThrow(PluginResourceExhaustedException);
    });

    it('函数不存在时应抛出 PluginSandboxException', async () => {
      mocks.plugin.call.mockRejectedValue(
        new Error('function "nonexistent" does not exist'),
      );

      await expect(
        service.execute(testWasm, 'transform', 'input', undefined, pluginId),
      ).rejects.toThrow(PluginSandboxException);
    });

    it('插件自身错误时应抛出 PluginSandboxException', async () => {
      mocks.plugin.call.mockRejectedValue(
        new Error('Plugin-originated error: something went wrong'),
      );

      await expect(
        service.execute(testWasm, 'transform', 'input', undefined, pluginId),
      ).rejects.toThrow(PluginSandboxException);
    });

    it('未知错误时应抛出 PluginSandboxException', async () => {
      mocks.plugin.call.mockRejectedValue(new Error('unexpected failure'));

      await expect(
        service.execute(testWasm, 'transform', 'input', undefined, pluginId),
      ).rejects.toThrow(PluginSandboxException);
    });

    it('应应用自定义沙箱配置', async () => {
      await service.execute(
        testWasm,
        'transform',
        'input',
        {
          allowedHosts: ['api.example.com'],
          allowedPaths: { '/tmp': '/sandbox/tmp' },
          maxMemoryPages: 2048,
          timeoutMs: 10_000,
          useWasi: true,
          config: { ENV: 'production' },
        },
        pluginId,
      );

      expect(mocks.createPlugin).toHaveBeenCalledWith(
        expect.objectContaining({
          allowedHosts: ['api.example.com'],
          allowedPaths: { '/tmp': '/sandbox/tmp' },
          memory: { maxPages: 2048 },
          config: { ENV: 'production' },
        }),
        expect.objectContaining({
          timeoutMs: 10_000,
          runInWorker: true,
          useWasi: true,
        }),
      );
    });
  });

  describe('buildSandboxConfig', () => {
    it('manifest 不包含 sandbox 时应返回空配置', () => {
      expect(service.buildSandboxConfig({})).toEqual({});
    });

    it('sandbox 非对象时应返回空配置', () => {
      expect(service.buildSandboxConfig({ sandbox: 'invalid' })).toEqual({});
    });

    it('应从 manifest 提取完整沙箱配置', () => {
      const config = service.buildSandboxConfig({
        sandbox: {
          allowedHosts: ['api.example.com'],
          allowedPaths: { '/data': '/sandbox/data' },
          maxMemoryPages: 2048,
          timeoutMs: 10_000,
          useWasi: true,
          config: { REGION: 'cn' },
        },
      });

      expect(config).toEqual({
        allowedHosts: ['api.example.com'],
        allowedPaths: { '/data': '/sandbox/data' },
        maxMemoryPages: 2048,
        timeoutMs: 10_000,
        useWasi: true,
        config: { REGION: 'cn' },
      });
    });

    it('应忽略非法字段并保留合法字段', () => {
      const config = service.buildSandboxConfig({
        sandbox: {
          allowedHosts: ['api.example.com'],
          allowedPaths: { '/data': '/sandbox/data', broken: 123 },
          maxMemoryPages: '2048',
          timeoutMs: 10_000,
          useWasi: 'yes',
          config: { REGION: 'cn', INVALID: 1 },
        },
      });

      expect(config).toEqual({
        allowedHosts: ['api.example.com'],
        allowedPaths: undefined,
        maxMemoryPages: undefined,
        timeoutMs: 10_000,
        useWasi: undefined,
        config: undefined,
      });
    });
  });
});
