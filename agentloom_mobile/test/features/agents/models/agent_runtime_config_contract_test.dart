import 'dart:convert';
import 'dart:io';

import 'package:agentloom_mobile/features/agents/models/agent_main_config_view.dart';
import 'package:agentloom_mobile/shared/utils/json_key_normalizer.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  final fixture = File(
    '${Directory.current.parent.path}/agentloom-contracts/fixtures/agent-runtime-config.json',
  );

  test('解析 agent runtime config 契约 fixture 的 canonical 字段', () {
    expect(
      fixture.existsSync(),
      isTrue,
      reason: '契约 fixture 缺失：${fixture.path}',
    );
    final json = jsonDecode(fixture.readAsStringSync()) as Map<String, dynamic>;

    final config = parseAgentRuntimeConfig(json);

    expect(config.modelId, '0195c3a1-6e11-7b30-8d42-9a1c5f3e7b04');
    expect(config.similarityThreshold, 0.75);
    expect(config.fallbackModelId, '0195c3a1-6e11-7b30-8d42-9a1c5f3e7b06');
    expect(config.candidateModelIds, ['0195c3a1-6e11-7b30-8d42-9a1c5f3e7b04']);
    expect(config.subAgents.first.alias, 'reviewer');
  });

  test('递归 normalizer 统一嵌套 Map 与 List，并优先 camelCase', () {
    final normalized = normalizeJsonMap({
      'model_config': {'model_id': 'snake-model', 'modelId': 'camel-model'},
      'knowledge_bindings': [
        {'similarity_threshold': 0.8},
      ],
    });

    expect(normalized['modelConfig'], {'modelId': 'camel-model'});
    expect(normalized['knowledgeBindings'], [
      {'similarityThreshold': 0.8},
    ]);
  });
}
