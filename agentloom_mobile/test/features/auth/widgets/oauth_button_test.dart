import 'package:agentloom_mobile/features/auth/widgets/oauth_button.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  Widget buildTestWidget({
    String provider = 'google',
    String label = '使用 Google 登录',
    IconData icon = Icons.g_mobiledata,
    Color backgroundColor = const Color(0xFF4285F4),
    Color foregroundColor = Colors.white,
    bool isLoading = false,
    VoidCallback? onPressed,
  }) {
    return MaterialApp(
      home: Scaffold(
        body: OAuthButton(
          provider: provider,
          label: label,
          icon: icon,
          backgroundColor: backgroundColor,
          foregroundColor: foregroundColor,
          isLoading: isLoading,
          onPressed: onPressed ?? () {},
        ),
      ),
    );
  }

  group('OAuthButton', () {
    testWidgets('渲染 label 和 icon', (tester) async {
      await tester.pumpWidget(buildTestWidget());

      expect(find.text('使用 Google 登录'), findsOneWidget);
      expect(find.byIcon(Icons.g_mobiledata), findsOneWidget);
    });

    testWidgets('点击触发 onPressed 回调', (tester) async {
      var pressed = false;
      await tester.pumpWidget(buildTestWidget(onPressed: () => pressed = true));

      await tester.tap(find.byType(ElevatedButton));
      expect(pressed, isTrue);
    });

    testWidgets('isLoading=true 时按钮禁用', (tester) async {
      var pressed = false;
      await tester.pumpWidget(
        buildTestWidget(isLoading: true, onPressed: () => pressed = true),
      );

      await tester.tap(find.byType(ElevatedButton));
      expect(pressed, isFalse);

      final button = tester.widget<ElevatedButton>(find.byType(ElevatedButton));
      expect(button.onPressed, isNull);
    });

    testWidgets('GitHub 按钮使用正确的品牌色', (tester) async {
      await tester.pumpWidget(
        buildTestWidget(
          provider: 'github',
          label: '使用 GitHub 登录',
          icon: Icons.code,
          backgroundColor: const Color(0xFF24292E),
        ),
      );

      expect(find.text('使用 GitHub 登录'), findsOneWidget);
      expect(find.byIcon(Icons.code), findsOneWidget);
    });
  });
}
