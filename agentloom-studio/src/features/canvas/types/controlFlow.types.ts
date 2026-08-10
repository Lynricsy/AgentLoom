import type { PortDefinition } from "./nodeTypeRegistry";
import { createPort } from "./portSchema";

export const COMPOUND_CONTAINER_NODE_TYPES = ["loop", "iteration"] as const;
export type CompoundContainerNodeType =
  (typeof COMPOUND_CONTAINER_NODE_TYPES)[number];

export const COMPOUND_SPECIAL_NODE_TYPES = [
  "loop-start",
  "iteration-start",
  "loop-state",
  "result",
  "break",
  "continue",
] as const;

export type CompoundSpecialNodeType =
  (typeof COMPOUND_SPECIAL_NODE_TYPES)[number];

export const COMPOUND_PARENT_EXEC_INPUT_ID = "exec-in";
export const COMPOUND_PARENT_EXEC_OUTPUT_ID = "exec-out";
export const ITERATION_ITEMS_INPUT_ID = "items-in";
export const LOOP_STATE_INPUT_ID = "state-in";
export const COMPOUND_EXTRA_INPUT_PREFIX = "input-";

export const ITERATION_START_EXEC_OUTPUT_ID = "exec-out";
export const ITERATION_START_ITEM_OUTPUT_ID = "item";
export const ITERATION_START_INDEX_OUTPUT_ID = "index";
export const ITERATION_START_TOTAL_OUTPUT_ID = "total";
export const ITERATION_START_IS_FIRST_OUTPUT_ID = "is-first";
export const ITERATION_START_IS_LAST_OUTPUT_ID = "is-last";

export const LOOP_START_EXEC_OUTPUT_ID = "exec-out";
export const LOOP_START_ROUND_OUTPUT_ID = "round";
export const LOOP_START_STATE_OUTPUT_ID = "state";
export const LOOP_START_PREVIOUS_RESULT_OUTPUT_ID = "previous-result";
export const LOOP_START_IS_FIRST_OUTPUT_ID = "is-first";

export const RESULT_EXEC_INPUT_ID = "exec-in";
export const RESULT_VALUE_INPUT_ID = "value-in";
export const LOOP_STATE_EXEC_INPUT_ID = "exec-in";
export const LOOP_STATE_VALUE_INPUT_ID = "state-in";
export const LOOP_STATE_EXEC_OUTPUT_ID = "exec-out";
export const JUMP_EXEC_INPUT_ID = "exec-in";

export type CompoundOutputMode = "none" | "collect-array" | "last";

export const COMPOUND_CONTAINER_DEFAULT_SIZE = {
  width: 600,
  height: 540,
} as const;

export const COMPOUND_START_NODE_DEFAULT_POSITION = {
  x: 24,
  y: 88,
} as const;

export interface BaseCompoundNodeConfig {
  isCollapsed: boolean;
  outputMode: CompoundOutputMode;
}

export interface IterationNodeConfig extends BaseCompoundNodeConfig {}

export interface LoopNodeConfig extends BaseCompoundNodeConfig {
  defaultState: unknown;
}

export interface IterationStartNodeConfig {
  exposeTotal: boolean;
  exposeIsFirst: boolean;
  exposeIsLast: boolean;
}

export interface LoopStartNodeConfig {
  exposePreviousResult: boolean;
  exposeIsFirst: boolean;
}

export interface ResultNodeConfig {
  outputKey: string;
}

export type ControlJumpMode = "always" | "expression";

export interface JumpNodeConfig {
  mode: ControlJumpMode;
  expression: string;
}

export function isCompoundContainerNodeType(
  nodeType: string | null | undefined,
): nodeType is CompoundContainerNodeType {
  return COMPOUND_CONTAINER_NODE_TYPES.includes(
    nodeType as CompoundContainerNodeType,
  );
}

export function isCompoundSpecialNodeType(
  nodeType: string | null | undefined,
): nodeType is CompoundSpecialNodeType {
  return COMPOUND_SPECIAL_NODE_TYPES.includes(
    nodeType as CompoundSpecialNodeType,
  );
}

export function createDefaultIterationNodeConfig(): IterationNodeConfig {
  return {
    isCollapsed: false,
    outputMode: "collect-array",
  };
}

export function createDefaultLoopCompoundNodeConfig(): LoopNodeConfig {
  return {
    isCollapsed: false,
    outputMode: "last",
    defaultState: null,
  };
}

export function createDefaultIterationStartNodeConfig(): IterationStartNodeConfig {
  return {
    exposeTotal: false,
    exposeIsFirst: false,
    exposeIsLast: false,
  };
}

export function createDefaultLoopStartNodeConfig(): LoopStartNodeConfig {
  return {
    exposePreviousResult: false,
    exposeIsFirst: false,
  };
}

export function createDefaultResultNodeConfig(): ResultNodeConfig {
  return {
    outputKey: "result",
  };
}

export function createDefaultJumpNodeConfig(): JumpNodeConfig {
  return {
    mode: "always",
    expression: "",
  };
}

function createCompoundValueInputPort(
  id: string,
  label: string,
): PortDefinition {
  return createPort(id, label, "input", "json", {
    acceptsAnyDataType: true,
    description: `${label}，可接收任意上游端口值`,
    schema: {
      kind: "json",
      shape: "object",
      title: label,
      properties: {},
      additionalProperties: true,
    },
  });
}

export function buildCompoundExtraInputPorts(
  extraInputIds: readonly string[],
  portLabels?: Record<string, string>,
): PortDefinition[] {
  return extraInputIds.map((portId, index) =>
    createCompoundValueInputPort(
      portId,
      portLabels?.[portId] ?? `输入 ${index + 1}`,
    ),
  );
}

export function buildJumpInputPorts(
  extraInputIds: readonly string[] = [],
  portLabels?: Record<string, string>,
): PortDefinition[] {
  return [
    createPort(JUMP_EXEC_INPUT_ID, "", "input", "exec", {
      description: "执行流进入后评估当前控制节点是否触发",
    }),
    ...buildCompoundExtraInputPorts(extraInputIds, portLabels),
  ];
}

export function getCompoundExtraInputPortIds(
  inputPorts: readonly PortDefinition[],
): string[] {
  return inputPorts
    .filter((port) => port.id.startsWith(COMPOUND_EXTRA_INPUT_PREFIX))
    .map((port) => port.id);
}

export function getNextCompoundExtraInputId(
  inputPorts: readonly PortDefinition[],
): string {
  const maxIndex = inputPorts.reduce((currentMax, port) => {
    if (!port.id.startsWith(COMPOUND_EXTRA_INPUT_PREFIX)) {
      return currentMax;
    }

    const suffix = Number.parseInt(
      port.id.slice(COMPOUND_EXTRA_INPUT_PREFIX.length),
      10,
    );
    return Number.isFinite(suffix) ? Math.max(currentMax, suffix) : currentMax;
  }, -1);

  return `${COMPOUND_EXTRA_INPUT_PREFIX}${maxIndex + 1}`;
}

export function buildIterationInputPorts(
  extraInputIds: readonly string[] = [],
  portLabels?: Record<string, string>,
): PortDefinition[] {
  return [
    createPort(COMPOUND_PARENT_EXEC_INPUT_ID, "", "input", "exec", {
      description: "执行流入口，前序节点完成后触发迭代容器",
    }),
    createPort(ITERATION_ITEMS_INPUT_ID, "数组", "input", "array", {
      description: "待迭代的数组输入",
    }),
    ...buildCompoundExtraInputPorts(extraInputIds, portLabels),
  ];
}

export function buildLoopInputPorts(
  extraInputIds: readonly string[] = [],
  portLabels?: Record<string, string>,
): PortDefinition[] {
  return [
    createPort(COMPOUND_PARENT_EXEC_INPUT_ID, "", "input", "exec", {
      description: "执行流入口，前序节点完成后触发循环容器",
    }),
    createCompoundValueInputPort(LOOP_STATE_INPUT_ID, "初始状态"),
    ...buildCompoundExtraInputPorts(extraInputIds, portLabels),
  ];
}

export function buildCompoundOutputPorts(
  outputKeys: readonly string[],
): PortDefinition[] {
  return [
    createPort(COMPOUND_PARENT_EXEC_OUTPUT_ID, "", "output", "exec", {
      description: "容器执行完成后触发下游节点",
    }),
    ...outputKeys.map((outputKey) => ({
      ...createCompoundValueInputPort(outputKey, outputKey),
      direction: "output" as const,
      description: `由 result 节点输出到父容器的 ${outputKey}`,
    })),
  ];
}

export function buildIterationStartOutputPorts(
  extraInputIds: readonly string[],
  config: IterationStartNodeConfig,
  portLabels?: Record<string, string>,
): PortDefinition[] {
  return [
    createPort(ITERATION_START_EXEC_OUTPUT_ID, "", "output", "exec", {
      description: "迭代轮次开始后触发内部子图",
    }),
    createCompoundValueInputPort(ITERATION_START_ITEM_OUTPUT_ID, "当前项"),
    createCompoundValueInputPort(ITERATION_START_INDEX_OUTPUT_ID, "索引"),
    ...extraInputIds.map((portId, index) =>
      createCompoundValueInputPort(
        portId,
        portLabels?.[portId] ?? `输入 ${index + 1}`,
      ),
    ),
    ...(config.exposeTotal
      ? [createCompoundValueInputPort(ITERATION_START_TOTAL_OUTPUT_ID, "总数")]
      : []),
    ...(config.exposeIsFirst
      ? [
          createCompoundValueInputPort(
            ITERATION_START_IS_FIRST_OUTPUT_ID,
            "是否首项",
          ),
        ]
      : []),
    ...(config.exposeIsLast
      ? [
          createCompoundValueInputPort(
            ITERATION_START_IS_LAST_OUTPUT_ID,
            "是否末项",
          ),
        ]
      : []),
  ].map((port) => ({
    ...port,
    direction: "output",
  }));
}

export function buildLoopStartOutputPorts(
  extraInputIds: readonly string[],
  config: LoopStartNodeConfig,
  portLabels?: Record<string, string>,
): PortDefinition[] {
  return [
    createPort(LOOP_START_EXEC_OUTPUT_ID, "", "output", "exec", {
      description: "循环轮次开始后触发内部子图",
    }),
    createCompoundValueInputPort(LOOP_START_ROUND_OUTPUT_ID, "轮次"),
    createCompoundValueInputPort(LOOP_START_STATE_OUTPUT_ID, "当前状态"),
    ...extraInputIds.map((portId, index) =>
      createCompoundValueInputPort(
        portId,
        portLabels?.[portId] ?? `输入 ${index + 1}`,
      ),
    ),
    ...(config.exposePreviousResult
      ? [
          createCompoundValueInputPort(
            LOOP_START_PREVIOUS_RESULT_OUTPUT_ID,
            "上一轮结果",
          ),
        ]
      : []),
    ...(config.exposeIsFirst
      ? [
          createCompoundValueInputPort(
            LOOP_START_IS_FIRST_OUTPUT_ID,
            "是否首轮",
          ),
        ]
      : []),
  ].map((port) => ({
    ...port,
    direction: "output",
  }));
}

export function buildResultInputPorts(): PortDefinition[] {
  return [
    createPort(RESULT_EXEC_INPUT_ID, "", "input", "exec", {
      description: "执行流进入后提交结果",
    }),
    createCompoundValueInputPort(RESULT_VALUE_INPUT_ID, "结果值"),
  ];
}

export function buildLoopStateNodePorts(): {
  inputPorts: PortDefinition[];
  outputPorts: PortDefinition[];
} {
  return {
    inputPorts: [
      createPort(LOOP_STATE_EXEC_INPUT_ID, "", "input", "exec", {
        description: "执行流进入后提交下一轮状态",
      }),
      createCompoundValueInputPort(LOOP_STATE_VALUE_INPUT_ID, "下一轮状态"),
    ],
    outputPorts: [
      createPort(LOOP_STATE_EXEC_OUTPUT_ID, "", "output", "exec", {
        description: "状态提交后继续执行内部后续节点",
      }),
    ],
  };
}
