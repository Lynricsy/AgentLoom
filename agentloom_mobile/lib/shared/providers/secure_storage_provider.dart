import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// FlutterSecureStorage 实例 Provider
///
/// 既供认证 token 使用，也供运行时连接配置持久化使用。
final secureStorageProvider = Provider<FlutterSecureStorage>((ref) {
  return const FlutterSecureStorage();
});
