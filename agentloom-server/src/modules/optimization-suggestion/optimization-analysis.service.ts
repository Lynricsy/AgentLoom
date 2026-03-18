import { Dependencies, Injectable, Logger } from '@nestjs/common';
import { and, count, desc, eq, gte } from 'drizzle-orm';

import { runInTenantTransaction } from '../../common/interceptors/tenant-transaction.context';
import { DRIZZLE, type DrizzleDB } from '../../database/database.module';
import type {
  ExecutionSummaryData,
  ReactFlowNode,
  StepTelemetryData,
} from '../../database/schema';
import * as schema from '../../database/schema';
import {
  AutonomyUpgradeAnalyzer,
  ModelDowngradeAnalyzer,
  TimeoutAdjustmentAnalyzer,
  ToolPruningAnalyzer,
  type AnalysisContext,
  type SuggestionAnalyzer,
  type SuggestionCandidate,
} from './analyzers';
import { OrganizationAutonomyPolicyService } from '../organization/organization-autonomy-policy.service';

type AnalysisResult = {
  analyzed: number;
  suggestionsCreated: number;
};

type WorkflowRow = Pick<
  typeof schema.workflowDefinitions.$inferSelect,
  'id' | 'tenantId' | 'nodes'
>;

@Injectable()
@Dependencies(
  DRIZZLE,
  ModelDowngradeAnalyzer,
  TimeoutAdjustmentAnalyzer,
  ToolPruningAnalyzer,
  AutonomyUpgradeAnalyzer,
  OrganizationAutonomyPolicyService,
)
export class OptimizationAnalysisService {
  private readonly logger = new Logger(OptimizationAnalysisService.name);

  constructor(
    private readonly db: DrizzleDB,
    private readonly modelDowngradeAnalyzer: ModelDowngradeAnalyzer,
    private readonly timeoutAdjustmentAnalyzer: TimeoutAdjustmentAnalyzer,
    private readonly toolPruningAnalyzer: ToolPruningAnalyzer,
    private readonly autonomyUpgradeAnalyzer: AutonomyUpgradeAnalyzer,
    private readonly organizationAutonomyPolicyService: OrganizationAutonomyPolicyService,
  ) {}

  async runAnalysis(tenantId?: string): Promise<AnalysisResult> {
    const tenantIds = tenantId ? [tenantId] : await this.getTenantIds();

    let analyzed = 0;
    let suggestionsCreated = 0;

    for (const currentTenantId of tenantIds) {
      const tenantResult = await runInTenantTransaction(
        this.db,
        currentTenantId,
        async (tenantDb) => this.analyzeTenant(tenantDb, currentTenantId),
      );

      analyzed += tenantResult.analyzed;
      suggestionsCreated += tenantResult.suggestionsCreated;
    }

    return { analyzed, suggestionsCreated };
  }

  private async getTenantIds(): Promise<string[]> {
    const rows = await this.db
      .select({ tenantId: schema.workflowDefinitions.tenantId })
      .from(schema.workflowDefinitions);

    return Array.from(new Set(rows.map((row) => row.tenantId)));
  }

  private async analyzeTenant(
    tenantDb: DrizzleDB,
    tenantId: string,
  ): Promise<AnalysisResult> {
    const workflows = await tenantDb
      .select({
        id: schema.workflowDefinitions.id,
        tenantId: schema.workflowDefinitions.tenantId,
        nodes: schema.workflowDefinitions.nodes,
      })
      .from(schema.workflowDefinitions)
      .where(eq(schema.workflowDefinitions.tenantId, tenantId));

    const analyzers = this.getAnalyzers();
    const analysisWindow = this.createAnalysisWindow();
    const suggestionsToInsert: typeof schema.optimizationSuggestions.$inferInsert[] = [];
    let analyzed = 0;
    const autonomyCap =
      await this.organizationAutonomyPolicyService.resolveAutonomyCapForTenant(tenantId);

    for (const workflow of workflows) {
      const agentNodes = workflow.nodes.filter((node) => this.isAgentNode(node));

      for (const node of agentNodes) {
        try {
          const telemetryCount = await this.getTelemetryCount(
            tenantDb,
            workflow.id,
            node.id,
            analysisWindow.start,
          );

          if (telemetryCount < 20) {
            continue;
          }

          const [telemetryRecords, executionSummaries] = await Promise.all([
            this.getTelemetryRecords(
              tenantDb,
              workflow.id,
              node.id,
              analysisWindow.start,
            ),
            this.getExecutionSummaries(
              tenantDb,
              workflow.id,
              node.id,
              analysisWindow.start,
            ),
          ]);

          const context: AnalysisContext = {
            tenantId,
            workflowDefinitionId: workflow.id,
            nodeId: node.id,
            autonomyCap,
            nodeConfig: this.normalizeNodeConfig(workflow, node),
            stepTelemetries: telemetryRecords,
            executionSummaries,
            analysisPeriod: analysisWindow,
          };

          const candidates = analyzers
            .map((analyzer) => analyzer.analyze(context))
            .filter((candidate): candidate is SuggestionCandidate => candidate !== null);

          const existingSuggestionTypes = await this.getExistingPendingSuggestionTypes(
            tenantDb,
            tenantId,
            workflow.id,
            node.id,
          );

          for (const candidate of candidates) {
            if (existingSuggestionTypes.has(candidate.suggestionType)) {
              continue;
            }

            suggestionsToInsert.push({
              tenantId,
              workflowDefinitionId: workflow.id,
              nodeId: node.id,
              suggestionType: candidate.suggestionType,
              status: 'pending',
              confidence: candidate.confidence,
              currentValue: this.mapCurrentValue(candidate),
              suggestedValue: this.mapSuggestedValue(candidate),
              rationale: candidate.rationale,
              impactEstimate: candidate.impactEstimate ?? null,
              analysisMetadata: {
                totalRecords: telemetryRecords.length + executionSummaries.length,
                analyzerVersion: 'optimization-analysis-v1',
              },
              analysisPeriodStart: analysisWindow.start,
              analysisPeriodEnd: analysisWindow.end,
            });
          }

          analyzed += 1;
        } catch (error) {
          const message = error instanceof Error ? error.message : 'unknown error';
          const stack = error instanceof Error ? error.stack : undefined;

          this.logger.error(
            `Optimization analysis failed for node ${node.id} in workflow ${workflow.id}: ${message}`,
            stack,
          );
        }
      }
    }

    if (suggestionsToInsert.length > 0) {
      await tenantDb.insert(schema.optimizationSuggestions).values(suggestionsToInsert);
    }

    return {
      analyzed,
      suggestionsCreated: suggestionsToInsert.length,
    };
  }

  private getAnalyzers(): SuggestionAnalyzer[] {
    return [
      this.modelDowngradeAnalyzer,
      this.timeoutAdjustmentAnalyzer,
      this.toolPruningAnalyzer,
      this.autonomyUpgradeAnalyzer,
    ];
  }

  private createAnalysisWindow(): { start: Date; end: Date } {
    const end = new Date();
    const start = new Date(end);
    start.setDate(start.getDate() - 28);

    return { start, end };
  }

  private mapCurrentValue(
    candidate: SuggestionCandidate,
  ): schema.SuggestionCurrentValue {
    const value = this.asRecord(candidate.currentValue) ?? {};

    switch (candidate.suggestionType) {
      case 'model_downgrade':
        return {
          modelId: this.readString(value.modelId, value.id) ?? 'unknown-model',
          modelName:
            this.readString(value.modelName, value.name, value.modelId) ?? 'unknown-model',
          provider: this.readString(value.provider) ?? 'unknown-provider',
        };
      case 'timeout_adjustment':
        return {
          timeoutMs: this.readNumber(value.timeoutMs) ?? 30_000,
        };
      case 'tool_pruning':
        return {
          tools: this.readStringArray(value.tools),
          removedTools: this.readStringArray(value.removedTools),
        };
      case 'autonomy_upgrade':
        return {
          autonomyMode:
            this.readString(value.autonomyMode, value.mode) ?? 'MANUAL_CONFIRM',
        };
    }
  }

  private mapSuggestedValue(
    candidate: SuggestionCandidate,
  ): schema.SuggestionSuggestedValue {
    const value = this.asRecord(candidate.suggestedValue) ?? {};

    switch (candidate.suggestionType) {
      case 'model_downgrade':
        return {
          modelId: this.readString(value.modelId, value.id) ?? 'unknown-model',
          modelName:
            this.readString(value.modelName, value.name, value.modelId) ?? 'unknown-model',
          provider: this.readString(value.provider) ?? 'unknown-provider',
        };
      case 'timeout_adjustment':
        return {
          timeoutMs: this.readNumber(value.timeoutMs) ?? 30_000,
        };
      case 'tool_pruning':
        return {
          tools: this.readStringArray(value.tools),
          removedTools: this.readStringArray(value.removedTools),
        };
      case 'autonomy_upgrade':
        return {
          autonomyMode:
            this.readString(value.autonomyMode, value.mode) ?? 'MANUAL_CONFIRM',
        };
    }
  }

  private isAgentNode(node: ReactFlowNode): boolean {
    return (
      node.type === 'agent' ||
      node.type === 'llm-agent' ||
      node.type === 'chat-agent' ||
      this.readString(node.data?.category) === 'agent'
    );
  }

  private normalizeNodeConfig(
    workflow: WorkflowRow,
    node: ReactFlowNode,
  ): Record<string, unknown> {
    const nodeData = this.asRecord(node.data) ?? {};
    const config = this.asRecord(nodeData.config) ?? {};
    const settings = this.asRecord(nodeData.settings) ?? {};
    const autonomyConfig = this.asRecord(nodeData.autonomyConfig) ?? {};
    const model = this.resolveModelConfig(workflow, nodeData, config);
    const tools = this.resolveTools(nodeData, config);

    return {
      ...config,
      ...settings,
      ...nodeData,
      model,
      tools,
      timeoutMs: this.readNumber(nodeData.timeoutMs, config.timeoutMs, settings.timeoutMs),
      autonomyMode:
        this.readString(
          nodeData.autonomyMode,
          autonomyConfig.mode,
          settings.autonomyMode,
          config.autonomyMode,
        ) || 'MANUAL_CONFIRM',
    };
  }

  private resolveModelConfig(
    workflow: WorkflowRow,
    nodeData: Record<string, unknown>,
    config: Record<string, unknown>,
  ): Record<string, unknown> {
    const directModel = this.asRecord(nodeData.model) ?? this.asRecord(config.model);
    const modelConfig = this.asRecord(nodeData.modelConfig) ?? this.asRecord(config.modelConfig);
    const connectedModelNodeId = this.readString(modelConfig?.connectedModelNodeId);

    if (!connectedModelNodeId) {
      return directModel ?? modelConfig ?? {};
    }

    const connectedNode = workflow.nodes.find((candidate) => candidate.id === connectedModelNodeId);
    const connectedNodeData = this.asRecord(connectedNode?.data) ?? {};
    const connectedConfig = this.asRecord(connectedNodeData.config) ?? {};

    return {
      ...connectedConfig,
      ...connectedNodeData,
      ...(directModel ?? {}),
    };
  }

  private resolveTools(
    nodeData: Record<string, unknown>,
    config: Record<string, unknown>,
  ): unknown[] {
    const directTools = Array.isArray(nodeData.tools)
      ? nodeData.tools
      : Array.isArray(config.tools)
        ? config.tools
        : [];
    const boundTools = Array.isArray(nodeData.toolBindings)
      ? nodeData.toolBindings
      : Array.isArray(config.toolBindings)
        ? config.toolBindings
        : [];

    return directTools.length > 0 ? directTools : boundTools;
  }

  private async getTelemetryCount(
    tenantDb: DrizzleDB,
    workflowDefinitionId: string,
    nodeId: string,
    analysisStart: Date,
  ): Promise<number> {
    const rows = await tenantDb
      .select({ count: count() })
      .from(schema.agentExecutionRecords)
      .innerJoin(
        schema.workflowExecutions,
        eq(
          schema.agentExecutionRecords.executionId,
          schema.workflowExecutions.id,
        ),
      )
      .where(
        and(
          eq(schema.agentExecutionRecords.nodeId, nodeId),
          eq(schema.agentExecutionRecords.recordType, 'step_telemetry'),
          eq(
            schema.workflowExecutions.workflowDefinitionId,
            workflowDefinitionId,
          ),
          gte(schema.agentExecutionRecords.createdAt, analysisStart),
        ),
      );

    return this.toNumber(rows[0]?.count);
  }

  private async getTelemetryRecords(
    tenantDb: DrizzleDB,
    workflowDefinitionId: string,
    nodeId: string,
    analysisStart: Date,
  ): Promise<AnalysisContext['stepTelemetries']> {
    const rows = await tenantDb
      .select({
        executionId: schema.agentExecutionRecords.executionId,
        stepId: schema.agentExecutionRecords.stepId,
        telemetryData: schema.agentExecutionRecords.telemetryData,
        createdAt: schema.agentExecutionRecords.createdAt,
      })
      .from(schema.agentExecutionRecords)
      .innerJoin(
        schema.workflowExecutions,
        eq(
          schema.agentExecutionRecords.executionId,
          schema.workflowExecutions.id,
        ),
      )
      .where(
        and(
          eq(schema.agentExecutionRecords.nodeId, nodeId),
          eq(schema.agentExecutionRecords.recordType, 'step_telemetry'),
          eq(
            schema.workflowExecutions.workflowDefinitionId,
            workflowDefinitionId,
          ),
          gte(schema.agentExecutionRecords.createdAt, analysisStart),
        ),
      )
      .orderBy(desc(schema.agentExecutionRecords.createdAt));

    return rows.flatMap((row) => {
      if (!row.telemetryData || !row.stepId) {
        return [];
      }

      return [
        {
          executionId: row.executionId,
          stepId: row.stepId,
          telemetryData: this.mapTelemetryData(row.telemetryData),
          createdAt: row.createdAt,
        },
      ];
    });
  }

  private async getExecutionSummaries(
    tenantDb: DrizzleDB,
    workflowDefinitionId: string,
    nodeId: string,
    analysisStart: Date,
  ): Promise<AnalysisContext['executionSummaries']> {
    const rows = await tenantDb
      .select({
        executionId: schema.agentExecutionRecords.executionId,
        summaryData: schema.agentExecutionRecords.summaryData,
        createdAt: schema.agentExecutionRecords.createdAt,
      })
      .from(schema.agentExecutionRecords)
      .innerJoin(
        schema.workflowExecutions,
        eq(
          schema.agentExecutionRecords.executionId,
          schema.workflowExecutions.id,
        ),
      )
      .where(
        and(
          eq(schema.agentExecutionRecords.nodeId, nodeId),
          eq(schema.agentExecutionRecords.recordType, 'execution_summary'),
          eq(
            schema.workflowExecutions.workflowDefinitionId,
            workflowDefinitionId,
          ),
          gte(schema.agentExecutionRecords.createdAt, analysisStart),
        ),
      )
      .orderBy(desc(schema.agentExecutionRecords.createdAt));

    return rows.flatMap((row) => {
      if (!row.summaryData) {
        return [];
      }

      return [
        {
          executionId: row.executionId,
          summaryData: this.mapSummaryData(row.summaryData),
          createdAt: row.createdAt,
        },
      ];
    });
  }

  private async getExistingPendingSuggestionTypes(
    tenantDb: DrizzleDB,
    tenantId: string,
    workflowDefinitionId: string,
    nodeId: string,
  ): Promise<Set<SuggestionCandidate['suggestionType']>> {
    const rows = await tenantDb
      .select({ suggestionType: schema.optimizationSuggestions.suggestionType })
      .from(schema.optimizationSuggestions)
      .where(
        and(
          eq(schema.optimizationSuggestions.tenantId, tenantId),
          eq(schema.optimizationSuggestions.workflowDefinitionId, workflowDefinitionId),
          eq(schema.optimizationSuggestions.nodeId, nodeId),
          eq(schema.optimizationSuggestions.status, 'pending'),
        ),
      );

    return new Set(rows.map((row) => row.suggestionType));
  }

  private mapTelemetryData(telemetryData: StepTelemetryData) {
    return {
      tokenUsage: telemetryData.llmInteractions
        ? {
            promptTokens: telemetryData.llmInteractions.promptTokens,
            completionTokens: telemetryData.llmInteractions.completionTokens,
            totalTokens: telemetryData.llmInteractions.totalTokens,
          }
        : undefined,
      latencyMs: telemetryData.llmInteractions?.latencyMs,
      errors: (telemetryData.errors ?? []).map((error) => ({
        type: error.errorType,
        message: error.errorMessage,
      })),
      toolCalls: (telemetryData.toolCalls ?? []).map((toolCall) => ({
        toolName: toolCall.toolName,
        success: toolCall.status === 'success',
      })),
      selfRepairs: (telemetryData.selfRepairs ?? []).map((repair) => ({
        success: repair.repairAttempts.some((attempt) => attempt.success),
      })),
    };
  }

  private mapSummaryData(summaryData: ExecutionSummaryData) {
    return {
      status: summaryData.failedSteps > 0 ? 'failed' : 'completed',
      totalDurationMs: summaryData.executionDurationMs,
      totalErrors: summaryData.totalErrors,
      totalTokens: summaryData.totalTokens,
    };
  }

  private asRecord(value: unknown): Record<string, unknown> | null {
    return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
  }

  private readString(...values: unknown[]): string | null {
    const resolved = values.find((value): value is string => typeof value === 'string' && value.length > 0);

    return resolved ?? null;
  }

  private readNumber(...values: unknown[]): number | null {
    const resolved = values.find(
      (value): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0,
    );

    return resolved ?? null;
  }

  private readStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value.filter((item): item is string => typeof item === 'string');
  }

  private toNumber(value: unknown): number {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === 'string') {
      const parsed = Number(value);

      return Number.isFinite(parsed) ? parsed : 0;
    }

    return 0;
  }
}
