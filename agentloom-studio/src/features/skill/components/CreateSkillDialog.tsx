import { useCallback, useEffect, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, Loader2 } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { useCreateSkill, useUpdateSkill } from '../api/skillQueries';
import type { Skill } from '../types';

interface CreateSkillDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  skill?: Skill | null;
}

export function CreateSkillDialog({
  open,
  onOpenChange,
  skill,
}: CreateSkillDialogProps) {
  const isEditing = Boolean(skill);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [content, setContent] = useState('');
  const [nameError, setNameError] = useState('');

  const createMutation = useCreateSkill();
  const updateMutation = useUpdateSkill();
  const isPending = createMutation.isPending || updateMutation.isPending;

  useEffect(() => {
    if (open && skill) {
      setName(skill.name);
      setDescription(skill.description ?? '');
      setContent(skill.content ?? '');
      setNameError('');
    } else if (open && !skill) {
      setName('');
      setDescription('');
      setContent('');
      setNameError('');
    }
  }, [open, skill]);

  const handleSubmit = useCallback(() => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setNameError('技能名称不能为空');
      return;
    }
    setNameError('');

    if (isEditing && skill) {
      updateMutation.mutate(
        {
          id: skill.id,
          name: trimmedName,
          description: description.trim() || undefined,
          content: content || undefined,
        },
        { onSuccess: () => onOpenChange(false) },
      );
    } else {
      createMutation.mutate(
        {
          name: trimmedName,
          description: description.trim() || undefined,
          content: content || undefined,
        },
        { onSuccess: () => onOpenChange(false) },
      );
    }
  }, [name, description, content, isEditing, skill, createMutation, updateMutation, onOpenChange]);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[85vh] w-full max-w-xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-border bg-background shadow-2xl data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]">
          <div className="flex flex-col gap-5 p-6">
            <div className="flex items-center justify-between">
              <Dialog.Title className="text-lg font-bold">
                {isEditing ? '编辑技能' : '新建技能'}
              </Dialog.Title>
              <Dialog.Close className="rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2">
                <X className="h-4 w-4" />
                <span className="sr-only">关闭</span>
              </Dialog.Close>
            </div>

            <div className="flex flex-col gap-4">
              <div className="space-y-1.5">
                <Label>名称 *</Label>
                <Input
                  id="skill-name"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    if (nameError) setNameError('');
                  }}
                  placeholder="输入技能名称"
                  autoFocus
                />
                {nameError && (
                  <p className="text-xs text-red-400">{nameError}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label>描述</Label>
                <Input
                  id="skill-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="简要描述技能的用途"
                />
              </div>

              <div className="space-y-1.5">
                <Label>内容</Label>
                <textarea
                  id="skill-content"
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="技能的 Markdown 内容（后续将支持富文本编辑器）"
                  rows={10}
                  className="w-full resize-y rounded-md border border-input bg-background px-3 py-2 font-mono text-sm text-foreground transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-border pt-4">
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isPending}
              >
                取消
              </Button>
              <Button onClick={handleSubmit} disabled={isPending}>
                {isPending && (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                )}
                {isEditing ? '保存' : '创建'}
              </Button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
