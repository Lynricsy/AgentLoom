import 'dart:async';

import 'package:agentloom_mobile/features/settings/api/settings_api.dart';
import 'package:agentloom_mobile/features/settings/providers/settings_provider.dart';
import 'package:agentloom_mobile/features/settings/screens/session_list_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  final testSessions = [
    const SessionInfo(
      id: 'sess-1',
      deviceInfo: 'Chrome on macOS',
      ipAddress: '192.168.1.1',
      lastActiveAt: '2026-03-20T10:00:00.000Z',
      isCurrent: true,
      createdAt: '2026-03-19T08:00:00.000Z',
    ),
    const SessionInfo(
      id: 'sess-2',
      deviceInfo: 'Firefox on Windows',
      ipAddress: '10.0.0.42',
      lastActiveAt: '2026-03-19T15:30:00.000Z',
      isCurrent: false,
      createdAt: '2026-03-18T12:00:00.000Z',
    ),
  ];

  Widget buildTestWidget({
    SessionListNotifier Function()? sessionListOverride,
  }) {
    return ProviderScope(
      overrides: [
        if (sessionListOverride != null)
          sessionListProvider.overrideWith(sessionListOverride),
      ],
      child: const MaterialApp(home: SessionListScreen()),
    );
  }

  group('SessionListScreen 渲染', () {
    testWidgets('渲染 AppBar 标题', (tester) async {
      await tester.pumpWidget(
        buildTestWidget(
          sessionListOverride: () => _DataSessionListNotifier([]),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('活跃会话'), findsOneWidget);
    });

    testWidgets('加载中显示 CircularProgressIndicator', (tester) async {
      await tester.pumpWidget(
        buildTestWidget(sessionListOverride: _LoadingSessionListNotifier.new),
      );

      expect(find.byType(CircularProgressIndicator), findsOneWidget);
    });

    testWidgets('空列表显示空状态', (tester) async {
      await tester.pumpWidget(
        buildTestWidget(
          sessionListOverride: () => _DataSessionListNotifier([]),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('暂无活跃会话'), findsOneWidget);
    });

    testWidgets('有数据时显示会话列表', (tester) async {
      await tester.pumpWidget(
        buildTestWidget(
          sessionListOverride: () => _DataSessionListNotifier(testSessions),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('Chrome on macOS'), findsOneWidget);
      expect(find.text('Firefox on Windows'), findsOneWidget);
      expect(find.text('IP: 192.168.1.1'), findsOneWidget);
      expect(find.text('IP: 10.0.0.42'), findsOneWidget);
    });

    testWidgets('当前会话显示"当前"标记', (tester) async {
      await tester.pumpWidget(
        buildTestWidget(
          sessionListOverride: () => _DataSessionListNotifier(testSessions),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('当前'), findsOneWidget);
    });

    testWidgets('当前会话无注销按钮，非当前会话有注销按钮', (tester) async {
      await tester.pumpWidget(
        buildTestWidget(
          sessionListOverride: () => _DataSessionListNotifier(testSessions),
        ),
      );
      await tester.pumpAndSettle();

      // 非当前会话有一个 logout 图标按钮
      expect(find.byIcon(Icons.logout), findsOneWidget);
    });
  });

  group('SessionListScreen 错误状态', () {
    testWidgets('错误状态显示错误信息和重试按钮', (tester) async {
      await tester.pumpWidget(
        buildTestWidget(sessionListOverride: _ErrorSessionListNotifier.new),
      );
      await tester.pumpAndSettle();

      expect(find.byIcon(Icons.error_outline), findsOneWidget);
      expect(find.text('重试'), findsOneWidget);
    });
  });

  group('SessionListScreen 交互', () {
    testWidgets('点击注销按钮显示确认对话框', (tester) async {
      await tester.pumpWidget(
        buildTestWidget(
          sessionListOverride: () => _DataSessionListNotifier(testSessions),
        ),
      );
      await tester.pumpAndSettle();

      // 点击非当前会话的注销按钮
      await tester.tap(find.byIcon(Icons.logout));
      await tester.pumpAndSettle();

      expect(find.text('注销会话'), findsOneWidget);
      expect(find.text('确定要注销设备 "Firefox on Windows" 的会话吗？'), findsOneWidget);
      expect(find.text('取消'), findsOneWidget);
      expect(find.text('注销'), findsOneWidget);
    });

    testWidgets('点击取消关闭确认对话框', (tester) async {
      await tester.pumpWidget(
        buildTestWidget(
          sessionListOverride: () => _DataSessionListNotifier(testSessions),
        ),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.byIcon(Icons.logout));
      await tester.pumpAndSettle();

      await tester.tap(find.text('取消'));
      await tester.pumpAndSettle();

      expect(find.text('注销会话'), findsNothing);
    });
  });
}

/// 始终处于 loading 状态的 SessionListNotifier
class _LoadingSessionListNotifier extends SessionListNotifier {
  @override
  Future<List<SessionInfo>> build() {
    // 使用 Completer 避免 Timer pending 问题
    return Completer<List<SessionInfo>>().future;
  }
}

/// 返回指定数据的 SessionListNotifier
class _DataSessionListNotifier extends SessionListNotifier {
  _DataSessionListNotifier(this._sessions);
  final List<SessionInfo> _sessions;

  @override
  Future<List<SessionInfo>> build() async => _sessions;
}

/// 始终处于错误状态的 SessionListNotifier
class _ErrorSessionListNotifier extends SessionListNotifier {
  @override
  Future<List<SessionInfo>> build() async {
    throw Exception('Network error');
  }
}
