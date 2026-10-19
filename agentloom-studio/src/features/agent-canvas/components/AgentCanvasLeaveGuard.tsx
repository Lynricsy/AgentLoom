import { useState, type MouseEvent } from 'react';
import { useBlocker } from '@tanstack/react-router';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from '@/shared/ui/alert-dialog';
import { useAgentCanvasStore } from '../stores/agent-canvas.store';

function hasUnsavedChanges(): boolean {
  const { isDirty, isSaving } = useAgentCanvasStore.getState();
  return isDirty || isSaving;
}

interface AgentCanvasLeaveGuardProps {
  /** 保存当前画布；返回 false 表示保存失败（调用方已提示），留在页面 */
  onSave: () => Promise<boolean>;
}

/**
 * 有未保存修改（含自动保存防抖期内与保存进行中）时拦截离开：
 * 站内跳转弹出确认框，可「保存并离开」「放弃修改」或留下；刷新 / 关闭标签页走浏览器原生 beforeunload 提示。
 */
export function AgentCanvasLeaveGuard({ onSave }: AgentCanvasLeaveGuardProps) {
  const [isSaving, setIsSaving] = useState(false);
  const blocker = useBlocker({
    shouldBlockFn: ({ current, next }) =>
      current.pathname !== next.pathname && hasUnsavedChanges(),
    enableBeforeUnload: hasUnsavedChanges,
    withResolver: true,
  });
  const isBlocked = blocker.status === 'blocked';

  const handleSaveAndLeave = async (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    setIsSaving(true);
    const saved = await onSave();
    setIsSaving(false);
    if (!isBlocked) {
      return;
    }
    if (saved) {
      blocker.proceed();
    } else {
      blocker.reset();
    }
  };

  return (
    <AlertDialog
      open={isBlocked}
      onOpenChange={(open) => {
        if (!open && isBlocked && !isSaving) {
          blocker.reset();
        }
      }}
    >
      <AlertDialogContent data-testid="agent-canvas-leave-dialog">
        <AlertDialogTitle>有未保存的修改</AlertDialogTitle>
        <AlertDialogDescription>
          Agent 画布还有修改没有保存，直接离开会丢失这些修改。
        </AlertDialogDescription>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isSaving}>留在此页</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={isSaving}
            onClick={(event) => {
              event.preventDefault();
              if (isBlocked) {
                blocker.proceed();
              }
            }}
          >
            放弃修改并离开
          </AlertDialogAction>
          <AlertDialogAction
            disabled={isSaving}
            onClick={(event) => void handleSaveAndLeave(event)}
          >
            {isSaving ? '保存中…' : '保存并离开'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
