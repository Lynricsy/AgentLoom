import 'package:agentloom_mobile/features/execution/lib/output_content.dart';
import 'package:agentloom_mobile/features/execution/models/execution_runtime.dart';
import 'package:agentloom_mobile/features/execution/models/execution_state.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('output_content', () {
    test('text-output 会从 result.content 提取原始文本', () {
      const step = StepSnapshot(
        stepId: 'step-text',
        nodeId: 'node-text',
        nodeType: 'text-output',
        status: 'completed',
        result: {'content': '# 标题\n\n内容'},
      );

      expect(extractWorkflowOutputText(step, null), '# 标题\n\n内容');
      expect(
        getWorkflowOutputFormat(step.nodeType),
        WorkflowOutputFormat.markdown,
      );
    });

    test('json-output 会优先提取结构化 json 并生成预览', () {
      const step = StepSnapshot(
        stepId: 'step-json',
        nodeId: 'node-json',
        nodeType: 'json-output',
        status: 'completed',
        result: {
          'json': {
            'score': 42,
            'tags': ['alpha', 'beta'],
          },
        },
      );

      final value =
          extractWorkflowJsonValue(step, null) as Map<Object?, Object?>;
      final preview = buildOutputPreviewText(
        format: WorkflowOutputFormat.json,
        output: extractWorkflowOutputText(step, null),
        jsonValue: value,
        maxChars: 120,
      );

      expect(value['score'], 42);
      expect(preview, contains('"score": 42'));
      expect(preview, contains('"tags"'));
    });

    test('流式 markdown 预览会移除代码块围栏并截断', () {
      const step = StepSnapshot(
        stepId: 'step-markdown',
        nodeId: 'node-markdown',
        nodeType: 'text-output',
        status: 'running',
      );
      const runtime = ExecutionRuntimeStep(
        stepId: 'step-markdown',
        nodeId: 'node-markdown',
        status: 'running',
        output: '```mermaid\ngraph TD\nA-->B\n```\n\n段落内容',
        isStreaming: true,
      );

      final preview = buildOutputPreviewText(
        format: WorkflowOutputFormat.markdown,
        output: extractWorkflowOutputText(step, runtime),
        isStreaming: true,
        maxChars: 10,
      );

      expect(preview, isNotNull);
      expect(preview, isNot(contains('```')));
      expect(preview, endsWith('…'));
    });

    test('非法 JSON 会解析失败', () {
      final parsed = parseJsonOutput('{"score":');
      expect(parsed.ok, isFalse);
      expect(isWorkflowOutputNodeType('json-output'), isTrue);
      expect(isWorkflowOutputNodeType('text-output'), isTrue);
      expect(isWorkflowOutputNodeType('chat-agent'), isFalse);
    });
  });
}
