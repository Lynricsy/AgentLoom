import type { ExecutionStep } from '../../database/schema';
import {
  isConditionNode,
  unwrapConditionBranchPayload,
} from './condition-evaluator.util';
import { isRecord, resolveJsonPath } from './node-value.util';

export function resolveSourceHandleValue(
  sourceStep: ExecutionStep,
  sourceHandle: string,
): unknown {
  if (!isRecord(sourceStep.result)) {
    return undefined;
  }

  const resolved = resolveJsonPath(sourceStep.result, sourceHandle);
  if (resolved !== undefined) {
    if (isConditionNode(sourceStep.nodeType)) {
      return unwrapConditionBranchPayload(sourceHandle, resolved);
    }

    return resolved;
  }

  switch (sourceStep.nodeType) {
    case 'agent':
    case 'chat-agent':
      if (
        sourceHandle === 'reply-out' ||
        sourceHandle === 'agent-out' ||
        sourceHandle === 'reply' ||
        sourceHandle === 'agent-output'
      ) {
        return sourceStep.result.content;
      }
      if (
        sourceHandle === 'structured-out' ||
        sourceHandle === 'structured' ||
        sourceHandle === 'structured-output'
      ) {
        return sourceStep.result.decision;
      }
      return undefined;
    case 'manual-trigger':
    case 'schedule-trigger':
    case 'webhook-trigger':
    case 'api-event-trigger':
      if (sourceHandle === 'payload-out' || sourceHandle === 'payload') {
        return sourceStep.result.payload;
      }
      if (sourceHandle === 'exec-out' || sourceHandle === 'exec_out') {
        return sourceStep.result['exec-out'] ?? sourceStep.result.exec_out;
      }
      if (isRecord(sourceStep.result.payload)) {
        return sourceStep.result.payload[sourceHandle];
      }
      return undefined;
    case 'llm-model':
      return sourceHandle === 'model-out' || sourceHandle === 'model-output'
        ? sourceStep.result
        : undefined;
    case 'smart-routing':
      return sourceHandle === 'model-out' ? sourceStep.result : undefined;
    case 'mcp-tool':
      return sourceHandle === 'tool-out' || sourceHandle === 'tool-output'
        ? sourceStep.result
        : undefined;
    case 'skill':
      return sourceHandle === 'skill-out' ? sourceStep.result : undefined;
    case 'knowledge-base':
      return sourceHandle === 'knowledge-out' || sourceHandle === 'knowledge'
        ? sourceStep.result
        : undefined;
    case 'sandbox':
      return sourceHandle === 'sandbox-out' || sourceHandle === 'sandbox-output'
        ? sourceStep.result
        : undefined;
    case 'workspace':
      return sourceHandle === 'volume-out' || sourceHandle === 'volume-output'
        ? sourceStep.result
        : undefined;
    case 'memory':
      return sourceHandle === 'memory-out' || sourceHandle === 'memory-out-0'
        ? sourceStep.result
        : undefined;
    case 'merge':
      return sourceHandle === 'merged-out' || sourceHandle === 'merged'
        ? sourceStep.result
        : undefined;
    default:
      return undefined;
  }
}
