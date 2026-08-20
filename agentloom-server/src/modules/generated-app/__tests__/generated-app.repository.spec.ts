import { ConfigService } from '@nestjs/config';
import { HEADERS_METADATA } from '@nestjs/common/constants';
import * as crypto from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  computeContentHash as computePluginArchiveContentHash,
  readArchiveManifest,
  verifyArchiveSignature as verifyPluginArchiveSignature,
} from '@agentloom/plugin-sdk';
import JSZip from 'jszip';

import type { DrizzleDB } from '../../../database/database.module';
import type {
  GeneratedApp,
  GeneratedAppBrowserAcceptancePlan,
  GeneratedAppBuildUnitPlan,
  GeneratedAppGenerationPlan,
  GeneratedAppGenerationRun,
  GeneratedAppGateRun,
  GeneratedAppIndependentVerificationPlan,
  GeneratedAppIntegrationPlan,
  GeneratedAppPublishCandidatePlan,
  GeneratedAppReadiness,
  GeneratedAppRepairPlan,
  GeneratedAppRepairAttempt,
  GeneratedAppReverificationPlan,
  GeneratedAppStaticContracts,
  GeneratedAppSubmission,
  WorkflowDefinition,
} from '../../../database/schema';
import {
  GeneratedAppArtifactNotFoundException,
  GeneratedAppArtifactTooLargeException,
  GeneratedAppGenerationRunNotFoundException,
  GeneratedAppNotFoundException,
  GeneratedAppPublicShareNotReadyException,
  GeneratedAppRepairAttemptNotFoundException,
  GeneratedAppSubmissionNotFoundException,
} from '../generated-app.exceptions';
import * as generationPlanBuilder from '../plan-builders/generation-plan.builder';
import * as integrationPlanBuilder from '../plan-builders/integration-plan.builder';
import * as browserAcceptancePlanBuilder from '../plan-builders/browser-acceptance-plan.builder';
import * as independentVerificationPlanBuilder from '../plan-builders/independent-verification-plan.builder';
import * as publishCandidatePlanBuilder from '../plan-builders/publish-candidate-plan.builder';
import {
  buildBuildUnitPlan,
  buildGenerationPlan,
  buildStaticContracts,
} from '../plan-builders/generation-plan.builder';
import { buildIntegrationPlan } from '../plan-builders/integration-plan.builder';
import { buildBrowserAcceptancePlan } from '../plan-builders/browser-acceptance-plan.builder';
import { buildIndependentVerificationPlan } from '../plan-builders/independent-verification-plan.builder';
import { buildPublishCandidatePlan } from '../plan-builders/publish-candidate-plan.builder';
import { GeneratedAppGate7PublishCandidateRunner } from '../generated-app.publish-candidate-runner';
import { createInitialGeneratedAppGateResults } from '../generated-app.gates';
import { GeneratedAppService } from '../generated-app.service';
import { GeneratedAppRepository } from '../generated-app.repository';
import { GeneratedAppArtifactService } from '../generated-app-artifact.service';
import { GeneratedAppRuntimeBindingService } from '../generated-app-runtime-binding.service';
import { GeneratedAppGenerationRepairService } from '../generated-app-generation-repair.service';
import { GeneratedAppGenerationOrchestratorService } from '../generated-app-generation-orchestrator.service';
import { GeneratedAppPublicRuntimeService } from '../generated-app-public-runtime.service';
import { WorkflowNotPublishedException } from '../../execution/execution.exceptions';
import type { ExecutionService } from '../../execution/execution.service';
import type { StorageService } from '../../../infrastructure/storage/storage.service';
import type { PluginService } from '../../plugin/plugin.service';
import { PluginSandboxService } from '../../plugin/plugin-sandbox.service';
import {
  GeneratedAppGate4IntegrationRunner,
  type GeneratedAppGate4RunnerResult,
} from '../generated-app.integration-runner';
import type { GeneratedAppResponseDto } from '../dto';
import { GeneratedAppPublicController } from '../generated-app.controller';
import {
  GeneratedAppGate3WorkspaceRunner,
  type GeneratedAppGate3RepairResult,
  type GeneratedAppGate3RunnerResult,
} from '../generated-app.workspace';

import {
  TENANT_ID,
  USER_ID,
  APP_ID,
  GENERATION_RUN_ID,
  GATE_RUN_ID,
  REPAIR_ATTEMPT_ID,
  NOW,
  createConfigService,
  createSelectChain,
  createSelectPageChain,
  createCountChain,
  createInsertReturningChain,
  createUpdateReturningChain,
  createPublishCandidateReadiness,
  createGeneratedPrivatePluginServiceMock,
  createStorageServiceMock,
  createGeneratedAppGateRun,
  createGeneratedAppGenerationRun,
  createGeneratedAppRepairAttempt,
  createGeneratedApp,
  mockTenantDb
} from './generated-app-test-support';

describe('repository migrated scenarios', () => {
  let service: GeneratedAppService;
  let repository: GeneratedAppRepository;
  let artifactService: GeneratedAppArtifactService;
  let runtimeBindingService: GeneratedAppRuntimeBindingService;
  let repairService: GeneratedAppGenerationRepairService;
  let orchestrator: GeneratedAppGenerationOrchestratorService;
  let publicRuntimeService: GeneratedAppPublicRuntimeService;

  beforeEach(() => {
    vi.restoreAllMocks(); vi.clearAllMocks();
    const configService = createConfigService();
    const pluginService = createGeneratedPrivatePluginServiceMock();
    const storageService = createStorageServiceMock();
    repository = new GeneratedAppRepository(mockTenantDb as unknown as DrizzleDB, configService);
    artifactService = new GeneratedAppArtifactService(repository, configService, storageService);
    runtimeBindingService = new GeneratedAppRuntimeBindingService(repository, artifactService, pluginService);
    repairService = new GeneratedAppGenerationRepairService(repository);
    orchestrator = new GeneratedAppGenerationOrchestratorService(repository, repairService, runtimeBindingService, configService);
    publicRuntimeService = new GeneratedAppPublicRuntimeService(repository, artifactService, runtimeBindingService);
    service = new GeneratedAppService(mockTenantDb as unknown as DrizzleDB, configService, undefined, undefined, undefined, undefined, undefined, pluginService, undefined, storageService, repository, artifactService, runtimeBindingService, repairService, orchestrator, publicRuntimeService);
  });

  it('创建和更新生成运行台账时应保留预算、状态和失败原因', async () => {
    const app = createGeneratedApp();
    const run = createGeneratedAppGenerationRun();
    const completedRun = createGeneratedAppGenerationRun({
      status: 'failed',
      failureReason: 'gate-2 多次修复后仍失败。',
      completedAt: NOW,
    });
    const insertChain = createInsertReturningChain([run]);
    const updateChain = createUpdateReturningChain([completedRun]);
    mockTenantDb.select.mockReturnValueOnce(createSelectChain([app]));
    mockTenantDb.insert.mockReturnValueOnce(insertChain);
    mockTenantDb.update.mockReturnValueOnce(updateChain);

    const created = await service.createGenerationRun(
      TENANT_ID,
      USER_ID,
      APP_ID,
      {
        runNumber: 1,
        status: 'running',
        triggerSource: 'manual',
        maxRepairAttempts: 3,
        maxRuntimeSeconds: 1800,
        summary: '开始自动开发测试循环。',
        startedAt: NOW.toISOString(),
      },
    );
    const updated = await service.updateGenerationRun(
      TENANT_ID,
      APP_ID,
      GENERATION_RUN_ID,
      {
        status: 'failed',
        failureReason: 'gate-2 多次修复后仍失败。',
        completedAt: NOW.toISOString(),
      },
    );

    expect(insertChain.values).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_ID,
        generatedAppId: APP_ID,
        runNumber: 1,
        status: 'running',
        triggerSource: 'manual',
        maxRepairAttempts: 3,
        maxRuntimeSeconds: 1800,
        createdBy: USER_ID,
      }),
    );
    expect(updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'failed',
        failureReason: 'gate-2 多次修复后仍失败。',
        completedAt: NOW,
        updatedAt: expect.any(Date),
      }),
    );
    expect(created).toEqual(
      expect.objectContaining({
        id: GENERATION_RUN_ID,
        status: 'running',
      }),
    );
    expect(updated).toEqual(
      expect.objectContaining({
        id: GENERATION_RUN_ID,
        status: 'failed',
        failureReason: 'gate-2 多次修复后仍失败。',
      }),
    );
  });

  it('创建和更新修复尝试台账时应绑定生成运行', async () => {
    const generationRun = createGeneratedAppGenerationRun();
    const repairAttempt = createGeneratedAppRepairAttempt();
    const completedAttempt = createGeneratedAppRepairAttempt({
      status: 'completed',
      changeSummary: '修复 TypeScript 类型错误。',
      verificationSummary: 'gate-2 重新运行通过。',
      repairPlan: {
        planVersion: 1,
        source: 'manual-repair-work-order',
        targetGateId: 'gate-2',
        targetGateName: '静态合约门禁',
        failureCode: 'static-contract-incomplete',
        failureSummary: '静态合约检查失败。',
        repairInstructions: '补齐 staticContracts。',
        evidenceIds: ['gate-2-static-contracts'],
        evidenceSummaries: ['staticContracts 缺失。'],
        allowedChangeScopes: ['static-contracts', 'test-contracts'],
        forbiddenChangeScopes: ['public-share-token'],
        patchTargets: ['generated_apps.generation_plan.staticContracts'],
        requiredTraceability: ['failed-evidence-citation'],
        generatedAt: NOW.toISOString(),
      },
      reverificationPlan: {
        planVersion: 1,
        targetGateId: 'gate-2',
        requiredGateIds: ['gate-2'],
        requiredCommandIds: [],
        requiredEvidenceIds: ['gate-2-static-contracts'],
        successCriteria: ['gate-2 重新运行通过。'],
        blockedUntilPatchApplied: true,
        generatedAt: NOW.toISOString(),
      },
      completedAt: NOW,
    });
    const insertChain = createInsertReturningChain([repairAttempt]);
    const updateChain = createUpdateReturningChain([completedAttempt]);
    mockTenantDb.select.mockReturnValueOnce(createSelectChain([generationRun]));
    mockTenantDb.insert.mockReturnValueOnce(insertChain);
    mockTenantDb.update.mockReturnValueOnce(updateChain);

    const created = await service.createRepairAttempt(
      TENANT_ID,
      USER_ID,
      APP_ID,
      GENERATION_RUN_ID,
      {
        attemptNumber: 1,
        targetGateId: 'gate-2',
        status: 'running',
        failureSummary: '静态合约检查失败。',
        startedAt: NOW.toISOString(),
      },
    );
    const updated = await service.updateRepairAttempt(
      TENANT_ID,
      APP_ID,
      GENERATION_RUN_ID,
      REPAIR_ATTEMPT_ID,
      {
        status: 'completed',
        changeSummary: '修复 TypeScript 类型错误。',
        verificationSummary: 'gate-2 重新运行通过。',
        repairPlan: {
          planVersion: 1,
          source: 'manual-repair-work-order',
          targetGateId: 'gate-2',
          targetGateName: '静态合约门禁',
          failureCode: 'static-contract-incomplete',
          failureSummary: '静态合约检查失败。',
          repairInstructions: '补齐 staticContracts。',
          evidenceIds: ['gate-2-static-contracts'],
          evidenceSummaries: ['staticContracts 缺失。'],
          allowedChangeScopes: ['static-contracts', 'test-contracts'],
          forbiddenChangeScopes: ['public-share-token'],
          patchTargets: ['generated_apps.generation_plan.staticContracts'],
          requiredTraceability: ['failed-evidence-citation'],
          generatedAt: NOW.toISOString(),
        },
        reverificationPlan: {
          planVersion: 1,
          targetGateId: 'gate-2',
          requiredGateIds: ['gate-2'],
          requiredCommandIds: [],
          requiredEvidenceIds: ['gate-2-static-contracts'],
          successCriteria: ['gate-2 重新运行通过。'],
          blockedUntilPatchApplied: true,
          generatedAt: NOW.toISOString(),
        },
        completedAt: NOW.toISOString(),
      },
    );

    expect(insertChain.values).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_ID,
        generatedAppId: APP_ID,
        generationRunId: GENERATION_RUN_ID,
        attemptNumber: 1,
        targetGateId: 'gate-2',
        status: 'running',
        createdBy: USER_ID,
      }),
    );
    expect(updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'completed',
        changeSummary: '修复 TypeScript 类型错误。',
        verificationSummary: 'gate-2 重新运行通过。',
        repairPlan: expect.objectContaining({
          targetGateId: 'gate-2',
          patchTargets: ['generated_apps.generation_plan.staticContracts'],
        }),
        reverificationPlan: expect.objectContaining({
          targetGateId: 'gate-2',
          requiredGateIds: ['gate-2'],
        }),
        completedAt: NOW,
      }),
    );
    expect(created.generationRunId).toBe(GENERATION_RUN_ID);
    expect(updated.status).toBe('completed');
    expect(updated.repairPlan).toEqual(completedAttempt.repairPlan);
    expect(updated.reverificationPlan).toEqual(
      completedAttempt.reverificationPlan,
    );
  });

  it('创建者可以分页筛选生成运行和修复尝试台账', async () => {
    const generationRun = createGeneratedAppGenerationRun();
    const repairAttempt = createGeneratedAppRepairAttempt({
      status: 'failed',
      targetGateId: 'gate-2',
    });
    const runListChain = createSelectPageChain([generationRun]);
    const runCountChain = createCountChain(1);
    const repairListChain = createSelectPageChain([repairAttempt]);
    const repairCountChain = createCountChain(1);
    mockTenantDb.select
      .mockReturnValueOnce(runListChain)
      .mockReturnValueOnce(runCountChain)
      .mockReturnValueOnce(repairListChain)
      .mockReturnValueOnce(repairCountChain);

    const runs = await service.listGenerationRuns(TENANT_ID, APP_ID, {
      page: 1,
      pageSize: 20,
      status: 'running',
    });
    const repairs = await service.listRepairAttempts(
      TENANT_ID,
      APP_ID,
      GENERATION_RUN_ID,
      {
        page: 1,
        pageSize: 20,
        status: 'failed',
        targetGateId: 'gate-2',
      },
    );

    expect(runListChain.where).toHaveBeenCalledTimes(1);
    expect(repairListChain.where).toHaveBeenCalledTimes(1);
    expect(runs.data).toEqual([
      expect.objectContaining({
        id: GENERATION_RUN_ID,
        appId: APP_ID,
        status: 'running',
      }),
    ]);
    expect(repairs.data).toEqual([
      expect.objectContaining({
        id: REPAIR_ATTEMPT_ID,
        generationRunId: GENERATION_RUN_ID,
        targetGateId: 'gate-2',
      }),
    ]);
  });

  it('记录单次门禁运行时应写入证据并同步当前 gateResults/readiness', async () => {
    const app = createGeneratedApp();
    const gateRun = createGeneratedAppGateRun({
      generationRunId: GENERATION_RUN_ID,
      repairAttemptId: REPAIR_ATTEMPT_ID,
    });
    const insertChain = createInsertReturningChain([gateRun]);
    const updateChain = createUpdateReturningChain([
      createGeneratedApp({
        ...app,
        gateResults: app.gateResults.map((gate) =>
          gate.gateId === 'gate-1'
            ? {
                ...gate,
                status: 'passed',
                summary: gateRun.summary,
                evidence: gateRun.evidence,
                updatedAt: NOW.toISOString(),
              }
            : gate,
        ),
      }),
    ]);
    mockTenantDb.select
      .mockReturnValueOnce(createSelectChain([app]))
      .mockReturnValueOnce(
        createSelectChain([createGeneratedAppGenerationRun()]),
      )
      .mockReturnValueOnce(
        createSelectChain([createGeneratedAppRepairAttempt()]),
      );
    mockTenantDb.insert.mockReturnValueOnce(insertChain);
    mockTenantDb.update.mockReturnValueOnce(updateChain);

    const response = await service.recordGateRun(TENANT_ID, USER_ID, APP_ID, {
      gateId: 'gate-1',
      generationRunId: GENERATION_RUN_ID,
      repairAttemptId: REPAIR_ATTEMPT_ID,
      attemptNumber: 1,
      status: 'passed',
      summary: gateRun.summary,
      evidence: gateRun.evidence,
      startedAt: NOW.toISOString(),
      completedAt: NOW.toISOString(),
    });

    expect(insertChain.values).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_ID,
        generatedAppId: APP_ID,
        generationRunId: GENERATION_RUN_ID,
        repairAttemptId: REPAIR_ATTEMPT_ID,
        gateId: 'gate-1',
        gateOrder: 1,
        gateName: '架构计划门禁',
        blocking: true,
        attemptNumber: 1,
        status: 'passed',
        evidence: gateRun.evidence,
        createdBy: USER_ID,
      }),
    );
    expect(updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'preview_ready',
        publicShareToken: null,
        publicShareEnabled: false,
        gateResults: expect.arrayContaining([
          expect.objectContaining({
            gateId: 'gate-1',
            status: 'passed',
            evidence: gateRun.evidence,
          }),
        ]),
      }),
    );
    const updatePayload = updateChain.set.mock.calls[0]?.[0] as Record<
      string,
      unknown
    >;
    expect(
      Object.prototype.hasOwnProperty.call(updatePayload, 'generationPlan'),
    ).toBe(false);
    expect(response.gateRun).toEqual(
      expect.objectContaining({
        id: GATE_RUN_ID,
        gateId: 'gate-1',
        status: 'passed',
      }),
    );
    expect(response.app.id).toBe(APP_ID);
  });

  it('记录失败门禁运行时应关闭已启用的公开链接并写入修复建议', async () => {
    const app = createGeneratedApp({
      status: 'published',
      readiness: createPublishCandidateReadiness(),
      publicShareEnabled: true,
      publicShareToken: '9'.repeat(64),
      publicShareCreatedAt: NOW,
    });
    const gateRun = createGeneratedAppGateRun({
      gateId: 'gate-2',
      gateOrder: 2,
      gateName: '静态合约门禁',
      status: 'failed',
      summary: 'TypeScript 类型检查失败。',
      failure: {
        code: 'tsc-failed',
        message: '存在类型错误。',
      },
      repairInstructions: '修复类型错误后重新运行 gate-2。',
    });
    const insertChain = createInsertReturningChain([gateRun]);
    const updateChain = createUpdateReturningChain([
      createGeneratedApp({
        ...app,
        status: 'failed',
        publicShareEnabled: false,
        publicShareToken: null,
        publicShareDisabledAt: NOW,
      }),
    ]);
    mockTenantDb.select.mockReturnValueOnce(createSelectChain([app]));
    mockTenantDb.insert.mockReturnValueOnce(insertChain);
    mockTenantDb.update.mockReturnValueOnce(updateChain);

    const response = await service.recordGateRun(TENANT_ID, USER_ID, APP_ID, {
      gateId: 'gate-2',
      attemptNumber: 2,
      status: 'failed',
      summary: 'TypeScript 类型检查失败。',
      evidence: [],
      failure: {
        code: 'tsc-failed',
        message: '存在类型错误。',
      },
      repairInstructions: '修复类型错误后重新运行 gate-2。',
    });

    expect(insertChain.values).toHaveBeenCalledWith(
      expect.objectContaining({
        gateId: 'gate-2',
        attemptNumber: 2,
        status: 'failed',
        failure: {
          code: 'tsc-failed',
          message: '存在类型错误。',
        },
        repairInstructions: '修复类型错误后重新运行 gate-2。',
      }),
    );
    expect(updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'failed',
        publicShareToken: null,
        publicShareEnabled: false,
        publicShareDisabledAt: expect.any(Date),
      }),
    );
    expect(response.gateRun.failure).toEqual({
      code: 'tsc-failed',
      message: '存在类型错误。',
    });
    expect(response.gateRun.repairInstructions).toBe(
      '修复类型错误后重新运行 gate-2。',
    );
  });

  it('创建者可以分页筛选门禁运行证据记录', async () => {
    const gateRun = createGeneratedAppGateRun({
      gateId: 'gate-2',
      gateOrder: 2,
      gateName: '静态合约门禁',
      status: 'failed',
      failure: {
        message: '类型检查失败。',
      },
    });
    const listChain = createSelectPageChain([gateRun]);
    const countChain = createCountChain(1);
    mockTenantDb.select
      .mockReturnValueOnce(listChain)
      .mockReturnValueOnce(countChain);

    const response = await service.listGateRuns(TENANT_ID, APP_ID, {
      page: 1,
      pageSize: 20,
      gateId: 'gate-2',
      status: 'failed',
    });

    expect(listChain.where).toHaveBeenCalledTimes(1);
    expect(countChain.where).toHaveBeenCalledTimes(1);
    expect(response.data).toEqual([
      expect.objectContaining({
        id: GATE_RUN_ID,
        tenantId: TENANT_ID,
        appId: APP_ID,
        gateId: 'gate-2',
        status: 'failed',
        failure: {
          message: '类型检查失败。',
        },
      }),
    ]);
    expect(response.meta).toEqual({
      total: 1,
      page: 1,
      pageSize: 20,
      totalPages: 1,
    });
  });

  it('空台账分页应稳定返回零总数而不是依赖 count 行存在', async () => {
    const emptyCountChain = () => ({
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue([]),
    });
    mockTenantDb.select
      .mockReturnValueOnce(createSelectPageChain([]))
      .mockReturnValueOnce(emptyCountChain())
      .mockReturnValueOnce(createSelectPageChain([]))
      .mockReturnValueOnce(emptyCountChain())
      .mockReturnValueOnce(createSelectPageChain([]))
      .mockReturnValueOnce(emptyCountChain());

    const [runs, repairs, gates] = await Promise.all([
      service.listGenerationRuns(TENANT_ID, APP_ID, {
        page: 2,
        pageSize: 10,
      }),
      service.listRepairAttempts(TENANT_ID, APP_ID, GENERATION_RUN_ID, {
        page: 3,
        pageSize: 5,
      }),
      service.listGateRuns(TENANT_ID, APP_ID, {
        page: 4,
        pageSize: 25,
      }),
    ]);

    expect(runs).toEqual({
      data: [],
      meta: { total: 0, page: 2, pageSize: 10, totalPages: 0 },
    });
    expect(repairs).toEqual({
      data: [],
      meta: { total: 0, page: 3, pageSize: 5, totalPages: 0 },
    });
    expect(gates).toEqual({
      data: [],
      meta: { total: 0, page: 4, pageSize: 25, totalPages: 0 },
    });
  });

  it('生成运行 DTO 应保留默认时间、显式 null 和完整更新字段', async () => {
    const app = createGeneratedApp();
    const createdRun = createGeneratedAppGenerationRun();
    const updatedRun = createGeneratedAppGenerationRun({
      status: 'failed',
      summary: '门禁回滚完成。',
      failureReason: null,
      startedAt: new Date('2026-04-25T01:00:00.000Z'),
      completedAt: null,
    });
    const insertChain = createInsertReturningChain([createdRun]);
    const updateChain = createUpdateReturningChain([updatedRun]);
    mockTenantDb.select.mockReturnValueOnce(createSelectChain([app]));
    mockTenantDb.insert.mockReturnValueOnce(insertChain);
    mockTenantDb.update.mockReturnValueOnce(updateChain);

    const created = await service.createGenerationRun(
      TENANT_ID,
      USER_ID,
      APP_ID,
      {
        runNumber: 2,
        status: 'running',
        triggerSource: 'retry',
        maxRepairAttempts: 2,
        maxRuntimeSeconds: 900,
        summary: '重试门禁。',
        completedAt: null,
      },
    );
    const updated = await service.updateGenerationRun(
      TENANT_ID,
      APP_ID,
      GENERATION_RUN_ID,
      {
        status: 'failed',
        summary: '门禁回滚完成。',
        failureReason: null,
        startedAt: '2026-04-25T01:00:00.000Z',
        completedAt: null,
      },
    );

    expect(insertChain.values).toHaveBeenCalledWith(
      expect.objectContaining({
        runNumber: 2,
        status: 'running',
        triggerSource: 'retry',
        failureReason: null,
        startedAt: expect.any(Date),
        completedAt: null,
      }),
    );
    expect(updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'failed',
        summary: '门禁回滚完成。',
        failureReason: null,
        startedAt: new Date('2026-04-25T01:00:00.000Z'),
        completedAt: null,
        updatedAt: expect.any(Date),
      }),
    );
    expect(created).toEqual(
      expect.objectContaining({ id: GENERATION_RUN_ID, status: 'running' }),
    );
    expect(updated).toEqual(
      expect.objectContaining({
        status: 'failed',
        failureReason: null,
        completedAt: null,
      }),
    );
  });

  it('生成运行和修复尝试更新零行时应回滚为领域 not-found 错误', async () => {
    mockTenantDb.update
      .mockReturnValueOnce(createUpdateReturningChain([]))
      .mockReturnValueOnce(createUpdateReturningChain([]));

    await expect(
      service.updateGenerationRun(TENANT_ID, APP_ID, GENERATION_RUN_ID, {
        completedAt: null,
      }),
    ).rejects.toBeInstanceOf(GeneratedAppGenerationRunNotFoundException);
    await expect(
      service.updateRepairAttempt(
        TENANT_ID,
        APP_ID,
        GENERATION_RUN_ID,
        REPAIR_ATTEMPT_ID,
        { completedAt: null },
      ),
    ).rejects.toBeInstanceOf(GeneratedAppRepairAttemptNotFoundException);
  });

  it('修复尝试 DTO 应归一化缺省时间、nullable 计划并持久化全部状态转换字段', async () => {
    const run = createGeneratedAppGenerationRun();
    const createdAttempt = createGeneratedAppRepairAttempt({
      repairPlan: null,
      reverificationPlan: null,
    });
    const updatedAttempt = createGeneratedAppRepairAttempt({
      status: 'failed',
      failureSummary: '仍有阻断证据。',
      changeSummary: null,
      verificationSummary: null,
      completedAt: null,
    });
    const insertChain = createInsertReturningChain([createdAttempt]);
    const updateChain = createUpdateReturningChain([updatedAttempt]);
    mockTenantDb.select.mockReturnValueOnce(createSelectChain([run]));
    mockTenantDb.insert.mockReturnValueOnce(insertChain);
    mockTenantDb.update.mockReturnValueOnce(updateChain);

    const created = await service.createRepairAttempt(
      TENANT_ID,
      USER_ID,
      APP_ID,
      GENERATION_RUN_ID,
      {
        attemptNumber: 2,
        targetGateId: 'gate-6',
        status: 'running',
        failureSummary: '独立审查缺少证据。',
        changeSummary: null,
        verificationSummary: null,
        repairPlan: null,
        reverificationPlan: null,
        completedAt: null,
      },
    );
    const updated = await service.updateRepairAttempt(
      TENANT_ID,
      APP_ID,
      GENERATION_RUN_ID,
      REPAIR_ATTEMPT_ID,
      {
        status: 'failed',
        failureSummary: '仍有阻断证据。',
        changeSummary: null,
        verificationSummary: null,
        repairPlan: null,
        reverificationPlan: null,
        startedAt: '2026-04-25T02:00:00.000Z',
        completedAt: null,
      },
    );

    expect(insertChain.values).toHaveBeenCalledWith(
      expect.objectContaining({
        targetGateId: 'gate-6',
        repairPlan: null,
        reverificationPlan: null,
        startedAt: expect.any(Date),
        completedAt: null,
      }),
    );
    expect(updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'failed',
        failureSummary: '仍有阻断证据。',
        changeSummary: null,
        verificationSummary: null,
        repairPlan: null,
        reverificationPlan: null,
        startedAt: new Date('2026-04-25T02:00:00.000Z'),
        completedAt: null,
      }),
    );
    expect(created.repairPlan).toBeNull();
    expect(created.reverificationPlan).toBeNull();
    expect(updated).toEqual(
      expect.objectContaining({ status: 'failed', completedAt: null }),
    );
  });
});

