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
    int version = 1,
  }) async {
    when(() => mockApi.getInputSchema('wf-1')).thenAnswer(
      (_) async => createTestWorkflowInputSchema(
        version: version,
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

    testWidgets('hybrid 模式继续走 conversation fallback', (tester) async {
      await pumpScreen(
        tester,
        collectionMode: 'hybrid',
        fields: [
          createTestInputFieldDefinition(
            id: 'title',
            type: 'text',
            label: '标题',
          ),
        ],
      );

      expect(find.byType(ConversationModePrompt), findsOneWidget);
      expect(find.byType(NoParamsConfirmation), findsNothing);
      expect(find.byType(TextFormField), findsNothing);
    });

    testWidgets('无参数场景可直接启动并导航到执行监控页', (tester) async {
      when(
        () => mockApi.runWorkflow(
          'wf-1',
          inputParams: null,
          schemaVersion: 1,
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
          schemaVersion: 1,
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
          schemaVersion: any(named: 'schemaVersion'),
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
          schemaVersion: any(named: 'schemaVersion'),
          launchSource: any(named: 'launchSource'),
        ),
      );
    });

    testWidgets('表单提交成功后导航到执行监控页', (tester) async {
      when(
        () => mockApi.runWorkflow(
          'wf-1',
          inputParams: {'title': 'hello'},
          schemaVersion: 2,
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
        version: 2,
      );

      await tester.enterText(find.byType(TextFormField), 'hello');
      await tester.tap(find.text('启动运行'));
      await tester.pumpAndSettle();

      verify(
        () => mockApi.runWorkflow(
          'wf-1',
          inputParams: {'title': 'hello'},
          schemaVersion: 2,
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
          schemaVersion: 1,
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

    testWidgets('隐藏字段不渲染，默认值会提交且携带 schemaVersion', (tester) async {
      when(
        () => mockApi.runWorkflow(
          'wf-1',
          inputParams: {'title': 'hello', 'mode': 'basic', 'locale': 'zh-CN'},
          schemaVersion: 3,
          launchSource: 'mobile',
        ),
      ).thenAnswer(
        (_) async => {
          'data': {'id': 'exec-visibility-1'},
        },
      );

      await pumpScreen(
        tester,
        collectionMode: 'form',
        version: 3,
        fields: [
          createTestInputFieldDefinition(
            id: 'title',
            type: 'text',
            label: '标题',
            required: true,
          ),
          createTestInputFieldDefinition(
            id: 'mode',
            type: 'text',
            label: '模式',
            defaultValue: 'basic',
          ),
          createTestInputFieldDefinition(
            id: 'locale',
            type: 'text',
            label: '地区',
            defaultValue: 'zh-CN',
          ),
          createTestInputFieldDefinition(
            id: 'advancedNote',
            type: 'text',
            label: '高级说明',
            defaultValue: '请详细说明',
            visibility: createTestInputFieldVisibility(
              fieldId: 'mode',
              equals: 'advanced',
            ),
          ),
        ],
      );

      expect(find.text('高级说明'), findsNothing);

      await tester.enterText(find.byType(TextFormField).first, 'hello');
      await tester.tap(find.text('启动运行'));
      await tester.pumpAndSettle();

      verify(
        () => mockApi.runWorkflow(
          'wf-1',
          inputParams: {'title': 'hello', 'mode': 'basic', 'locale': 'zh-CN'},
          schemaVersion: 3,
          launchSource: 'mobile',
        ),
      ).called(1);
      expect(find.text('Execution exec-visibility-1'), findsOneWidget);
    });

    testWidgets('控制字段切回隐藏状态后不会提交隐藏字段值', (tester) async {
      when(
        () => mockApi.runWorkflow(
          'wf-1',
          inputParams: {'title': 'hello', 'mode': 'basic'},
          schemaVersion: 4,
          launchSource: 'mobile',
        ),
      ).thenAnswer(
        (_) async => {
          'data': {'id': 'exec-visibility-2'},
        },
      );

      await pumpScreen(
        tester,
        collectionMode: 'form',
        version: 4,
        fields: [
          createTestInputFieldDefinition(
            id: 'title',
            type: 'text',
            label: '标题',
            required: true,
          ),
          createTestInputFieldDefinition(
            id: 'mode',
            type: 'text',
            label: '模式',
            defaultValue: 'advanced',
          ),
          createTestInputFieldDefinition(
            id: 'advancedNote',
            type: 'text',
            label: '高级说明',
            visibility: createTestInputFieldVisibility(
              fieldId: 'mode',
              equals: 'advanced',
            ),
          ),
        ],
      );

      expect(find.text('高级说明'), findsOneWidget);

      await tester.enterText(find.byType(TextFormField).at(0), 'hello');
      await tester.enterText(find.byType(TextFormField).at(1), 'basic');
      await tester.pumpAndSettle();

      expect(find.text('高级说明'), findsNothing);

      await tester.tap(find.text('启动运行'));
      await tester.pumpAndSettle();

      verify(
        () => mockApi.runWorkflow(
          'wf-1',
          inputParams: {'title': 'hello', 'mode': 'basic'},
          schemaVersion: 4,
          launchSource: 'mobile',
        ),
      ).called(1);
      expect(find.text('Execution exec-visibility-2'), findsOneWidget);
    });

    testWidgets('字段重新显示时保留用户先前输入，保持非破坏性体验', (tester) async {
      await pumpScreen(
        tester,
        collectionMode: 'form',
        version: 5,
        fields: [
          createTestInputFieldDefinition(
            id: 'mode',
            type: 'text',
            label: '模式',
            defaultValue: 'advanced',
          ),
          createTestInputFieldDefinition(
            id: 'advancedNote',
            type: 'text',
            label: '高级说明',
            visibility: createTestInputFieldVisibility(
              fieldId: 'mode',
              equals: 'advanced',
            ),
          ),
        ],
      );

      expect(find.text('高级说明'), findsOneWidget);

      await tester.enterText(find.byType(TextFormField).at(1), '保留内容');
      await tester.enterText(find.byType(TextFormField).at(0), 'basic');
      await tester.pumpAndSettle();
      expect(find.text('高级说明'), findsNothing);

      await tester.enterText(find.byType(TextFormField).first, 'advanced');
      await tester.pumpAndSettle();

      expect(find.text('高级说明'), findsOneWidget);
      expect(find.text('保留内容'), findsOneWidget);
    });
  });
}
