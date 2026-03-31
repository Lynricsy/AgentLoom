import 'dart:async';

import 'package:agentloom_mobile/features/skills/api/skill_api.dart';
import 'package:agentloom_mobile/features/skills/models/skill_dto.dart';
import 'package:agentloom_mobile/features/skills/screens/skill_list_screen.dart';
import 'package:agentloom_mobile/shared/models/paginated_response.dart';
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
    'description': 'A great test skill',
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
    'description': 'A built-in skill',
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

  Widget createTestWidget({required MockSkillApi api}) {
    return ProviderScope(
      overrides: [skillApiProvider.overrideWithValue(api)],
      child: const MaterialApp(home: SkillListScreen()),
    );
  }

  group('SkillListScreen', () {
    testWidgets('shows loading indicator initially', (tester) async {
      // 使用 Completer 保持加载状态
      final completer = Completer<PaginatedResponse<SkillDto>>();
      when(
        () => mockApi.listSkills(
          page: any(named: 'page'),
          pageSize: any(named: 'pageSize'),
          status: any(named: 'status'),
          isBuiltin: any(named: 'isBuiltin'),
          search: any(named: 'search'),
        ),
      ).thenAnswer((_) => completer.future);

      await tester.pumpWidget(createTestWidget(api: mockApi));
      await tester.pump();

      expect(find.byType(CircularProgressIndicator), findsOneWidget);
    });

    testWidgets('renders skill list when data loaded', (tester) async {
      when(
        () => mockApi.listSkills(
          page: any(named: 'page'),
          pageSize: any(named: 'pageSize'),
          status: any(named: 'status'),
          isBuiltin: any(named: 'isBuiltin'),
          search: any(named: 'search'),
        ),
      ).thenAnswer(
        (_) async => PaginatedResponse<SkillDto>(
          data: [sampleSkill, builtinSkill],
          meta: const PaginationMeta(
            total: 2,
            page: 1,
            pageSize: 20,
            totalPages: 1,
          ),
        ),
      );

      await tester.pumpWidget(createTestWidget(api: mockApi));
      await tester.pumpAndSettle();

      expect(find.text('Test Skill'), findsOneWidget);
      expect(find.text('Built-in Skill'), findsOneWidget);
    });

    testWidgets('shows empty view when no skills', (tester) async {
      when(
        () => mockApi.listSkills(
          page: any(named: 'page'),
          pageSize: any(named: 'pageSize'),
          status: any(named: 'status'),
          isBuiltin: any(named: 'isBuiltin'),
          search: any(named: 'search'),
        ),
      ).thenAnswer(
        (_) async => const PaginatedResponse<SkillDto>(
          data: [],
          meta: PaginationMeta(
            total: 0,
            page: 1,
            pageSize: 20,
            totalPages: 0,
          ),
        ),
      );

      await tester.pumpWidget(createTestWidget(api: mockApi));
      await tester.pumpAndSettle();

      expect(find.text('No skills found'), findsOneWidget);
    });

    testWidgets('shows error view with retry on API failure', (tester) async {
      when(
        () => mockApi.listSkills(
          page: any(named: 'page'),
          pageSize: any(named: 'pageSize'),
          status: any(named: 'status'),
          isBuiltin: any(named: 'isBuiltin'),
          search: any(named: 'search'),
        ),
      ).thenThrow(Exception('Network error'));

      await tester.pumpWidget(createTestWidget(api: mockApi));
      await tester.pumpAndSettle();

      // 错误视图应显示重试按钮
      expect(find.text('Retry'), findsOneWidget);
    });

    testWidgets('has AppBar with Skills title', (tester) async {
      when(
        () => mockApi.listSkills(
          page: any(named: 'page'),
          pageSize: any(named: 'pageSize'),
          status: any(named: 'status'),
          isBuiltin: any(named: 'isBuiltin'),
          search: any(named: 'search'),
        ),
      ).thenAnswer(
        (_) async => const PaginatedResponse<SkillDto>(
          data: [],
          meta: PaginationMeta(
            total: 0,
            page: 1,
            pageSize: 20,
            totalPages: 0,
          ),
        ),
      );

      await tester.pumpWidget(createTestWidget(api: mockApi));
      await tester.pumpAndSettle();

      expect(find.text('Skills'), findsOneWidget);
    });

    testWidgets('has search text field', (tester) async {
      when(
        () => mockApi.listSkills(
          page: any(named: 'page'),
          pageSize: any(named: 'pageSize'),
          status: any(named: 'status'),
          isBuiltin: any(named: 'isBuiltin'),
          search: any(named: 'search'),
        ),
      ).thenAnswer(
        (_) async => PaginatedResponse<SkillDto>(
          data: [sampleSkill],
          meta: const PaginationMeta(
            total: 1,
            page: 1,
            pageSize: 20,
            totalPages: 1,
          ),
        ),
      );

      await tester.pumpWidget(createTestWidget(api: mockApi));
      await tester.pumpAndSettle();

      expect(find.byType(TextField), findsOneWidget);
    });

    testWidgets('has filter chips for type', (tester) async {
      when(
        () => mockApi.listSkills(
          page: any(named: 'page'),
          pageSize: any(named: 'pageSize'),
          status: any(named: 'status'),
          isBuiltin: any(named: 'isBuiltin'),
          search: any(named: 'search'),
        ),
      ).thenAnswer(
        (_) async => PaginatedResponse<SkillDto>(
          data: [sampleSkill],
          meta: const PaginationMeta(
            total: 1,
            page: 1,
            pageSize: 20,
            totalPages: 1,
          ),
        ),
      );

      await tester.pumpWidget(createTestWidget(api: mockApi));
      await tester.pumpAndSettle();

      // 类型过滤器 chips: 全部/内置/自定义
      expect(find.byType(FilterChip), findsWidgets);
    });
  });
}
