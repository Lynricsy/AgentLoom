import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

import type { DrizzleDB } from '../../../database/database.module';
import { WorkflowArchivedException } from '../../workflow-definition/workflow-version.exceptions';
import type { WorkflowVersionService } from '../../workflow-definition/workflow-version.service';
import type { GeneratedAppResponseDto } from '../dto';
import type { GeneratedAppGenerationPipelineService } from '../generated-app-generation-pipeline.service';
import { GeneratedAppArtifactService } from '../generated-app-artifact.service';
import { GeneratedAppGenerationRunInProgressException } from '../generated-app.exceptions';
import { GeneratedAppPublicRuntimeService } from '../generated-app-public-runtime.service';
import { GeneratedAppRepository } from '../generated-app.repository';
import { GeneratedAppRuntimeBindingService } from '../generated-app-runtime-binding.service';
import { GeneratedAppService } from '../generated-app.service';
import {
  APP_ID,
  DEFAULT_START_GENERATION_RUN_DTO,
  GENERATION_RUN_ID,
  TENANT_ID,
  USER_ID,
  createConfigService,
  createStorageServiceMock,
  mockTenantDb,
} from './generated-app-test-support';

describe('GeneratedAppService facade', () => {
  let service: GeneratedAppService;
  let repository: GeneratedAppRepository;
  let artifactService: GeneratedAppArtifactService;
  let runtimeBindingService: GeneratedAppRuntimeBindingService;
  let publicRuntimeService: GeneratedAppPublicRuntimeService;
  let pipeline: { enqueueRun: Mock };
  let workflowVersionService: { archive: Mock };

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    const configService = createConfigService();
    repository = new GeneratedAppRepository(
      mockTenantDb as unknown as DrizzleDB,
      configService,
    );
    artifactService = new GeneratedAppArtifactService(
      repository,
      configService,
      createStorageServiceMock(),
    );
    runtimeBindingService = new GeneratedAppRuntimeBindingService(repository);
    publicRuntimeService = new GeneratedAppPublicRuntimeService(
      repository,
      runtimeBindingService,
    );
    pipeline = {
      enqueueRun: vi
        .fn()
        .mockResolvedValue({ id: GENERATION_RUN_ID, status: 'queued' }),
    };
    workflowVersionService = { archive: vi.fn().mockResolvedValue(undefined) };
    service = new GeneratedAppService(
      repository,
      artifactService,
      runtimeBindingService,
      pipeline as unknown as GeneratedAppGenerationPipelineService,
      publicRuntimeService,
      workflowVersionService as unknown as WorkflowVersionService,
    );
  });

  it('创建应用后排队 initial 生成运行，响应带 generationRunId', async () => {
    const created = { id: APP_ID, status: 'app_spec_generating' };
    const create = vi
      .spyOn(repository, 'create')
      .mockResolvedValue(created as unknown as GeneratedAppResponseDto);
    const dto = { prompt: '问答页面' };

    await expect(service.create(TENANT_ID, USER_ID, dto)).resolves.toEqual({
      ...created,
      generationRunId: GENERATION_RUN_ID,
    });
    expect(create).toHaveBeenCalledWith(TENANT_ID, USER_ID, dto);
    expect(pipeline.enqueueRun).toHaveBeenCalledWith(
      TENANT_ID,
      USER_ID,
      APP_ID,
      {
        triggerSource: 'initial',
        maxRepairAttempts: 3,
        maxRuntimeSeconds: 1800,
      },
    );
  });

  it('start 只排队并立即返回 queued 运行，不同步执行门禁', async () => {
    const app = { id: APP_ID };
    vi.spyOn(repository, 'findOne').mockResolvedValue(
      app as unknown as GeneratedAppResponseDto,
    );

    await expect(
      service.startGenerationRun(
        TENANT_ID,
        USER_ID,
        APP_ID,
        DEFAULT_START_GENERATION_RUN_DTO,
      ),
    ).resolves.toEqual({
      generationRun: { id: GENERATION_RUN_ID, status: 'queued' },
      gateRuns: [],
      app,
    });
    expect(pipeline.enqueueRun).toHaveBeenCalledWith(
      TENANT_ID,
      USER_ID,
      APP_ID,
      DEFAULT_START_GENERATION_RUN_DTO,
    );
  });

  it('已有进行中的运行时 start 原样抛出 409 异常', async () => {
    const error = new GeneratedAppGenerationRunInProgressException(
      APP_ID,
      GENERATION_RUN_ID,
    );
    pipeline.enqueueRun.mockRejectedValueOnce(error);

    await expect(
      service.startGenerationRun(
        TENANT_ID,
        USER_ID,
        APP_ID,
        DEFAULT_START_GENERATION_RUN_DTO,
      ),
    ).rejects.toBe(error);
  });

  it('repository API 应原样委派参数和结果', async () => {
    const expected = { id: APP_ID };
    const delegate = vi
      .spyOn(repository, 'findOne')
      .mockResolvedValue(expected as unknown as GeneratedAppResponseDto);

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

  it('repair-attempt API 应原样委派参数和异常', async () => {
    const error = new Error('repair ledger unavailable');
    const delegate = vi
      .spyOn(repository, 'createRepairAttempt')
      .mockRejectedValue(error);
    const dto = {
      attemptNumber: 1,
      targetGateId: 'gate-3' as const,
      status: 'running' as const,
      failureSummary: 'contract case failed',
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
