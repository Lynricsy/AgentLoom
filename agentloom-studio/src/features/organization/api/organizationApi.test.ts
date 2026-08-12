import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  fetchCurrentOrganization,
  fetchOrganizationMembers,
  inviteOrganizationMember,
  removeOrganizationMember,
  updateOrganizationMemberRole,
} from './organizationApi'
import type { Organization } from '../types'

const { getMock, postMock, putMock, deleteMock, toSnakeBodyMock } = vi.hoisted(
  () => ({
    getMock: vi.fn(),
    postMock: vi.fn(),
    putMock: vi.fn(),
    deleteMock: vi.fn(),
    toSnakeBodyMock: vi.fn((body: unknown) => body),
  }),
)

vi.mock('@/shared/api/client', () => ({
  apiClient: {
    get: getMock,
    post: postMock,
    put: putMock,
    delete: deleteMock,
  },
  toSnakeBody: toSnakeBodyMock,
}))

const organization: Organization = {
  id: 'org-1',
  name: 'Acme 智能体',
  slug: 'acme',
  description: null,
  ownerId: 'user-1',
  isActive: true,
  createdAt: '2026-01-05T03:00:00.000Z',
  updatedAt: '2026-02-05T03:00:00.000Z',
  memberCount: 2,
}

describe('organizationApi', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('按当前租户拉取组织，不在前端拼组织 id', async () => {
    getMock.mockReturnValue({
      json: vi.fn().mockResolvedValue({ data: organization }),
    })

    await expect(fetchCurrentOrganization()).resolves.toEqual(organization)
    expect(getMock).toHaveBeenCalledWith('organizations/current')
  })

  it('成员相关请求都落在服务端返回的真实组织 id 上', async () => {
    getMock.mockReturnValue({ json: vi.fn().mockResolvedValue({ data: [] }) })
    postMock.mockReturnValue({
      json: vi.fn().mockResolvedValue({ data: { id: 'inv-1' } }),
    })
    putMock.mockReturnValue({
      json: vi.fn().mockResolvedValue({ data: { userId: 'user-2' } }),
    })

    await fetchOrganizationMembers(organization.id)
    await inviteOrganizationMember(organization.id, {
      email: 'dev@acme.dev',
      role: 'creator',
    })
    await updateOrganizationMemberRole(organization.id, 'user-2', 'admin')
    await removeOrganizationMember(organization.id, 'user-2')

    expect(getMock).toHaveBeenCalledWith('organizations/org-1/members')
    expect(postMock).toHaveBeenCalledWith('organizations/org-1/invitations', {
      json: { email: 'dev@acme.dev', role: 'creator' },
    })
    expect(putMock).toHaveBeenCalledWith(
      'organizations/org-1/members/user-2/role',
      { json: { role: 'admin' } },
    )
    expect(deleteMock).toHaveBeenCalledWith('organizations/org-1/members/user-2')
  })
})
