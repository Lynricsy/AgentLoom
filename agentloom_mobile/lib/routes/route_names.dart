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

  /// Skill 路由
  static const String skills = 'skills';
  static const String skillDetail = 'skillDetail';
  static const String skillEdit = 'skillEdit';

  /// Memory 路由
  static const String memoryList = 'memoryList';
  static const String memoryDetail = 'memoryDetail';
  static const String memoryNode = 'memoryNode';
  static const String memoryAudit = 'memoryAudit';
  static const String memoryAuditDetail = 'memoryAuditDetail';

  /// 设置子路由
  static const String changePassword = 'changePassword';
  static const String mfaManage = 'mfaManage';
  static const String sessions = 'sessions';
}
