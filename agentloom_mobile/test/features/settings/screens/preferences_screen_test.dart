import 'package:agentloom_mobile/features/resources/api/resources_api.dart';
import 'package:agentloom_mobile/features/resources/models/resource_dtos.dart';
import 'package:agentloom_mobile/features/settings/api/settings_api.dart';
import 'package:agentloom_mobile/features/settings/screens/preferences_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';

class MockResourcesApi extends Mock implements ResourcesApi {}

class MockSettingsApi extends Mock implements SettingsApi {}

void main() {
  late MockResourcesApi mockResourcesApi;
  late MockSettingsApi mockSettingsApi;

  const openAiProvider = LlmProviderEntityDto(
    id: 'provider-openai',
    orgId: 'org-1',
    tenantId: 'tenant-1',
    slug: 'openai',
    name: 'OpenAI',
    iconUrl: null,
    baseUrl: null,
    defaultBaseUrl: 'https://api.openai.com',
    isBuiltin: true,
    isEnabled: true,
    apiProtocol: 'openai_responses',
    apiKeyId: null,
    sortOrder: 1,
    createdAt: '2026-04-01T00:00:00Z',
    updatedAt: '2026-04-01T00:00:00Z',
  );

  const googleProvider = LlmProviderEntityDto(
    id: 'provider-google',
    orgId: 'org-1',
    tenantId: 'tenant-1',
    slug: 'google',
    name: 'Google',
    iconUrl: null,
    baseUrl: null,
    defaultBaseUrl: 'https://generativelanguage.googleapis.com',
    isBuiltin: true,
    isEnabled: true,
    apiProtocol: 'google',
    apiKeyId: null,
    sortOrder: 2,
    createdAt: '2026-04-01T00:00:00Z',
    updatedAt: '2026-04-01T00:00:00Z',
  );

  const disabledProvider = LlmProviderEntityDto(
    id: 'provider-disabled',
    orgId: 'org-1',
    tenantId: 'tenant-1',
    slug: 'anthropic',
    name: 'Anthropic',
    iconUrl: null,
    baseUrl: null,
    defaultBaseUrl: 'https://api.anthropic.com',
    isBuiltin: true,
    isEnabled: false,
    apiProtocol: 'anthropic',
    apiKeyId: null,
    sortOrder: 3,
    createdAt: '2026-04-01T00:00:00Z',
    updatedAt: '2026-04-01T00:00:00Z',
  );

  LlmModelConfigDto createModel(
    String id,
    String name,
    String modelId,
    LlmProviderEntityDto provider, {
    bool isDefault = false,
    bool isEnabled = true,
    String modelType = 'chat',
  }) {
    return LlmModelConfigDto(
      id: id,
      orgId: 'org-1',
      tenantId: 'tenant-1',
      providerId: provider.id,
      name: name,
      modelId: modelId,
      modelType: modelType,
      isEnabled: isEnabled,
      isDefault: isDefault,
      capabilities: const ModelCapabilitiesDto(),
      parameters: const <String, dynamic>{},
      createdAt: '2026-04-01T00:00:00Z',
      updatedAt: '2026-04-01T00:00:00Z',
      provider: provider,
    );
  }

  Widget buildTestWidget() {
    return ProviderScope(
      overrides: [
        resourcesApiProvider.overrideWithValue(mockResourcesApi),
        settingsApiProvider.overrideWithValue(mockSettingsApi),
      ],
      child: const MaterialApp(home: PreferencesScreen()),
    );
  }

  setUp(() {
    mockResourcesApi = MockResourcesApi();
    mockSettingsApi = MockSettingsApi();

    when(() => mockSettingsApi.getUserPreferences()).thenAnswer(
      (_) async =>
          const UserPreferenceDto(id: 'pref-1', titleModelConfigId: null),
    );
    when(() => mockResourcesApi.listLlmModelConfigs()).thenAnswer(
      (_) async => <LlmModelConfigDto>[
        createModel(
          'model-openai-chat',
          'GPT-4o',
          'gpt-4o',
          openAiProvider,
          isDefault: true,
        ),
        createModel(
          'model-openai-embedding',
          'Text Embedding',
          'text-embedding-3-large',
          openAiProvider,
          modelType: 'embedding',
        ),
        createModel(
          'model-google-chat',
          'Gemini 2.0 Flash',
          'gemini-2.0-flash',
          googleProvider,
        ),
        createModel(
          'model-disabled-provider',
          'Claude Sonnet',
          'claude-sonnet',
          disabledProvider,
        ),
        createModel(
          'model-google-disabled',
          'Disabled Gemini',
          'gemini-disabled',
          googleProvider,
          isEnabled: false,
        ),
      ],
    );
  });

  testWidgets('按 Provider 分组展示已启用聊天模型', (tester) async {
    await tester.pumpWidget(buildTestWidget());
    await tester.pumpAndSettle();

    expect(find.text('使用组织默认（GPT-4o）'), findsOneWidget);

    await tester.tap(find.text('标题生成模型'));
    await tester.pumpAndSettle();

    expect(find.text('选择标题生成模型'), findsOneWidget);
    expect(find.text('OpenAI'), findsOneWidget);
    expect(find.text('Google'), findsOneWidget);
    expect(find.text('GPT-4o'), findsOneWidget);
    expect(find.text('Gemini 2.0 Flash'), findsOneWidget);
    expect(find.text('Text Embedding'), findsNothing);
    expect(find.text('Disabled Gemini'), findsNothing);
    expect(find.text('Anthropic'), findsNothing);
  });

  testWidgets('选择模型后调用更新接口并显示保存成功提示', (tester) async {
    when(
      () => mockSettingsApi.updateUserPreferences(
        titleModelConfigId: 'model-google-chat',
      ),
    ).thenAnswer(
      (_) async => const UserPreferenceDto(
        id: 'pref-1',
        titleModelConfigId: 'model-google-chat',
      ),
    );

    await tester.pumpWidget(buildTestWidget());
    await tester.pumpAndSettle();

    await tester.tap(find.text('标题生成模型'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Gemini 2.0 Flash'));
    await tester.pumpAndSettle();

    verify(
      () => mockSettingsApi.updateUserPreferences(
        titleModelConfigId: 'model-google-chat',
      ),
    ).called(1);
    expect(find.text('偏好设置已保存'), findsOneWidget);
    expect(find.textContaining('Google'), findsOneWidget);
  });
}
