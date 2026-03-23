import 'package:agentloom_mobile/features/skills/api/skill_api.dart';
import 'package:agentloom_mobile/features/skills/models/skill_dto.dart';
import 'package:agentloom_mobile/shared/models/paginated_response.dart';
import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';

import '../../helpers/test_helpers.dart';

void main() {
  late MockDio mockDio;
  late SkillApi api;

  setUp(() {
    mockDio = MockDio();
    api = SkillApi(mockDio);
  });

  Response<dynamic> okResponse(Map<String, dynamic> data) {
    return Response(
      data: data,
      statusCode: 200,
      requestOptions: RequestOptions(),
    );
  }

  Map<String, dynamic> sampleSkillJson({String id = 'skill-1'}) => {
    'id': id,
    'tenant_id': 'tenant-1',
    'name': 'Test Skill',
    'slug': 'test-skill',
    'description': 'A test skill',
    'content': '# Skill Content',
    'is_builtin': false,
    'status': 'active',
    'file_count': 3,
    'total_size_bytes': 1024,
    'version': 1,
    'created_at': '2026-01-01T00:00:00.000Z',
    'updated_at': '2026-01-01T00:00:00.000Z',
  };

  Map<String, dynamic> paginatedResponse(List<Map<String, dynamic>> items) => {
    'data': items,
    'meta': {
      'total': items.length,
      'page': 1,
      'page_size': 20,
      'total_pages': 1,
    },
  };

  group('SkillApi', () {
    group('listSkills', () {
      test('sends correct default parameters', () async {
        when(
          () => mockDio.get(
            any(),
            queryParameters: any(named: 'queryParameters'),
          ),
        ).thenAnswer((_) async => okResponse(paginatedResponse([])));

        await api.listSkills();

        verify(
          () => mockDio.get(
            '/api/v1/skills',
            queryParameters: {'page': 1, 'pageSize': 20},
          ),
        ).called(1);
      });

      test('sends all optional filter parameters', () async {
        when(
          () => mockDio.get(
            any(),
            queryParameters: any(named: 'queryParameters'),
          ),
        ).thenAnswer((_) async => okResponse(paginatedResponse([])));

        await api.listSkills(
          page: 2,
          pageSize: 10,
          status: 'active',
          isBuiltin: true,
          search: 'test',
        );

        verify(
          () => mockDio.get(
            '/api/v1/skills',
            queryParameters: {
              'page': 2,
              'pageSize': 10,
              'status': 'active',
              'isBuiltin': true,
              'search': 'test',
            },
          ),
        ).called(1);
      });

      test('omits null/empty optional params', () async {
        when(
          () => mockDio.get(
            any(),
            queryParameters: any(named: 'queryParameters'),
          ),
        ).thenAnswer((_) async => okResponse(paginatedResponse([])));

        await api.listSkills();

        final captured =
            verify(
                  () => mockDio.get(
                    any(),
                    queryParameters: captureAny(named: 'queryParameters'),
                  ),
                ).captured.single
                as Map<String, dynamic>;

        expect(captured.containsKey('status'), isFalse);
        expect(captured.containsKey('isBuiltin'), isFalse);
        expect(captured.containsKey('search'), isFalse);
      });

      test('parses paginated response correctly', () async {
        when(
          () => mockDio.get(
            any(),
            queryParameters: any(named: 'queryParameters'),
          ),
        ).thenAnswer(
          (_) async => okResponse(paginatedResponse([sampleSkillJson()])),
        );

        final result = await api.listSkills();

        expect(result, isA<PaginatedResponse<SkillDto>>());
        expect(result.data.length, 1);
        expect(result.data.first.name, 'Test Skill');
        expect(result.meta.total, 1);
      });

      test('throws on DioException', () async {
        when(
          () => mockDio.get(
            any(),
            queryParameters: any(named: 'queryParameters'),
          ),
        ).thenThrow(
          DioException(
            requestOptions: RequestOptions(),
            type: DioExceptionType.connectionError,
          ),
        );

        expect(() => api.listSkills(), throwsA(isA<DioException>()));
      });
    });

    group('getSkill', () {
      test('sends GET to correct path and parses response', () async {
        when(() => mockDio.get(any())).thenAnswer(
          (_) async => okResponse({'data': sampleSkillJson(id: 'skill-42')}),
        );

        final result = await api.getSkill('skill-42');

        verify(() => mockDio.get('/api/v1/skills/skill-42')).called(1);
        expect(result, isA<SkillDto>());
        expect(result.id, 'skill-42');
      });

      test('throws on DioException', () async {
        when(() => mockDio.get(any())).thenThrow(
          DioException(
            requestOptions: RequestOptions(),
            response: Response(
              statusCode: 404,
              requestOptions: RequestOptions(),
            ),
          ),
        );

        expect(() => api.getSkill('not-found'), throwsA(isA<DioException>()));
      });
    });

    group('createSkill', () {
      test('sends POST with correct body and parses response', () async {
        when(
          () => mockDio.post(any(), data: any(named: 'data')),
        ).thenAnswer((_) async => okResponse({'data': sampleSkillJson()}));

        final result = await api.createSkill(
          name: 'New Skill',
          description: 'desc',
          content: 'content body',
        );

        verify(
          () => mockDio.post(
            '/api/v1/skills',
            data: {
              'name': 'New Skill',
              'description': 'desc',
              'content': 'content body',
            },
          ),
        ).called(1);
        expect(result, isA<SkillDto>());
      });

      test('omits null optional fields from body', () async {
        when(
          () => mockDio.post(any(), data: any(named: 'data')),
        ).thenAnswer((_) async => okResponse({'data': sampleSkillJson()}));

        await api.createSkill(name: 'Minimal');

        final captured =
            verify(
                  () => mockDio.post(any(), data: captureAny(named: 'data')),
                ).captured.single
                as Map<String, dynamic>;

        expect(captured, {'name': 'Minimal'});
        expect(captured.containsKey('description'), isFalse);
        expect(captured.containsKey('content'), isFalse);
      });
    });

    group('updateSkill', () {
      test('sends PUT with occVersion and optional fields', () async {
        when(
          () => mockDio.put(any(), data: any(named: 'data')),
        ).thenAnswer((_) async => okResponse({'data': sampleSkillJson()}));

        final result = await api.updateSkill(
          'skill-1',
          name: 'Updated',
          description: 'new desc',
          occVersion: 2,
        );

        verify(
          () => mockDio.put(
            '/api/v1/skills/skill-1',
            data: {
              'occVersion': 2,
              'name': 'Updated',
              'description': 'new desc',
            },
          ),
        ).called(1);
        expect(result, isA<SkillDto>());
      });

      test('sends only occVersion when no optional fields', () async {
        when(
          () => mockDio.put(any(), data: any(named: 'data')),
        ).thenAnswer((_) async => okResponse({'data': sampleSkillJson()}));

        await api.updateSkill('skill-1', occVersion: 1);

        final captured =
            verify(
                  () => mockDio.put(any(), data: captureAny(named: 'data')),
                ).captured.single
                as Map<String, dynamic>;

        expect(captured, {'occVersion': 1});
      });
    });

    group('deleteSkill', () {
      test('sends DELETE to correct path', () async {
        when(() => mockDio.delete(any())).thenAnswer(
          (_) async => Response(
            data: null,
            statusCode: 204,
            requestOptions: RequestOptions(),
          ),
        );

        await api.deleteSkill('skill-99');

        verify(() => mockDio.delete('/api/v1/skills/skill-99')).called(1);
      });
    });

    group('archiveSkill', () {
      test('sends PATCH to archive endpoint and parses response', () async {
        when(
          () => mockDio.patch(any()),
        ).thenAnswer((_) async => okResponse({'data': sampleSkillJson()}));

        final result = await api.archiveSkill('skill-1');

        verify(() => mockDio.patch('/api/v1/skills/skill-1/archive')).called(1);
        expect(result, isA<SkillDto>());
      });
    });
  });
}
