import 'dart:async';

import 'package:agentloom_mobile/features/skills/api/skill_api.dart';
import 'package:agentloom_mobile/features/skills/models/skill_dto.dart';
import 'package:agentloom_mobile/features/skills/providers/skill_provider.dart';
import 'package:agentloom_mobile/features/skills/screens/skill_detail_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';

class MockSkillApi extends Mock implements SkillApi {}

void main() {
  late MockSkillApi mockApi;

  final sampleSkill = SkillDto.fromJson(const {
    'id': 'skill-1',
    'tenant_id': 'tenant-1',
    'name': 'Test Skill',
    'slug': 'test-skill',
    'description': 'A wonderful test skill description',
    'content': '# Skill Content\nThis is the skill content.',
    'is_builtin': false,
    'status': 'active',
    'file_count': 3,
    'total_size_bytes': 1024,
    'version': 1,
    'created_at': '2026-01-01T00:00:00.000Z',
    'updated_at': '2026-01-01T00:00:00.000Z',
  });

  final builtinSkill = SkillDto.fromJson(const {
    'id': 'skill-2',
    'tenant_id': 'tenant-1',
    'name': 'Built-in Skill',
    'slug': 'builtin-skill',
    'description': 'A built-in system skill',
    'is_builtin': true,
    'status': 'active',
    'file_count': 5,
    'total_size_bytes': 2048,
    'version': 2,
    'created_at': '2026-01-02T00:00:00.000Z',
    'updated_at': '2026-01-02T00:00:00.000Z',
  });

  setUp(() {
    mockApi = MockSkillApi();
  });

  Widget createTestWidget({required String skillId}) {
    return ProviderScope(
      overrides: [skillApiProvider.overrideWithValue(mockApi)],
      child: MaterialApp(home: SkillDetailScreen(skillId: skillId)),
    );
  }

  group('SkillDetailScreen', () {
    testWidgets('shows loading indicator while fetching', (tester) async {
      final completer = Completer<SkillDto>();
      when(
        () => mockApi.getSkill('skill-1'),
      ).thenAnswer((_) => completer.future);

      await tester.pumpWidget(createTestWidget(skillId: 'skill-1'));
      await tester.pump();

      expect(find.byType(CircularProgressIndicator), findsOneWidget);
    });

    testWidgets('renders skill name in AppBar and header', (tester) async {
      when(
        () => mockApi.getSkill('skill-1'),
      ).thenAnswer((_) async => sampleSkill);

      await tester.pumpWidget(createTestWidget(skillId: 'skill-1'));
      await tester.pumpAndSettle();

      // 技能名出现两次：AppBar + HeaderSection
      expect(find.text('Test Skill'), findsNWidgets(2));
      expect(find.text('test-skill'), findsOneWidget);
    });

    testWidgets('renders description section', (tester) async {
      when(
        () => mockApi.getSkill('skill-1'),
      ).thenAnswer((_) async => sampleSkill);

      await tester.pumpWidget(createTestWidget(skillId: 'skill-1'));
      await tester.pumpAndSettle();

      expect(find.text('A wonderful test skill description'), findsOneWidget);
    });

    testWidgets('renders capitalized status in metadata', (tester) async {
      when(
        () => mockApi.getSkill('skill-1'),
      ).thenAnswer((_) async => sampleSkill);

      await tester.pumpWidget(createTestWidget(skillId: 'skill-1'));
      await tester.pumpAndSettle();

      // 状态 'active' 被首字母大写显示为 'Active'
      expect(find.text('Active'), findsOneWidget);
    });

    testWidgets('shows Built-in badge for builtin skills', (tester) async {
      when(
        () => mockApi.getSkill('skill-2'),
      ).thenAnswer((_) async => builtinSkill);

      await tester.pumpWidget(createTestWidget(skillId: 'skill-2'));
      await tester.pumpAndSettle();

      expect(find.text('Built-in'), findsWidgets);
    });

    testWidgets('shows error state on fetch failure', (tester) async {
      when(() => mockApi.getSkill('bad-id')).thenThrow(Exception('Not found'));

      await tester.pumpWidget(createTestWidget(skillId: 'bad-id'));
      await tester.pumpAndSettle();

      // 错误场景应有可识别的错误提示
      expect(find.byIcon(Icons.error_outline), findsOneWidget);
    });

    testWidgets('custom skill shows popup menu and FAB', (tester) async {
      when(
        () => mockApi.getSkill('skill-1'),
      ).thenAnswer((_) async => sampleSkill);

      await tester.pumpWidget(createTestWidget(skillId: 'skill-1'));
      await tester.pumpAndSettle();

      expect(find.byType(PopupMenuButton<String>), findsOneWidget);
      expect(find.byType(FloatingActionButton), findsOneWidget);
    });

    testWidgets('renders Custom type for non-builtin skills', (tester) async {
      when(
        () => mockApi.getSkill('skill-1'),
      ).thenAnswer((_) async => sampleSkill);

      await tester.pumpWidget(createTestWidget(skillId: 'skill-1'));
      await tester.pumpAndSettle();

      expect(find.text('Custom'), findsOneWidget);
    });

    testWidgets('shows Skill Detail in AppBar when loading', (tester) async {
      final completer = Completer<SkillDto>();
      when(
        () => mockApi.getSkill('skill-1'),
      ).thenAnswer((_) => completer.future);

      await tester.pumpWidget(createTestWidget(skillId: 'skill-1'));
      await tester.pump();

      expect(find.text('Skill Detail'), findsOneWidget);
    });

    testWidgets('builtin skill has no popup menu and no FAB', (tester) async {
      when(
        () => mockApi.getSkill('skill-2'),
      ).thenAnswer((_) async => builtinSkill);

      await tester.pumpWidget(createTestWidget(skillId: 'skill-2'));
      await tester.pumpAndSettle();

      expect(find.byType(PopupMenuButton<String>), findsNothing);
      expect(find.byType(FloatingActionButton), findsNothing);
    });
  });
}
