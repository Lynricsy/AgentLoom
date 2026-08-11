import { memo, type ReactNode, useEffect, useMemo, useState } from 'react'
import { cva } from 'class-variance-authority'
import {
  AlertTriangle,
  Bot,
  FileSearch2,
  Loader2,
  Lock,
  MessageSquare,
  ShieldCheck,
  Unlock,
  Wrench,
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'

import { cn } from '@/shared/lib/utils'
import { Badge } from '@/shared/ui/badge'
import { Button } from '@/shared/ui/button'
import { useDecryptContent } from '@/features/tenant-key/hooks/useDecryptContent'
import type { EncryptedPayload } from '@/features/tenant-key/types'

import { useEvidenceDetail, useEvidenceVerify } from '../api/evidenceQueries'
import type {
  EvidenceChainNode,
  EvidenceEncryptionMetadata,
  EvidenceRecord,
  EvidenceSourceType,
  PhysicalLocation,
} from '../types'
import { LocationLink } from './LocationLink'
import { SourceStatusBadge } from './SourceStatusBadge'

interface EvidenceCardProps {
  node: EvidenceChainNode
  isSelected?: boolean
  isHighlighted?: boolean
  onSelect?: (evidenceId: string) => void
  className?: string
}

/** 证据来源 → 图标/标签/领域类别色 */
const sourceTypeConfig: Record<
  EvidenceSourceType,
  { icon: typeof FileSearch2; label: string; color: string }
> = {
  rag_retrieval: { icon: FileSearch2, label: 'RAG 检索', color: 'text-node-knowledge' },
  agent_decision: { icon: Bot, label: 'Agent 决策', color: 'text-node-agent' },
  tool_output: { icon: Wrench, label: '工具输出', color: 'text-node-tool' },
  user_input: { icon: MessageSquare, label: '用户输入', color: 'text-info' },
  intervention: { icon: ShieldCheck, label: '人工介入', color: 'text-warning' },
  node_error: { icon: AlertTriangle, label: '节点错误', color: 'text-error' },
}

const cardVariants = cva('rounded-card border p-3 transition-colors', {
  variants: {
    selected: {
      true: 'border-primary bg-primary/5 shadow-node',
      false: 'border-border bg-surface hover:border-border-hover hover:bg-surface-elevated',
    },
  },
  defaultVariants: {
    selected: false,
  },
})

function stringifyValue(value: unknown): string {
  if (typeof value === 'string') {
    return value
  }

  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function formatTimestamp(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }

  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

function formatInterventionAction(action: string): string {
  switch (action) {
    case 'approve':
      return '批准'
    case 'modify':
      return '修改'
    case 'reject':
      return '拒绝'
    default:
      return action
  }
}

function formatErrorTypeLabel(type?: string): string {
  if (!type) {
    return '节点错误'
  }

  const segment = type.split('/').filter(Boolean).at(-1) ?? type
  return segment
}

function renderTypeMismatchPreview(
  typeMismatch:
    | {
        sourcePortId?: string
        targetPortId?: string
        sourceType: string
        targetType: string
        sourceNodeId: string
        targetNodeId: string
      }
    | undefined,
): ReactNode {
  if (!typeMismatch) {
    return null
  }

  return (
    <div className="rounded-lg border border-warning/20 bg-warning/10 p-2 text-[11px] text-warning">
      <p className="font-medium uppercase tracking-wide">类型不匹配</p>
      <p className="mt-1 break-words">
        {typeMismatch.sourceType} → {typeMismatch.targetType}
      </p>
      <p className="mt-1 break-all text-muted">
        {typeMismatch.sourceNodeId}
        {typeMismatch.sourcePortId ? ` · ${typeMismatch.sourcePortId}` : ''}
        {' → '}
        {typeMismatch.targetNodeId}
        {typeMismatch.targetPortId ? ` · ${typeMismatch.targetPortId}` : ''}
      </p>
    </div>
  )
}

function renderJsonPreview(value: unknown): ReactNode {
  return (
    <pre className="max-h-40 overflow-auto rounded-lg bg-surface-elevated p-2 text-[11px] leading-relaxed text-muted">
      {stringifyValue(value)}
    </pre>
  )
}

function renderStructuredDetails(
  record: EvidenceRecord | undefined,
  node: EvidenceChainNode,
): ReactNode {
  if (!record) {
    return null
  }

  if ('encryptedPacket' in record.packet) {
    return null
  }

  switch (record.packet.sourceType) {
    case 'rag_retrieval': {
      const { semanticLocation, retrievedContent } = record.packet
      return (
        <div className="mt-3 space-y-2 text-xs text-muted">
          <div className="rounded-lg bg-info/5 p-2">
            <p className="text-[10px] font-medium uppercase tracking-wide text-info">
              语义上下文
            </p>
            <p className="mt-1 line-clamp-3 leading-relaxed">
              {semanticLocation.context || node.packetSummary?.excerpt || retrievedContent}
            </p>
          </div>
          {retrievedContent && retrievedContent !== node.packetSummary?.excerpt && (
            <details className="rounded-lg border border-border px-2 py-1.5">
              <summary className="cursor-pointer text-[11px] font-medium text-foreground">
                查看缓存片段
              </summary>
              <p className="mt-2 whitespace-pre-wrap break-words leading-relaxed text-muted">
                {retrievedContent}
              </p>
            </details>
          )}
        </div>
      )
    }

    case 'agent_decision': {
      const { agentDecision } = record.packet
      const confidence =
        agentDecision.confidence != null && Number.isFinite(agentDecision.confidence)
          ? Math.max(0, Math.min(1, agentDecision.confidence)) * 100
          : null

      return (
        <div className="mt-3 space-y-3 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="var(--color-node-agent)" size="sm">
              {agentDecision.selectedAction}
            </Badge>
            <Badge variant="secondary" size="sm">
              {agentDecision.autonomyMode}
            </Badge>
            <span className="text-muted">{agentDecision.agentName}</span>
          </div>

          {confidence != null && (
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[11px] text-muted">
                <span>置信度</span>
                <span>{agentDecision.confidence}</span>
              </div>
              <span className="flex h-1.5 w-full overflow-hidden rounded-full bg-surface-elevated">
                <span className="h-full bg-node-agent" style={{ width: `${confidence}%` }} />
              </span>
            </div>
          )}

          <div className="space-y-1">
            <p className="text-[11px] font-medium text-foreground">推理</p>
            <div className="rounded-lg bg-surface-elevated p-2 text-muted">
              <ReactMarkdown
                skipHtml
                components={{
                  p: ({ children }) => <p className="whitespace-pre-wrap leading-relaxed">{children}</p>,
                  code: ({ children }) => (
                    <code className="rounded bg-surface px-1 py-0.5 font-mono text-[11px] text-foreground">
                      {children}
                    </code>
                  ),
                }}
              >
                {agentDecision.reasoning}
              </ReactMarkdown>
            </div>
          </div>

          {!!agentDecision.alternatives?.length && (
            <details className="rounded-lg border border-border px-2 py-1.5">
              <summary className="cursor-pointer text-[11px] font-medium text-foreground">
                备选方案（{agentDecision.alternatives.length}）
              </summary>
              <ul className="mt-2 space-y-1 text-muted">
                {agentDecision.alternatives.map((alternative) => (
                  <li key={alternative} className="leading-relaxed">
                    • {alternative}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )
    }

    case 'tool_output': {
      const { toolOutput } = record.packet
      const lastTransition = toolOutput.transitions?.[toolOutput.transitions.length - 1]

      return (
        <div className="mt-3 space-y-2 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="var(--color-node-tool)" size="sm">
              {toolOutput.toolName}
            </Badge>
            {lastTransition && (
              <Badge variant="secondary" size="sm">
                {lastTransition.to}
              </Badge>
            )}
          </div>
          {renderJsonPreview(toolOutput.toolOutput)}
        </div>
      )
    }

    case 'user_input':
      return (
        <div className="mt-3 space-y-2 text-xs text-muted">
          {renderJsonPreview(record.packet.userInput.content)}
          <p>记录时间：{formatTimestamp(record.createdAt)}</p>
        </div>
      )

    case 'intervention': {
      const { intervention } = record.packet

      return (
        <div className="mt-3 space-y-2 text-xs text-muted">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="warning" size="sm">
              {formatInterventionAction(intervention.action)}
            </Badge>
            <span>处理人：{intervention.resolvedBy}</span>
          </div>
          {intervention.feedback && (
            <p className="whitespace-pre-wrap break-words leading-relaxed">{intervention.feedback}</p>
          )}
          {intervention.modifiedContent != null && renderJsonPreview(intervention.modifiedContent)}
          <p>处理时间：{formatTimestamp(intervention.resolvedAt)}</p>
        </div>
      )
    }

    case 'node_error': {
      const { nodeError } = record.packet

      return (
        <div className="mt-3 space-y-2 text-xs text-muted">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="error" size="sm">
              {formatErrorTypeLabel(nodeError.errorType ?? nodeError.errorTitle)}
            </Badge>
            <span>节点：{nodeError.nodeId}</span>
          </div>
          <p className="whitespace-pre-wrap break-words leading-relaxed text-foreground">
            {nodeError.errorMessage}
          </p>
          {nodeError.errorDetail && (
            <p className="whitespace-pre-wrap break-words leading-relaxed">{nodeError.errorDetail}</p>
          )}
          {renderTypeMismatchPreview(nodeError.typeMismatch)}
        </div>
      )
    }

    default:
      return null
  }
}

function resolveEncryptionMetadata(
  record: EvidenceRecord | undefined,
  node: EvidenceChainNode,
): EvidenceEncryptionMetadata | null {
  return record?.encryptionMetadata ?? node.encryptionMetadata ?? null
}

function resolveEncryptedPayload(record: EvidenceRecord | undefined): EncryptedPayload | undefined {
  if (!record) {
    return undefined
  }

  if ('encryptedPacket' in record.packet) {
    return record.packet.encryptedPacket
  }

  return record.encryptionMetadata?.encryptedPayload
}

export const EvidenceCard = memo(function EvidenceCard({
  node,
  isSelected = false,
  isHighlighted = false,
  onSelect,
  className,
}: EvidenceCardProps) {
  const [snapshotVisible, setSnapshotVisible] = useState(false)
  const [decryptedContent, setDecryptedContent] = useState<string | null>(null)
  const config = sourceTypeConfig[node.sourceType] ?? sourceTypeConfig.rag_retrieval
  const Icon = config.icon

  const detailQuery = useEvidenceDetail(node.executionId, node.evidenceId)
  const detailRecord = detailQuery.data?.data
  const verifyQuery = useEvidenceVerify(node.executionId, node.evidenceId)
  const refetchVerify = verifyQuery.refetch

  const isEncrypted =
    detailRecord?.isEncrypted === true ||
    node.isEncrypted === true ||
    detailRecord?.encryptionMetadata?.isEncrypted === true ||
    node.encryptionMetadata?.isEncrypted === true

  const { decrypt, isDecrypting, error: decryptError, clearError } = useDecryptContent()

  async function handleDecrypt() {
    clearError()
    const encMeta = resolveEncryptionMetadata(detailRecord, node)
    if (!encMeta?.keyFingerprint) return

    const encryptedPayload = resolveEncryptedPayload(detailRecord)
    if (!encryptedPayload) {
      const syntheticPayload: EncryptedPayload = {
        ciphertext: '',
        encryptedSessionKey: '',
        iv: '',
        authTag: '',
        aad: '',
        keyFingerprint: encMeta.keyFingerprint,
        algorithm: encMeta.algorithm ?? 'RSA-OAEP-4096+AES-256-GCM',
      }
      const result = await decrypt(syntheticPayload)
      if (result) setDecryptedContent(result)
      return
    }

    const result = await decrypt(encryptedPayload)
    if (result) setDecryptedContent(result)
  }

  useEffect(() => {
    if (node.sourceType !== 'rag_retrieval' || node.sourceUnavailable) {
      return
    }

    void refetchVerify()
  }, [node.sourceType, node.sourceUnavailable, refetchVerify])

  const metadata = useMemo(
    () => (node.packetSummary?.metadata ?? {}) as Record<string, unknown>,
    [node.packetSummary?.metadata],
  )

  const relevanceScore =
    metadata.relevanceScore != null ? Number(metadata.relevanceScore) : null
  const relevancePercent =
    relevanceScore != null && Number.isFinite(relevanceScore)
      ? Math.max(0, Math.min(1, relevanceScore)) * 100
      : null
  const location =
    detailRecord?.packet.sourceType === 'rag_retrieval'
      ? (detailRecord.packet.physicalLocation as PhysicalLocation)
      : null
  const verifyResult = verifyQuery.data?.data
  const verifyError =
    verifyQuery.error instanceof Error ? verifyQuery.error.message : undefined

  return (
    <article
      className={cn(
        cardVariants({ selected: isSelected }),
        isHighlighted && 'border-primary ring-2 ring-primary/30',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div
          className="min-w-0 flex-1 text-left"
        >
          <button
            type="button"
            className="w-full text-left"
            onClick={() => onSelect?.(node.evidenceId)}
            data-testid={`evidence-card-${node.evidenceId}`}
          >
            <div className="flex min-w-0 items-center gap-2">
              <Icon className={cn('h-4 w-4 shrink-0', config.color)} />
              <span className="truncate text-xs font-medium text-foreground">
                {node.packetSummary?.title ?? config.label}
              </span>
              {isEncrypted && !decryptedContent && (
                <Lock className="h-3 w-3 shrink-0 text-warning" />
              )}
              {isEncrypted && decryptedContent && (
                <Unlock className="h-3 w-3 shrink-0 text-success" />
              )}
            </div>

            {node.packetSummary?.excerpt && (
              <p className="mt-2 line-clamp-2 break-words text-xs leading-relaxed text-muted">
                {node.packetSummary.excerpt}
              </p>
            )}

            {detailQuery.isLoading && (
              <p className="mt-3 text-[11px] text-muted">加载证据详情中…</p>
            )}

            {detailQuery.error && (
              <p className="mt-3 text-[11px] text-error">证据详情加载失败</p>
            )}
          </button>

          {isEncrypted && !decryptedContent && (
            <div className="mt-3 rounded-lg border border-warning/20 bg-warning/10 p-3">
              <p className="text-[11px] font-medium text-warning">🔒 已加密</p>
              {decryptError ? (
                <p className="mt-1 break-words text-[11px] text-error">{decryptError}</p>
              ) : (
                <p className="mt-1 text-[11px] text-muted">
                  此证据内容已加密保护
                </p>
              )}
              <Button
                variant="outline"
                size="sm"
                className="mt-2 h-7 text-[11px]"
                onClick={(e) => {
                  e.stopPropagation()
                  void handleDecrypt()
                }}
                disabled={isDecrypting}
              >
                {isDecrypting ? (
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                ) : (
                  <Unlock className="mr-1 h-3 w-3" />
                )}
                解密
              </Button>
            </div>
          )}

          {isEncrypted && decryptedContent && (
            <div className="mt-3 space-y-1">
              <p className="text-[10px] font-medium text-success">已解密内容</p>
              <pre className="max-h-40 overflow-auto rounded-lg bg-surface-elevated p-2 text-[11px] leading-relaxed text-muted">
                {decryptedContent}
              </pre>
            </div>
          )}

          {!isEncrypted && renderStructuredDetails(detailRecord, node)}
        </div>

        <SourceStatusBadge
          hashValid={node.hashValid}
          sourceModified={node.sourceModified}
          sourceUnavailable={node.sourceUnavailable}
          unavailableReason={node.unavailableReason}
          createdAt={node.createdAt}
          originalHash={node.contentHash}
          currentHash={verifyResult?.currentHash}
          isVerifying={verifyQuery.isFetching}
          verifyError={verifyError}
          hasOriginalSnapshot={!!node.originalSnapshot}
          snapshotVisible={snapshotVisible}
          onToggleOriginalSnapshot={
            node.originalSnapshot
              ? () => setSnapshotVisible((current) => !current)
              : undefined
          }
        />
      </div>

      {snapshotVisible && node.originalSnapshot && (
        <div className="mt-3 rounded-lg border border-warning/20 bg-warning/10 p-3">
          <p className="text-[11px] font-medium text-warning">缓存快照</p>
          <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words text-[11px] leading-relaxed text-muted">
            {node.originalSnapshot}
          </pre>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2 text-[10px] text-muted">
        {node.sourceType === 'rag_retrieval' && (
          <>
            {metadata.relevanceScore != null && (
              <span>相关度 {String(metadata.relevanceScore)}</span>
            )}
            {relevancePercent != null && (
              <span className="flex h-1.5 w-24 overflow-hidden rounded-full bg-surface-elevated">
                <span className="h-full bg-primary" style={{ width: `${relevancePercent}%` }} />
              </span>
            )}
            {location && (
              <LocationLink
                evidenceId={node.evidenceId}
                location={location}
                disabled={node.sourceUnavailable}
              />
            )}
          </>
        )}

        {node.depth > 0 && <span className="ml-auto">深度 {node.depth}</span>}
      </div>
    </article>
  )
})
