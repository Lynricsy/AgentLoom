import 'dart:async';

import 'package:agentloom_mobile/features/memory/api/memory_api.dart';
import 'package:agentloom_mobile/features/memory/models/memory_audit_entry.dart';
import 'package:agentloom_mobile/features/memory/providers/memory_providers.dart';
import 'package:agentloom_mobile/features/memory/screens/memory_audit_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';

import '../../../helpers/test_helpers.dart';

void main() {
  late MockMemoryApi mockApi;

  setUp(() {
    mockApi = MockMemoryApi();
  });

  Widget createTestWidget({String instanceId = 'mem-inst-1'}) {
    return ProviderScope(
      overrides: [
        memoryApiProvider.overrideWithValue(mockApi),
        memoryAuditInstanceIdProvider.overrideWithValue(instanceId),
      ],
      child: MaterialApp(home: MemoryAuditScreen(instanceId: instanceId)),
    );
  }

  /// 帮助方法：模拟 getAuditLog 返回
  void mockGetAuditLog({
    List<MemoryAuditEntryDto>? entries,
    int total = 5,
    int totalPages = 1,
  }) {
    when(
      () => mockApi.getAuditLog(
        any(),
        page: any(named: 'page'),
        pageSize: any(named: 'pageSize'),
      ),
    ).thenAnswer(
      (_) async => (
        data: entries ?? createTestMemoryAuditEntryList(),
        total: total,
        totalPages: totalPages,
      ),
    );
  }

  group('MemoryAuditScreen', () {
    testWidgets('shows loading state initially', (tester) async {
      when(
        () => mockApi.getAuditLog(
          any(),
          page: any(named: 'page'),
          pageSize: any(named: 'pageSize'),
        ),
      ).thenAnswer(
        (_) =>
            Completer<
                  ({List<MemoryAuditEntryDto> data, int total, int totalPages})
                >()
                .future,
      );

      await tester.pumpWidget(createTestWidget());
      await tester.pump();

      expect(find.byType(MemoryAuditScreen), findsOneWidget);
      expect(find.byType(CircularProgressIndicator), findsOneWidget);
    });

    testWidgets('shows AppBar with Audit Log title', (tester) async {
      mockGetAuditLog();

      await tester.pumpWidget(createTestWidget());
      await tester.pumpAndSettle();

      expect(find.text('审计日志'), findsOneWidget);
    });

    testWidgets('renders audit entry tiles after loading', (tester) async {
      mockGetAuditLog();

      await tester.pumpWidget(createTestWidget());
      await tester.pumpAndSettle();

      // 应该显示操作标签
      expect(find.text('节点已创建'), findsOneWidget);
      expect(find.text('版本已更新'), findsOneWidget);
      expect(find.text('路径已删除'), findsOneWidget);
      expect(find.text('评审已批准'), findsOneWidget);
      expect(find.text('评审已拒绝'), findsOneWidget);
    });

    testWidgets('shows correct action icons', (tester) async {
      mockGetAuditLog(
        entries: [createTestMemoryAuditEntry(action: 'create_node')],
        total: 1,
      );

      await tester.pumpWidget(createTestWidget());
      await tester.pumpAndSettle();

      expect(find.byIcon(Icons.add_circle_outline), findsOneWidget);
    });

    testWidgets('shows target info from metadata', (tester) async {
      mockGetAuditLog(
        entries: [
          createTestMemoryAuditEntry(
            metadata: {'nodeName': 'My Node', 'versionNumber': 3},
          ),
        ],
        total: 1,
      );

      await tester.pumpWidget(createTestWidget());
      await tester.pumpAndSettle();

      expect(find.text('My Node · v3'), findsOneWidget);
    });

    testWidgets('shows empty state when no audit entries', (tester) async {
      mockGetAuditLog(entries: [], total: 0);

      await tester.pumpWidget(createTestWidget());
      await tester.pumpAndSettle();

      expect(find.text('未找到审计记录'), findsOneWidget);
      expect(find.byIcon(Icons.history), findsOneWidget);
    });

    testWidgets('shows error state with retry button', (tester) async {
      when(
        () => mockApi.getAuditLog(
          any(),
          page: any(named: 'page'),
          pageSize: any(named: 'pageSize'),
        ),
      ).thenThrow(Exception('Network error'));

      await tester.pumpWidget(createTestWidget());
      await tester.pumpAndSettle();

      expect(find.text('加载审计日志失败'), findsOneWidget);
      expect(find.text('重试'), findsOneWidget);
    });

    testWidgets('supports pull-to-refresh', (tester) async {
      mockGetAuditLog();

      await tester.pumpWidget(createTestWidget());
      await tester.pumpAndSettle();

      expect(find.byType(RefreshIndicator), findsOneWidget);
    });

    testWidgets('shows chevron for entries with version id', (tester) async {
      mockGetAuditLog(
        entries: [
          createTestMemoryAuditEntry(
            targetNodeId: 'node-1',
            targetVersionId: 'ver-1',
          ),
        ],
        total: 1,
      );

      await tester.pumpWidget(createTestWidget());
      await tester.pumpAndSettle();

      expect(find.byIcon(Icons.chevron_right), findsOneWidget);
    });

    testWidgets('hides chevron for entries without version id', (tester) async {
      mockGetAuditLog(
        entries: [
          createTestMemoryAuditEntry(
            targetNodeId: null,
            targetVersionId: null,
            metadata: {},
          ),
        ],
        total: 1,
      );

      await tester.pumpWidget(createTestWidget());
      await tester.pumpAndSettle();

      expect(find.byIcon(Icons.chevron_right), findsNothing);
    });

    testWidgets('shows relative time for entries', (tester) async {
      mockGetAuditLog(
        entries: [
          createTestMemoryAuditEntry(
            createdAt: DateTime.now().subtract(const Duration(hours: 2)),
          ),
        ],
        total: 1,
      );

      await tester.pumpWidget(createTestWidget());
      await tester.pumpAndSettle();

      expect(find.text('2 小时前'), findsOneWidget);
    });

    testWidgets('shows delete action icon with error color', (tester) async {
      mockGetAuditLog(
        entries: [createTestMemoryAuditEntry(action: 'delete_path')],
        total: 1,
      );

      await tester.pumpWidget(createTestWidget());
      await tester.pumpAndSettle();

      expect(find.byIcon(Icons.delete_outline), findsOneWidget);
      expect(find.text('路径已删除'), findsOneWidget);
    });

    testWidgets('shows rollback action icon', (tester) async {
      mockGetAuditLog(
        entries: [createTestMemoryAuditEntry(action: 'rollback')],
        total: 1,
      );

      await tester.pumpWidget(createTestWidget());
      await tester.pumpAndSettle();

      expect(find.byIcon(Icons.undo), findsOneWidget);
      expect(find.text('回滚'), findsOneWidget);
    });

    testWidgets('shows unknown action with formatted label', (tester) async {
      mockGetAuditLog(
        entries: [createTestMemoryAuditEntry(action: 'custom_action')],
        total: 1,
      );

      await tester.pumpWidget(createTestWidget());
      await tester.pumpAndSettle();

      expect(find.text('Custom Action'), findsOneWidget);
      expect(find.byIcon(Icons.info_outline), findsOneWidget);
    });

    testWidgets('shows node id prefix when no metadata nodeName', (
      tester,
    ) async {
      mockGetAuditLog(
        entries: [
          createTestMemoryAuditEntry(
            targetNodeId: 'abcdef12-3456-7890',
            metadata: {},
          ),
        ],
        total: 1,
      );

      await tester.pumpWidget(createTestWidget());
      await tester.pumpAndSettle();

      expect(find.text('Node abcdef12...'), findsOneWidget);
    });
  });
}
