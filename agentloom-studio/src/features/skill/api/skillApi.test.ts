import { beforeEach, describe, expect, it, vi } from 'vitest'
import type * as ApiClientModule from '@/shared/api/client'

/**
 * /skills 的单个资源、文件列表与上传结果统一为 `{ data }` 包络（D-192），
 * 调用方拿到的必须是解包后的对象，而不是带 data 的整个响应体。
 */
const { getMock, postMock, putMock, patchMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  postMock: vi.fn(),
  putMock: vi.fn(),
  patchMock: vi.fn(),
}))

vi.mock('@/shared/api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof ApiClientModule>()
  return {
    ...actual,
    apiClient: { get: getMock, post: postMock, put: putMock, patch: patchMock },
  }
})

import {
  archiveSkill,
  createSkill,
  fetchSkillById,
  fetchSkillFiles,
  updateSkill,
  uploadSkillFile,
} from './skillApi'

const skill = { id: 'skill-1', name: 'Skill', version: 2 }
const respond = (data: unknown) => ({ json: () => Promise.resolve({ data }) })

describe('skillApi 响应包络', () => {
  beforeEach(() => {
    getMock.mockReset()
    postMock.mockReset()
    putMock.mockReset()
    patchMock.mockReset()
  })

  it('详情、创建、更新、归档返回解包后的 Skill', async () => {
    getMock.mockReturnValue(respond(skill))
    postMock.mockReturnValue(respond(skill))
    putMock.mockReturnValue(respond(skill))
    patchMock.mockReturnValue(respond({ ...skill, status: 'archived' }))

    await expect(fetchSkillById('skill-1')).resolves.toEqual(skill)
    await expect(createSkill({ name: 'Skill' })).resolves.toEqual(skill)
    await expect(
      updateSkill('skill-1', { name: 'Skill', occVersion: 2 }),
    ).resolves.toEqual(skill)
    await expect(archiveSkill('skill-1')).resolves.toEqual({
      ...skill,
      status: 'archived',
    })
    expect(getMock).toHaveBeenCalledWith('skills/skill-1')
    expect(patchMock).toHaveBeenCalledWith('skills/skill-1/archive')
  })

  it('文件列表与上传结果返回解包后的 { name, size }', async () => {
    const files = [{ name: 'SKILL.md', size: 12 }]
    getMock.mockReturnValue(respond(files))
    postMock.mockReturnValue(respond({ name: 'notes.txt', size: 5 }))

    await expect(fetchSkillFiles('skill-1')).resolves.toEqual(files)
    await expect(
      uploadSkillFile('skill-1', new File(['hello'], 'notes.txt')),
    ).resolves.toEqual({ name: 'notes.txt', size: 5 })
    expect(getMock).toHaveBeenCalledWith('skills/skill-1/files')
  })
})
