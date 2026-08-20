import '../../../shared/utils/json_key_normalizer.dart';
import 'agent_definition_dto.dart';

Map<String, dynamic>? _asMap(Object? value) {
  if (value is! Map) {
    return null;
  }
  return normalizeJsonMap(value);
}

List<Map<String, dynamic>> _asMapList(Object? value) {
  if (value is! List) {
    return const [];
  }
  return value
      .whereType<Map<Object?, Object?>>()
      .map(normalizeJsonMap)
      .toList(growable: false);
}

List<String> _asStringList(Object? value) {
  if (value is! List) {
    return const [];
  }
  return value.whereType<String>().toList(growable: false);
}

bool _hasAnyBoolean(Iterable<Object?> values) {
  return values.any((value) => value is bool);
}

class AgentNativeToolPolicyView {
  const AgentNativeToolPolicyView({
    required this.isConfigured,
    required this.readEnabled,
    required this.writeEnabled,
    required this.editEnabled,
    required this.terminalEnabled,
  });

  final bool isConfigured;
  final bool readEnabled;
  final bool writeEnabled;
  final bool editEnabled;
  final bool terminalEnabled;
}

class AgentSelfEvolutionPolicyView {
  const AgentSelfEvolutionPolicyView({
    required this.isConfigured,
    required this.enabled,
    required this.resourceManagement,
    required this.externalEditing,
    required this.sandboxManagement,
  });

  final bool isConfigured;
  final bool enabled;
  final bool resourceManagement;
  final bool externalEditing;
  final bool sandboxManagement;
}

class AgentSubAgentConfigView {
  const AgentSubAgentConfigView({required this.alias});

  final String alias;
}

class AgentRuntimeConfigView {
  const AgentRuntimeConfigView({
    required this.modelId,
    required this.similarityThreshold,
    required this.fallbackModelId,
    required this.candidateModelIds,
    required this.subAgents,
    required this.nativeToolPolicy,
    required this.selfEvolutionPolicy,
  });

  final String? modelId;
  final double? similarityThreshold;
  final String? fallbackModelId;
  final List<String> candidateModelIds;
  final List<AgentSubAgentConfigView> subAgents;
  final AgentNativeToolPolicyView nativeToolPolicy;
  final AgentSelfEvolutionPolicyView selfEvolutionPolicy;

  bool get hasCustomPolicy =>
      nativeToolPolicy.isConfigured || selfEvolutionPolicy.isConfigured;
}

typedef AgentMainConfigView = AgentRuntimeConfigView;

/// 集中解析 agent runtime config；输入可来自 REST 的 snake_case 或 camelCase。
AgentRuntimeConfigView parseAgentRuntimeConfig(Map<Object?, Object?> json) {
  final config = normalizeJsonMap(json);
  final modelConfig = _asMap(config['modelConfig']);
  final knowledgeBindings = _asMapList(config['knowledgeBindings']);
  final routingConfig = _asMap(config['routingConfig']);
  final nativeToolPolicy = _asMap(config['nativeToolPolicy']);
  final selfEvolutionPolicy = _asMap(config['selfEvolutionPolicy']);

  final nativeValues = [
    nativeToolPolicy?['readEnabled'],
    nativeToolPolicy?['writeEnabled'],
    nativeToolPolicy?['editEnabled'],
    nativeToolPolicy?['terminalEnabled'],
  ];
  final selfEvolutionValues = [
    selfEvolutionPolicy?['enabled'],
    selfEvolutionPolicy?['resourceManagement'],
    selfEvolutionPolicy?['externalEditing'],
    selfEvolutionPolicy?['sandboxManagement'],
  ];

  return AgentRuntimeConfigView(
    modelId: modelConfig?['modelId'] as String?,
    similarityThreshold:
        (knowledgeBindings.firstOrNull?['similarityThreshold'] as num?)
            ?.toDouble(),
    fallbackModelId: routingConfig?['fallbackModelId'] as String?,
    candidateModelIds: _asStringList(routingConfig?['candidateModelIds']),
    subAgents: _asMapList(config['subAgents'])
        .map(
          (subAgent) =>
              AgentSubAgentConfigView(alias: subAgent['alias'] as String),
        )
        .toList(growable: false),
    nativeToolPolicy: AgentNativeToolPolicyView(
      isConfigured: _hasAnyBoolean(nativeValues),
      readEnabled: nativeToolPolicy?['readEnabled'] as bool? ?? true,
      writeEnabled: nativeToolPolicy?['writeEnabled'] as bool? ?? true,
      editEnabled: nativeToolPolicy?['editEnabled'] as bool? ?? true,
      terminalEnabled: nativeToolPolicy?['terminalEnabled'] as bool? ?? true,
    ),
    selfEvolutionPolicy: AgentSelfEvolutionPolicyView(
      isConfigured: _hasAnyBoolean(selfEvolutionValues),
      enabled: selfEvolutionPolicy?['enabled'] as bool? ?? false,
      resourceManagement:
          selfEvolutionPolicy?['resourceManagement'] as bool? ?? false,
      externalEditing:
          selfEvolutionPolicy?['externalEditing'] as bool? ?? false,
      sandboxManagement:
          selfEvolutionPolicy?['sandboxManagement'] as bool? ?? false,
    ),
  );
}

AgentMainConfigView parseAgentMainConfig(List<Map<String, dynamic>> nodes) {
  for (final node in nodes) {
    final data = _asMap(node['data']);
    if (data?['nodeType'] != 'agent-main') {
      continue;
    }
    return parseAgentRuntimeConfig(_asMap(data?['config']) ?? const {});
  }
  return parseAgentRuntimeConfig(const {});
}

extension AgentDefinitionMainConfigX on AgentDefinitionDto {
  AgentMainConfigView get agentMainConfig => parseAgentMainConfig(nodes);
}
