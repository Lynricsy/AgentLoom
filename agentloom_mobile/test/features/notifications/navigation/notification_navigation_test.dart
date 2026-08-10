import 'dart:async';

import 'package:agentloom_mobile/app/app.dart';
import 'package:agentloom_mobile/config/env.dart';
import 'package:agentloom_mobile/features/auth/models/auth_tokens.dart';
import 'package:agentloom_mobile/features/auth/providers/token_storage_provider.dart';
import 'package:agentloom_mobile/features/execution/screens/execution_monitor_screen.dart';
import 'package:agentloom_mobile/features/notifications/models/push_notification_payload.dart';
import 'package:agentloom_mobile/features/notifications/providers/push_notification_provider.dart';
import 'package:agentloom_mobile/features/notifications/services/notification_service.dart';
import 'package:agentloom_mobile/features/workflows/api/workflow_api.dart';
import 'package:agentloom_mobile/routes/app_router.dart';
import 'package:agentloom_mobile/shared/providers/env_provider.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';

import '../../../helpers/test_helpers.dart';

class TestNotificationService extends NotificationService {
  TestNotificationService()
    : super(
        onMessageStream: const Stream.empty(),
        onMessageOpenedAppStream: const Stream.empty(),
      );

  final StreamController<PushNotificationPayload> _controller =
      StreamController<PushNotificationPayload>.broadcast();

  @override
  Stream<PushNotificationPayload> get onNotificationTap => _controller.stream;

  void emit(PushNotificationPayload payload) {
    _controller.add(payload);
  }

  @override
  void dispose() {
    _controller.close();
    super.dispose();
  }
}

class _AuthenticatedTokenStorage extends TokenStorage {
  _AuthenticatedTokenStorage() : super(const FlutterSecureStorage());

  static const AuthTokens _tokens = AuthTokens(
    accessToken: 'access-token',
    refreshToken: 'refresh-token',
    expiresIn: 3600,
  );

  @override
  Future<bool> hasTokens() async => true;

  @override
  Future<AuthTokens?> readTokens() async => _tokens;

  @override
  Future<void> saveTokens(AuthTokens tokens) async {}

  @override
  Future<void> clearTokens() async {}
}

void main() {
  const testEnvConfig = EnvConfig(
    studioBaseUrl: 'http://localhost:3000',
    appName: 'AgentLoom Test',
    environment: AppEnvironment.dev,
  );

  late TestNotificationService notificationService;
  late MockWorkflowApi workflowApi;
  late ProviderContainer container;

  setUp(() {
    notificationService = TestNotificationService();
    workflowApi = MockWorkflowApi();

    when(() => workflowApi.getExecution(any())).thenAnswer((invocation) async {
      final executionId = invocation.positionalArguments.first as String;
      return createTestExecution(
        id: executionId,
        status: 'completed',
        completedSteps: 1,
        totalSteps: 1,
        completedAt: '2026-01-01T10:05:00.000Z',
        steps: [
          createTestExecutionStep(
            id: 'step-1',
            executionId: executionId,
            nodeId: 'node-1',
            status: 'completed',
            completedAt: '2026-01-01T10:05:00.000Z',
          ),
        ],
      );
    });

    container = ProviderContainer(
      overrides: [
        baseEnvProvider.overrideWithValue(testEnvConfig),
        tokenStorageProvider.overrideWithValue(_AuthenticatedTokenStorage()),
        workflowApiProvider.overrideWithValue(workflowApi),
        notificationServiceProvider.overrideWithValue(notificationService),
      ],
    );
    addTearDown(() {
      notificationService.dispose();
      container.dispose();
    });
  });

  Widget createApp() {
    return UncontrolledProviderScope(
      container: container,
      child: const AgentLoomApp(),
    );
  }

  testWidgets('execution_completed payload 导航到 /executions/:id', (
    tester,
  ) async {
    await tester.pumpWidget(createApp());
    await tester.pumpAndSettle();

    notificationService.emit(
      const PushNotificationPayload(
        type: 'execution_completed',
        executionId: 'exec-200',
      ),
    );
    await tester.pumpAndSettle();

    final router = container.read(goRouterProvider);
    expect(
      router.routeInformationProvider.value.uri.path,
      '/executions/exec-200',
    );
    expect(find.byType(ExecutionMonitorScreen), findsOneWidget);
  });

  testWidgets('intervention_required payload 也导航到 /executions/:id', (
    tester,
  ) async {
    await tester.pumpWidget(createApp());
    await tester.pumpAndSettle();

    notificationService.emit(
      const PushNotificationPayload(
        type: 'intervention_required',
        executionId: 'exec-300',
        nodeId: 'node-approval',
      ),
    );
    await tester.pumpAndSettle();

    final router = container.read(goRouterProvider);
    expect(
      router.routeInformationProvider.value.uri.path,
      '/executions/exec-300',
    );
    expect(find.byType(ExecutionMonitorScreen), findsOneWidget);
  });

  testWidgets('没有 executionId 时不发生导航', (tester) async {
    await tester.pumpWidget(createApp());
    await tester.pumpAndSettle();

    notificationService.emit(const PushNotificationPayload(type: 'unknown'));
    await tester.pumpAndSettle();

    final router = container.read(goRouterProvider);
    expect(router.routeInformationProvider.value.uri.path, '/dashboard');
    expect(find.widgetWithText(AppBar, '仪表盘'), findsOneWidget);
  });
}
