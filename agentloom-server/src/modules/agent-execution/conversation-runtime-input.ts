import type { AgentRuntimeConfig } from '../agent-definition/agent-runtime-config.interface';
import {
  type InputPreprocessorHandlerImpl,
  normalizeInputPreprocessorConfig,
} from '../execution/node-handlers/input-preprocessor.handler';
import {
  isRecord,
  normalizeOptionalString,
} from './conversation-execution-metadata';

export function estimateConversationTokenCount(value: unknown): number {
  const serialized =
    typeof value === 'string' ? value : JSON.stringify(value ?? {});
  return Math.max(0, Math.ceil(serialized.length / 4));
}

export async function applyConversationInputPreprocessors(
  latestPrompt: string,
  runtimeConfig: AgentRuntimeConfig | undefined,
  inputPreprocessorHandler: InputPreprocessorHandlerImpl,
): Promise<string> {
  const preprocessors = runtimeConfig?.inputPreprocessors ?? [];
  if (preprocessors.length === 0) {
    return latestPrompt;
  }

  let current: string | Record<string, unknown> = latestPrompt;

  for (const preprocessor of preprocessors) {
    const transformType = normalizeOptionalString(preprocessor.type);
    const configRecord = isRecord(preprocessor.config)
      ? preprocessor.config
      : {};

    if (!transformType) {
      continue;
    }

    const handlerInput: string | Record<string, unknown> =
      typeof current === 'string'
        ? {
            text: current,
            value: current,
            raw: current,
          }
        : current;

    current = (
      await inputPreprocessorHandler.execute(
        handlerInput,
        normalizeInputPreprocessorConfig(configRecord, transformType),
      )
    ).output;
  }

  return typeof current === 'string'
    ? current
    : JSON.stringify(current, null, 2);
}
