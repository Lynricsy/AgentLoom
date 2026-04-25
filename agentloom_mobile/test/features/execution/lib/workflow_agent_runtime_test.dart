import 'package:agentloom_mobile/features/agents/models/conversation_message_dto.dart';
import 'package:agentloom_mobile/features/execution/lib/workflow_agent_runtime.dart';
import 'package:agentloom_mobile/features/execution/models/execution_runtime.dart';
import 'package:agentloom_mobile/features/execution/models/execution_state.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('workflow_agent_runtime', () {
    test('buildWorkflowAgentConversationState 会复用 runtime 瀑布流与上下文', () {
      const step = StepSnapshot(
        stepId: 'step-agent-1',
        nodeId: 'node-agent-1',
        nodeName: '研究 Agent',
        nodeType: 'agent',
        status: 'running',
        startedAt: '2026-03-31T12:00:00.000Z',
      );
      final runtime = ExecutionRuntimeStep(
        stepId: 'step-agent-1',
        nodeId: 'node-agent-1',
        nodeName: '研究 Agent',
        nodeType: 'agent',
        status: 'running',
        output: '先整理线索\n\nKB-ALPHA-20260331',
        thinking: '先判断资料可信度',
        isStreaming: true,
        toolCalls: const [
          ConversationToolCallDto(
            id: 'tool-1',
            tool: 'search_knowledge',
            status: ConversationToolStatus.completed,
          ),
        ],
        segments: const [
          MessageSegment.text('先整理线索'),
          MessageSegment.toolCall('tool-1'),
          MessageSegment.text('KB-ALPHA-20260331'),
        ],
        terminalEntries: [
          TerminalEntry(
            id: 'terminal-1',
            output: 'ls\nnotes.md',
            timestamp: DateTime(2026, 3, 31, 12, 0, 1),
          ),
        ],
        fileChanges: const [
          WorkspaceFileChange(path: 'notes.md', changeType: 'modified'),
        ],
      );

      final state = buildWorkflowAgentConversationState(
        step: step,
        runtime: runtime,
        fileTree: const [
          WorkspaceFileNode(name: 'notes.md', path: 'notes.md', type: 'file'),
        ],
        selectedFilePath: 'notes.md',
        selectedFileContent: const WorkspaceFileContent(
          path: 'notes.md',
          content: 'alpha',
          size: 5,
          encoding: 'utf-8',
        ),
      );

      expect(state.status, ConversationStatus.executing);
      expect(state.messages, hasLength(1));
      expect(state.messages.first.segments, hasLength(3));
      expect(state.messages.first.toolCalls.single.tool, 'search_knowledge');
      expect(state.terminalEntries.single.output, contains('notes.md'));
      expect(state.fileChanges.single.path, 'notes.md');
      expect(state.selectedFileContent?.content, 'alpha');
    });

    test('summarizeExecutionStep 优先展示活跃工具状态', () {
      const step = StepSnapshot(
        stepId: 'step-agent-1',
        nodeId: 'node-agent-1',
        nodeName: '研究 Agent',
        nodeType: 'agent',
        status: 'running',
      );
      const runtime = ExecutionRuntimeStep(
        stepId: 'step-agent-1',
        nodeId: 'node-agent-1',
        status: 'running',
        toolCalls: [
          ConversationToolCallDto(
            id: 'tool-1',
            tool: 'read_file',
            status: ConversationToolStatus.awaitingPermission,
          ),
        ],
      );

      expect(summarizeExecutionStep(step, runtime), '等待授权 · read_file');
    });
  });
}
