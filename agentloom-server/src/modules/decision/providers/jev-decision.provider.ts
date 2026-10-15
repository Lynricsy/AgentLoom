import { Injectable } from '@nestjs/common';
import type {
  DecisionDefinition,
  DecisionOutcome,
  DecisionProvider,
  DecisionProviderEvaluation,
} from '../decision.types';
import { JevClient } from './jev-client';

/** 决策定义在 Jev 请求里的问题 id；一个请求只问一个问题 */
const ANSWER_ID = 'answer';

/** 把决策定义翻译成 Jev 问题并把回答映射回 DecisionOutcome */
@Injectable()
export class JevDecisionProvider implements DecisionProvider {
  readonly name = 'jev' as const;

  constructor(private readonly client: JevClient) {}

  get enabled(): boolean {
    return this.client.enabled;
  }

  async evaluate<I>(
    def: DecisionDefinition<I>,
    input: I,
    signal: AbortSignal,
  ): Promise<DecisionProviderEvaluation> {
    const criteria =
      def.type === 'choice' ? def.buildOptions?.(input) : def.criteria;
    const response = await this.client.evaluate(
      {
        state: def.buildState(input),
        questions: {
          [ANSWER_ID]: {
            type: def.type,
            instructions: def.instructions,
            ...(criteria ? { criteria } : {}),
          },
        },
      },
      signal,
    );
    const answer = response.answers[ANSWER_ID];
    let outcome: DecisionOutcome;

    if (answer?.type === 'noul' && def.type === 'noul') {
      outcome = { type: 'noul', value: answer.noul };
    } else if (answer?.type === 'choice' && def.type === 'choice') {
      outcome = {
        type: 'choice',
        choice: answer.choice,
        probabilities: answer.probabilities,
        confidence: answer.confidence,
      };
    } else {
      throw new Error(
        `Jev 回答类型不匹配：期望 ${def.type}，实际 ${answer?.type ?? '缺失'}`,
      );
    }

    return {
      outcome,
      model: response.model,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
    };
  }
}
