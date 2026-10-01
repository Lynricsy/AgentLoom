import { useAuthToken } from '@/features/auth'
import {
  getInterventionPolicyRoleFromToken,
  type InterventionRole,
} from '@/features/intervention-policy'

import type { AgentApiKeyAccess } from '../types'

/**
 * 对齐 `agent-definitions/:agentId/api-keys` 的服务端 @Roles：
 * - POST / DELETE：owner、admin
 * - GET：owner、admin、creator
 * 前端判定只用于 UI 门控，真正的闸门在服务端 RolesGuard。
 */
export function getAgentApiKeyAccess(
  role: InterventionRole | null,
): AgentApiKeyAccess {
  if (role === 'owner' || role === 'admin') {
    return 'manage'
  }

  if (role === 'creator') {
    return 'read'
  }

  return 'none'
}

export function useAgentApiKeyAccess(): AgentApiKeyAccess {
  return getAgentApiKeyAccess(getInterventionPolicyRoleFromToken(useAuthToken()))
}
