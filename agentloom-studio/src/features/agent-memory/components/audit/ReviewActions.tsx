import { useState, useCallback } from 'react';
import { Button } from '@/shared/ui/button';
import { useReview, useRollback } from './api';
import type { AuditLogEntry, ReviewAction } from './types';

interface ReviewActionsProps {
  instanceId: string;
  entry: AuditLogEntry | null;
}

export function ReviewActions({ instanceId, entry }: ReviewActionsProps) {
  const [confirmAction, setConfirmAction] = useState<
    ReviewAction | 'rollback' | null
  >(null);

  const reviewMutation = useReview(instanceId);
  const rollbackMutation = useRollback(instanceId);

  const handleReview = useCallback(
    (action: ReviewAction) => {
      if (!entry) return;
      reviewMutation.mutate(
        {
          nodeId: entry.nodeId,
          versionId: entry.versionId,
          action,
        },
        { onSettled: () => setConfirmAction(null) },
      );
    },
    [entry, reviewMutation],
  );

  const handleRollback = useCallback(() => {
    if (!entry) return;
    rollbackMutation.mutate(
      {
        instanceId,
        nodeId: entry.nodeId,
        versionId: entry.versionId,
      },
      { onSettled: () => setConfirmAction(null) },
    );
  }, [entry, instanceId, rollbackMutation]);

  if (!entry) {
    return (
      <div
        className="py-4 text-center text-sm text-gray-400"
        data-testid="review-actions-empty"
      >
        选择一条记录以执行审核操作
      </div>
    );
  }

  const isPending = entry.reviewStatus === 'pending';
  const isProcessing = reviewMutation.isPending || rollbackMutation.isPending;

  return (
    <div data-testid="review-actions">
      {/* 确认对话框 */}
      {confirmAction && (
        <div
          className="mb-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
          data-testid="confirm-dialog"
        >
          <p className="mb-3 text-sm text-gray-700">
            {confirmAction === 'approve' && '确认批准此版本变更？'}
            {confirmAction === 'reject' && '确认拒绝此版本变更？拒绝后可回滚到上一版本。'}
            {confirmAction === 'rollback' &&
              `确认回滚节点 "${entry.nodeName}" 到版本 ${entry.versionId.slice(0, 8)}？此操作不可撤销。`}
          </p>
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() => {
                if (confirmAction === 'rollback') {
                  handleRollback();
                } else {
                  handleReview(confirmAction);
                }
              }}
              disabled={isProcessing}
            >
              {isProcessing ? '处理中...' : '确认'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConfirmAction(null)}
              disabled={isProcessing}
            >
              取消
            </Button>
          </div>
        </div>
      )}

      {/* 操作按钮 */}
      <div className="flex flex-wrap gap-2">
        {isPending && (
          <>
            <Button
              size="sm"
              onClick={() => setConfirmAction('approve')}
              disabled={isProcessing}
              data-testid="approve-btn"
            >
              批准
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="text-red-600 hover:text-red-700"
              onClick={() => setConfirmAction('reject')}
              disabled={isProcessing}
              data-testid="reject-btn"
            >
              拒绝
            </Button>
          </>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="text-amber-600 hover:text-amber-700"
          onClick={() => setConfirmAction('rollback')}
          disabled={isProcessing}
          data-testid="rollback-btn"
        >
          回滚
        </Button>
      </div>

      {/* 当前状态 */}
      <div className="mt-3 text-xs text-gray-400">
        当前状态:{' '}
        {entry.reviewStatus === 'pending' && '🟡 待审核'}
        {entry.reviewStatus === 'approved' && '✅ 已批准'}
        {entry.reviewStatus === 'rejected' && '❌ 已拒绝'}
      </div>
    </div>
  );
}
