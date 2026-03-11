import 'package:agentloom_mobile/shared/models/paginated_response.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('PaginationMeta', () {
    test('fromJson 正确解析 snake_case JSON', () {
      final json = {'total': 42, 'page': 2, 'page_size': 20, 'total_pages': 3};

      final meta = PaginationMeta.fromJson(json);

      expect(meta.total, 42);
      expect(meta.page, 2);
      expect(meta.pageSize, 20);
      expect(meta.totalPages, 3);
    });

    test('toJson 输出 snake_case JSON', () {
      const meta = PaginationMeta(
        total: 10,
        page: 1,
        pageSize: 5,
        totalPages: 2,
      );

      final json = meta.toJson();

      expect(json['total'], 10);
      expect(json['page'], 1);
      expect(json['page_size'], 5);
      expect(json['total_pages'], 2);
    });
  });

  group('PaginatedResponse', () {
    test('fromJson 正确解析泛型列表', () {
      final json = {
        'data': [
          {'id': '1', 'name': 'Item 1'},
          {'id': '2', 'name': 'Item 2'},
        ],
        'meta': {'total': 2, 'page': 1, 'page_size': 20, 'total_pages': 1},
      };

      final response = PaginatedResponse<Map<String, dynamic>>.fromJson(
        json,
        (obj) => obj as Map<String, dynamic>,
      );

      expect(response.data.length, 2);
      expect(response.data[0]['id'], '1');
      expect(response.data[1]['name'], 'Item 2');
      expect(response.meta.total, 2);
      expect(response.meta.page, 1);
    });

    test('toJson 正确序列化泛型列表', () {
      const response = PaginatedResponse<Map<String, String>>(
        data: [
          {'id': '1'},
        ],
        meta: PaginationMeta(total: 1, page: 1, pageSize: 20, totalPages: 1),
      );

      final json = response.toJson((item) => item);

      expect((json['data'] as List).length, 1);
      expect(json['meta'], isA<Map<String, dynamic>>());
    });

    test('空数据列表处理正确', () {
      final json = {
        'data': <dynamic>[],
        'meta': {'total': 0, 'page': 1, 'page_size': 20, 'total_pages': 0},
      };

      final response = PaginatedResponse<Map<String, dynamic>>.fromJson(
        json,
        (obj) => obj as Map<String, dynamic>,
      );

      expect(response.data, isEmpty);
      expect(response.meta.total, 0);
      expect(response.meta.totalPages, 0);
    });
  });
}
