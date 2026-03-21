/// 路由名常量
class RouteNames {
  RouteNames._();

  static const String dashboard = 'dashboard';
  static const String workflows = 'workflows';
  static const String settings = 'settings';
  static const String workflowDetail = 'workflowDetail';
  static const String executionMonitor = 'executionMonitor';
  static const String workflowLaunch = 'workflowLaunch';

  /// Agent 路由
  static const String agents = 'agents';
  static const String agentDetail = 'agentDetail';
  static const String agentConversation = 'agentConversation';

  static const String login = 'login';

  /// OAuth 回调深链路由 (agentloom://auth/callback)
  static const String authCallback = 'authCallback';

  /// MFA 路由
  static const String mfaVerify = 'mfaVerify';
  static const String mfaEnroll = 'mfaEnroll';

  /// 设置子路由
  static const String changePassword = 'changePassword';
  static const String mfaManage = 'mfaManage';
  static const String sessions = 'sessions';
}
