import { useState, useCallback, useRef } from 'react';
import { Check, RotateCcw, X } from 'lucide-react';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
  AlertDialogFooter,
} from '@/shared/ui/alert-dialog';
import { REVIEW_STATUS_META } from './AuditTimeline';
import { useReview, useRollback } from './api';
import type { AuditLogEntry, ReviewAction } from './types';

interface ReviewActionsProps {
  instanceId: string;
  entry: AuditLogEntry | null;
}

type ConfirmKind = ReviewAction | 'rollback';

const CONFIRM_TITLES: Record<ConfirmKind, string> = {
  approve: '批准版本变更',
  reject: '拒绝版本变更',
  rollback: '回滚节点版本',
};

export function ReviewActions({ instanceId, entry }: ReviewActionsProps) {
  const [confirmAction, setConfirmAction] = useState<ConfirmKind | null>(null);
  // 退场动画期间 confirmAction 已置空，标题/描述读最近一次动作，避免文案闪空
  const lastActionRef = useRef<ConfirmKind | null>(null);
  if (confirmAction) lastActionRef.current = confirmAction;
  const shownAction = confirmAction ?? lastActionRef.current;

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
      <p
        className="py-4 text-center text-sm text-muted-foreground"
        data-testid="review-actions-empty"
      >
        选择一条记录以执行审核操作
      </p>
    );
  }

  const isPending = entry.reviewStatus === 'pending';
  const isProcessing = reviewMutation.isPending || rollbackMutation.isPending;
  const statusMeta = REVIEW_STATUS_META[entry.reviewStatus];

  return (
    <div data-testid="review-actions">
      <div className="flex flex-wrap items-center gap-2">
        {isPending && (
          <>
            <Button
              size="sm"
              onClick={() => setConfirmAction('approve')}
              disabled={isProcessing}
              data-testid="approve-btn"
            >
              <Check />
              批准
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="text-error hover:border-error/40 hover:bg-error/10 hover:text-error"
              onClick={() => setConfirmAction('reject')}
              disabled={isProcessing}
              data-testid="reject-btn"
            >
              <X />
              拒绝
            </Button>
          </>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="text-warning hover:bg-warning/10 hover:text-warning"
          onClick={() => setConfirmAction('rollback')}
          disabled={isProcessing}
          data-testid="rollback-btn"
        >
          <RotateCcw />
          回滚
        </Button>

        <span className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
          当前状态
          <Badge size="sm" tone={statusMeta.tone}>
            {statusMeta.label}
          </Badge>
        </span>
      </div>

      <AlertDialog
        open={confirmAction !== null}
        onOpenChange={(next) => {
          if (!next) setConfirmAction(null);
        }}
      >
        <AlertDialogContent data-testid="confirm-dialog">
          <AlertDialogTitle>
            {shownAction ? CONFIRM_TITLES[shownAction] : ''}
          </AlertDialogTitle>
          <AlertDialogDescription className="break-words">
            {shownAction === 'approve' && '确认批准此版本变更？'}
            {shownAction === 'reject' &&
              '确认拒绝此版本变更？拒绝后可回滚到上一版本。'}
            {shownAction === 'rollback' &&
              `确认回滚节点「${entry?.nodeName ?? ''}」到版本 ${entry?.versionId.slice(0, 8) ?? ''}？此操作不可撤销。`}
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isProcessing}>取消</AlertDialogCancel>
            <AlertDialogAction
              variant={shownAction === 'approve' ? 'default' : 'destructive'}
              disabled={isProcessing}
              onClick={(e) => {
                e.preventDefault();
                if (confirmAction === 'rollback') {
                  handleRollback();
                } else if (confirmAction) {
                  handleReview(confirmAction);
                }
              }}
            >
              {isProcessing ? '处理中…' : '确认'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
