/**
 * Agent 节点「结构化」端口（structured-out）的取值：按节点生效的 outputSchema
 * 解析并校验模型最终回复。Schema 同时经 appendOutputSchemaToSystemPrompt 进入系统提示词，
 * 这里负责兑现端口契约——下游拿到的一定是通过 Schema 校验的 JSON。
 *
 * 人工干预恢复（approve / modify）时对最终采用的内容再走一遍同一校验。
 */
import { z } from 'zod';

/** 模型常把 JSON 包在 ```json 围栏里；只剥离包住整段回复的那一层围栏。 */
const WHOLE_REPLY_FENCE = /^```(?:json)?\s*\n([\s\S]*?)\n?```$/i;

/**
 * @param content 模型回复文本；干预修改提交的内容也可能已是结构化值，此时跳过 JSON 解析直接校验。
 */
export function parseAgentStructuredOutput(
  content: unknown,
  outputSchema: Record<string, unknown>,
): unknown {
  let parsed: unknown = content;
  if (typeof content === 'string') {
    const trimmed = content.trim();
    const jsonText = WHOLE_REPLY_FENCE.exec(trimmed)?.[1] ?? trimmed;
    try {
      parsed = JSON.parse(jsonText);
    } catch (error) {
      throw new Error(
        `Agent 回复不是合法 JSON，无法输出到「结构化」端口（${error instanceof Error ? error.message : String(error)}）`,
      );
    }
  }

  let validator: z.ZodType;
  try {
    validator = z.fromJSONSchema(outputSchema);
  } catch (error) {
    throw new Error(
      `Agent 输出 Schema 无法用于校验（${error instanceof Error ? error.message : String(error)}）`,
    );
  }

  const validation = validator.safeParse(parsed);
  if (!validation.success) {
    throw new Error(
      `Agent 回复不符合输出 Schema：\n${z.prettifyError(validation.error)}`,
    );
  }
  return validation.data;
}
