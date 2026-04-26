import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  createGeneratedApp,
  disableGeneratedAppPublicShare,
  enableGeneratedAppPublicShare,
  getGeneratedApp,
  getGeneratedAppPublicRuntime,
  listGeneratedApps,
  recordGeneratedAppGateResults,
  regenerateGeneratedAppPublicShare,
} from './generatedAppApi'
import type { GeneratedApp, GeneratedAppGateResult } from '../types'

const { deleteMock, getMock, patchMock, postMock } = vi.hoisted(() => ({
  deleteMock: vi.fn(),
  getMock: vi.fn(),
  patchMock: vi.fn(),
  postMock: vi.fn(),
}))

vi.mock('@/shared/api/client', () => ({
  apiClient: {
    delete: deleteMock,
    get: getMock,
    patch: patchMock,
    post: postMock,
  },
}))

function mockKyJson<T>(value: T) {
  return { json: vi.fn().mockResolvedValue(value) }
}

function makeGeneratedApp(overrides: Partial<GeneratedApp> = {}): GeneratedApp {
  return {
    id: 'app-1',
    tenantId: 'tenant-1',
    prompt: '自动化中医问诊系统',
    appName: '自动化中医问诊系统',
    description: '围绕需求生成的 AppSpec 初稿。',
    status: 'preview_ready',
    appSpec: {
      version: 1,
      appName: '自动化中医问诊系统',
      summary: '围绕需求生成的 AppSpec 初稿。',
      userGoal: '自动化中医问诊系统',
      actors: ['创建者', '终端用户'],
      coreRequirements: [{ id: 'req-1', text: '自动化中医问诊系统' }],
      pages: [
        {
          id: 'page-public-runtime',
          name: '公开运行页',
          purpose: '让终端用户使用业务应用。',
        },
      ],
      dataPolicy: {
        publicSubmissionsPersisted: true,
        creatorCanDeleteSubmissions: true,
        endUserLoginRequired: false,
      },
      nonGoals: [],
      acceptanceScenarios: [],
      traceability: [],
    },
    generationPlan: null,
    gateResults: [],
    readiness: {
      state: 'preview',
      canCreatePublicShare: false,
      blockingIssueCount: 7,
      warningCount: 0,
      summary: '阻断门禁尚未全部通过。',
      blockers: [],
      warnings: [],
    },
    preview: {
      previewUrl: null,
      sourceArtifactUrl: null,
      testReportUrl: null,
    },
    agentDefinitionId: null,
    workflowDefinitionId: null,
    pluginIds: [],
    publicShareEnabled: false,
    publicShareToken: null,
    publicShareUrl: null,
    publicShareCreatedAt: null,
    publicShareDisabledAt: null,
    publicViewCount: 0,
    createdAt: '2026-04-25T00:00:00.000Z',
    updatedAt: '2026-04-25T01:00:00.000Z',
    ...overrides,
  }
}

function makeGateResult(
  overrides: Partial<GeneratedAppGateResult> = {},
): GeneratedAppGateResult {
  return {
    gateId: 'gate-0',
    order: 0,
    name: '需求规格门禁',
    blocking: true,
    status: 'passed',
    summary: 'AppSpec 完整。',
    evidence: [
      {
        id: 'app-spec-draft',
        label: 'AppSpec 初稿',
        kind: 'app_spec',
        url: null,
        summary: '已生成结构化规格。',
      },
    ],
    updatedAt: '2026-04-25T00:00:00.000Z',
    ...overrides,
  }
}

describe('generatedAppApi', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('creates a generated app through POST /generated-apps with a camelCase body', async () => {
    const app = makeGeneratedApp()
    postMock.mockReturnValue(mockKyJson({ data: app }))

    const result = await createGeneratedApp({ prompt: ' 自动化中医问诊系统 ' })

    expect(postMock).toHaveBeenCalledWith('generated-apps', {
      json: { prompt: ' 自动化中医问诊系统 ' },
    })
    expect(result).toEqual(app)
  })

  it('lists generated apps with camelCase query params expected by the backend DTO', async () => {
    const response = {
      data: [makeGeneratedApp()],
      meta: { page: 2, pageSize: 10, total: 11, totalPages: 2 },
    }
    getMock.mockReturnValue(mockKyJson(response))

    const result = await listGeneratedApps({
      page: 2,
      pageSize: 10,
      status: 'trial_ready',
    })

    expect(getMock).toHaveBeenCalledWith('generated-apps', {
      searchParams: {
        page: '2',
        pageSize: '10',
        status: 'trial_ready',
      },
    })
    expect(result).toEqual(response)
  })

  it('fetches generated app details from GET /generated-apps/:appId', async () => {
    const app = makeGeneratedApp({ id: 'app-detail' })
    getMock.mockReturnValue(mockKyJson({ data: app }))

    const result = await getGeneratedApp('app-detail')

    expect(getMock).toHaveBeenCalledWith('generated-apps/app-detail')
    expect(result).toEqual(app)
  })

  it('fetches public runtime surface without returning creator-only fields', async () => {
    const publicResponse = {
      token: 'public-token',
      appId: 'app-public',
      title: '自动化中医问诊系统',
      description: '逐步问诊并生成分析报告。',
      dataUseNotice: '提交内容会被保存并提供给应用创建者查看。',
      appSpec: {
        version: 1,
        appName: '自动化中医问诊系统',
        summary: '按患者回答动态提问。',
        userGoal: '完成问诊并查看分析报告。',
        actors: ['终端用户'],
        pages: [
          {
            id: 'page-public-runtime',
            name: '问诊运行页',
            purpose: '让终端用户回答问诊问题。',
            sourceArtifactUrl: 'https://internal.example.test/source.zip',
          },
        ],
        coreRequirements: [{ id: 'req-private', text: '内部需求' }],
      },
      runtimeSurface: {
        kind: 'generated-app',
        previewUrl: 'https://preview.example.test/apps/1',
        sourceArtifactUrl: 'https://internal.example.test/source.zip',
      },
      createdAt: '2026-04-25T00:00:00.000Z',
      gateResults: [makeGateResult()],
      readiness: makeGeneratedApp().readiness,
      generationPlan: { steps: ['内部计划'] },
      sourceArtifactUrl: 'https://internal.example.test/source.zip',
      testReportUrl: 'https://internal.example.test/report.json',
      pluginIds: ['plugin-private'],
      publicShareToken: 'public-token',
    }
    getMock.mockReturnValue(mockKyJson({ data: publicResponse }))

    const result = await getGeneratedAppPublicRuntime('public-token')

    expect(getMock).toHaveBeenCalledWith('generated-apps/public/public-token')
    expect(result).toEqual({
      token: 'public-token',
      appId: 'app-public',
      title: '自动化中医问诊系统',
      description: '逐步问诊并生成分析报告。',
      dataUseNotice: '提交内容会被保存并提供给应用创建者查看。',
      appSpec: {
        version: 1,
        appName: '自动化中医问诊系统',
        summary: '按患者回答动态提问。',
        userGoal: '完成问诊并查看分析报告。',
        actors: ['终端用户'],
        pages: [
          {
            id: 'page-public-runtime',
            name: '问诊运行页',
            purpose: '让终端用户回答问诊问题。',
          },
        ],
      },
      runtimeSurface: {
        kind: 'generated-app',
        previewUrl: 'https://preview.example.test/apps/1',
      },
      createdAt: '2026-04-25T00:00:00.000Z',
    })
    expect(result).not.toHaveProperty('gateResults')
    expect(result).not.toHaveProperty('readiness')
    expect(result).not.toHaveProperty('generationPlan')
    expect(result).not.toHaveProperty('sourceArtifactUrl')
    expect(result).not.toHaveProperty('testReportUrl')
    expect(result).not.toHaveProperty('pluginIds')
    expect(result).not.toHaveProperty('publicShareToken')
    expect(result.appSpec).not.toHaveProperty('coreRequirements')
    expect(result.runtimeSurface).not.toHaveProperty('sourceArtifactUrl')
  })

  it('records gate results without snake-casing the backend camelCase contract', async () => {
    const app = makeGeneratedApp({ id: 'app-gates' })
    const payload = {
      gateResults: [makeGateResult()],
      generationPlan: { steps: ['生成源码', '运行测试'] },
      preview: {
        previewUrl: 'https://example.com/preview',
        sourceArtifactUrl: 'https://example.com/source.zip',
        testReportUrl: 'https://example.com/report',
      },
    }
    patchMock.mockReturnValue(mockKyJson({ data: app }))

    const result = await recordGeneratedAppGateResults('app-gates', payload)

    expect(patchMock).toHaveBeenCalledWith('generated-apps/app-gates/gates', {
      json: payload,
    })
    expect(result).toEqual(app)
  })

  it('uses the generated-app public share management endpoints', async () => {
    const app = makeGeneratedApp({
      id: 'app-share',
      readiness: {
        state: 'publish_candidate',
        canCreatePublicShare: true,
        blockingIssueCount: 0,
        warningCount: 0,
        summary: '全部门禁通过。',
        blockers: [],
        warnings: [],
      },
    })
    postMock.mockReturnValue(mockKyJson({ data: app }))
    deleteMock.mockReturnValue(mockKyJson({ data: app }))

    await enableGeneratedAppPublicShare('app-share')
    await regenerateGeneratedAppPublicShare('app-share')
    await disableGeneratedAppPublicShare('app-share')

    expect(postMock).toHaveBeenNthCalledWith(
      1,
      'generated-apps/app-share/public-share',
    )
    expect(postMock).toHaveBeenNthCalledWith(
      2,
      'generated-apps/app-share/public-share/regenerate',
    )
    expect(deleteMock).toHaveBeenCalledWith(
      'generated-apps/app-share/public-share',
    )
  })
})
