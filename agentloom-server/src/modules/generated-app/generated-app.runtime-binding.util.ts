import * as schema from '../../database/schema';
import type { GeneratedAppGenerationPlan } from '../../database/schema';
import type { GeneratedAppResponseDto } from './dto';
import type { WorkflowInputSchema } from '../workflow/dto/workflow-input-schema.dto';
import {
  GENERATED_APP_PRIVATE_PLUGIN_HARD_GATES,
  getNonEmptyString,
} from './generated-app.plan-validation.util';
export interface GeneratedAppPrivatePluginBuildReport {
  toolId: string;
  manifestValid: boolean;
  nodeDefinitionsValid: boolean;
  contentHash: string;
  signature: string;
  developerKeyFingerprint: string;
  generatedSigningPublicKeyPem: string;
  signingVerification: {
    requiredBeforePrivateActivation?: boolean;
    status?: string;
    contentHashMatches?: boolean;
    verified?: boolean;
  };
  declaredPermissions: string[];
  artifactPath: string;
  wasmEntry?: string;
  wasmRuntime?: string;
  wasmSizeBytes?: number;
  wasmSha256?: string;
  passed: boolean;
}

export function buildGeneratedWorkflowRuntimeNodes(
  app: GeneratedAppResponseDto,
): schema.ReactFlowNode[] {
  const pluginTools = getGeneratedPrivatePluginRuntimeBindings(app);
  const promptText = [
    `Generated App: ${app.appName}`,
    `App ID: ${app.id}`,
    `AppSpec v${app.appSpec.version}`,
    '',
    app.appSpec.summary,
    '',
    '此运行时 Workflow 由 Gate 7 自动生成并发布。公开提交会先保存 deterministic report，再创建异步 Workflow execution；公开端只暴露 execution handoff，不暴露画布、节点、插件或内部证据。',
  ].join('\n');

  return [
    {
      id: 'generated-app-manual-trigger',
      type: 'trigger',
      position: { x: 0, y: 80 },
      data: {
        label: '生成应用输入',
        nodeType: 'manual-trigger',
        category: 'trigger',
        description: '公开提交创建异步 execution 时使用的运行时入口。',
        config: {},
        inputPorts: [],
        outputPorts: [
          createWorkflowPort('exec-out', '', 'output', 'exec'),
          createWorkflowPort('payload-out', '触发数据', 'output', 'json'),
        ],
      },
    },
    ...pluginTools.map((tool, index) =>
      buildGeneratedWorkflowRuntimePluginNode(tool, index),
    ),
    {
      id: 'generated-app-runtime-note',
      type: 'output',
      position: { x: 360, y: 0 },
      data: {
        label: '生成应用运行时说明',
        nodeType: 'text',
        category: 'output',
        description:
          '说明该资源绑定是已发布 runtime Workflow，并记录公开执行边界。',
        config: {
          text: promptText,
        },
        inputPorts: [],
        outputPorts: [
          createWorkflowPort('text-out', '文本', 'output', 'text', {
            multiple: true,
            maxConnections: null,
          }),
        ],
      },
    },
    {
      id: 'generated-app-runtime-output',
      type: 'output',
      position: { x: 720, y: 80 },
      data: {
        label: '运行时输出',
        nodeType: 'text-output',
        category: 'output',
        description: '输出 Generated App runtime handoff 边界说明。',
        config: {},
        inputPorts: [
          createWorkflowPort('exec-in', '', 'input', 'exec'),
          createWorkflowPort('content-in', '文本', 'input', 'text'),
        ],
        outputPorts: [],
      },
    },
  ];
}

export function buildGeneratedWorkflowRuntimePluginNode(
  tool: { toolId: string; pluginId: string; purpose: string },
  index: number,
): schema.ReactFlowNode {
  return {
    id: `generated-app-plugin-${tool.toolId}`,
    type: 'plugin',
    position: { x: 360, y: 180 + index * 180 },
    data: {
      label: `私有工具 ${tool.toolId}`,
      nodeType: 'plugin',
      category: 'plugin',
      description: tool.purpose,
      pluginId: tool.pluginId,
      pluginName: `Generated App ${tool.toolId}`,
      pluginNodeType: tool.toolId,
      pluginConfig: { mode: 'screening' },
      inputPorts: [
        createWorkflowPort('exec-in', '', 'input', 'exec'),
        createWorkflowPort('input', '业务输入', 'input', 'json'),
      ],
      outputPorts: [
        createWorkflowPort('exec-out', '', 'output', 'exec'),
        createWorkflowPort('analysis', '结构化分析', 'output', 'json'),
        createWorkflowPort('analysis-out', '结构化分析', 'output', 'json'),
      ],
      portMappingMetadata: {
        inputs: [
          { name: 'exec-in', dataType: 'exec' },
          { name: 'input', dataType: 'json' },
        ],
        outputs: [
          { name: 'exec-out', dataType: 'exec' },
          { name: 'analysis', dataType: 'json' },
          { name: 'analysis-out', dataType: 'json' },
        ],
      },
    },
  };
}

export function buildGeneratedWorkflowRuntimeEdges(
  app?: GeneratedAppResponseDto,
): schema.ReactFlowEdge[] {
  const pluginTools = app ? getGeneratedPrivatePluginRuntimeBindings(app) : [];
  const edges: schema.ReactFlowEdge[] = [
    {
      id: 'generated-app-trigger-to-output-exec',
      source: 'generated-app-manual-trigger',
      target: 'generated-app-runtime-output',
      sourceHandle: 'exec-out',
      targetHandle: 'exec-in',
      type: 'smart',
    },
    {
      id: 'generated-app-payload-to-output-content',
      source: 'generated-app-manual-trigger',
      target: 'generated-app-runtime-output',
      sourceHandle: 'payload-out',
      targetHandle: 'content-in',
      type: 'smart',
    },
  ];

  for (const tool of pluginTools) {
    const pluginNodeId = `generated-app-plugin-${tool.toolId}`;
    edges.push(
      {
        id: `generated-app-trigger-to-${tool.toolId}-exec`,
        source: 'generated-app-manual-trigger',
        target: pluginNodeId,
        sourceHandle: 'exec-out',
        targetHandle: 'exec-in',
        type: 'smart',
      },
      {
        id: `generated-app-payload-to-${tool.toolId}-input`,
        source: 'generated-app-manual-trigger',
        target: pluginNodeId,
        sourceHandle: 'payload-out',
        targetHandle: 'input',
        type: 'smart',
      },
    );
  }

  return edges;
}

export function getGeneratedPrivatePluginRuntimeBindings(
  app: GeneratedAppResponseDto,
): Array<{ toolId: string; pluginId: string; purpose: string }> {
  const generationPlan =
    app.generationPlan as GeneratedAppGenerationPlan | null;
  const pluginTools = generationPlan?.pluginTools.tools ?? [];

  return pluginTools
    .map((tool) => {
      const toolId = getNonEmptyString(tool.toolId);
      if (!toolId) {
        return null;
      }

      return {
        toolId,
        pluginId: buildGeneratedPrivatePluginId(app.id, toolId),
        purpose: tool.purpose,
      };
    })
    .filter(
      (
        binding,
      ): binding is { toolId: string; pluginId: string; purpose: string } =>
        binding !== null,
    );
}

export function buildGeneratedPrivatePluginId(
  appId: string,
  toolId: string,
): string {
  return `com.agentloom.generated.${sanitizeGeneratedPluginSegment(
    `app-${appId}`,
  )}.${sanitizeGeneratedPluginSegment(toolId)}`;
}

export function sanitizeGeneratedPluginSegment(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') || 'generated'
  );
}

export function createWorkflowPort(
  id: string,
  label: string,
  direction: 'input' | 'output',
  dataType: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id,
    label,
    direction,
    dataType,
    required: false,
    multiple: false,
    maxConnections: direction === 'input' ? 1 : null,
    ...overrides,
  };
}

export function buildGeneratedPrivatePluginRegistrationManifest(params: {
  app: GeneratedAppResponseDto;
  toolId: string;
  pluginBundle: {
    manifest: Record<string, unknown>;
    artifactPath: string;
    buildReportPath: string;
    buildReport: GeneratedAppPrivatePluginBuildReport;
    wasmEntry: string | null;
    wasmBuffer: Buffer | null;
  };
  wasmBundleUrl: string | undefined;
}): Record<string, unknown> {
  const { app, toolId, pluginBundle, wasmBundleUrl } = params;

  return {
    ...pluginBundle.manifest,
    metadata: {
      source: 'generated-app-private-plugin',
      generatedAppId: app.id,
      appSpecVersion: app.appSpec.version,
      toolId,
      activationScope: 'tenant-private',
      gate3ArtifactPath: pluginBundle.artifactPath,
      gate3BuildReportPath: pluginBundle.buildReportPath,
      signingVerification: pluginBundle.buildReport.signingVerification,
      activationHardGates: [...GENERATED_APP_PRIVATE_PLUGIN_HARD_GATES],
      wasmEntry: pluginBundle.wasmEntry ?? null,
      wasmBundleUrl: wasmBundleUrl ?? null,
      wasmRuntime: pluginBundle.wasmEntry
        ? 'wasm-extism'
        : 'legacy-no-wasm-fallback',
      wasmSizeBytes: pluginBundle.wasmBuffer?.length ?? null,
    },
  };
}

export function buildGeneratedWorkflowRuntimeInputSchema(): WorkflowInputSchema | null {
  return null;
}
