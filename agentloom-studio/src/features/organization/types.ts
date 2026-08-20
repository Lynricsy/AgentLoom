import type {
  InviteMemberDto,
  InviteMemberDtoRoleEnum,
  UpdateMemberRoleDto,
} from '@agentloom/api-client'

/** 组织角色，与服务端 `org_role` 枚举一一对应 */
export const ORGANIZATION_ROLES = [
  'owner',
  'admin',
  'creator',
  'operator',
  'viewer',
] as const

export type OrganizationRole = InviteMemberDtoRoleEnum

/** 角色中文名，列表与下拉共用，避免两处各写一份 */
export const ORGANIZATION_ROLE_LABELS: Record<OrganizationRole, string> = {
  owner: '所有者',
  admin: '管理员',
  creator: '创建者',
  operator: '操作员',
  viewer: '访客',
}

/** 邀请下拉里的角色说明，帮助邀请人选对权限档位 */
export const ORGANIZATION_ROLE_DESCRIPTIONS: Record<OrganizationRole, string> = {
  owner: '完全控制，包含计费与组织删除',
  admin: '管理成员、资源与平台设置',
  creator: '创建并编辑工作流、Agent 与资源',
  operator: '执行工作流并处理人工介入',
  viewer: '只读浏览',
}

export interface Organization {
  id: string
  name: string
  slug: string
  description: string | null
  ownerId: string
  isActive: boolean
  createdAt: string
  updatedAt: string
  /** 服务端在详情响应里附加的成员数 */
  memberCount: number
}

export interface OrganizationMember {
  userId: string
  email: string
  /** 用户未填写昵称时为 null */
  displayName: string | null
  role: OrganizationRole
  /** 加入组织的时间（服务端取自 organization_members.joined_at） */
  createdAt: string
}

export type InvitationStatus = 'pending' | 'accepted' | 'expired' | 'cancelled'

export interface OrganizationInvitation {
  id: string
  organizationId: string
  email: string
  role: OrganizationRole
  token: string
  expiresAt: string
  status: InvitationStatus
  createdAt: string
}

/**
 * POST /organizations/:id/invitations 请求体（生成模型）。
 * `role` 在 server 侧带 `.default('viewer')`，客户端可省略；
 * 原手写类型标成必需，属于过度收紧。
 */
export type InviteMemberInput = InviteMemberDto

/** PATCH /organizations/:id/members/:userId 请求体（生成模型 + 路径参数） */
export type UpdateMemberRoleInput = UpdateMemberRoleDto & {
  userId: string
}

/** 接受邀请后服务端回传加入的组织与成员记录 */
export interface AcceptInvitationResult {
  organization: Organization
  member: {
    id: string
    organizationId: string
    userId: string
    role: OrganizationRole
    joinedAt: string
  }
}
