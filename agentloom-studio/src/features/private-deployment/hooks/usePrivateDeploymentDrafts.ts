import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { useToast } from '@/shared/ui/toast'
import { useUpdatePrivateDeploymentSettings } from './usePrivateDeployment'
import {
  buildCertificatesPayload,
  buildLlmProxyPayload,
  buildSmtpPayload,
  createCertificatesDraft,
  createLicenseDraft,
  createLlmProxyDraft,
  createSmtpDraft,
  getSyncKey,
  type CertificatesDraft,
  type LicenseDraft,
  type LlmProxyDraft,
  type SmtpDraft,
} from '../lib/privateDeploymentPayloads'
import type {
  PrivateDeploymentSettings,
  UpdatePrivateDeploymentSettingsInput,
} from '../types/privateDeployment'

interface SubmitFeedback {
  successTitle: string
  successDescription: string
  errorTitle: string
  errorDescription: string
}

export interface UsePrivateDeploymentDraftsOptions {
  organizationId: string
  settings: PrivateDeploymentSettings | undefined
}

export interface PrivateDeploymentDrafts {
  smtpDraft: SmtpDraft
  setSmtpDraft: Dispatch<SetStateAction<SmtpDraft>>
  llmProxyDraft: LlmProxyDraft
  setLlmProxyDraft: Dispatch<SetStateAction<LlmProxyDraft>>
  certificatesDraft: CertificatesDraft
  setCertificatesDraft: Dispatch<SetStateAction<CertificatesDraft>>
  licenseDraft: LicenseDraft
  setLicenseDraft: Dispatch<SetStateAction<LicenseDraft>>
  isSubmitting: boolean
  submitSmtp: () => void
  clearSmtpSecret: () => void
  submitLlmProxy: () => void
  clearLlmProxySecret: () => void
  submitCertificates: () => void
  submitLicense: () => void
}

/**
 * 私有部署四组配置的本地草稿与分组提交。
 * 服务端返回新版本后立即重同步草稿，secret 一律不回显。
 */
export function usePrivateDeploymentDrafts({
  organizationId,
  settings,
}: UsePrivateDeploymentDraftsOptions): PrivateDeploymentDrafts {
  const { notify } = useToast()
  const updateMutation = useUpdatePrivateDeploymentSettings(organizationId)

  const [smtpDraft, setSmtpDraft] = useState<SmtpDraft>({
    host: '',
    port: '',
    username: '',
    password: '',
    fromEmail: '',
    useTls: false,
  })
  const [llmProxyDraft, setLlmProxyDraft] = useState<LlmProxyDraft>({
    mode: 'direct',
    baseUrl: '',
    apiKey: '',
    allowExternalEgress: false,
  })
  const [certificatesDraft, setCertificatesDraft] = useState<CertificatesDraft>({
    source: 'ingress-managed',
    tlsSecretRef: '',
    expiresAt: '',
    certificatePem: '',
    privateKeyPem: '',
  })
  const [licenseDraft, setLicenseDraft] = useState<LicenseDraft>(createLicenseDraft())
  const lastSyncRef = useRef<string | null>(null)

  useEffect(() => {
    if (!settings) {
      return
    }

    const nextSyncKey = getSyncKey(settings)

    if (lastSyncRef.current === nextSyncKey) {
      return
    }

    lastSyncRef.current = nextSyncKey
    setSmtpDraft(createSmtpDraft(settings))
    setLlmProxyDraft(createLlmProxyDraft(settings))
    setCertificatesDraft(createCertificatesDraft(settings))
    setLicenseDraft(createLicenseDraft())
  }, [settings])

  function syncDrafts(nextSettings: PrivateDeploymentSettings) {
    lastSyncRef.current = getSyncKey(nextSettings)
    setSmtpDraft(createSmtpDraft(nextSettings))
    setLlmProxyDraft(createLlmProxyDraft(nextSettings))
    setCertificatesDraft(createCertificatesDraft(nextSettings))
    setLicenseDraft(createLicenseDraft())
  }

  function submitUpdate(
    payload: UpdatePrivateDeploymentSettingsInput,
    feedback: SubmitFeedback,
  ) {
    updateMutation.mutate(payload, {
      onSuccess: (nextSettings) => {
        syncDrafts(nextSettings)
        notify({
          title: feedback.successTitle,
          description: feedback.successDescription,
          variant: 'success',
        })
      },
      onError: () => {
        notify({
          title: feedback.errorTitle,
          description: feedback.errorDescription,
          variant: 'error',
        })
      },
    })
  }

  function notifyValidationError(
    title: string,
    fallback: string,
    validationError: unknown,
  ) {
    notify({
      title,
      description:
        validationError instanceof Error ? validationError.message : fallback,
      variant: 'warning',
    })
  }

  function submitSmtp() {
    try {
      submitUpdate(
        { smtp: buildSmtpPayload(smtpDraft) },
        {
          successTitle: 'SMTP 设置已更新',
          successDescription: '新的 SMTP 配置已保存，受管密码不会在页面中回显。',
          errorTitle: '更新 SMTP 设置失败',
          errorDescription: '请检查 SMTP 主机、端口和发件配置后重试。',
        },
      )
    } catch (validationError) {
      notifyValidationError(
        'SMTP 配置不合法',
        '请检查 SMTP 表单后重试。',
        validationError,
      )
    }
  }

  function clearSmtpSecret() {
    try {
      submitUpdate(
        { smtp: buildSmtpPayload(smtpDraft, true) },
        {
          successTitle: 'SMTP 密码已清除',
          successDescription: '当前 SMTP 受管密码已移除。',
          errorTitle: '清除 SMTP 密码失败',
          errorDescription: '请稍后重试，或检查当前组织权限。',
        },
      )
    } catch (validationError) {
      notifyValidationError(
        'SMTP 配置不合法',
        '请检查 SMTP 表单后重试。',
        validationError,
      )
    }
  }

  function submitLlmProxy() {
    try {
      submitUpdate(
        { llmProxy: buildLlmProxyPayload(llmProxyDraft) },
        {
          successTitle: 'LLM 代理设置已更新',
          successDescription: '代理模式、地址和受管 API Key 状态已同步。',
          errorTitle: '更新 LLM 代理设置失败',
          errorDescription: '请检查代理模式、基地址和出口开关后重试。',
        },
      )
    } catch (validationError) {
      notifyValidationError(
        'LLM 代理配置不合法',
        '请检查 LLM 代理表单后重试。',
        validationError,
      )
    }
  }

  function clearLlmProxySecret() {
    try {
      submitUpdate(
        { llmProxy: buildLlmProxyPayload(llmProxyDraft, true) },
        {
          successTitle: '代理 API Key 已清除',
          successDescription: '当前 LLM 代理的受管 API Key 已移除。',
          errorTitle: '清除代理 API Key 失败',
          errorDescription: '请稍后重试，或检查当前组织权限。',
        },
      )
    } catch (validationError) {
      notifyValidationError(
        'LLM 代理配置不合法',
        '请检查 LLM 代理表单后重试。',
        validationError,
      )
    }
  }

  function submitCertificates() {
    try {
      submitUpdate(
        { certificates: buildCertificatesPayload(certificatesDraft) },
        {
          successTitle: '证书设置已更新',
          successDescription: '证书来源、引用和过期时间信息已同步。',
          errorTitle: '更新证书设置失败',
          errorDescription: '请检查证书来源与对应字段后重试。',
        },
      )
    } catch (validationError) {
      notifyValidationError(
        '证书配置不合法',
        '请检查证书表单后重试。',
        validationError,
      )
    }
  }

  function submitLicense() {
    const licenseKey = licenseDraft.licenseKey.trim()

    if (!licenseKey) {
      notify({
        title: '缺少 License Key',
        description: '请输入新的 License Key 后再提交。',
        variant: 'warning',
      })
      return
    }

    submitUpdate(
      {
        license: {
          licenseKey,
        },
      },
      {
        successTitle: 'License 设置已更新',
        successDescription: '新的 License Key 已提交，页面仅展示校验结果与元数据。',
        errorTitle: '更新 License 设置失败',
        errorDescription: '请确认 License Key 内容正确后重试。',
      },
    )
  }

  return {
    smtpDraft,
    setSmtpDraft,
    llmProxyDraft,
    setLlmProxyDraft,
    certificatesDraft,
    setCertificatesDraft,
    licenseDraft,
    setLicenseDraft,
    isSubmitting: updateMutation.isPending,
    submitSmtp,
    clearSmtpSecret,
    submitLlmProxy,
    clearLlmProxySecret,
    submitCertificates,
    submitLicense,
  }
}
