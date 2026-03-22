import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { jsonSchema, tool, type ToolSet } from 'ai';

import type { MemoryPath, MemoryVersion } from '../../database/schema';
import type { SessionToolProvider } from '../agent/ports/agent-runtime.port';
import { MemoryFusionService } from './services/memory-fusion.service';
import { GlossaryService } from './services/glossary.service';
import { MemoryNodeService } from './services/memory-node.service';
import { PathResolverService } from './services/path-resolver.service';
import { MemoryVersionService } from './services/memory-version.service';

type AiJsonSchemaInput = Parameters<typeof jsonSchema>[0];

const TOOL_TIMEOUT_MS = 2000;

type MemoryToolName =
  | 'read_memory'
  | 'create_memory'
  | 'update_memory'
  | 'delete_memory'
  | 'add_alias'
  | 'manage_triggers'
  | 'search_memory';

export interface MemoryToolResult<TData = unknown> {
  success: boolean;
  data: TData | null;
  error?: string;
}

export interface MemoryToolDefinition<TInput = unknown, TData = unknown> {
  name: MemoryToolName;
  description: string;
  inputSchema: AiJsonSchemaInput;
  execute: (input: TInput) => Promise<MemoryToolResult<TData>>;
}

type ReadMemoryInput = {
  uri: string;
};

type CreateMemoryInput = {
  uri: string;
  content: string;
  contentType?: string;
  metadata?: Record<string, unknown>;
  disclosureLevel?: number;
  createdBy?: string;
};

type UpdateMemoryInput =
  | {
      uri: string;
      mode: 'append';
      appendContent: string;
      createdBy?: string;
    }
  | {
      uri: string;
      mode: 'patch';
      oldString: string;
      newString: string;
      createdBy?: string;
    };

type DeleteMemoryInput = {
  uri: string;
};

type AddAliasInput = {
  uri: string;
  aliasUri: string;
};

type ManageTriggersInput = {
  action: 'add' | 'remove';
  keyword: string;
  uri: string;
};

type SearchMemoryInput = {
  query: string;
  limit?: number;
  offset?: number;
  minDisclosure?: number;
};

type EnrichedMemoryPath = MemoryPath & {
  uri: string;
};

const READ_MEMORY_SCHEMA = {
  type: 'object',
  properties: {
    uri: {
      type: 'string',
      description: '要读取的记忆 URI，例如 core://profile/name 或 system://boot',
    },
  },
  required: ['uri'],
  additionalProperties: false,
} satisfies AiJsonSchemaInput;

const CREATE_MEMORY_SCHEMA = {
  type: 'object',
  properties: {
    uri: {
      type: 'string',
      description: '要创建的目标记忆 URI',
    },
    content: {
      type: 'string',
      description: '初始记忆内容',
    },
    contentType: {
      type: 'string',
      description: '可选内容类型，默认 text',
    },
    metadata: {
      type: 'object',
      description: '可选节点元数据',
      additionalProperties: true,
    },
    disclosureLevel: {
      type: 'integer',
      description: '可选公开等级，默认 0',
      minimum: 0,
    },
    createdBy: {
      type: 'string',
      description: '可选创建人标识',
    },
  },
  required: ['uri', 'content'],
  additionalProperties: false,
} satisfies AiJsonSchemaInput;

const UPDATE_MEMORY_SCHEMA = {
  type: 'object',
  properties: {
    uri: {
      type: 'string',
      description: '要更新的记忆 URI',
    },
    mode: {
      type: 'string',
      enum: ['append', 'patch'],
      description: 'append 追加新内容；patch 将 oldString 替换为 newString',
    },
    appendContent: {
      type: 'string',
      description: 'append 模式下要追加的内容',
    },
    oldString: {
      type: 'string',
      description: 'patch 模式下待替换的旧字符串',
    },
    newString: {
      type: 'string',
      description: 'patch 模式下的新字符串',
    },
    createdBy: {
      type: 'string',
      description: '可选创建人标识',
    },
  },
  required: ['uri', 'mode'],
  additionalProperties: false,
} satisfies AiJsonSchemaInput;

const DELETE_MEMORY_SCHEMA = {
  type: 'object',
  properties: {
    uri: {
      type: 'string',
      description: '要删除路径绑定的记忆 URI',
    },
  },
  required: ['uri'],
  additionalProperties: false,
} satisfies AiJsonSchemaInput;

const ADD_ALIAS_SCHEMA = {
  type: 'object',
  properties: {
    uri: {
      type: 'string',
      description: '已有记忆 URI',
    },
    aliasUri: {
      type: 'string',
      description: '要新增的别名 URI',
    },
  },
  required: ['uri', 'aliasUri'],
  additionalProperties: false,
} satisfies AiJsonSchemaInput;

const MANAGE_TRIGGERS_SCHEMA = {
  type: 'object',
  properties: {
    action: {
      type: 'string',
      enum: ['add', 'remove'],
      description: 'add 新增触发词，remove 删除触发词',
    },
    keyword: {
      type: 'string',
      description: '要管理的触发词',
    },
    uri: {
      type: 'string',
      description: '触发词绑定的记忆 URI',
    },
  },
  required: ['action', 'keyword', 'uri'],
  additionalProperties: false,
} satisfies AiJsonSchemaInput;

const SEARCH_MEMORY_SCHEMA = {
  type: 'object',
  properties: {
    query: {
      type: 'string',
      description: '全文搜索查询文本',
    },
    limit: {
      type: 'integer',
      minimum: 1,
      maximum: 100,
      description: '结果数量上限，默认 20',
    },
    offset: {
      type: 'integer',
      minimum: 0,
      description: '结果偏移，默认 0',
    },
    minDisclosure: {
      type: 'integer',
      minimum: 0,
      description: '仅返回 disclosureLevel <= 该值的节点',
    },
  },
  required: ['query'],
  additionalProperties: false,
} satisfies AiJsonSchemaInput;

@Injectable()
export class MemoryToolsService {
  constructor(
    private readonly memoryFusionService: MemoryFusionService,
    private readonly pathResolverService: PathResolverService,
    private readonly memoryNodeService: MemoryNodeService,
    private readonly memoryVersionService: MemoryVersionService,
    private readonly glossaryService: GlossaryService,
  ) {}

  createSessionToolProvider(sessionIds: string[]): SessionToolProvider {
    return async (): Promise<ToolSet> => {
      const tools: ToolSet = {};

      for (const definition of this.getToolDefinitions(sessionIds)) {
        tools[definition.name] = tool({
          description: definition.description,
          inputSchema: jsonSchema(definition.inputSchema),
          execute: definition.execute,
        });
      }

      return tools;
    };
  }

  getToolDefinitions(
    sessionIds: string[],
  ): ReadonlyArray<MemoryToolDefinition> {
    return [
      {
        name: 'read_memory',
        description: 'Read memory content by URI, including boot/index/glossary resources.',
        inputSchema: READ_MEMORY_SCHEMA,
        execute: (input) =>
          this.withTimeout(() =>
            this.executeReadMemory(sessionIds, input as ReadMemoryInput),
          ),
      },
      {
        name: 'create_memory',
        description: 'Create a new memory node and bind it to the specified URI.',
        inputSchema: CREATE_MEMORY_SCHEMA,
        execute: (input) =>
          this.withTimeout(() =>
            this.executeCreateMemory(sessionIds, input as CreateMemoryInput),
          ),
      },
      {
        name: 'update_memory',
        description: 'Update an existing memory by appending content or patching old text.',
        inputSchema: UPDATE_MEMORY_SCHEMA,
        execute: (input) =>
          this.withTimeout(() =>
            this.executeUpdateMemory(sessionIds, input as UpdateMemoryInput),
          ),
      },
      {
        name: 'delete_memory',
        description: 'Delete a memory path binding without deleting the underlying node content.',
        inputSchema: DELETE_MEMORY_SCHEMA,
        execute: (input) =>
          this.withTimeout(() =>
            this.executeDeleteMemory(sessionIds, input as DeleteMemoryInput),
          ),
      },
      {
        name: 'add_alias',
        description: 'Add an alias URI that points to an existing memory node.',
        inputSchema: ADD_ALIAS_SCHEMA,
        execute: (input) =>
          this.withTimeout(() =>
            this.executeAddAlias(sessionIds, input as AddAliasInput),
          ),
      },
      {
        name: 'manage_triggers',
        description: 'Add or remove glossary keyword triggers for a memory URI.',
        inputSchema: MANAGE_TRIGGERS_SCHEMA,
        execute: (input) =>
          this.withTimeout(() =>
            this.executeManageTriggers(sessionIds, input as ManageTriggersInput),
          ),
      },
      {
        name: 'search_memory',
        description: 'Search memory content across all active memory sessions.',
        inputSchema: SEARCH_MEMORY_SCHEMA,
        execute: (input) =>
          this.withTimeout(() =>
            this.executeSearchMemory(sessionIds, input as SearchMemoryInput),
          ),
      },
    ];
  }

  async executeReadMemory(
    sessionIds: string[],
    input: ReadMemoryInput,
  ): Promise<unknown> {
    if (input.uri === 'system://boot') {
      const sequence = await this.memoryFusionService.bootAll(sessionIds);
      return {
        uri: input.uri,
        content: sequence.boot,
        systemPrompt: sequence.systemPrompt,
      };
    }

    if (input.uri === 'system://index') {
      const sequence = await this.memoryFusionService.bootAll(sessionIds);
      return {
        uri: input.uri,
        entries: sequence.index.map((entry) => this.enrichPath(entry)),
      };
    }

    if (input.uri === 'system://glossary') {
      const sequence = await this.memoryFusionService.bootAll(sessionIds);
      return {
        uri: input.uri,
        entries: sequence.glossary,
      };
    }

    const results = await this.memoryFusionService.readFromAll(sessionIds, input.uri);

    return Promise.all(
      results.map(async (result) => ({
        ...result,
        paths: await this.listNodePaths(result.nodeId),
      })),
    );
  }

  async executeCreateMemory(
    sessionIds: string[],
    input: CreateMemoryInput,
  ): Promise<unknown> {
    const targetSession = await this.memoryFusionService.getWriteTarget(sessionIds);

    try {
      await this.pathResolverService.resolveUri(targetSession.memoryInstanceId, input.uri);
      throw new ConflictException(`Memory path ${input.uri} already exists`);
    } catch (error) {
      if (!(error instanceof NotFoundException)) {
        throw error;
      }

      const parsedUri = this.parseUri(input.uri);
      const node = await this.memoryNodeService.createNode(
        targetSession.memoryInstanceId,
        {
          ...(input.contentType ? { contentType: input.contentType } : {}),
          ...(input.metadata ? { metadata: input.metadata } : {}),
          ...(input.disclosureLevel !== undefined
            ? { disclosureLevel: input.disclosureLevel }
            : {}),
        },
      );
      const path = await this.pathResolverService.createPath(
        targetSession.memoryInstanceId,
        parsedUri.domain,
        parsedUri.pathString,
        node.id,
      );
      const version = await this.memoryVersionService.createVersion(
        node.id,
        input.content,
        input.createdBy,
      );

      return {
        sessionId: targetSession.id,
        memoryInstanceId: targetSession.memoryInstanceId,
        node,
        path: this.enrichPath(path),
        version,
      };
    }
  }

  async executeUpdateMemory(
    sessionIds: string[],
    input: UpdateMemoryInput,
  ): Promise<unknown> {
    const targetSession = await this.memoryFusionService.getWriteTarget(sessionIds);
    const node = await this.pathResolverService.resolveUri(
      targetSession.memoryInstanceId,
      input.uri,
    );

    const version =
      input.mode === 'append'
        ? await this.appendMemory(node.id, input.appendContent, input.createdBy)
        : await this.patchMemory(
            node.id,
            input.oldString,
            input.newString,
            input.createdBy,
          );

    return {
      sessionId: targetSession.id,
      memoryInstanceId: targetSession.memoryInstanceId,
      nodeId: node.id,
      version,
      paths: await this.listNodePaths(node.id),
    };
  }

  async executeDeleteMemory(
    sessionIds: string[],
    input: DeleteMemoryInput,
  ): Promise<unknown> {
    const targetSession = await this.memoryFusionService.getWriteTarget(sessionIds);
    const deleted = await this.pathResolverService.deletePath(
      targetSession.memoryInstanceId,
      input.uri,
    );

    return {
      sessionId: targetSession.id,
      memoryInstanceId: targetSession.memoryInstanceId,
      uri: input.uri,
      ...deleted,
    };
  }

  async executeAddAlias(
    sessionIds: string[],
    input: AddAliasInput,
  ): Promise<unknown> {
    const targetSession = await this.memoryFusionService.getWriteTarget(sessionIds);
    const alias = await this.pathResolverService.addAlias(
      targetSession.memoryInstanceId,
      input.uri,
      input.aliasUri,
    );

    return {
      sessionId: targetSession.id,
      memoryInstanceId: targetSession.memoryInstanceId,
      uri: input.uri,
      alias: this.enrichPath(alias),
    };
  }

  async executeManageTriggers(
    sessionIds: string[],
    input: ManageTriggersInput,
  ): Promise<unknown> {
    const targetSession = await this.memoryFusionService.getWriteTarget(sessionIds);
    const node = await this.pathResolverService.resolveUri(
      targetSession.memoryInstanceId,
      input.uri,
    );

    if (input.action === 'add') {
      const binding = await this.glossaryService.addKeyword(
        targetSession.memoryInstanceId,
        input.keyword,
        node.id,
      );

      return {
        sessionId: targetSession.id,
        memoryInstanceId: targetSession.memoryInstanceId,
        action: input.action,
        binding,
        paths: await this.listNodePaths(node.id),
      };
    }

    await this.glossaryService.removeKeyword(
      targetSession.memoryInstanceId,
      input.keyword,
      node.id,
    );

    return {
      sessionId: targetSession.id,
      memoryInstanceId: targetSession.memoryInstanceId,
      action: input.action,
      keyword: input.keyword,
      nodeId: node.id,
      paths: await this.listNodePaths(node.id),
    };
  }

  async executeSearchMemory(
    sessionIds: string[],
    input: SearchMemoryInput,
  ): Promise<unknown> {
    const results = await this.memoryFusionService.searchAll(sessionIds, input.query, {
      ...(input.limit !== undefined ? { limit: input.limit } : {}),
      ...(input.offset !== undefined ? { offset: input.offset } : {}),
      ...(input.minDisclosure !== undefined
        ? { minDisclosure: input.minDisclosure }
        : {}),
    });

    return Promise.all(
      results.map(async (result) => ({
        ...result,
        paths: await this.listNodePaths(result.nodeId),
      })),
    );
  }

  private async appendMemory(
    nodeId: string,
    appendContent: string,
    createdBy?: string,
  ): Promise<MemoryVersion> {
    if (!appendContent) {
      throw new BadRequestException('appendContent is required for append mode');
    }

    const latestVersion = await this.memoryVersionService.getLatestVersion(nodeId);

    if (!latestVersion) {
      return this.memoryVersionService.createVersion(nodeId, appendContent, createdBy);
    }

    return this.memoryVersionService.appendVersion(nodeId, appendContent, createdBy);
  }

  private async patchMemory(
    nodeId: string,
    oldString: string,
    newString: string,
    createdBy?: string,
  ): Promise<MemoryVersion> {
    if (!oldString) {
      throw new BadRequestException('oldString is required for patch mode');
    }

    if (newString === undefined) {
      throw new BadRequestException('newString is required for patch mode');
    }

    return this.memoryVersionService.patchVersion(
      nodeId,
      { oldString, newString },
      createdBy,
    );
  }

  private async withTimeout<TData>(
    operation: () => Promise<TData>,
  ): Promise<MemoryToolResult<TData>> {
    let timer: NodeJS.Timeout | undefined;

    try {
      return await Promise.race([
        operation()
          .then((data) => ({
            success: true,
            data,
          }))
          .catch((error: unknown) => ({
            success: false,
            data: null,
            error: this.getErrorMessage(error),
          })),
        new Promise<MemoryToolResult<TData>>((resolve) => {
          timer = setTimeout(() => {
            resolve({
              success: false,
              data: null,
              error: `Tool execution timed out (${TOOL_TIMEOUT_MS}ms)`,
            });
          }, TOOL_TIMEOUT_MS);
        }),
      ]);
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
    }
  }

  private async listNodePaths(nodeId: string): Promise<EnrichedMemoryPath[]> {
    const paths = await this.pathResolverService.getPathsByNode(nodeId);
    return paths.map((path) => this.enrichPath(path));
  }

  private enrichPath(path: MemoryPath): EnrichedMemoryPath {
    return {
      ...path,
      uri: `${path.domain}://${path.pathString}`,
    };
  }

  private parseUri(uri: string): { domain: string; pathString: string } {
    const separatorIndex = uri.indexOf('://');
    if (separatorIndex <= 0 || separatorIndex >= uri.length - 3) {
      throw new BadRequestException('Invalid URI format');
    }

    const domain = uri.slice(0, separatorIndex);
    const pathString = uri.slice(separatorIndex + 3);

    if (!domain || !pathString) {
      throw new BadRequestException('Invalid URI format');
    }

    return { domain, pathString };
  }

  private getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
