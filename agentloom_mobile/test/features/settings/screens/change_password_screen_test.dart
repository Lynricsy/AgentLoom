import 'package:agentloom_mobile/features/settings/providers/settings_provider.dart';
import 'package:agentloom_mobile/features/settings/screens/change_password_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  Widget buildTestWidget({
    ChangePasswordNotifier Function()? changePasswordOverride,
  }) {
    return ProviderScope(
      overrides: [
        if (changePasswordOverride != null)
          changePasswordProvider.overrideWith(changePasswordOverride),
      ],
      child: const MaterialApp(home: ChangePasswordScreen()),
    );
  }

  group('ChangePasswordScreen 渲染', () {
    testWidgets('渲染 AppBar 标题和三个密码输入框', (tester) async {
      await tester.pumpWidget(buildTestWidget());

      expect(find.text('修改密码'), findsOneWidget);
      expect(find.text('当前密码'), findsOneWidget);
      expect(find.text('新密码'), findsOneWidget);
      expect(find.text('确认新密码'), findsOneWidget);
    });

    testWidgets('渲染提交按钮', (tester) async {
      await tester.pumpWidget(buildTestWidget());

      expect(find.text('确认修改'), findsOneWidget);
      expect(find.byType(FilledButton), findsOneWidget);
    });

    testWidgets('渲染密码策略提示文本', (tester) async {
      await tester.pumpWidget(buildTestWidget());

      expect(find.text('至少 8 位，包含大写、小写字母和数字'), findsOneWidget);
    });

    testWidgets('初始状态密码字段为遮蔽模式', (tester) async {
      await tester.pumpWidget(buildTestWidget());

      // 三个密码字段都有 visibility_off 图标
      expect(find.byIcon(Icons.visibility_off), findsNWidgets(3));
      expect(find.byIcon(Icons.visibility), findsNothing);
    });
  });

  group('ChangePasswordScreen 密码可见性切换', () {
    testWidgets('点击切换当前密码可见性', (tester) async {
      await tester.pumpWidget(buildTestWidget());

      // 点击第一个 visibility_off 图标（当前密码）
      await tester.tap(find.byIcon(Icons.visibility_off).first);
      await tester.pump();

      // 一个变成 visibility，其余两个仍为 visibility_off
      expect(find.byIcon(Icons.visibility), findsOneWidget);
      expect(find.byIcon(Icons.visibility_off), findsNWidgets(2));
    });
  });

  group('ChangePasswordScreen 表单验证', () {
    testWidgets('空表单提交显示验证错误', (tester) async {
      await tester.pumpWidget(buildTestWidget());

      await tester.tap(find.text('确认修改'));
      await tester.pumpAndSettle();

      expect(find.text('请输入当前密码'), findsOneWidget);
      expect(find.text('请输入新密码'), findsOneWidget);
      expect(find.text('请确认新密码'), findsOneWidget);
    });

    testWidgets('新密码不满足策略 — 太短', (tester) async {
      await tester.pumpWidget(buildTestWidget());

      // 输入当前密码
      await tester.enterText(find.byType(TextFormField).at(0), 'oldpassword');
      // 输入太短的新密码
      await tester.enterText(find.byType(TextFormField).at(1), 'Ab1');
      // 确认密码
      await tester.enterText(find.byType(TextFormField).at(2), 'Ab1');
      await tester.pump();

      await tester.tap(find.text('确认修改'));
      await tester.pumpAndSettle();

      expect(find.text('密码至少 8 个字符'), findsOneWidget);
    });

    testWidgets('新密码不满足策略 — 缺少大写', (tester) async {
      await tester.pumpWidget(buildTestWidget());

      await tester.enterText(find.byType(TextFormField).at(0), 'oldpassword');
      await tester.enterText(find.byType(TextFormField).at(1), 'abcdefg1');
      await tester.enterText(find.byType(TextFormField).at(2), 'abcdefg1');
      await tester.pump();

      await tester.tap(find.text('确认修改'));
      await tester.pumpAndSettle();

      expect(find.text('密码需包含至少一个大写字母'), findsOneWidget);
    });

    testWidgets('新密码不满足策略 — 缺少小写', (tester) async {
      await tester.pumpWidget(buildTestWidget());

      await tester.enterText(find.byType(TextFormField).at(0), 'oldpassword');
      await tester.enterText(find.byType(TextFormField).at(1), 'ABCDEFG1');
      await tester.enterText(find.byType(TextFormField).at(2), 'ABCDEFG1');
      await tester.pump();

      await tester.tap(find.text('确认修改'));
      await tester.pumpAndSettle();

      expect(find.text('密码需包含至少一个小写字母'), findsOneWidget);
    });

    testWidgets('新密码不满足策略 — 缺少数字', (tester) async {
      await tester.pumpWidget(buildTestWidget());

      await tester.enterText(find.byType(TextFormField).at(0), 'oldpassword');
      await tester.enterText(find.byType(TextFormField).at(1), 'Abcdefgh');
      await tester.enterText(find.byType(TextFormField).at(2), 'Abcdefgh');
      await tester.pump();

      await tester.tap(find.text('确认修改'));
      await tester.pumpAndSettle();

      expect(find.text('密码需包含至少一个数字'), findsOneWidget);
    });

    testWidgets('确认密码不一致', (tester) async {
      await tester.pumpWidget(buildTestWidget());

      await tester.enterText(find.byType(TextFormField).at(0), 'oldpassword');
      await tester.enterText(find.byType(TextFormField).at(1), 'NewPass123');
      await tester.enterText(find.byType(TextFormField).at(2), 'Different1');
      await tester.pump();

      await tester.tap(find.text('确认修改'));
      await tester.pumpAndSettle();

      expect(find.text('两次输入的密码不一致'), findsOneWidget);
    });
  });

  group('ChangePasswordScreen 状态展示', () {
    testWidgets('加载中显示 CircularProgressIndicator', (tester) async {
      await tester.pumpWidget(
        buildTestWidget(
          changePasswordOverride: _LoadingChangePasswordNotifier.new,
        ),
      );

      expect(find.byType(CircularProgressIndicator), findsOneWidget);
      // 按钮应禁用
      final button = tester.widget<FilledButton>(find.byType(FilledButton));
      expect(button.onPressed, isNull);
    });

    testWidgets('错误状态显示错误消息', (tester) async {
      await tester.pumpWidget(
        buildTestWidget(
          changePasswordOverride: _ErrorChangePasswordNotifier.new,
        ),
      );

      expect(find.text('当前密码不正确'), findsOneWidget);
    });
  });
}

/// 始终处于 loading 状态的 Notifier
class _LoadingChangePasswordNotifier extends ChangePasswordNotifier {
  @override
  ChangePasswordState build() => const ChangePasswordLoading();
}

/// 始终处于 error 状态的 Notifier
class _ErrorChangePasswordNotifier extends ChangePasswordNotifier {
  @override
  ChangePasswordState build() => const ChangePasswordError(message: '当前密码不正确');
}
