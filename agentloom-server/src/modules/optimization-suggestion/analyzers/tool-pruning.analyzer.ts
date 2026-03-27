import { Injectable } from '@nestjs/common';

import type {
  AnalysisContext,
  SuggestionAnalyzer,
  SuggestionCandidate,
} from './suggestion-analyzer.interface';

const MIN_CONSECUTIVE_UNUSED = 5;

@Injectable()
export class ToolPruningAnalyzer implements SuggestionAnalyzer {
  readonly type = 'tool_pruning';

  analyze(context: AnalysisContext): SuggestionCandidate | null {
    const configuredTools = this.resolveTools(context.nodeConfig);

    if (configuredTools.length <= 1) {
      return null;
    }

    const executions = this.groupExecutionToolUsage(context);
    if (executions.length < MIN_CONSECUTIVE_UNUSED) {
      return null;
    }

    const removableTools = configuredTools.filter((toolName) => {
      const consecutiveUnusedExecutions = this.countConsecutiveUnusedExecutions(
        toolName,
        executions,
      );

      return consecutiveUnusedExecutions >= MIN_CONSECUTIVE_UNUSED;
    });

    if (
      removableTools.length === 0 ||
      removableTools.length === configuredTools.length
    ) {
      return null;
    }

    const minUnusedCount = Math.min(
      ...removableTools.map((toolName) =>
        this.countConsecutiveUnusedExecutions(toolName, executions),
      ),
    );

    return {
      suggestionType: 'tool_pruning',
      confidence: this.calculateConfidence(minUnusedCount),
      currentValue: { tools: configuredTools },
      suggestedValue: {
        tools: configuredTools.filter(
          (toolName) => !removableTools.includes(toolName),
        ),
        removedTools: removableTools,
      },
      rationale: `工具 ${removableTools.join(', ')} 在最近 ${minUnusedCount} 次连续执行中均未被调用，适合从候选工具列表中裁剪。`,
    };
  }

  private resolveTools(nodeConfig: Record<string, unknown>): string[] {
    const rawTools = Array.isArray(nodeConfig.tools)
      ? nodeConfig.tools
      : Array.isArray(nodeConfig.toolBindings)
        ? nodeConfig.toolBindings
        : [];

    return rawTools
      .map((tool) => {
        if (typeof tool === 'string') {
          return tool;
        }

        if (typeof tool === 'object' && tool !== null) {
          const toolRecord = tool as Record<string, unknown>;

          if (typeof toolRecord.toolName === 'string') {
            return toolRecord.toolName;
          }

          if (typeof toolRecord.name === 'string') {
            return toolRecord.name;
          }
        }

        return null;
      })
      .filter(
        (toolName): toolName is string =>
          typeof toolName === 'string' && toolName.length > 0,
      );
  }

  private groupExecutionToolUsage(context: AnalysisContext): Array<{
    executionId: string;
    usedTools: Set<string>;
    lastSeenAt: Date;
  }> {
    const grouped = new Map<
      string,
      {
        executionId: string;
        usedTools: Set<string>;
        lastSeenAt: Date;
      }
    >();

    for (const telemetry of context.stepTelemetries) {
      const current = grouped.get(telemetry.executionId) ?? {
        executionId: telemetry.executionId,
        usedTools: new Set<string>(),
        lastSeenAt: telemetry.createdAt,
      };

      for (const toolCall of telemetry.telemetryData.toolCalls ?? []) {
        current.usedTools.add(toolCall.toolName);
      }

      if (telemetry.createdAt > current.lastSeenAt) {
        current.lastSeenAt = telemetry.createdAt;
      }

      grouped.set(telemetry.executionId, current);
    }

    return [...grouped.values()].sort(
      (left, right) => right.lastSeenAt.getTime() - left.lastSeenAt.getTime(),
    );
  }

  private countConsecutiveUnusedExecutions(
    toolName: string,
    executions: Array<{ usedTools: Set<string> }>,
  ): number {
    let count = 0;

    for (const execution of executions) {
      if (execution.usedTools.has(toolName)) {
        break;
      }

      count += 1;
    }

    return count;
  }

  private calculateConfidence(consecutiveUnusedExecutions: number): number {
    if (consecutiveUnusedExecutions >= 20) {
      return 0.95;
    }

    if (consecutiveUnusedExecutions >= 10) {
      return 0.85;
    }

    return 0.7;
  }
}
