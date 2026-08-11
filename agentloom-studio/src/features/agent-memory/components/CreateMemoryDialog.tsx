import { useCallback, useState } from 'react';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Textarea } from '@/shared/ui/textarea';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog';
import { Spinner } from '@/shared/components/spinner/Spinner';
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

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) handleClose();
      }}
    >
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>新建记忆实例</DialogTitle>
          <DialogDescription>
            记忆实例承载 Agent 的长期知识图谱，创建后可继续配置知识域与提示词。
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="contents">
          <DialogBody className="space-y-4">
            <div className="space-y-1.5">
              <label
                htmlFor="memory-name"
                className="block text-sm font-medium text-foreground"
              >
                名称 <span className="text-error">*</span>
              </label>
              <Input
                id="memory-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="输入记忆实例名称"
                required
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="memory-description"
                className="block text-sm font-medium text-foreground"
              >
                描述
              </label>
              <Textarea
                id="memory-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="输入描述（可选）"
                rows={3}
              />
            </div>

            {createMutation.isError && (
              <p className="text-xs font-medium text-error">创建失败，请重试</p>
            )}
          </DialogBody>

          <DialogFooter>
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
              {createMutation.isPending && <Spinner className="text-current" />}
              创建
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
