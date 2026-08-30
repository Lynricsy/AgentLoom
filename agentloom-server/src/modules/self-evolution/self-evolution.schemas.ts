/**
 * 自进化工具与下游 DTO 的 Zod 边界。
 * schema 只负责验证和类型收窄，不改变既有下游调用参数形状。
 */
import {
  WorkflowGraphEdgeSchema,
  WorkflowGraphNodeSchema,
} from '@agentloom/contracts';
import { z } from 'zod';

import type {
  ReactFlowEdge,
  ReactFlowNode,
} from '../../database/schema/workflow-definitions.schema';
import type { CreateAgentDefinitionDto } from '../agent-definition/dto/create-agent-definition.dto';
import type { CreateLlmModelConfigDto } from '../llm/dto/create-llm-model-config.dto';
import type { CreateLlmProviderDto } from '../llm/dto/create-llm-provider.dto';
import type { ImportMcpToolsDto } from '../mcp/dto/import-mcp-tools.dto';

export const GenericRecordSchema = z.record(z.string(), z.unknown());

export const QueryStateSchema = z
  .object({
    scope: z.enum(['self', 'agent', 'workflow']).optional(),
    targetId: z.string().trim().min(1).optional(),
  })
  .strict();

export const QueryResourcePoolSchema = z
  .object({
    resourceType: z
      .enum([
        'skill',
        'mcp_server',
        'mcp_tool',
        'model',
        'agent',
        'workflow',
        'workspace',
      ])
      .optional(),
    search: z.string().optional(),
    limit: z.number().int().min(1).max(100).optional(),
  })
  .strict();

const GraphOperationSchema = z
  .object({
    op: z.enum(['add', 'update', 'remove']),
    nodeId: z.string().optional(),
    edgeId: z.string().optional(),
    node: GenericRecordSchema.optional(),
    edge: GenericRecordSchema.optional(),
    patch: GenericRecordSchema.optional(),
  })
  .strict();

export const ProposeChangeSchema = z
  .object({
    targetKind: z.enum(['self', 'agent', 'workflow']),
    targetId: z.string().optional(),
    nodeOperations: z.array(GraphOperationSchema).optional(),
    edgeOperations: z.array(GraphOperationSchema).optional(),
    viewport: GenericRecordSchema.optional(),
    metadataPatch: GenericRecordSchema.optional(),
    publishTarget: z.boolean().optional(),
  })
  .strict();

export const ApplyChangeSchema = z
  .object({ proposal: GenericRecordSchema })
  .strict();
export const CreateResourceSchema = z
  .object({
    resourceType: z.enum([
      'skill',
      'workspace',
      'agent',
      'workflow',
      'mcp',
      'model',
    ]),
    spec: GenericRecordSchema,
  })
  .strict();

export const SkillCreateDtoSchema = z
  .object({
    name: z.string().min(1),
    description: z.string(),
    content: z.string().optional(),
  })
  .strict();

const AgentGraphNodeSchema = WorkflowGraphNodeSchema.partial({
  position: true,
}).extend({
  data: GenericRecordSchema.optional(),
});
export const AgentGraphNodeArraySchema = z
  .array(AgentGraphNodeSchema)
  .pipe(z.custom<ReactFlowNode[]>());
export const AgentGraphEdgeArraySchema = z
  .array(WorkflowGraphEdgeSchema)
  .pipe(z.custom<ReactFlowEdge[]>());
export const AgentCreateDtoSchema = z
  .object({
    name: z.string().min(1),
    description: z.string().optional(),
    icon: z.string().optional(),
  })
  .strict()
  .pipe(z.custom<CreateAgentDefinitionDto>());

const LegacyMcpConnectionSchema = z
  .object({
    type: z.string().optional(),
    transportType: z.string().optional(),
    command: z.string().optional(),
    args: z.array(z.string()).optional(),
    env: z.record(z.string(), z.string()).optional(),
    url: z.string().optional(),
    headers: z.record(z.string(), z.string()).optional(),
  })
  .passthrough();
export const McpImportDtoSchema = z
  .object({
    serverName: z.string().min(1),
    serverDescription: z.string().optional(),
    connection: LegacyMcpConnectionSchema,
    toolNames: z.array(z.string().min(1)).min(1),
    conflictStrategy: z.enum(['overwrite', 'skip']),
  })
  .strict()
  .pipe(z.custom<ImportMcpToolsDto>());

export const ProviderCreateDtoSchema = z
  .object({
    name: z.string().min(1),
    baseUrl: z.string().min(1),
    slug: z.string().optional(),
    apiProtocol: z.string().optional(),
    apiKey: z.string().optional(),
    iconUrl: z.string().optional(),
  })
  .strict()
  .pipe(z.custom<CreateLlmProviderDto>());

const ModelCapabilitiesSchema = z
  .object({
    vision: z.boolean().optional(),
    functionCalling: z.boolean().optional(),
    reasoning: z.boolean().optional(),
    structuredOutput: z.boolean().optional(),
  })
  .passthrough();
export const ModelCreateDtoSchema = z
  .object({
    name: z.string().min(1),
    providerId: z.string().min(1),
    modelId: z.string().min(1),
    modelType: z.enum(['chat', 'embedding']).default('chat'),
    parameters: GenericRecordSchema.default({}),
    capabilities: ModelCapabilitiesSchema.default({}),
    isDefault: z.boolean().default(false),
    isEnabled: z.boolean().default(true),
    contextWindow: z.number().int().positive().nullish(),
    maxOutputTokens: z.number().int().positive().nullish(),
    timeoutMs: z.number().int().min(5_000).max(600_000).optional(),
  })
  .strict()
  .pipe(z.custom<CreateLlmModelConfigDto>());
