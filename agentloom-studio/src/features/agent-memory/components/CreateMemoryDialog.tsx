import { useCallback, useRef, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { useCreateMemoryInstance } from '../hooks/useMemoryInstances';

interface CreateMemoryDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: (id: string) => void;
}

export function CreateMemoryDialog({
  open,
  onClose,
  onSuccess,
}: CreateMemoryDialogProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const nameInputRef = useRef<HTMLInputElement>(null);
  const createMutation = useCreateMemoryInstance();

  const handleClose = useCallback(() => {
    setName('');
    setDescription('');
    createMutation.reset();
    onClose();
  }, [onClose, createMutation]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!name.trim()) return;

      try {
        const result = await createMutation.mutateAsync({
          name: name.trim(),
          description: description.trim() || undefined,
        });
        handleClose();
        onSuccess?.(result.id);
      } catch {
        // 错误已由 mutation 状态管理
      }
    },
    [name, description, createMutation, handleClose, onSuccess],
  );

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-memory-dialog-title"
    >
      <div className="w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-lg">
        <div className="mb-4 flex items-center justify-between">
          <h2
            id="create-memory-dialog-title"
            className="text-lg font-semibold"
          >
            新建记忆实例
          </h2>
          <button
            onClick={handleClose}
            className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="关闭"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="memory-name"
              className="mb-1.5 block text-sm font-medium"
            >
              名称 <span className="text-destructive">*</span>
            </label>
            <Input
              ref={nameInputRef}
              id="memory-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="输入记忆实例名称"
              required
              autoFocus
            />
          </div>

          <div>
            <label
              htmlFor="memory-description"
              className="mb-1.5 block text-sm font-medium"
            >
              描述
            </label>
            <textarea
              id="memory-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="输入描述（可选）"
              rows={3}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {createMutation.isError && (
            <p className="text-sm text-destructive">
              创建失败，请重试
            </p>
          )}

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={createMutation.isPending}
            >
              取消
            </Button>
            <Button
              type="submit"
              disabled={!name.trim() || createMutation.isPending}
            >
              {createMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              创建
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
