/**
 * Sandbox 模型配置服务回归：直接验证 payload 边界与 guest session 初始化错误语义。
 */
import JSZip from 'jszip';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PiConfigGeneratorService } from '../../sandbox/pi-config-generator.service';
import {
  SandboxRuntimePluginUnsupportedFileException,
  SandboxSessionPayloadTooLargeException,
} from '../../sandbox/sandbox.exceptions';
import { SandboxModelConfigService } from '../sandbox-model-config.service';

const RUNTIME_PLUGIN_RECORD_ID = '0195a1c0-0000-7000-8000-000000000001';

async function createRuntimePluginArchive(
  extraFiles: Record<string, string | Uint8Array> = {},
): Promise<Buffer> {
  const zip = new JSZip();
  zip.file(
    'manifest.json',
    JSON.stringify({
      id: 'com.example.demo-rt',
      kind: 'runtime',
      runtime: {
        dshVersion: '0.2.0-rc.2',
        patch: 'cordis.patch.yml',
        entry: 'dist/index.js',
      },
    }),
  );
  zip.file(
    'cordis.patch.yml',
    '- insert:\n    - id: demo\n      name: __PLUGIN_ROOT__/dist/index.js\n',
  );
  zip.file('dist/index.js', 'export const name = "demo";\n');
  for (const [path, content] of Object.entries(extraFiles)) {
    zip.file(path, content);
  }
  return zip.generateAsync({ type: 'nodebuffer' });
}

function createHarnessService(archive: Buffer) {
  const runtimePluginService = {
    findActiveById: vi.fn().mockResolvedValue({
      id: RUNTIME_PLUGIN_RECORD_ID,
      pluginId: 'com.example.demo-rt',
    }),
    downloadArchive: vi.fn().mockResolvedValue(archive),
  };
  const db = {
    transaction: vi.fn(async (operation: (tx: unknown) => unknown) =>
      operation({ execute: vi.fn() }),
    ),
  };
  return {
    runtimePluginService,
    service: new SandboxModelConfigService(
      db as never,
      { requestGuest: vi.fn() } as never,
      undefined,
      undefined,
      runtimePluginService as never,
    ),
  };
}

const session = {
  id: 'session-1',
  agentId: 'agent-1',
  mode: 'workflow',
  context: { history: [], cwd: '/workspace/' },
  status: 'active',
  systemPrompt: '  system prompt  ',
  createdAt: new Date(),
  updatedAt: new Date(),
} as const;

describe('SandboxModelConfigService', () => {
  let service: SandboxModelConfigService;
  let runtimeDriver: { requestGuest: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    runtimeDriver = { requestGuest: vi.fn() };
    service = new SandboxModelConfigService(
      {} as never,
      runtimeDriver as never,
      undefined,
      undefined,
    );
  });

  it('无 pi generator 时仍保留 systemPrompt、MCP 与 nativeToolPolicy', async () => {
    await expect(
      service.buildContainerSessionPayload({
        session: session as never,
        mcpServers: { search: { url: 'https://mcp.test' } as never },
        runtimeConfig: { nativeToolPolicy: { bash: false } } as never,
      }),
    ).resolves.toEqual({
      systemPrompt: 'system prompt',
      mcpServers: { search: { url: 'https://mcp.test' } },
      nativeToolPolicy: { bash: false },
    });
  });

  it('技能写成 guest session files，供 pi 从 agentDir/skills 自动发现', async () => {
    const withGenerator = new SandboxModelConfigService(
      {} as never,
      runtimeDriver as never,
      undefined,
      new PiConfigGeneratorService(),
    );

    const payload = await withGenerator.buildContainerSessionPayload({
      session: session as never,
      skills: [
        {
          name: 'Code Review',
          description: 'Review diffs',
          files: {
            'SKILL.md': '---\nname: legacy\n---\nCheck error handling.',
            'refs/checklist.md': '- tests',
          },
        },
      ],
    });

    expect(payload.files).toEqual({
      'skills/code-review/SKILL.md':
        '---\nname: code-review\ndescription: Review diffs\n---\n\nCheck error handling.',
      'skills/code-review/refs/checklist.md': '- tests',
    });
  });

  it('有技能但缺少 pi generator 时显式失败，而不是静默丢弃技能', async () => {
    await expect(
      service.buildContainerSessionPayload({
        session: session as never,
        skills: [{ name: 's', description: 'd', files: { 'SKILL.md': 'x' } }],
      }),
    ).rejects.toThrow('PiConfigGeneratorService');
  });

  // guest 上限：agentloom-deploy/sandbox/src/session-config.ts 单文件 1 MiB、总计 16 MiB
  it.each([
    ['单文件超过 1 MiB', { 'SKILL.md': 'x'.repeat(1024 * 1024 + 1) }],
    [
      '总量超过 16 MiB',
      Object.fromEntries(
        Array.from({ length: 17 }, (_, index) => [
          `refs/part-${index}.md`,
          'x'.repeat(1024 * 1024 - 64),
        ]),
      ),
    ],
  ])('技能%s时在创建会话前拒绝', async (_label, files) => {
    const withGenerator = new SandboxModelConfigService(
      {} as never,
      runtimeDriver as never,
      undefined,
      new PiConfigGeneratorService(),
    );

    await expect(
      withGenerator.buildContainerSessionPayload({
        session: session as never,
        skills: [{ name: 'Huge', description: 'd', files }],
      }),
    ).rejects.toBeInstanceOf(SandboxSessionPayloadTooLargeException);
  });

  it('容器初始化单次请求覆盖 guest 内 dsh 启动窗口并在 ok 时完成', async () => {
    runtimeDriver.requestGuest.mockResolvedValue({ ok: true, status: 200 });
    const timeout = vi.spyOn(AbortSignal, 'timeout');
    await service.initializeContainerSession('runtime-1', {
      sessionId: 'session-1',
    });
    expect(runtimeDriver.requestGuest).toHaveBeenCalledWith(
      'runtime-1',
      '/v1/session',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(timeout).toHaveBeenCalledWith(45_000);
    timeout.mockRestore();
  });

  it('启用的 npm runtime 插件按每个 180 s 在线安装延长会话初始化超时', async () => {
    runtimeDriver.requestGuest.mockResolvedValue({ ok: true, status: 200 });
    const timeout = vi.spyOn(AbortSignal, 'timeout');
    await service.initializeContainerSession('runtime-1', {
      sessionId: 'session-1',
      harness: {
        engine: 'dsh',
        plugins: [
          { nodeId: 'a', source: 'npm', ref: 'a', version: '1', enabled: true },
          {
            nodeId: 'b',
            source: 'npm',
            ref: 'b',
            version: '1',
            enabled: false,
          },
        ],
      },
    });
    expect(timeout).toHaveBeenCalledWith(45_000 + 180_000);
    timeout.mockRestore();
  });

  it('harness 含 package 插件时下发 pluginId 并把包内文件写入 plugins/<pluginId>/', async () => {
    const { service: harnessService, runtimePluginService } =
      createHarnessService(await createRuntimePluginArchive());

    const payload = await harnessService.buildContainerSessionPayload({
      session: { ...session, tenantId: 'tenant-1' } as never,
      runtimeConfig: {
        runtimeMode: 'sandbox',
        harness: {
          engine: 'dsh',
          profilePatch: '- id: approval\n  config:\n    policy: never\n',
          plugins: [
            {
              nodeId: 'rp-package',
              source: 'package',
              ref: RUNTIME_PLUGIN_RECORD_ID,
              enabled: true,
            },
            {
              nodeId: 'rp-off',
              source: 'package',
              ref: 'disabled-ref',
              enabled: false,
            },
          ],
        },
      },
    });

    expect(runtimePluginService.findActiveById).toHaveBeenCalledTimes(1);
    expect(runtimePluginService.findActiveById).toHaveBeenCalledWith(
      RUNTIME_PLUGIN_RECORD_ID,
      'tenant-1',
    );
    expect(payload['harness']).toEqual({
      engine: 'dsh',
      profilePatch: '- id: approval\n  config:\n    policy: never\n',
      plugins: [
        {
          nodeId: 'rp-package',
          source: 'package',
          ref: RUNTIME_PLUGIN_RECORD_ID,
          enabled: true,
          pluginId: 'com.example.demo-rt',
        },
        {
          nodeId: 'rp-off',
          source: 'package',
          ref: 'disabled-ref',
          enabled: false,
        },
      ],
    });
    expect(Object.keys(payload['files'] as object).sort()).toEqual([
      'plugins/com.example.demo-rt/cordis.patch.yml',
      'plugins/com.example.demo-rt/dist/index.js',
      'plugins/com.example.demo-rt/manifest.json',
    ]);
    expect(
      (payload['files'] as Record<string, string>)[
        'plugins/com.example.demo-rt/dist/index.js'
      ],
    ).toBe('export const name = "demo";\n');
  });

  it('runtime 插件包含非 UTF-8 文件时以 422 拒绝', async () => {
    const { service: harnessService } = createHarnessService(
      await createRuntimePluginArchive({
        'assets/logo.png': new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0xff, 0xfe]),
      }),
    );

    const pending = harnessService.buildContainerSessionPayload({
      session: { ...session, tenantId: 'tenant-1' } as never,
      runtimeConfig: {
        runtimeMode: 'sandbox',
        harness: {
          engine: 'dsh',
          plugins: [
            {
              nodeId: 'rp-package',
              source: 'package',
              ref: RUNTIME_PLUGIN_RECORD_ID,
              enabled: true,
            },
          ],
        },
      },
    });

    const error = await pending.catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(SandboxRuntimePluginUnsupportedFileException);
    expect(
      (error as SandboxRuntimePluginUnsupportedFileException).getStatus(),
    ).toBe(422);
    expect(
      (error as SandboxRuntimePluginUnsupportedFileException).detail,
    ).toContain('assets/logo.png');
  });

  it('不可重试 HTTP 状态保持原错误消息', async () => {
    runtimeDriver.requestGuest.mockResolvedValue({ ok: false, status: 401 });
    await expect(
      service.initializeContainerSession('runtime-1', {
        sessionId: 'session-1',
      }),
    ).rejects.toThrow('Container session init failed with status 401');
  });
});
