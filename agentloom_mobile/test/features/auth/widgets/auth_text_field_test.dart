import 'package:agentloom_mobile/features/auth/widgets/auth_text_field.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('AuthTextField', () {
    testWidgets('正确渲染 label', (tester) async {
      final controller = TextEditingController();

      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: AuthTextField(controller: controller, label: '邮箱'),
          ),
        ),
      );

      expect(find.text('邮箱'), findsOneWidget);
    });

    testWidgets('点击可切换密码可见性图标', (tester) async {
      await tester.pumpWidget(
        const MaterialApp(home: Scaffold(body: _AuthTextFieldHarness())),
      );

      expect(find.byIcon(Icons.visibility_off), findsOneWidget);
      expect(find.byIcon(Icons.visibility), findsNothing);

      await tester.tap(find.byType(IconButton));
      await tester.pump();

      expect(find.byIcon(Icons.visibility), findsOneWidget);
      expect(find.byIcon(Icons.visibility_off), findsNothing);
    });

    testWidgets('支持 enabled 与 disabled 状态', (tester) async {
      final controller = TextEditingController();

      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: AuthTextField(
              controller: controller,
              label: '密码',
              enabled: false,
            ),
          ),
        ),
      );

      final textField = tester.widget<TextField>(find.byType(TextField));
      expect(textField.enabled, isFalse);
    });

    testWidgets('正确显示 errorText', (tester) async {
      final controller = TextEditingController();

      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: AuthTextField(
              controller: controller,
              label: '邮箱',
              errorText: '请输入正确的邮箱地址',
            ),
          ),
        ),
      );
      await tester.pump();

      expect(find.text('请输入正确的邮箱地址'), findsOneWidget);
    });
  });
}

class _AuthTextFieldHarness extends StatefulWidget {
  const _AuthTextFieldHarness();

  @override
  State<_AuthTextFieldHarness> createState() => _AuthTextFieldHarnessState();
}

class _AuthTextFieldHarnessState extends State<_AuthTextFieldHarness> {
  final TextEditingController _controller = TextEditingController();
  bool _obscureText = true;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AuthTextField(
      controller: _controller,
      label: '密码',
      obscureText: _obscureText,
      onToggleVisibility: () {
        setState(() => _obscureText = !_obscureText);
      },
    );
  }
}
