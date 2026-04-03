import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../../../shared/providers/secure_storage_provider.dart';
import '../models/auth_tokens.dart';

/// 安全存储 key 常量
class TokenStorageKeys {
  TokenStorageKeys._();

  static const accessToken = 'agentloom_access_token';
  static const refreshToken = 'agentloom_refresh_token';
  static const tokenExpiresIn = 'agentloom_token_expires_in';
}

/// Token 安全存储封装
class TokenStorage {
  TokenStorage(this._storage);

  final FlutterSecureStorage _storage;

  /// 保存全部 tokens
  Future<void> saveTokens(AuthTokens tokens) async {
    await Future.wait([
      _storage.write(
        key: TokenStorageKeys.accessToken,
        value: tokens.accessToken,
      ),
      _storage.write(
        key: TokenStorageKeys.refreshToken,
        value: tokens.refreshToken,
      ),
      _storage.write(
        key: TokenStorageKeys.tokenExpiresIn,
        value: tokens.expiresIn.toString(),
      ),
    ]);
  }

  /// 读取 tokens，任一缺失返回 null
  Future<AuthTokens?> readTokens() async {
    List<String?> results;
    try {
      results = await Future.wait([
        _storage.read(key: TokenStorageKeys.accessToken),
        _storage.read(key: TokenStorageKeys.refreshToken),
        _storage.read(key: TokenStorageKeys.tokenExpiresIn),
      ]);
    } catch (_) {
      return null;
    }

    final accessToken = results[0];
    final refreshToken = results[1];
    final expiresInStr = results[2];

    if (accessToken == null || refreshToken == null || expiresInStr == null) {
      return null;
    }

    return AuthTokens(
      accessToken: accessToken,
      refreshToken: refreshToken,
      expiresIn: int.tryParse(expiresInStr) ?? 0,
    );
  }

  /// 检查是否有 stored tokens
  Future<bool> hasTokens() async {
    return (await readTokens()) != null;
  }

  /// 清除所有 tokens
  Future<void> clearTokens() async {
    for (final key in const <String>[
      TokenStorageKeys.accessToken,
      TokenStorageKeys.refreshToken,
      TokenStorageKeys.tokenExpiresIn,
    ]) {
      try {
        await _storage.delete(key: key);
      } catch (_) {
        // Web 端本地加密状态损坏时，删除也可能失败；这里按“尽力清理”处理。
      }
    }
  }
}

/// TokenStorage Provider
final tokenStorageProvider = Provider<TokenStorage>((ref) {
  return TokenStorage(ref.watch(secureStorageProvider));
});
