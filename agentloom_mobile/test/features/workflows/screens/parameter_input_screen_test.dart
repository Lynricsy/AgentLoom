import 'package:agentloom_mobile/features/workflows/api/workflow_api.dart';
import 'package:agentloom_mobile/features/workflows/screens/parameter_input_screen.dart';
import 'package:agentloom_mobile/features/workflows/widgets/conversation_mode_prompt.dart';
import 'package:agentloom_mobile/features/workflows/widgets/no_params_confirmation.dart';
import 'package:agentloom_mobile/routes/route_names.dart';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:mocktail/mocktail.dart';

import '../../../helpers/test_helpers.dart';

void main() {
  late MockWorkflowApi mockApi;

  setUp(() {
    mockApi = MockWorkflowApi();
  });

  GoRouter createRouter() {
    return GoRouter(
      initialLocation: '/launch',
      routes: [
        GoRoute(
          path: '/launch',
          builder: (context, state) => ProviderScope(
            overrides: [workflowApiProvider.overrideWithValue(mockApi)],
            child: const ParameterInputScreen(
              workflowId: 'wf-1',
              workflowName: '测试工作流',
            ),
          ),
        ),
        GoRoute(
          path: '/executions/:executionId',
          name: RouteNames.executionMonitor,
          builder: (context, state) =>
              Text('Execution ${state.pathParameters['executionId']}'),
        ),
      ],
    );
  }

  Future<GoRouter> pumpScreen(
    WidgetTester tester, {
    required String collectionMode,
    required List<dynamic> fields,
  }) async {
    when(() => mockApi.getInputSchema('wf-1')).thenAnswer(
      (_) async => createTestWorkflowInputSchema(
        collectionMode: collectionMode,
        fields: fields.cast(),
      ),
    );

    final router = createRouter();
    addTearDown(router.dispose);

    await tester.pumpWidget(MaterialApp.router(routerConfig: router));
    await tester.pumpAndSettle();
    return router;
  }

  group('ParameterInputScreen', () {
    testWidgets('conversation 模式显示 Web 引导提示', (tester) async {
      await pumpScreen(
        tester,
        collectionMode: 'conversation',
        fields: const [],
      );

      expect(find.byType(ConversationModePrompt), findsOneWidget);
      expect(find.text('此工作流需要对话式交互'), findsOneWidget);
    });

    testWidgets('无参数场景可直接启动并导航到执行监控页', (tester) async {
      when(
        () => mockApi.runWorkflow(
          'wf-1',
          inputParams: null,
          launchSource: 'mobile',
        ),
      ).thenAnswer(
        (_) async => {
          'data': {'id': 'exec-123'},
        },
      );

      await pumpScreen(tester, collectionMode: 'form', fields: const []);

      expect(find.byType(NoParamsConfirmation), findsOneWidget);

      await tester.tap(find.text('启动运行'));
      await tester.pumpAndSettle();

      verify(
        () => mockApi.runWorkflow(
          'wf-1',
          inputParams: null,
          launchSource: 'mobile',
        ),
      ).called(1);
      expect(find.text('Execution exec-123'), findsOneWidget);
    });

    testWidgets('必填文本字段校验失败时阻止提交', (tester) async {
      when(
        () => mockApi.runWorkflow(
          any(),
          inputParams: any(named: 'inputParams'),
          launchSource: any(named: 'launchSource'),
        ),
      ).thenAnswer(
        (_) async => {
          'data': {'id': 'exec-999'},
        },
      );

      await pumpScreen(
        tester,
        collectionMode: 'form',
        fields: [
          createTestInputFieldDefinition(
            id: 'title',
            type: 'text',
            label: '标题',
            required: true,
          ),
        ],
      );

      await tester.tap(find.text('启动运行'));
      await tester.pump();

      expect(find.text('此字段为必填项'), findsOneWidget);
      verifyNever(
        () => mockApi.runWorkflow(
          any(),
          inputParams: any(named: 'inputParams'),
          launchSource: any(named: 'launchSource'),
        ),
      );
    });

    testWidgets('表单提交成功后导航到执行监控页', (tester) async {
      when(
        () => mockApi.runWorkflow(
          'wf-1',
          inputParams: {'title': 'hello'},
          launchSource: 'mobile',
        ),
      ).thenAnswer(
        (_) async => {
          'data': {'id': 'exec-456'},
        },
      );

      await pumpScreen(
        tester,
        collectionMode: 'form',
        fields: [
          createTestInputFieldDefinition(
            id: 'title',
            type: 'text',
            label: '标题',
            required: true,
          ),
        ],
      );

      await tester.enterText(find.byType(TextFormField), 'hello');
      await tester.tap(find.text('启动运行'));
      await tester.pumpAndSettle();

      verify(
        () => mockApi.runWorkflow(
          'wf-1',
          inputParams: {'title': 'hello'},
          launchSource: 'mobile',
        ),
      ).called(1);
      expect(find.text('Execution exec-456'), findsOneWidget);
    });

    testWidgets('提交失败时显示错误 snackbar', (tester) async {
      when(
        () => mockApi.runWorkflow(
          'wf-1',
          inputParams: null,
          launchSource: 'mobile',
        ),
      ).thenThrow(
        DioException(
          type: DioExceptionType.badResponse,
          requestOptions: RequestOptions(path: '/'),
          response: Response(
            statusCode: 409,
            requestOptions: RequestOptions(path: '/'),
          ),
        ),
      );

      await pumpScreen(tester, collectionMode: 'form', fields: const []);

      await tester.tap(find.text('启动运行'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 300));

      expect(find.text('此工作流尚未发布，无法启动'), findsOneWidget);
    });
  });
}
