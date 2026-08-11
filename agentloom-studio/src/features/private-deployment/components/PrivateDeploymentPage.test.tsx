import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PrivateDeploymentSettings } from '../types/privateDeployment'
import { PrivateDeploymentPage } from './PrivateDeploymentPage'

const mocks = vi.hoisted(() => ({
  useAuthToken: vi.fn(),
  usePrivateDeployment: vi.fn(),
  useUpdatePrivateDeploymentSettings: vi.fn(),
  updateMutate: vi.fn(),
  notify: vi.fn(),
}))

vi.mock('@/features/execution', () => ({
  useAuthToken: mocks.useAuthToken,
}))

vi.mock('../hooks/usePrivateDeployment', () => ({
  usePrivateDeployment: mocks.usePrivateDeployment,
  useUpdatePrivateDeploymentSettings: mocks.useUpdatePrivateDeploymentSettings,
}))

vi.mock('@/shared/ui/toast', () => ({
  useToast: () => ({ notify: mocks.notify }),
}))

function createToken(payload: Record<string, unknown>) {
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url')
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')

  return `${header}.${body}.signature`
}

const ownerToken = createToken({ tenantRole: 'owner', organizationId: 'org-1', tenantId: 'tenant-1' })
const adminToken = createToken({ tenantRole: 'admin', organizationId: 'org-1', tenantId: 'tenant-1' })
const creatorToken = createToken({ tenantRole: 'creator', organizationId: 'org-1' })
const ownerWithoutOrgToken = createToken({ tenantRole: 'owner' })

const smtpSecretRef = 'private-deployment://organizations/org-1/smtp/password'
const llmSecretRef = 'private-deployment://organizations/org-1/llm-proxy/api-key'

const baseSettings: PrivateDeploymentSettings = {
  organizationId: 'org-1',
  tenantId: 'tenant-1',
  deploymentMode: 'private' as const,
  version: 3,
  createdBy: 'owner@ling.plus',
  updatedBy: 'admin@ling.plus',
  createdAt: '2026-03-18T01:00:00.000Z',
  updatedAt: '2026-03-18T02:00:00.000Z',
  smtp: {
    host: 'smtp.internal.ling.plus',
    port: 587,
    username: 'mailer',
    passwordSecretRef: smtpSecretRef,
    fromEmail: 'noreply@ling.plus',
    useTls: true,
  },
  llmProxy: {
    mode: 'private_cloud' as const,
    baseUrl: 'https://llm.internal.ling.plus/v1',
    apiKeySecretRef: llmSecretRef,
    allowExternalEgress: false,
  },
  certificates: {
    source: 'secretRef' as const,
    tlsSecretRef: 'k8s://secrets/ling-plus/tls',
    expiresAt: '2026-12-31T00:00:00.000Z',
  },
  license: {
    status: 'valid' as const,
    fingerprint: 'ABCD-1234',
    expiresAt: '2026-12-31T00:00:00.000Z',
    lastVerifiedAt: '2026-03-18T02:30:00.000Z',
  },
}

function mockMutationSuccess(
  nextSettings: PrivateDeploymentSettings = { ...baseSettings, version: baseSettings.version + 1 },
) {
  mocks.updateMutate.mockImplementation((_input, options) => {
    options?.onSuccess?.(nextSettings)
  })
}

describe('PrivateDeploymentPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    mocks.useAuthToken.mockReturnValue(ownerToken)
    mocks.usePrivateDeployment.mockReturnValue({
      data: baseSettings,
      isLoading: false,
      isError: false,
      error: null,
    })
    mocks.useUpdatePrivateDeploymentSettings.mockReturnValue({
      mutate: mocks.updateMutate,
      isPending: false,
    })
  })

  it('shows a forbidden state for direct non-owner/admin access', () => {
    mocks.useAuthToken.mockReturnValue(creatorToken)

    render(<PrivateDeploymentPage />)

    expect(screen.getByTestId('private-deployment-forbidden')).toBeInTheDocument()
    expect(screen.getByText('无权访问私有部署设置')).toBeInTheDocument()
    expect(screen.getByText(/当前租户角色为 creator/)).toBeInTheDocument()
  })

  it('shows a missing-organization state when the owner token has no org claim', () => {
    mocks.useAuthToken.mockReturnValue(ownerWithoutOrgToken)

    render(<PrivateDeploymentPage />)

    expect(screen.getByTestId('private-deployment-missing-org')).toBeInTheDocument()
    expect(screen.getByText('无法识别当前组织')).toBeInTheDocument()
  })

  it('renders content for admin users without exposing managed secret refs', () => {
    mocks.useAuthToken.mockReturnValue(adminToken)

    render(<PrivateDeploymentPage />)

    const metadataSection = screen.getByTestId('private-deployment-metadata')

    expect(screen.getByTestId('private-deployment-page')).toBeInTheDocument()
    expect(metadataSection).toHaveTextContent('当前部署模式')
    expect(metadataSection).toHaveTextContent('相关操作')
    expect(
      within(metadataSection).getByRole('link', {
        name: '资源治理设置',
      }),
    ).toHaveAttribute('href', '/settings/resource-quotas')
    expect(
      within(metadataSection).getByRole('link', {
        name: '运行监控',
      }),
    ).toHaveAttribute('href', '/settings/monitoring')
    expect(
      within(metadataSection).getByRole('link', {
        name: '审计日志',
      }),
    ).toHaveAttribute('href', '/settings/audit-logs')
    expect(screen.getByTestId('private-deployment-smtp-form')).toHaveTextContent('SMTP')
    expect(screen.getByTestId('private-deployment-llm-proxy-form')).toHaveTextContent('LLM 代理')
    expect(screen.queryByText(smtpSecretRef)).not.toBeInTheDocument()
    expect(screen.queryByText(llmSecretRef)).not.toBeInTheDocument()
    expect(screen.getAllByText('已配置受管密钥')).toHaveLength(2)
    expect(screen.getByLabelText('SMTP 密码（仅替换时填写）')).toHaveValue('')
    expect(screen.getByLabelText('代理 API Key（仅替换时填写）')).toHaveValue('')
  })

  it('updates smtp settings through the section mutation flow', async () => {
    const user = userEvent.setup()

    mockMutationSuccess({
      ...baseSettings,
      version: 4,
    })

    render(<PrivateDeploymentPage />)

    const passwordInput = screen.getByLabelText('SMTP 密码（仅替换时填写）')
    await user.type(passwordInput, 'rotated-smtp-secret')
    await user.click(screen.getByRole('button', { name: '保存 SMTP 设置' }))

    expect(mocks.updateMutate).toHaveBeenCalledWith(
      {
        smtp: {
          host: 'smtp.internal.ling.plus',
          port: 587,
          username: 'mailer',
          password: 'rotated-smtp-secret',
          fromEmail: 'noreply@ling.plus',
          useTls: true,
        },
      },
      expect.objectContaining({
        onSuccess: expect.any(Function),
        onError: expect.any(Function),
      }),
    )

    await waitFor(() => {
      expect(passwordInput).toHaveValue('')
    })
    expect(mocks.notify).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'SMTP 设置已更新',
        variant: 'success',
      }),
    )
  })

  it('updates llm proxy settings through the section mutation flow', async () => {
    const user = userEvent.setup()

    mockMutationSuccess({
      ...baseSettings,
      version: 4,
      llmProxy: {
        mode: 'enterprise_proxy',
        baseUrl: 'https://enterprise-gateway.ling.plus/openai/v1',
        apiKeySecretRef: llmSecretRef,
        allowExternalEgress: true,
      },
    })

    render(<PrivateDeploymentPage />)

    expect(screen.queryByText(llmSecretRef)).not.toBeInTheDocument()

    await user.click(screen.getByLabelText('代理模式'))
    await user.click(await screen.findByRole('option', { name: 'enterprise_proxy（企业代理）' }))

    const baseUrlInput = screen.getByLabelText('代理基地址')
    await user.clear(baseUrlInput)
    await user.type(baseUrlInput, 'https://enterprise-gateway.ling.plus/openai/v1')

    const allowExternalEgressToggle = screen.getByLabelText('允许外部网络出口')
    await user.click(allowExternalEgressToggle)

    const apiKeyInput = screen.getByLabelText('代理 API Key（仅替换时填写）')
    await user.type(apiKeyInput, 'rotated-llm-api-key')
    await user.click(screen.getByRole('button', { name: '保存 LLM 代理设置' }))

    expect(mocks.updateMutate).toHaveBeenCalledWith(
      {
        llmProxy: {
          mode: 'enterprise_proxy',
          baseUrl: 'https://enterprise-gateway.ling.plus/openai/v1',
          allowExternalEgress: true,
          apiKey: 'rotated-llm-api-key',
        },
      },
      expect.objectContaining({
        onSuccess: expect.any(Function),
        onError: expect.any(Function),
      }),
    )

    await waitFor(() => {
      expect(apiKeyInput).toHaveValue('')
    })
    expect(screen.queryByText(llmSecretRef)).not.toBeInTheDocument()
    expect(mocks.notify).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'LLM 代理设置已更新',
        variant: 'success',
      }),
    )
  })

  it('updates certificate settings through the section mutation flow', async () => {
    const user = userEvent.setup()

    mockMutationSuccess({
      ...baseSettings,
      version: 4,
      certificates: {
        source: 'secretRef',
        tlsSecretRef: 'k8s://secrets/ling-plus/tls-rotated',
        expiresAt: '2026-12-31T00:00:00.000Z',
      },
    })

    render(<PrivateDeploymentPage />)

    const tlsSecretRefInput = screen.getByLabelText('TLS Secret 引用')
    await user.clear(tlsSecretRefInput)
    await user.type(tlsSecretRefInput, 'k8s://secrets/ling-plus/tls-rotated')
    await user.click(screen.getByRole('button', { name: '保存证书设置' }))

    expect(mocks.updateMutate).toHaveBeenCalledWith(
      {
        certificates: {
          source: 'secretRef',
          tlsSecretRef: 'k8s://secrets/ling-plus/tls-rotated',
          expiresAt: '2026-12-31T00:00:00.000Z',
        },
      },
      expect.objectContaining({
        onSuccess: expect.any(Function),
        onError: expect.any(Function),
      }),
    )

    expect(mocks.notify).toHaveBeenCalledWith(
      expect.objectContaining({
        title: '证书设置已更新',
        variant: 'success',
      }),
    )
  })

  it('updates license settings through the section mutation flow', async () => {
    const user = userEvent.setup()

    mockMutationSuccess({
      ...baseSettings,
      version: 4,
      license: {
        status: 'valid',
        fingerprint: 'EFGH-5678',
        expiresAt: '2027-12-31T00:00:00.000Z',
        lastVerifiedAt: '2026-03-18T03:30:00.000Z',
      },
    })

    render(<PrivateDeploymentPage />)

    const licenseKeyInput = screen.getByLabelText('新的 License Key')
    await user.type(licenseKeyInput, 'offline-license-key-v2')
    await user.click(screen.getByRole('button', { name: '保存 License 设置' }))

    expect(mocks.updateMutate).toHaveBeenCalledWith(
      {
        license: {
          licenseKey: 'offline-license-key-v2',
        },
      },
      expect.objectContaining({
        onSuccess: expect.any(Function),
        onError: expect.any(Function),
      }),
    )

    await waitFor(() => {
      expect(licenseKeyInput).toHaveValue('')
    })
    expect(mocks.notify).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'License 设置已更新',
        variant: 'success',
      }),
    )
  })
})
