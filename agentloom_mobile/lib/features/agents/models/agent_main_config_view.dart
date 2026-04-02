import 'agent_definition_dto.dart';

Map<String, dynamic>? _asMap(Object? value) {
  if (value is Map<String, dynamic>) {
    return value;
  }
  if (value is Map<Object?, Object?>) {
    return value.map((key, item) => MapEntry('$key', item));
  }
  return null;
}

bool _hasAnyBoolean(Iterable<Object?> values) {
  for (final value in values) {
    if (value is bool) {
      return true;
    }
  }
  return false;
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

class AgentMainConfigView {
  const AgentMainConfigView({
    required this.nativeToolPolicy,
    required this.selfEvolutionPolicy,
  });

  final AgentNativeToolPolicyView nativeToolPolicy;
  final AgentSelfEvolutionPolicyView selfEvolutionPolicy;

  bool get hasCustomPolicy =>
      nativeToolPolicy.isConfigured || selfEvolutionPolicy.isConfigured;
}

AgentMainConfigView parseAgentMainConfig(List<Map<String, dynamic>> nodes) {
  Map<String, dynamic>? agentMainData;

  for (final node in nodes) {
    final data = _asMap(node['data']);
    if (data?['nodeType'] == 'agent-main') {
      agentMainData = data;
      break;
    }
  }

  final config = _asMap(agentMainData?['config']);
  final nativeToolPolicyMap = _asMap(config?['nativeToolPolicy']);
  final selfEvolutionPolicyMap = _asMap(config?['selfEvolutionPolicy']);

  final hasNativeToolPolicy = _hasAnyBoolean([
    nativeToolPolicyMap?['readEnabled'],
    nativeToolPolicyMap?['writeEnabled'],
    nativeToolPolicyMap?['editEnabled'],
    nativeToolPolicyMap?['terminalEnabled'],
  ]);
  final hasSelfEvolutionPolicy = _hasAnyBoolean([
    selfEvolutionPolicyMap?['enabled'],
    selfEvolutionPolicyMap?['resourceManagement'],
    selfEvolutionPolicyMap?['externalEditing'],
    selfEvolutionPolicyMap?['sandboxManagement'],
  ]);

  return AgentMainConfigView(
    nativeToolPolicy: AgentNativeToolPolicyView(
      isConfigured: hasNativeToolPolicy,
      readEnabled: nativeToolPolicyMap?['readEnabled'] as bool? ?? true,
      writeEnabled: nativeToolPolicyMap?['writeEnabled'] as bool? ?? true,
      editEnabled: nativeToolPolicyMap?['editEnabled'] as bool? ?? true,
      terminalEnabled:
          nativeToolPolicyMap?['terminalEnabled'] as bool? ?? true,
    ),
    selfEvolutionPolicy: AgentSelfEvolutionPolicyView(
      isConfigured: hasSelfEvolutionPolicy,
      enabled: selfEvolutionPolicyMap?['enabled'] as bool? ?? false,
      resourceManagement:
          selfEvolutionPolicyMap?['resourceManagement'] as bool? ?? false,
      externalEditing:
          selfEvolutionPolicyMap?['externalEditing'] as bool? ?? false,
      sandboxManagement:
          selfEvolutionPolicyMap?['sandboxManagement'] as bool? ?? false,
    ),
  );
}

extension AgentDefinitionMainConfigX on AgentDefinitionDto {
  AgentMainConfigView get agentMainConfig => parseAgentMainConfig(nodes);
}
