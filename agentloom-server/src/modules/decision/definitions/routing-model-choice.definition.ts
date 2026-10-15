import type {
  DecisionDefinition,
  RoutingModelChoiceInput,
} from '../decision.types';
import { truncateText } from './truncate.util';

const QUERY_TEXT_MAX_CHARS = 4000;

/**
 * 路由节点的模型选择。规则结果 = 路由策略实际选中的模型；Jev 影子给出它会选的模型与置信度，仅记录。
 */
export const routingModelChoiceDefinition: DecisionDefinition<RoutingModelChoiceInput> =
  {
    kind: 'routing.model_choice',
    type: 'choice',
    version: 1,
    shadow: true,
    instructions:
      'Which candidate model is the best fit for this task considering quality, latency and cost?',
    buildState: (input) => ({
      task: {
        queryText:
          input.queryText === null
            ? null
            : truncateText(input.queryText, QUERY_TEXT_MAX_CHARS),
        taskCategory: input.taskCategory,
        inputTokenCount: input.inputTokenCount,
      },
      candidates: input.candidates.map((candidate) => ({
        id: candidate.id,
        name: candidate.name,
        provider: candidate.provider,
        qualityRank: candidate.qualityRank,
        avgLatencyMs: candidate.avgLatencyMs,
        costs: candidate.costs,
      })),
    }),
    buildOptions: (input) =>
      Object.fromEntries(
        input.candidates.map((candidate) => [
          candidate.id,
          `${candidate.name} (${candidate.provider}) quality=${candidate.qualityRank} latency=${candidate.avgLatencyMs}ms in=$${candidate.costs.input}/1k out=$${candidate.costs.output}/1k`,
        ]),
      ),
    rule: (input) => ({
      type: 'choice',
      choice: input.selectedModelId,
      probabilities: { [input.selectedModelId]: 1 },
      confidence: 1,
    }),
  };
