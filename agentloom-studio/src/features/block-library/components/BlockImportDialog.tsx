import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import * as Dialog from '@radix-ui/react-dialog';

import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { useToast } from '@/shared/ui/toast';
import { useCreateBlock } from '../api/blockQueries';
import {
  MAX_IMPORT_SIZE,
  parseImportFile,
  validateImportFile,
  type ExportedBlock,
} from '../lib/blockExportImport';

interface BlockImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImportSuccess: () => void;
}

function formatCategoryLabel(category: ExportedBlock['block']['category']): string {
  return category ?? '未分类';
}

function formatFileSize(bytes: number): string {
  return `${bytes / 1024 / 1024} MB`;
}

export function BlockImportDialog({
  open,
  onOpenChange,
  onImportSuccess,
}: BlockImportDialogProps) {
  const { notify } = useToast();
  const createBlockMutation = useCreateBlock();

  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [previewBlock, setPreviewBlock] = useState<ExportedBlock | null>(null);

  useEffect(() => {
    if (!open) {
      setSelectedFileName(null);
      setValidationErrors([]);
      setSubmitError(null);
      setPreviewBlock(null);
    }
  }, [open]);

  const previewSummary = useMemo(() => {
    if (!previewBlock) {
      return null;
    }

    return {
      nodeCount: previewBlock.block.definition.nodes.length,
      inputPortCount: previewBlock.block.definition.inputPorts.length,
      outputPortCount: previewBlock.block.definition.outputPorts.length,
    };
  }, [previewBlock]);

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];

    input.value = '';

    setSelectedFileName(file?.name ?? null);
    setValidationErrors([]);
    setSubmitError(null);
    setPreviewBlock(null);

    if (!file) {
      return;
    }

    try {
      const content = await parseImportFile(file);
      const result = validateImportFile(content);

      if (!result.valid || !result.block) {
        setValidationErrors(
          result.errors.length > 0
            ? result.errors
            : ['导入文件校验失败。'],
        );
        return;
      }

      setPreviewBlock(result.block);
    } catch (error) {
      setValidationErrors([
        error instanceof Error ? error.message : '读取导入文件失败。',
      ]);
    }
  }

  async function handleImport() {
    if (!previewBlock) {
      return;
    }

    setSubmitError(null);

    try {
      await createBlockMutation.mutateAsync({
        name: previewBlock.block.name,
        description: previewBlock.block.description ?? undefined,
        category: previewBlock.block.category ?? undefined,
        tags: [...previewBlock.block.tags],
        definition: previewBlock.block.definition,
        metadata: previewBlock.block.metadata ?? undefined,
      });

      notify({
        title: '块导入成功',
        description: `已导入块「${previewBlock.block.name}」。`,
        variant: 'success',
      });
      onImportSuccess();
      onOpenChange(false);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : '导入块失败，请稍后重试。';

      setSubmitError(message);
      notify({
        title: '块导入失败',
        description: message,
        variant: 'error',
      });
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/70 backdrop-blur-sm" />
        <Dialog.Content
          aria-describedby="block-import-dialog-description"
          className="fixed left-1/2 top-1/2 z-50 flex max-h-[min(90vh,42rem)] w-[min(36rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-border bg-surface-elevated text-foreground shadow-2xl"
        >
          <div className="border-b border-border px-6 py-5">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-2">
                <Dialog.Title className="text-lg font-semibold">
                  导入块文件
                </Dialog.Title>
                <Dialog.Description
                  className="text-sm text-muted-foreground"
                  id="block-import-dialog-description"
                >
                  选择导出的块 JSON 文件，系统会先校验格式，再允许导入到我的块库。
                </Dialog.Description>
              </div>

              <Dialog.Close asChild>
                <Button aria-label="关闭导入对话框" variant="outline">
                  关闭
                </Button>
              </Dialog.Close>
            </div>
          </div>

          <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
            <div className="space-y-2">
              <label
                className="block text-sm font-medium text-foreground"
                htmlFor="block-import-file"
              >
                选择块文件
              </label>
              <Input
                accept=".json,.agentloom-block.json,application/json"
                data-testid="file-input"
                id="block-import-file"
                onChange={handleFileChange}
                type="file"
              />
              <p className="text-xs text-muted-foreground">
                支持 `.agentloom-block.json` / `.json`，最大 {formatFileSize(MAX_IMPORT_SIZE)}。
              </p>
            </div>

            {selectedFileName ? (
              <div className="rounded-2xl border border-border bg-surface px-4 py-3 text-sm text-muted-foreground">
                当前文件：
                <span className="ml-1 font-medium text-foreground">
                  {selectedFileName}
                </span>
              </div>
            ) : null}

            {validationErrors.length > 0 ? (
              <div
                className="rounded-2xl border border-error/50 bg-error/5 px-4 py-3"
                data-testid="validation-errors"
                role="alert"
              >
                <p className="text-sm font-medium text-foreground">文件校验失败</p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                  {validationErrors.map((error) => (
                    <li key={error}>{error}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {submitError ? (
              <div
                className="rounded-2xl border border-error/50 bg-error/5 px-4 py-3 text-sm text-muted-foreground"
                role="alert"
              >
                {submitError}
              </div>
            ) : null}

            {previewBlock && previewSummary ? (
              <section
                className="space-y-4 rounded-2xl border border-border bg-surface p-4"
                data-testid="block-preview"
              >
                <div className="space-y-1">
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                    预览
                  </p>
                  <h3 className="text-lg font-semibold text-foreground">
                    {previewBlock.block.name}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {previewBlock.block.description ?? '这个块没有提供额外描述。'}
                  </p>
                </div>

                <div className="grid gap-3 text-sm sm:grid-cols-2">
                  <div className="space-y-1">
                    <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                      分类
                    </p>
                    <p className="text-foreground">
                      {formatCategoryLabel(previewBlock.block.category)}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                      标签
                    </p>
                    <p className="text-foreground">
                      {previewBlock.block.tags.length > 0
                        ? previewBlock.block.tags.join('、')
                        : '无标签'}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                      节点数量
                    </p>
                    <p className="text-foreground">{previewSummary.nodeCount} 个节点</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                      端口摘要
                    </p>
                    <p className="text-foreground">
                      输入 {previewSummary.inputPortCount} · 输出{' '}
                      {previewSummary.outputPortCount}
                    </p>
                  </div>
                </div>
              </section>
            ) : null}
          </div>

          <div className="border-t border-border px-6 py-4">
            <div className="flex justify-end gap-3">
              <Dialog.Close asChild>
                <Button variant="outline">取消</Button>
              </Dialog.Close>
              <Button
                disabled={!previewBlock || createBlockMutation.isPending}
                onClick={handleImport}
              >
                {createBlockMutation.isPending ? '导入中…' : '导入块'}
              </Button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export type { BlockImportDialogProps };
