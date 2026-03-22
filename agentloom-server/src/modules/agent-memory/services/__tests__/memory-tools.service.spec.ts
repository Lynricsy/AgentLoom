import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MemoryToolsService } from '../../memory-tools.service';
import { MemoryFusionService } from '../memory-fusion.service';
import { GlossaryService } from '../glossary.service';
import { MemoryNodeService } from '../memory-node.service';
import { PathResolverService } from '../path-resolver.service';
import { MemoryVersionService } from '../memory-version.service';

const createTargetSession = (overrides: Record<string, unknown> = {}) =>
  ({
    id: 'session-1',
    memoryInstanceId: 'instance-1',
    role: 'primary',
    ...overrides,
  }) as unknown as Awaited<ReturnType<MemoryFusionService['getWriteTarget']>>;

const createNode = (overrides: Record<string, unknown> = {}) =>
  ({
    id: 'node-1',
    ...overrides,
  }) as unknown as Awaited<ReturnType<PathResolverService['resolveUri']>>;

const createVersion = (overrides: Record<string, unknown> = {}) =>
  ({
    id: 'version-1',
    nodeId: 'node-1',
    content: 'memory-content',
    ...overrides,
  }) as unknown as Awaited<ReturnType<MemoryVersionService['createVersion']>>;

const createPath = (overrides: Record<string, unknown> = {}) =>
  ({
    id: 'path-1',
    domain: 'core',
    pathString: 'profile/name',
    nodeId: 'node-1',
    ...overrides,
  }) as unknown as Awaited<ReturnType<PathResolverService['createPath']>>;

const createGlossaryBinding = (overrides: Record<string, unknown> = {}) =>
  ({
    id: 'keyword-1',
    keyword: 'fox',
    nodeId: 'node-1',
    ...overrides,
  }) as unknown as Awaited<ReturnType<GlossaryService['addKeyword']>>;

const createBootSequence = (overrides: Record<string, unknown> = {}) =>
  ({
    systemPrompt: 'memory-system-prompt',
    boot: 'memory-boot',
    index: [createPath()],
    glossary: [createGlossaryBinding()],
    ...overrides,
  }) as unknown as Awaited<ReturnType<MemoryFusionService['bootAll']>>;

describe('MemoryToolsService', () => {
  let memoryFusionService: {
    bootAll: ReturnType<typeof vi.fn>;
    readFromAll: ReturnType<typeof vi.fn>;
    searchAll: ReturnType<typeof vi.fn>;
    getWriteTarget: ReturnType<typeof vi.fn>;
  };
  let pathResolverService: {
    resolveUri: ReturnType<typeof vi.fn>;
    createPath: ReturnType<typeof vi.fn>;
    addAlias: ReturnType<typeof vi.fn>;
    deletePath: ReturnType<typeof vi.fn>;
    getPathsByNode: ReturnType<typeof vi.fn>;
  };
  let memoryNodeService: {
    createNode: ReturnType<typeof vi.fn>;
  };
  let memoryVersionService: {
    createVersion: ReturnType<typeof vi.fn>;
    appendVersion: ReturnType<typeof vi.fn>;
    patchVersion: ReturnType<typeof vi.fn>;
    getLatestVersion: ReturnType<typeof vi.fn>;
  };
  let glossaryService: {
    addKeyword: ReturnType<typeof vi.fn>;
    removeKeyword: ReturnType<typeof vi.fn>;
  };
  let service: MemoryToolsService;

  beforeEach(() => {
    memoryFusionService = {
      bootAll: vi.fn(),
      readFromAll: vi.fn(),
      searchAll: vi.fn(),
      getWriteTarget: vi.fn(),
    };
    pathResolverService = {
      resolveUri: vi.fn(),
      createPath: vi.fn(),
      addAlias: vi.fn(),
      deletePath: vi.fn(),
      getPathsByNode: vi.fn(),
    };
    memoryNodeService = {
      createNode: vi.fn(),
    };
    memoryVersionService = {
      createVersion: vi.fn(),
      appendVersion: vi.fn(),
      patchVersion: vi.fn(),
      getLatestVersion: vi.fn(),
    };
    glossaryService = {
      addKeyword: vi.fn(),
      removeKeyword: vi.fn(),
    };

    service = new MemoryToolsService(
      memoryFusionService as unknown as MemoryFusionService,
      pathResolverService as unknown as PathResolverService,
      memoryNodeService as unknown as MemoryNodeService,
      memoryVersionService as unknown as MemoryVersionService,
      glossaryService as unknown as GlossaryService,
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('returns all 7 memory tool definitions and provider entries', async () => {
    const definitions = service.getToolDefinitions(['session-1']);
    expect(definitions.map((definition) => definition.name)).toEqual([
      'read_memory',
      'create_memory',
      'update_memory',
      'delete_memory',
      'add_alias',
      'manage_triggers',
      'search_memory',
    ]);

    const tools = await service.createSessionToolProvider(['session-1'])();
    expect(Object.keys(tools).sort()).toEqual(
      definitions.map((definition) => definition.name).sort(),
    );
  });

  it('reads boot content from fused boot sequence', async () => {
    const definition = service
      .getToolDefinitions(['session-1'])
      .find((tool) => tool.name === 'read_memory');
    memoryFusionService.bootAll.mockResolvedValue(createBootSequence());

    const result = await definition?.execute({ uri: 'system://boot' });

    expect(memoryFusionService.bootAll).toHaveBeenCalledWith(['session-1']);
    expect(result).toEqual({
      success: true,
      data: {
        uri: 'system://boot',
        content: 'memory-boot',
        systemPrompt: 'memory-system-prompt',
      },
    });
  });

  it('reads ordinary memory and enriches returned paths', async () => {
    const definition = service
      .getToolDefinitions(['session-1'])
      .find((tool) => tool.name === 'read_memory');
    memoryFusionService.readFromAll.mockResolvedValue([
      {
        sessionId: 'session-1',
        memoryInstanceId: 'instance-1',
        fusionPriority: 1,
        role: 'primary',
        nodeId: 'node-1',
        uri: 'core://profile/name',
        content: 'Wine Fox',
      },
    ]);
    pathResolverService.getPathsByNode.mockResolvedValue([
      createPath({ domain: 'core', pathString: 'profile/name' }),
      createPath({ id: 'path-2', domain: 'alias', pathString: 'profile/name' }),
    ]);

    const result = await definition?.execute({ uri: 'core://profile/name' });

    expect(result).toEqual({
      success: true,
      data: [
        {
          sessionId: 'session-1',
          memoryInstanceId: 'instance-1',
          fusionPriority: 1,
          role: 'primary',
          nodeId: 'node-1',
          uri: 'core://profile/name',
          content: 'Wine Fox',
          paths: [
            {
              id: 'path-1',
              domain: 'core',
              pathString: 'profile/name',
              nodeId: 'node-1',
              uri: 'core://profile/name',
            },
            {
              id: 'path-2',
              domain: 'alias',
              pathString: 'profile/name',
              nodeId: 'node-1',
              uri: 'alias://profile/name',
            },
          ],
        },
      ],
    });
  });

  it('creates a new memory on the write target when uri is missing', async () => {
    const definition = service
      .getToolDefinitions(['session-1'])
      .find((tool) => tool.name === 'create_memory');
    const targetSession = createTargetSession();
    const node = createNode();
    const path = createPath();
    const version = createVersion({ content: 'initial content' });

    memoryFusionService.getWriteTarget.mockResolvedValue(targetSession);
    pathResolverService.resolveUri.mockRejectedValue(
      new NotFoundException('Memory path core://profile/name not found'),
    );
    memoryNodeService.createNode.mockResolvedValue(node);
    pathResolverService.createPath.mockResolvedValue(path);
    memoryVersionService.createVersion.mockResolvedValue(version);

    const result = await definition?.execute({
      uri: 'core://profile/name',
      content: 'initial content',
      contentType: 'markdown',
      metadata: { owner: 'fox' },
      disclosureLevel: 2,
      createdBy: 'agent',
    });

    expect(memoryNodeService.createNode).toHaveBeenCalledWith('instance-1', {
      contentType: 'markdown',
      metadata: { owner: 'fox' },
      disclosureLevel: 2,
    });
    expect(pathResolverService.createPath).toHaveBeenCalledWith(
      'instance-1',
      'core',
      'profile/name',
      'node-1',
    );
    expect(memoryVersionService.createVersion).toHaveBeenCalledWith(
      'node-1',
      'initial content',
      'agent',
    );
    expect(result).toEqual({
      success: true,
      data: {
        sessionId: 'session-1',
        memoryInstanceId: 'instance-1',
        node,
        path: {
          id: 'path-1',
          domain: 'core',
          pathString: 'profile/name',
          nodeId: 'node-1',
          uri: 'core://profile/name',
        },
        version,
      },
    });
  });

  it('returns conflict when create_memory uri already exists', async () => {
    const definition = service
      .getToolDefinitions(['session-1'])
      .find((tool) => tool.name === 'create_memory');

    memoryFusionService.getWriteTarget.mockResolvedValue(createTargetSession());
    pathResolverService.resolveUri.mockResolvedValue(createNode());

    const result = await definition?.execute({
      uri: 'core://profile/name',
      content: 'duplicate',
    });

    expect(result).toEqual({
      success: false,
      data: null,
      error: 'Memory path core://profile/name already exists',
    });
    expect(memoryNodeService.createNode).not.toHaveBeenCalled();
  });

  it('appends memory and falls back to createVersion when no latest version exists', async () => {
    const definition = service
      .getToolDefinitions(['session-1'])
      .find((tool) => tool.name === 'update_memory');
    const version = createVersion({ content: 'append text' });

    memoryFusionService.getWriteTarget.mockResolvedValue(createTargetSession());
    pathResolverService.resolveUri.mockResolvedValue(createNode());
    memoryVersionService.getLatestVersion.mockResolvedValue(null);
    memoryVersionService.createVersion.mockResolvedValue(version);
    pathResolverService.getPathsByNode.mockResolvedValue([createPath()]);

    const result = await definition?.execute({
      uri: 'core://profile/name',
      mode: 'append',
      appendContent: 'append text',
      createdBy: 'agent',
    });

    expect(memoryVersionService.createVersion).toHaveBeenCalledWith(
      'node-1',
      'append text',
      'agent',
    );
    expect(memoryVersionService.appendVersion).not.toHaveBeenCalled();
    expect(result).toEqual({
      success: true,
      data: {
        sessionId: 'session-1',
        memoryInstanceId: 'instance-1',
        nodeId: 'node-1',
        version,
        paths: [
          {
            id: 'path-1',
            domain: 'core',
            pathString: 'profile/name',
            nodeId: 'node-1',
            uri: 'core://profile/name',
          },
        ],
      },
    });
  });

  it('patches memory content in patch mode', async () => {
    const definition = service
      .getToolDefinitions(['session-1'])
      .find((tool) => tool.name === 'update_memory');
    const version = createVersion({ content: 'new value' });

    memoryFusionService.getWriteTarget.mockResolvedValue(createTargetSession());
    pathResolverService.resolveUri.mockResolvedValue(createNode());
    memoryVersionService.patchVersion.mockResolvedValue(version);
    pathResolverService.getPathsByNode.mockResolvedValue([createPath()]);

    const result = await definition?.execute({
      uri: 'core://profile/name',
      mode: 'patch',
      oldString: 'old value',
      newString: 'new value',
    });

    expect(memoryVersionService.patchVersion).toHaveBeenCalledWith(
      'node-1',
      { oldString: 'old value', newString: 'new value' },
      undefined,
    );
    expect(result?.success).toBe(true);
  });

  it('fails append mode when appendContent is empty', async () => {
    const definition = service
      .getToolDefinitions(['session-1'])
      .find((tool) => tool.name === 'update_memory');

    memoryFusionService.getWriteTarget.mockResolvedValue(createTargetSession());
    pathResolverService.resolveUri.mockResolvedValue(createNode());

    const result = await definition?.execute({
      uri: 'core://profile/name',
      mode: 'append',
      appendContent: '',
    });

    expect(result).toEqual({
      success: false,
      data: null,
      error: 'appendContent is required for append mode',
    });
  });

  it('deletes path bindings without deleting node content', async () => {
    const definition = service
      .getToolDefinitions(['session-1'])
      .find((tool) => tool.name === 'delete_memory');

    memoryFusionService.getWriteTarget.mockResolvedValue(createTargetSession());
    pathResolverService.deletePath.mockResolvedValue({ id: 'path-1', deleted: true });

    const result = await definition?.execute({ uri: 'core://profile/name' });

    expect(pathResolverService.deletePath).toHaveBeenCalledWith(
      'instance-1',
      'core://profile/name',
    );
    expect(result).toEqual({
      success: true,
      data: {
        sessionId: 'session-1',
        memoryInstanceId: 'instance-1',
        uri: 'core://profile/name',
        id: 'path-1',
        deleted: true,
      },
    });
  });

  it('adds alias paths on the primary memory target', async () => {
    const definition = service
      .getToolDefinitions(['session-1'])
      .find((tool) => tool.name === 'add_alias');

    memoryFusionService.getWriteTarget.mockResolvedValue(createTargetSession());
    pathResolverService.addAlias.mockResolvedValue(
      createPath({ id: 'path-2', domain: 'alias', pathString: 'profile/name' }),
    );

    const result = await definition?.execute({
      uri: 'core://profile/name',
      aliasUri: 'alias://profile/name',
    });

    expect(pathResolverService.addAlias).toHaveBeenCalledWith(
      'instance-1',
      'core://profile/name',
      'alias://profile/name',
    );
    expect(result).toEqual({
      success: true,
      data: {
        sessionId: 'session-1',
        memoryInstanceId: 'instance-1',
        uri: 'core://profile/name',
        alias: {
          id: 'path-2',
          domain: 'alias',
          pathString: 'profile/name',
          nodeId: 'node-1',
          uri: 'alias://profile/name',
        },
      },
    });
  });

  it('adds and removes glossary triggers for a memory uri', async () => {
    const definition = service
      .getToolDefinitions(['session-1'])
      .find((tool) => tool.name === 'manage_triggers');

    memoryFusionService.getWriteTarget.mockResolvedValue(createTargetSession());
    pathResolverService.resolveUri.mockResolvedValue(createNode());
    pathResolverService.getPathsByNode.mockResolvedValue([createPath()]);
    glossaryService.addKeyword.mockResolvedValue(createGlossaryBinding());

    const addResult = await definition?.execute({
      action: 'add',
      keyword: 'fox',
      uri: 'core://profile/name',
    });

    expect(addResult).toEqual({
      success: true,
      data: {
        sessionId: 'session-1',
        memoryInstanceId: 'instance-1',
        action: 'add',
        binding: {
          id: 'keyword-1',
          keyword: 'fox',
          nodeId: 'node-1',
        },
        paths: [
          {
            id: 'path-1',
            domain: 'core',
            pathString: 'profile/name',
            nodeId: 'node-1',
            uri: 'core://profile/name',
          },
        ],
      },
    });

    const removeResult = await definition?.execute({
      action: 'remove',
      keyword: 'fox',
      uri: 'core://profile/name',
    });

    expect(glossaryService.removeKeyword).toHaveBeenCalledWith(
      'instance-1',
      'fox',
      'node-1',
    );
    expect(removeResult).toEqual({
      success: true,
      data: {
        sessionId: 'session-1',
        memoryInstanceId: 'instance-1',
        action: 'remove',
        keyword: 'fox',
        nodeId: 'node-1',
        paths: [
          {
            id: 'path-1',
            domain: 'core',
            pathString: 'profile/name',
            nodeId: 'node-1',
            uri: 'core://profile/name',
          },
        ],
      },
    });
  });

  it('searches memory across sessions and enriches result paths', async () => {
    const definition = service
      .getToolDefinitions(['session-1', 'session-2'])
      .find((tool) => tool.name === 'search_memory');

    memoryFusionService.searchAll.mockResolvedValue([
      {
        sessionId: 'session-1',
        memoryInstanceId: 'instance-1',
        fusionPriority: 1,
        weightedScore: 0.8,
        nodeId: 'node-1',
        content: 'fox profile',
        relevanceScore: 0.8,
        snippet: 'fox profile',
        disclosureLevel: 0,
      },
    ]);
    pathResolverService.getPathsByNode.mockResolvedValue([createPath()]);

    const result = await definition?.execute({
      query: 'fox',
      limit: 5,
      offset: 0,
      minDisclosure: 1,
    });

    expect(memoryFusionService.searchAll).toHaveBeenCalledWith(
      ['session-1', 'session-2'],
      'fox',
      {
        limit: 5,
        offset: 0,
        minDisclosure: 1,
      },
    );
    expect(result).toEqual({
      success: true,
      data: [
        {
          sessionId: 'session-1',
          memoryInstanceId: 'instance-1',
          fusionPriority: 1,
          weightedScore: 0.8,
          nodeId: 'node-1',
          content: 'fox profile',
          relevanceScore: 0.8,
          snippet: 'fox profile',
          disclosureLevel: 0,
          paths: [
            {
              id: 'path-1',
              domain: 'core',
              pathString: 'profile/name',
              nodeId: 'node-1',
              uri: 'core://profile/name',
            },
          ],
        },
      ],
    });
  });

  it('maps thrown errors into tool result failures', async () => {
    const definition = service
      .getToolDefinitions(['session-1'])
      .find((tool) => tool.name === 'read_memory');

    memoryFusionService.readFromAll.mockRejectedValue(
      new ConflictException('read failed'),
    );

    const result = await definition?.execute({ uri: 'core://broken' });

    expect(result).toEqual({
      success: false,
      data: null,
      error: 'read failed',
    });
  });

  it('times out a tool execution after 2000ms', async () => {
    vi.useFakeTimers();

    const definition = service
      .getToolDefinitions(['session-1'])
      .find((tool) => tool.name === 'read_memory');

    memoryFusionService.readFromAll.mockImplementation(
      () => new Promise<never>(() => undefined),
    );

    const resultPromise = definition?.execute({ uri: 'core://slow' });
    await vi.advanceTimersByTimeAsync(2000);

    await expect(resultPromise).resolves.toEqual({
      success: false,
      data: null,
      error: 'Tool execution timed out (2000ms)',
    });
  });

  it('preserves invalid uri validation errors in create_memory', async () => {
    const definition = service
      .getToolDefinitions(['session-1'])
      .find((tool) => tool.name === 'create_memory');

    memoryFusionService.getWriteTarget.mockResolvedValue(createTargetSession());
    pathResolverService.resolveUri.mockRejectedValue(
      new BadRequestException('Invalid URI format'),
    );

    const result = await definition?.execute({
      uri: 'invalid-uri',
      content: 'hello',
    });

    expect(result).toEqual({
      success: false,
      data: null,
      error: 'Invalid URI format',
    });
    expect(memoryNodeService.createNode).not.toHaveBeenCalled();
  });
});
