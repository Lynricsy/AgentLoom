import 'dart:async';

import 'package:agentloom_mobile/features/skills/api/skill_api.dart';
import 'package:agentloom_mobile/features/skills/models/skill_dto.dart';
import 'package:agentloom_mobile/features/skills/providers/skill_provider.dart';
import 'package:agentloom_mobile/shared/models/paginated_response.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';

class MockSkillApi extends Mock implements SkillApi {}

void main() {
  late MockSkillApi mockApi;
  late ProviderContainer container;

  final sampleSkill = SkillDto.fromJson(const {
    'id': 'skill-1',
    'tenant_id': 'tenant-1',
    'name': 'Test Skill',
    'slug': 'test-skill',
    'description': 'A test skill',
    'is_builtin': false,
    'status': 'active',
    'file_count': 3,
    'total_size_bytes': 1024,
    'version': 1,
    'created_at': '2026-01-01T00:00:00.000Z',
    'updated_at': '2026-01-01T00:00:00.000Z',
  });

  final samplePaginatedResponse = PaginatedResponse<SkillDto>(
    data: [sampleSkill],
    meta: const PaginationMeta(total: 1, page: 1, pageSize: 20, totalPages: 1),
  );

  final emptyPaginatedResponse = PaginatedResponse<SkillDto>(
    data: const [],
    meta: const PaginationMeta(total: 0, page: 1, pageSize: 20, totalPages: 0),
  );

  setUp(() {
    mockApi = MockSkillApi();
  });

  tearDown(() {
    container.dispose();
  });

  group('skillListProvider', () {
    test('loads skills on initialization', () async {
      when(
        () => mockApi.listSkills(
          page: any(named: 'page'),
          pageSize: any(named: 'pageSize'),
          status: any(named: 'status'),
          isBuiltin: any(named: 'isBuiltin'),
          search: any(named: 'search'),
        ),
      ).thenAnswer((_) async => samplePaginatedResponse);

      container = ProviderContainer(
        overrides: [skillApiProvider.overrideWithValue(mockApi)],
      );

      // 等待 build() 完成
      final state = await container.read(skillListProvider.future);

      expect(state.skills.length, 1);
      expect(state.skills.first.name, 'Test Skill');
      expect(state.meta?.total, 1);
    });

    test('setStatusFilter reloads with filter', () async {
      when(
        () => mockApi.listSkills(
          page: any(named: 'page'),
          pageSize: any(named: 'pageSize'),
          status: any(named: 'status'),
          isBuiltin: any(named: 'isBuiltin'),
          search: any(named: 'search'),
        ),
      ).thenAnswer((_) async => samplePaginatedResponse);

      container = ProviderContainer(
        overrides: [skillApiProvider.overrideWithValue(mockApi)],
      );

      // 等待初始加载完成
      await container.read(skillListProvider.future);

      // 应用过滤器
      await container
          .read(skillListProvider.notifier)
          .setStatusFilter('archived');

      final state = container.read(skillListProvider).value;
      expect(state?.statusFilter, 'archived');

      // 验证第二次调用带上了 status 参数
      verify(
        () => mockApi.listSkills(
          page: 1,
          pageSize: 20,
          status: 'archived',
          isBuiltin: null,
          search: null,
        ),
      ).called(1);
    });

    test('setIsBuiltinFilter reloads with builtin filter', () async {
      when(
        () => mockApi.listSkills(
          page: any(named: 'page'),
          pageSize: any(named: 'pageSize'),
          status: any(named: 'status'),
          isBuiltin: any(named: 'isBuiltin'),
          search: any(named: 'search'),
        ),
      ).thenAnswer((_) async => samplePaginatedResponse);

      container = ProviderContainer(
        overrides: [skillApiProvider.overrideWithValue(mockApi)],
      );

      await container.read(skillListProvider.future);

      await container.read(skillListProvider.notifier).setIsBuiltinFilter(true);

      final state = container.read(skillListProvider).value;
      expect(state?.isBuiltinFilter, true);
    });

    test('setSearchQuery reloads with search query', () async {
      when(
        () => mockApi.listSkills(
          page: any(named: 'page'),
          pageSize: any(named: 'pageSize'),
          status: any(named: 'status'),
          isBuiltin: any(named: 'isBuiltin'),
          search: any(named: 'search'),
        ),
      ).thenAnswer((_) async => samplePaginatedResponse);

      container = ProviderContainer(
        overrides: [skillApiProvider.overrideWithValue(mockApi)],
      );

      await container.read(skillListProvider.future);

      await container.read(skillListProvider.notifier).setSearchQuery('prompt');

      final state = container.read(skillListProvider).value;
      expect(state?.searchQuery, 'prompt');
    });

    test('setSearchQuery treats empty string as null', () async {
      when(
        () => mockApi.listSkills(
          page: any(named: 'page'),
          pageSize: any(named: 'pageSize'),
          status: any(named: 'status'),
          isBuiltin: any(named: 'isBuiltin'),
          search: any(named: 'search'),
        ),
      ).thenAnswer((_) async => emptyPaginatedResponse);

      container = ProviderContainer(
        overrides: [skillApiProvider.overrideWithValue(mockApi)],
      );

      await container.read(skillListProvider.future);

      await container.read(skillListProvider.notifier).setSearchQuery('');

      final state = container.read(skillListProvider).value;
      expect(state?.searchQuery, isNull);
    });

    test('loadMore appends next page', () async {
      final page1Response = PaginatedResponse<SkillDto>(
        data: [sampleSkill],
        meta: const PaginationMeta(
          total: 2,
          page: 1,
          pageSize: 1,
          totalPages: 2,
        ),
      );

      final skill2 = SkillDto.fromJson(const {
        'id': 'skill-2',
        'tenant_id': 'tenant-1',
        'name': 'Skill Two',
        'slug': 'skill-two',
        'is_builtin': true,
        'status': 'active',
        'file_count': 1,
        'total_size_bytes': 512,
        'version': 1,
        'created_at': '2026-01-02T00:00:00.000Z',
        'updated_at': '2026-01-02T00:00:00.000Z',
      });

      final page2Response = PaginatedResponse<SkillDto>(
        data: [skill2],
        meta: const PaginationMeta(
          total: 2,
          page: 2,
          pageSize: 1,
          totalPages: 2,
        ),
      );

      int callCount = 0;
      when(
        () => mockApi.listSkills(
          page: any(named: 'page'),
          pageSize: any(named: 'pageSize'),
          status: any(named: 'status'),
          isBuiltin: any(named: 'isBuiltin'),
          search: any(named: 'search'),
        ),
      ).thenAnswer((_) async {
        callCount++;
        return callCount == 1 ? page1Response : page2Response;
      });

      container = ProviderContainer(
        overrides: [skillApiProvider.overrideWithValue(mockApi)],
      );

      await container.read(skillListProvider.future);

      await container.read(skillListProvider.notifier).loadMore();

      final state = container.read(skillListProvider).value;
      expect(state?.skills.length, 2);
      expect(state?.skills[0].name, 'Test Skill');
      expect(state?.skills[1].name, 'Skill Two');
    });

    test('loadMore does nothing on last page', () async {
      when(
        () => mockApi.listSkills(
          page: any(named: 'page'),
          pageSize: any(named: 'pageSize'),
          status: any(named: 'status'),
          isBuiltin: any(named: 'isBuiltin'),
          search: any(named: 'search'),
        ),
      ).thenAnswer((_) async => samplePaginatedResponse);

      container = ProviderContainer(
        overrides: [skillApiProvider.overrideWithValue(mockApi)],
      );

      await container.read(skillListProvider.future);

      // page=1, totalPages=1 → already on last page
      await container.read(skillListProvider.notifier).loadMore();

      // 只有 build() 的初始调用
      verify(
        () => mockApi.listSkills(
          page: any(named: 'page'),
          pageSize: any(named: 'pageSize'),
          status: any(named: 'status'),
          isBuiltin: any(named: 'isBuiltin'),
          search: any(named: 'search'),
        ),
      ).called(1);
    });

    test('handles API error on build', () async {
      when(
        () => mockApi.listSkills(
          page: any(named: 'page'),
          pageSize: any(named: 'pageSize'),
          status: any(named: 'status'),
          isBuiltin: any(named: 'isBuiltin'),
          search: any(named: 'search'),
        ),
      ).thenThrow(Exception('Network error'));

      container = ProviderContainer(
        overrides: [skillApiProvider.overrideWithValue(mockApi)],
      );

      // 使用 listen + Completer 模式避免 Riverpod 3.x StateError
      final completer = Completer<void>();
      container.listen(skillListProvider, (prev, next) {
        if (next.hasError && !completer.isCompleted) {
          completer.complete();
        }
      });

      // 触发 build
      container.read(skillListProvider);

      await completer.future;

      final state = container.read(skillListProvider);
      expect(state.hasError, isTrue);
    });
  });

  group('skillDetailProvider', () {
    test('fetches skill by ID', () async {
      when(
        () => mockApi.getSkill('skill-1'),
      ).thenAnswer((_) async => sampleSkill);

      container = ProviderContainer(
        overrides: [skillApiProvider.overrideWithValue(mockApi)],
      );

      final skill = await container.read(skillDetailProvider('skill-1').future);

      expect(skill.id, 'skill-1');
      expect(skill.name, 'Test Skill');
      verify(() => mockApi.getSkill('skill-1')).called(1);
    });

    test('handles API error', () async {
      when(() => mockApi.getSkill('bad-id')).thenThrow(Exception('Not found'));

      container = ProviderContainer(
        overrides: [skillApiProvider.overrideWithValue(mockApi)],
      );

      final completer = Completer<void>();
      container.listen(skillDetailProvider('bad-id'), (prev, next) {
        if (next.hasError && !completer.isCompleted) {
          completer.complete();
        }
      });

      container.read(skillDetailProvider('bad-id'));

      await completer.future;

      final state = container.read(skillDetailProvider('bad-id'));
      expect(state.hasError, isTrue);
    });
  });
}
