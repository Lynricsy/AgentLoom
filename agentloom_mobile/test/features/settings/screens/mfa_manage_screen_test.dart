import 'dart:async';

import 'package:agentloom_mobile/features/settings/api/settings_api.dart';
import 'package:agentloom_mobile/features/settings/providers/settings_provider.dart';
import 'package:agentloom_mobile/features/settings/screens/mfa_manage_screen.dart';
import 'package:agentloom_mobile/routes/route_names.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';

void main() {
  Widget buildTestWidget({
    SecurityInfoNotifier Function()? securityInfoOverride,
  }) {
    return ProviderScope(
      overrides: [
        if (securityInfoOverride != null)
          securityInfoProvider.overrideWith(securityInfoOverride),
      ],
      child: const MaterialApp(home: MfaManageScreen()),
    );
  }

  Widget buildRouterTestWidget({
    required GoRouter router,
    SecurityInfoNotifier Function()? securityInfoOverride,
  }) {
    return ProviderScope(
      overrides: [
        if (securityInfoOverride != null)
          securityInfoProvider.overrideWith(securityInfoOverride),
      ],
      child: MaterialApp.router(routerConfig: router),
    );
  }

  group('MfaManageScreen 渲染', () {
    testWidgets('渲染 AppBar 标题', (tester) async {
      await tester.pumpWidget(
        buildTestWidget(
          securityInfoOverride: () =>
              _DataSecurityInfoNotifier(const SecurityInfo(mfaEnabled: false)),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('双因素认证'), findsOneWidget);
    });

    testWidgets('加载中显示 CircularProgressIndicator', (tester) async {
      await tester.pumpWidget(
        buildTestWidget(securityInfoOverride: _LoadingSecurityInfoNotifier.new),
      );

      expect(find.byType(CircularProgressIndicator), findsOneWidget);
    });
  });

  group('MfaManageScreen — MFA 未启用', () {
    testWidgets('显示未启用状态', (tester) async {
      await tester.pumpWidget(
        buildTestWidget(
          securityInfoOverride: () =>
              _DataSecurityInfoNotifier(const SecurityInfo(mfaEnabled: false)),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('双因素认证未启用'), findsOneWidget);
      expect(find.text('启用双因素认证以增强账户安全'), findsOneWidget);
      expect(find.byIcon(Icons.shield_outlined), findsOneWidget);
    });

    testWidgets('显示启用按钮', (tester) async {
      await tester.pumpWidget(
        buildTestWidget(
          securityInfoOverride: () =>
              _DataSecurityInfoNotifier(const SecurityInfo(mfaEnabled: false)),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('启用双因素认证'), findsOneWidget);
      expect(find.byType(FilledButton), findsOneWidget);
    });

    testWidgets('进入启用页后返回应回到 MFA 管理页', (tester) async {
      GoRouter.optionURLReflectsImperativeAPIs = true;
      final router = GoRouter(
        initialLocation: '/settings/mfa',
        routes: [
          ShellRoute(
            builder: (context, state, child) => child,
            routes: [
              GoRoute(
                path: '/settings/mfa',
                builder: (context, state) => const MfaManageScreen(),
              ),
            ],
          ),
          GoRoute(
            path: '/mfa-enroll',
            name: RouteNames.mfaEnroll,
            builder: (context, state) =>
                const Scaffold(body: Center(child: Text('MFA Enroll'))),
          ),
        ],
      );
      addTearDown(router.dispose);

      await tester.pumpWidget(
        buildRouterTestWidget(
          router: router,
          securityInfoOverride: () =>
              _DataSecurityInfoNotifier(const SecurityInfo(mfaEnabled: false)),
        ),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.text('启用双因素认证'));
      await tester.pumpAndSettle();

      expect(router.routeInformationProvider.value.uri.path, '/mfa-enroll');
      expect(find.text('MFA Enroll'), findsOneWidget);

      router.pop();
      await tester.pumpAndSettle();

      expect(router.routeInformationProvider.value.uri.path, '/settings/mfa');
      expect(find.text('双因素认证'), findsOneWidget);
    });

    testWidgets('未启用时不显示禁用按钮', (tester) async {
      await tester.pumpWidget(
        buildTestWidget(
          securityInfoOverride: () =>
              _DataSecurityInfoNotifier(const SecurityInfo(mfaEnabled: false)),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('禁用双因素认证'), findsNothing);
    });
  });

  group('MfaManageScreen — MFA 已启用', () {
    testWidgets('显示已启用状态', (tester) async {
      await tester.pumpWidget(
        buildTestWidget(
          securityInfoOverride: () => _DataSecurityInfoNotifier(
            const SecurityInfo(
              mfaEnabled: true,
              mfaType: 'totp',
              mfaEnrolledAt: '2026-01-15T10:30:00.000Z',
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('双因素认证已启用'), findsOneWidget);
      expect(find.text('您的账户受到额外安全保护'), findsOneWidget);
      expect(find.byIcon(Icons.verified_user), findsOneWidget);
    });

    testWidgets('显示 MFA 类型和启用时间', (tester) async {
      await tester.pumpWidget(
        buildTestWidget(
          securityInfoOverride: () => _DataSecurityInfoNotifier(
            const SecurityInfo(
              mfaEnabled: true,
              mfaType: 'totp',
              mfaEnrolledAt: '2026-01-15T10:30:00.000Z',
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('认证类型'), findsOneWidget);
      expect(find.text('TOTP'), findsOneWidget);
      expect(find.text('启用时间'), findsOneWidget);
    });

    testWidgets('显示禁用按钮', (tester) async {
      await tester.pumpWidget(
        buildTestWidget(
          securityInfoOverride: () => _DataSecurityInfoNotifier(
            const SecurityInfo(mfaEnabled: true, mfaType: 'totp'),
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('禁用双因素认证'), findsOneWidget);
      expect(find.byType(OutlinedButton), findsOneWidget);
    });

    testWidgets('已启用时不显示启用按钮', (tester) async {
      await tester.pumpWidget(
        buildTestWidget(
          securityInfoOverride: () => _DataSecurityInfoNotifier(
            const SecurityInfo(mfaEnabled: true, mfaType: 'totp'),
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('启用双因素认证'), findsNothing);
    });

    testWidgets('点击禁用按钮显示确认对话框', (tester) async {
      await tester.pumpWidget(
        buildTestWidget(
          securityInfoOverride: () => _DataSecurityInfoNotifier(
            const SecurityInfo(mfaEnabled: true, mfaType: 'totp'),
          ),
        ),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.text('禁用双因素认证'));
      await tester.pumpAndSettle();

      expect(find.text('禁用双因素认证'), findsNWidgets(2)); // 按钮 + 对话框标题
      expect(find.text('取消'), findsOneWidget);
      expect(find.text('确认禁用'), findsOneWidget);
      expect(find.text('验证码'), findsOneWidget);
    });
  });

  group('MfaManageScreen 错误状态', () {
    testWidgets('错误状态显示错误信息和重试按钮', (tester) async {
      await tester.pumpWidget(
        buildTestWidget(securityInfoOverride: _ErrorSecurityInfoNotifier.new),
      );
      await tester.pumpAndSettle();

      expect(find.byIcon(Icons.error_outline), findsOneWidget);
      expect(find.text('重试'), findsOneWidget);
    });
  });
}

/// 始终处于 loading 状态的 SecurityInfoNotifier
class _LoadingSecurityInfoNotifier extends SecurityInfoNotifier {
  @override
  Future<SecurityInfo> build() {
    // 使用 Completer 避免 Timer pending 问题
    return Completer<SecurityInfo>().future;
  }
}

/// 返回指定数据的 SecurityInfoNotifier
class _DataSecurityInfoNotifier extends SecurityInfoNotifier {
  _DataSecurityInfoNotifier(this._info);
  final SecurityInfo _info;

  @override
  Future<SecurityInfo> build() async => _info;
}

/// 始终处于错误状态的 SecurityInfoNotifier
class _ErrorSecurityInfoNotifier extends SecurityInfoNotifier {
  @override
  Future<SecurityInfo> build() async {
    throw Exception('Network error');
  }
}
