import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { DrizzleDB } from '../../../database/database.module';
import { WorkflowArchivedException } from '../../workflow-definition/workflow-version.exceptions';
import type { WorkflowVersionService } from '../../workflow-definition/workflow-version.service';
import { GeneratedAppService } from '../generated-app.service';
import { GeneratedAppRepository } from '../generated-app.repository';
import { GeneratedAppArtifactService } from '../generated-app-artifact.service';
import { GeneratedAppRuntimeBindingService } from '../generated-app-runtime-binding.service';
import { GeneratedAppGenerationRepairService } from '../generated-app-generation-repair.service';
import { GeneratedAppGenerationOrchestratorService } from '../generated-app-generation-orchestrator.service';
import { GeneratedAppPublicRuntimeService } from '../generated-app-public-runtime.service';
import {
  APP_ID,
  DEFAULT_START_GENERATION_RUN_DTO,
  TENANT_ID,
  USER_ID,
  createConfigService,
  createGeneratedPrivatePluginServiceMock,
  createStorageServiceMock,
  mockTenantDb,
} from './generated-app-test-support';

describe('GeneratedAppService facade', () => {
  let service: GeneratedAppService;
  let repository: GeneratedAppRepository;
  let artifactService: GeneratedAppArtifactService;
  let runtimeBindingService: GeneratedAppRuntimeBindingService;
  let repairService: GeneratedAppGenerationRepairService;
  let orchestrator: GeneratedAppGenerationOrchestratorService;
  let publicRuntimeService: GeneratedAppPublicRuntimeService;
  let workflowVersionService: { archive: Mock };

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    const configService = createConfigService();
    const pluginService = createGeneratedPrivatePluginServiceMock();
    const storageService = createStorageServiceMock();
    repository = new GeneratedAppRepository(
      mockTenantDb as unknown as DrizzleDB,
      configService,
    );
    artifactService = new GeneratedAppArtifactService(
      repository,
      configService,
      storageService,
    );
    runtimeBindingService = new GeneratedAppRuntimeBindingService(
      repository,
      artifactService,
      pluginService,
    );
    repairService = new GeneratedAppGenerationRepairService(repository);
    orchestrator = new GeneratedAppGenerationOrchestratorService(
      repository,
      repairService,
      runtimeBindingService,
      configService,
    );
    publicRuntimeService = new GeneratedAppPublicRuntimeService(
      repository,
      artifactService,
      runtimeBindingService,
    );
    workflowVersionService = { archive: vi.fn().mockResolvedValue(undefined) };
    service = new GeneratedAppService(
      mockTenantDb as unknown as DrizzleDB,
      configService,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      pluginService,
      undefined,
      storageService,
      repository,
      artifactService,
      runtimeBindingService,
      repairService,
      orchestrator,
      publicRuntimeService,
      workflowVersionService as unknown as WorkflowVersionService,
    );
  });

  it('repository API 应原样委派参数和结果', async () => {
    const expected = { id: APP_ID };
    const delegate = vi
      .spyOn(repository, 'findOne')
      .mockResolvedValue(
        expected as Awaited<ReturnType<GeneratedAppRepository['findOne']>>,
      );

    await expect(service.findOne(TENANT_ID, APP_ID)).resolves.toBe(expected);
    expect(delegate).toHaveBeenCalledWith(TENANT_ID, APP_ID);
  });

  it('artifact API 应原样委派参数和异常', async () => {
    const error = new Error('artifact unavailable');
    const delegate = vi
      .spyOn(artifactService, 'getArtifactContent')
      .mockRejectedValue(error);

    await expect(
      service.getArtifactContent(TENANT_ID, APP_ID, 'artifact-1'),
    ).rejects.toBe(error);
    expect(delegate).toHaveBeenCalledWith(TENANT_ID, APP_ID, 'artifact-1');
  });

  it('runtime-binding API 应原样委派参数和异常', async () => {
    const error = new Error('workflow unavailable');
    const delegate = vi
      .spyOn(runtimeBindingService, 'getRuntimeBindingReadiness')
      .mockRejectedValue(error);

    await expect(
      service.getRuntimeBindingReadiness(TENANT_ID, APP_ID),
    ).rejects.toBe(error);
    expect(delegate).toHaveBeenCalledWith(TENANT_ID, APP_ID);
  });

  it('generation-repair API 应原样委派参数和异常', async () => {
    const error = new Error('repair ledger unavailable');
    const delegate = vi
      .spyOn(repository, 'createRepairAttempt')
      .mockRejectedValue(error);
    const dto = {
      attemptNumber: 1,
      targetGateId: 'gate-3' as const,
      status: 'running' as const,
      failureSummary: 'build failed',
    };

    await expect(
      service.createRepairAttempt(TENANT_ID, USER_ID, APP_ID, 'run-1', dto),
    ).rejects.toBe(error);
    expect(delegate).toHaveBeenCalledWith(
      TENANT_ID,
      USER_ID,
      APP_ID,
      'run-1',
      dto,
    );
  });

  it('orchestrator API 应原样委派参数和异常', async () => {
    const error = new Error('gate runner failed');
    const delegate = vi
      .spyOn(orchestrator, 'startGenerationRun')
      .mockRejectedValue(error);

    await expect(
      service.startGenerationRun(
        TENANT_ID,
        USER_ID,
        APP_ID,
        DEFAULT_START_GENERATION_RUN_DTO,
      ),
    ).rejects.toBe(error);
    expect(delegate).toHaveBeenCalledWith(
      TENANT_ID,
      USER_ID,
      APP_ID,
      DEFAULT_START_GENERATION_RUN_DTO,
    );
  });

  it('public-runtime API 应原样委派参数和异常', async () => {
    const error = new Error('public runtime unavailable');
    const delegate = vi
      .spyOn(publicRuntimeService, 'getPublicApp')
      .mockRejectedValue(error);

    await expect(service.getPublicApp('public-token')).rejects.toBe(error);
    expect(delegate).toHaveBeenCalledWith('public-token');
  });

  describe('delete', () => {
    function stubApp(runtimeWorkflowIds: string[]) {
      vi.spyOn(repository, 'findOne').mockResolvedValue({
        id: APP_ID,
      } as never);
      const listRuntime = vi
        .spyOn(runtimeBindingService, 'listActiveGeneratedWorkflowRuntimeIds')
        .mockResolvedValue(runtimeWorkflowIds);
      const remove = vi
        .spyOn(repository, 'delete')
        .mockResolvedValue(undefined);
      return { listRuntime, remove };
    }

    it('先归档自动创建的运行时工作流再删除应用', async () => {
      const { listRuntime, remove } = stubApp(['wf-1', 'wf-2']);

      await service.delete(TENANT_ID, USER_ID, APP_ID);

      expect(listRuntime).toHaveBeenCalledWith(TENANT_ID, APP_ID);
      expect(workflowVersionService.archive.mock.calls).toEqual([
        ['wf-1', USER_ID],
        ['wf-2', USER_ID],
      ]);
      expect(remove).toHaveBeenCalledWith(TENANT_ID, APP_ID);
      expect(
        workflowVersionService.archive.mock.invocationCallOrder[1],
      ).toBeLessThan(remove.mock.invocationCallOrder[0]);
    });

    it('工作流已被并发归档时仍删除应用；其他归档失败时保留应用', async () => {
      const { remove } = stubApp(['wf-1']);
      workflowVersionService.archive.mockRejectedValueOnce(
        new WorkflowArchivedException('wf-1'),
      );
      await service.delete(TENANT_ID, USER_ID, APP_ID);
      expect(remove).toHaveBeenCalledTimes(1);

      const error = new Error('db down');
      workflowVersionService.archive.mockRejectedValueOnce(error);
      await expect(service.delete(TENANT_ID, USER_ID, APP_ID)).rejects.toBe(
        error,
      );
      expect(remove).toHaveBeenCalledTimes(1);
    });

    it('应用不存在时不归档任何工作流', async () => {
      const error = new Error('not found');
      vi.spyOn(repository, 'findOne').mockRejectedValue(error);
      const listRuntime = vi.spyOn(
        runtimeBindingService,
        'listActiveGeneratedWorkflowRuntimeIds',
      );

      await expect(service.delete(TENANT_ID, USER_ID, APP_ID)).rejects.toBe(
        error,
      );
      expect(listRuntime).not.toHaveBeenCalled();
      expect(workflowVersionService.archive).not.toHaveBeenCalled();
    });
  });
});
