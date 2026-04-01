import 'package:agentloom_mobile/config/theme.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('AppTheme 为正文和标题文本提供本地 CJK fallback', () {
    final theme = AppTheme.light();

    expect(
      theme.textTheme.bodyMedium?.fontFamilyFallback,
      containsAll(<String>['Noto Sans SC', 'Microsoft YaHei']),
    );
    expect(
      theme.textTheme.titleLarge?.fontFamilyFallback,
      contains('PingFang SC'),
    );
  });
}
