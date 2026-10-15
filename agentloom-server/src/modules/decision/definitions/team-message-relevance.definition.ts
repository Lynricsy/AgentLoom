import type {
  DecisionDefinition,
  TeamMessageRelevanceInput,
} from '../decision.types';
import { truncateText } from './truncate.util';

const RECENT_OUTPUT_MAX_CHARS = 1500;
const MESSAGE_CONTENT_MAX_CHARS = 4000;

/**
 * 团队广播 observation 对某个接收者是否相关。
 * 规则恒为投递（value=1）；Jev 影子给出相关概率，仅记录。
 */
export const teamMessageRelevanceDefinition: DecisionDefinition<TeamMessageRelevanceInput> =
  {
    kind: 'team.message_relevance',
    type: 'noul',
    version: 1,
    shadow: true,
    instructions:
      'Does this message change what the recipient should do next in their current task?',
    criteria: {
      true: 'The recipient should act on it or adjust their plan',
      false: "Irrelevant to the recipient's current task or already known",
    },
    buildState: (input) => ({
      recipient: {
        role: input.recipient.role,
        instructions: input.recipient.instructions,
        recentOutput: truncateText(
          input.recipient.recentOutput ?? '',
          RECENT_OUTPUT_MAX_CHARS,
        ),
      },
      message: {
        fromRole: input.message.fromRole,
        kind: input.message.kind,
        content: truncateText(input.message.content, MESSAGE_CONTENT_MAX_CHARS),
        refs: input.message.refs,
      },
    }),
    rule: () => ({ type: 'noul', value: 1 }),
  };
