/**
 * 节点分派器：维护 nodeType 到执行器的唯一注册表，负责查表、调用，
 * 并把执行器未自行收口的异常按失败策略落到本节点。
 */
import { Injectable } from '@nestjs/common';
import { NodeExecutionFailurePolicy } from './node-execution-failure-policy';
import { CodeNodeExecutor } from './node-executors/code-node.executor';
import { CompoundNodeExecutor } from './node-executors/compound-node.executor';
import { ConditionalNodeExecutor } from './node-executors/conditional-node.executor';
import { DataTransformNodeExecutor } from './node-executors/data-transform-node.executor';
import { DeprecatedNodeExecutor } from './node-executors/deprecated-node.executor';
import { ExtensionNodeExecutor } from './node-executors/extension-node.executor';
import { HttpNodeExecutor } from './node-executors/http-node.executor';
import type {
  NodeExecutionContext,
  NodeExecutor,
} from './node-executors/node-executor.interface';
import { ResourceNodeExecutor } from './node-executors/resource-node.executor';
import { SmartRoutingNodeExecutor } from './node-executors/smart-routing-node.executor';
import { SubAgentNodeExecutor } from './node-executors/sub-agent-node.executor';
import { TeamNodeExecutor } from './node-executors/team-node.executor';
import { TriggerNodeExecutor } from './node-executors/trigger-node.executor';
import { ValueNodeExecutor } from './node-executors/value-node.executor';
import { WorkflowAgentNodeExecutor } from './node-executors/workflow-agent-node.executor';

@Injectable()
export class NodeDispatcherService {
  private readonly executors: Readonly<Record<string, NodeExecutor>>;

  constructor(
    workflowAgent: WorkflowAgentNodeExecutor,
    trigger: TriggerNodeExecutor,
    resource: ResourceNodeExecutor,
    dataTransform: DataTransformNodeExecutor,
    http: HttpNodeExecutor,
    code: CodeNodeExecutor,
    conditional: ConditionalNodeExecutor,
    compound: CompoundNodeExecutor,
    value: ValueNodeExecutor,
    smartRouting: SmartRoutingNodeExecutor,
    extension: ExtensionNodeExecutor,
    subAgent: SubAgentNodeExecutor,
    deprecated: DeprecatedNodeExecutor,
    team: TeamNodeExecutor,
    private readonly failurePolicy: NodeExecutionFailurePolicy,
  ) {
    this.executors = {
      agent: workflowAgent,
      'chat-agent': workflowAgent,
      'llm-agent': deprecated,
      'manual-trigger': trigger,
      'schedule-trigger': trigger,
      'webhook-trigger': trigger,
      'api-event-trigger': trigger,
      'llm-model': resource,
      sandbox: resource,
      workspace: resource,
      memory: resource,
      'knowledge-base': resource,
      data_transform: dataTransform,
      'input-preprocessor': dataTransform,
      'http-tool': http,
      'code-tool': code,
      condition: conditional,
      conditional,
      loop: compound,
      iteration: compound,
      'loop-start': compound,
      'iteration-start': compound,
      'loop-state': compound,
      result: compound,
      break: compound,
      continue: compound,
      merge: value,
      text: value,
      'text-output': value,
      'json-output': value,
      'smart-routing': smartRouting,
      plugin: extension,
      skill: extension,
      'mcp-tool': extension,
      'sub-agent': subAgent,
      team,
    };
  }

  find(nodeType: string): NodeExecutor | undefined {
    return this.executors[nodeType];
  }

  async dispatch(context: NodeExecutionContext): Promise<boolean> {
    const nodeType = context.step.nodeType;
    if (nodeType === null) return false;
    return this.dispatchAs(nodeType, context);
  }

  async dispatchAs(
    nodeType: string,
    context: NodeExecutionContext,
  ): Promise<boolean> {
    const executor = this.find(nodeType);
    if (!executor) return false;
    try {
      await executor.execute(context);
    } catch (error) {
      // 异常不能继续上抛：下游节点由上游执行器的 onNodeCompleted 同步调度，上抛会落进
      // 上游 try/catch，把已完成的上游步骤改判 failed（completed→failed 非法转换），
      // 而真正出错的本节点停在 pending、没有错误信息。状态机非法转换仍由失败策略上抛。
      await this.failurePolicy.handle(error, {
        tenantId: context.tenantId,
        executionId: context.executionId,
        step: context.step,
        onNodeFailed: context.runtime.onNodeFailed.bind(context.runtime),
      });
    }
    return true;
  }
}
