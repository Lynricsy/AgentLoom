import { Injectable } from '@nestjs/common';
import type {
  DecisionDefinition,
  DecisionProvider,
  DecisionProviderEvaluation,
} from '../decision.types';

/** 确定性规则：直接执行定义里的 rule，结果即主结果 */
@Injectable()
export class RuleDecisionProvider implements DecisionProvider {
  readonly name = 'rule' as const;

  async evaluate<I>(
    def: DecisionDefinition<I>,
    input: I,
  ): Promise<DecisionProviderEvaluation> {
    return { outcome: def.rule(input) };
  }
}
