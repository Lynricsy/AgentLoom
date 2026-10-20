/**
 * 生成 AppSpec v2 草稿的提示词（ADR-0007 §1）。系统提示定义角色与输出规则；用户消息由
 * 创建者需求原文、绑定候选目录与上一次尝试的问题列表组成。
 */
import {
  GENERATED_APP_FIELD_ID_PATTERN,
  GENERATED_APP_SPEC_LIMITS,
} from './types/app-spec-v2.schema';
import type {
  AppSpecRepairFeedback,
  GeneratedAppCandidateKnowledge,
  GeneratedAppCatalogCandidate,
} from './types/generation-v2.ports';

/** 交给模型的候选目录上限：条数与序列化后的 UTF-8 字节数 */
export const APP_SPEC_CANDIDATES_MAX = 20;
export const APP_SPEC_CANDIDATE_CATALOG_MAX_BYTES = 16 * 1024;
/** 每个候选列出的知识库数，与每个知识库列出的文档名数 */
export const APP_SPEC_CANDIDATE_KNOWLEDGE_MAX = 5;
export const APP_SPEC_CANDIDATE_KNOWLEDGE_DOCUMENTS_MAX = 10;

const CANDIDATE_DESCRIPTION_MAX_LENGTH = 300;

const L = GENERATED_APP_SPEC_LIMITS;

export const GENERATED_APP_SPEC_SYSTEM_PROMPT = `你是 AgentLoom 的生成应用规划器。创建者用一句话描述想要的应用，你要把它落成一个「表单 → 调用已发布的工作流或 Agent → 分区展示结果」的应用规格草稿（AppSpec 草稿），只输出一个符合给定 JSON Schema 的 JSON 对象，不输出任何解释、Markdown 或代码块。

## 绑定（binding）
- 只能从用户消息中的「候选绑定目标」里选择一个目标，id 必须原样使用候选里的 workflowDefinitionId 或 agentDefinitionId，不得编造。
- 选择最能实现需求的目标；需求点名「上述工作流」等时，选择与需求最贴近的工作流。
- 工作流绑定（kind=workflow）：
  - inputMapping：每个表单字段恰好映射一次。候选的 inputs 不为 null 时，workflowInputFieldId 必须是 inputs 中的 id，且 inputs 里 required=true 的每个输入都必须被映射，映射它的表单字段也必须 required=true。
  - 类型兼容：工作流 text ← 表单 text 或 textarea；number ← number；single_select ← single_select；multi_select ← multi_select。选择字段的 options[].value 必须取自工作流该输入的 options（label 可以写得更友好）。工作流输入声明了 maxLength/min/max 时，表单字段的 maxLength/min/max 不能比它更宽。
  - 候选的 inputs 为 null 时，工作流没有声明输入契约，workflowInputFieldId 自定为 camelCase 键名。
  - outputMapping：每个结果分区恰好对应一个输出节点，nodeId 必须是候选 outputs 中的 nodeId。json-output 节点可以用 path 取结果对象中的一个键（如 answer、citations），text-output 节点不能带 path。
- Agent 绑定（kind=agent）：结果视图只能有一个分区，replySectionId 指向它，用来承接 Agent 的回复。Agent 回复是一段文本，这个分区的 format 只能是 markdown 或 text，不能是 citations 或 json（需求要求引用时写进回复正文）。

## 表单与结果
- 表单字段 id 必须匹配 ${GENERATED_APP_FIELD_ID_PATTERN.source}（camelCase，如 question、targetAudience），类型只能是 text、textarea、number、single_select、multi_select；最多 ${L.fieldsMax} 个字段，只保留实现需求必需的字段，不要为了「完整」添加需求没有提到的字段。
- 结果分区 id 用小写 kebab-case（如 answer、citations），format 取 text、markdown、citations（引用列表）、json；最多 ${L.resultSectionsMax} 个分区。需求提到「引用」「来源」时用 citations 分区承接。
- 标题、标签、说明使用简体中文，面向终端用户，不暴露工作流、节点等内部术语。

## 需求与验收场景
- requirements 只写从创建者需求拆出的、终端用户可验证的行为，source 固定为 prompt，id 形如 req-xxx，最多 ${L.requirementsMax} 条。不要写数据保存、登录、门禁等平台需求，也不要使用 req-platform- 开头的 id，服务端会补。
- acceptanceScenarios 全部为 scope=requirement，id 形如 scenario-xxx，最多 ${L.scenariosMax} 条；每条需求至少被一个场景的 requirementIds 引用。
- 每个场景的 browserSteps 必须能在真实浏览器里执行：先用 fill（text/textarea/number，number 写十进制字符串）或 select（single_select 一个值、multi_select 一到多个值，取字段 options 的 value）填写全部 required 字段，再 submit 一次，然后用 expectResult 断言结果分区。填写值要具体、真实、与绑定目标的业务相关，能让工作流或 Agent 给出有内容的结果，不要写「测试」「示例」之类的占位值，也不要把创建者需求本身改写成问题。
- 候选带 knowledge（知识库名称、描述、文档名）时，问答、检索类场景的输入必须落在这些资料明确覆盖的主题内（例如就文档名或描述中出现的产品、功能提一个具体问题），保证知识库能检索到原文、结果分区（尤其引用）有内容。问题只问资料内容本身，不要把工作流、Agent、知识库或文档的名称写进问题——这些名称是内部资源名，资料里没有。
- expectResult 只有 assertion=nonEmpty 一种：结果来自模型生成，每次措辞不同，验收只检查分区有内容，不断言具体文字。
- given/when/then 用简短中文句子描述场景。

## 高风险领域
- 医疗、法律、金融等领域：不要设计「诊断」「处方」「用药建议」「法律意见」「投资建议」类的字段或结果分区，结果分区用「参考信息」「相关资料」等中性标签，summary 中注明结果仅供参考。

## 自我修复
- 用户消息带有「上一次输出的问题」时，逐条修正这些问题后重新输出完整的 JSON 对象。`;

type CatalogEntry =
  | {
      kind: 'workflow';
      workflowDefinitionId: string;
      name: string;
      description: string | null;
      inputs: Array<{
        id: string;
        type: string;
        label: string;
        required: boolean;
        options?: string[];
        maxLength?: number;
        min?: number;
        max?: number;
      }> | null;
      outputs: Array<{ nodeId: string; nodeType: string; label: string }>;
      knowledge: GeneratedAppCandidateKnowledge[];
    }
  | {
      kind: 'agent';
      agentDefinitionId: string;
      name: string;
      description: string | null;
      knowledge: GeneratedAppCandidateKnowledge[];
    };

/**
 * 候选目录 JSON：不含版本 id（服务端固定版本），描述截断；超过条数或字节上限时从末尾（最久未更新）丢弃，
 * 至少保留一个候选。
 */
export function buildAppSpecCandidateCatalog(
  candidates: readonly GeneratedAppCatalogCandidate[],
): { json: string; includedIds: string[] } {
  const entries: CatalogEntry[] = candidates
    .slice(0, APP_SPEC_CANDIDATES_MAX)
    .map((candidate) => {
      const description = truncateDescription(candidate.description);
      const knowledge = candidate.knowledge
        .slice(0, APP_SPEC_CANDIDATE_KNOWLEDGE_MAX)
        .map((item) => ({
          name: item.name,
          description: truncateDescription(item.description),
          documentNames: item.documentNames.slice(
            0,
            APP_SPEC_CANDIDATE_KNOWLEDGE_DOCUMENTS_MAX,
          ),
        }));
      if (candidate.kind === 'agent') {
        return {
          kind: 'agent',
          agentDefinitionId: candidate.agentDefinitionId,
          name: candidate.name,
          description,
          knowledge,
        };
      }
      const fields = candidate.inputSchema?.fields ?? [];
      return {
        kind: 'workflow',
        workflowDefinitionId: candidate.workflowDefinitionId,
        name: candidate.name,
        description,
        inputs:
          fields.length === 0
            ? null
            : fields.map((field) => ({
                id: field.id,
                type: field.type,
                label: field.label,
                required: field.required,
                ...(field.options ? { options: field.options } : {}),
                ...(field.validation?.maxLength !== undefined
                  ? { maxLength: field.validation.maxLength }
                  : {}),
                ...(field.validation?.min !== undefined
                  ? { min: field.validation.min }
                  : {}),
                ...(field.validation?.max !== undefined
                  ? { max: field.validation.max }
                  : {}),
              })),
        outputs: candidate.outputNodes.map((node) => ({
          nodeId: node.nodeId,
          nodeType: node.nodeType,
          label: node.label,
        })),
        knowledge,
      };
    });

  let json = JSON.stringify(entries, null, 2);
  while (
    entries.length > 1 &&
    Buffer.byteLength(json, 'utf8') > APP_SPEC_CANDIDATE_CATALOG_MAX_BYTES
  ) {
    entries.pop();
    json = JSON.stringify(entries, null, 2);
  }

  return {
    json,
    includedIds: entries.map((entry) =>
      entry.kind === 'workflow'
        ? entry.workflowDefinitionId
        : entry.agentDefinitionId,
    ),
  };
}

function truncateDescription(description: string | null): string | null {
  return description
    ? description.slice(0, CANDIDATE_DESCRIPTION_MAX_LENGTH)
    : null;
}

export function buildAppSpecUserMessage(params: {
  prompt: string;
  catalogJson: string;
  feedback: AppSpecRepairFeedback | null;
}): string {
  const sections = [
    `## 创建者需求\n${params.prompt}`,
    `## 候选绑定目标\n${params.catalogJson}`,
  ];
  if (params.feedback && params.feedback.issues.length > 0) {
    sections.push(
      `## 上一次输出的问题（第 ${params.feedback.previousAttempt} 次尝试）\n${params.feedback.issues
        .map((issue) => `- ${issue}`)
        .join('\n')}\n\n请逐条修正后重新输出完整的 JSON 对象。`,
    );
  }
  return sections.join('\n\n');
}
