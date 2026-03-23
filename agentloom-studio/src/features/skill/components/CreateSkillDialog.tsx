import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
} from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import {
  X,
  Loader2,
  Upload,
  FileText,
  Download,
  Trash2,
  AlertCircle,
} from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/shared/ui/tabs';
import {
  useCreateSkill,
  useUpdateSkill,
  useSkillFiles,
  useUploadSkillFile,
  useDeleteSkillFile,
} from '../api/skillQueries';
import { downloadSkillFile, type SkillFileInfo } from '../api/skillApi';
import type { Skill } from '../types';


/** 5 MB per file */
const SKILL_FILE_MAX_SIZE = 5_242_880;
/** 50 MB total */
const SKILL_TOTAL_MAX_SIZE = 52_428_800;

const MonacoEditor = lazy(() => import('@monaco-editor/react'));
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

function EditorSkeleton() {
  return (
    <div className="flex h-[400px] flex-col gap-2 rounded-md border border-border bg-muted/30 p-4">
      <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
      <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
      <div className="h-4 w-5/6 animate-pulse rounded bg-muted" />
      <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
      <div className="h-4 w-4/5 animate-pulse rounded bg-muted" />
    </div>
  );
}

interface FileItemProps {
  file: SkillFileInfo;
  skillId: string;
  isMainContent: boolean;
  onDelete: (fileName: string) => void;
  isDeleting: boolean;
}

function FileItem({
  file,
  skillId,
  isMainContent,
  onDelete,
  isDeleting,
}: FileItemProps) {
  const handleDownload = useCallback(async () => {
    try {
      const blob = await downloadSkillFile(skillId, file.fileName);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.fileName;
      a.click();
      URL.revokeObjectURL(url);
    } catch { /* noop */ }
  }, [skillId, file.fileName]);

  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-muted/20 px-3 py-2">
      <div className="flex min-w-0 items-center gap-2">
        <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{file.fileName}</p>
          <p className="text-xs text-muted-foreground">
            {formatBytes(file.sizeBytes)}
            {isMainContent && (
              <span className="ml-1.5 text-primary">(主内容)</span>
            )}
          </p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={handleDownload}
          className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          title="下载"
        >
          <Download className="h-3.5 w-3.5" />
        </button>
        {!isMainContent && (
          <button
            type="button"
            onClick={() => onDelete(file.fileName)}
            disabled={isDeleting}
            className="rounded p-1 text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-400 disabled:opacity-50"
            title="删除"
          >
            {isDeleting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Trash2 className="h-3.5 w-3.5" />
            )}
          </button>
        )}
      </div>
    </div>
  );
}

interface DropZoneProps {
  onFilesSelected: (files: File[]) => void;
  disabled: boolean;
}

function DropZone({ onFilesSelected, disabled }: DropZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = useCallback(
    (e: DragEvent<HTMLButtonElement>) => {
      e.preventDefault();
      if (!disabled) setIsDragging(true);
    },
    [disabled],
  );

  const handleDragLeave = useCallback(() => setIsDragging(false), []);

  const handleDrop = useCallback(
    (e: DragEvent<HTMLButtonElement>) => {
      e.preventDefault();
      setIsDragging(false);
      if (disabled) return;
      const files = Array.from(e.dataTransfer.files);
      if (files.length > 0) onFilesSelected(files);
    },
    [disabled, onFilesSelected],
  );

  const handleClick = useCallback(() => {
    if (!disabled) inputRef.current?.click();
  }, [disabled]);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? []);
      if (files.length > 0) onFilesSelected(files);
      // reset to allow re-selecting the same file
      e.target.value = '';
    },
    [onFilesSelected],
  );

  return (
    <button
      type="button"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={handleClick}
      disabled={disabled}
      className={`flex w-full cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed px-4 py-6 transition-colors ${
        isDragging
          ? 'border-primary bg-primary/5'
          : 'border-border hover:border-muted-foreground/50'
      } ${disabled ? 'pointer-events-none opacity-50' : ''}`}
    >
      <Upload className="h-6 w-6 text-muted-foreground" />
      <div className="text-center">
        <p className="text-sm text-muted-foreground">
          拖放文件到此处，或{' '}
          <span className="text-primary">点击选择</span>
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground/70">
          单文件 ≤ {formatBytes(SKILL_FILE_MAX_SIZE)}，总量 ≤{' '}
          {formatBytes(SKILL_TOTAL_MAX_SIZE)}
        </p>
      </div>
      <input
        ref={inputRef}
        type="file"
        multiple
        onChange={handleInputChange}
        className="hidden"
      />
    </button>
  );
}

/**
 * Monaco decoration for YAML frontmatter (`---` delimited block).
 * Uses deltaDecorations with line-level className, re-applied on content change.
 */
function applyFrontmatterDecorations(
  editorInstance: any,
) {
  const model = editorInstance.getModel();
  if (!model) return;

  const text = model.getValue();
  // 匹配第一行开始的 ---\n...\n--- 块
  const match = text.match(/^---\r?\n[\s\S]*?\r?\n---/);
  if (!match) {
    editorInstance.removeDecorations(
      (editorInstance as any).__frontmatterDecorationIds ?? [],
    );
    (editorInstance as any).__frontmatterDecorationIds = [];
    return;
  }

  const startLine = 1;
  const endLine = model.getPositionAt(match[0].length).lineNumber;

  const newDecorations: any[] = [
    {
      range: {
        startLineNumber: startLine,
        startColumn: 1,
        endLineNumber: endLine,
        endColumn: model.getLineMaxColumn(endLine),
      },
      options: {
        isWholeLine: true,
        className: 'skill-frontmatter-line',
        glyphMarginClassName: 'skill-frontmatter-glyph',
      },
    },
  ];

  (editorInstance as any).__frontmatterDecorationIds =
    editorInstance.deltaDecorations(
      (editorInstance as any).__frontmatterDecorationIds ?? [],
      newDecorations,
    );
}

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
  const [fileError, setFileError] = useState('');
  const [deletingFile, setDeletingFile] = useState<string | null>(null);

  const editorRef = useRef<any>(null);

  const createMutation = useCreateSkill();
  const updateMutation = useUpdateSkill();
  const isPending = createMutation.isPending || updateMutation.isPending;

  // file hooks (edit mode only)
  const filesQuery = useSkillFiles(skill?.id ?? '', {
    enabled: isEditing && open,
  });
  const uploadMutation = useUploadSkillFile();
  const deleteMutation = useDeleteSkillFile();

  const files = filesQuery.data ?? [];
  const totalSize = useMemo(
    () => files.reduce((sum, f) => sum + f.sizeBytes, 0),
    [files],
  );


  useEffect(() => {
    if (open && skill) {
      setName(skill.name);
      setDescription(skill.description ?? '');
      setContent(skill.content ?? '');
      setNameError('');
      setFileError('');
      setDeletingFile(null);
    } else if (open && !skill) {
      setName('');
      setDescription('');
      setContent('');
      setNameError('');
      setFileError('');
      setDeletingFile(null);
    }
  }, [open, skill]);


  const handleEditorMount = useCallback(
    (editor: any) => {
      editorRef.current = editor;
      applyFrontmatterDecorations(editor);
    },
    [],
  );

  const handleEditorChange = useCallback(
    (value: string | undefined) => {
      const next = value ?? '';
      setContent(next);
      if (editorRef.current) {
        applyFrontmatterDecorations(editorRef.current);
      }
    },
    [],
  );


  const handleFilesSelected = useCallback(
    (incoming: File[]) => {
      if (!skill) return;
      setFileError('');

      for (const file of incoming) {
        if (file.size > SKILL_FILE_MAX_SIZE) {
          setFileError(
            `文件 "${file.name}" 超过单文件限制 (${formatBytes(SKILL_FILE_MAX_SIZE)})`,
          );
          return;
        }
        if (totalSize + file.size > SKILL_TOTAL_MAX_SIZE) {
          setFileError(
            `上传 "${file.name}" 后将超过总量限制 (${formatBytes(SKILL_TOTAL_MAX_SIZE)})`,
          );
          return;
        }

        uploadMutation.mutate(
          { id: skill.id, file },
          {
            onError: () => {
              setFileError(`上传 "${file.name}" 失败，请重试`);
            },
          },
        );
      }
    },
    [skill, totalSize, uploadMutation],
  );

  const handleDeleteFile = useCallback(
    (fileName: string) => {
      if (!skill) return;
      setDeletingFile(fileName);
      deleteMutation.mutate(
        { id: skill.id, fileName },
        {
          onSettled: () => setDeletingFile(null),
          onError: () => setFileError(`删除 "${fileName}" 失败`),
        },
      );
    },
    [skill, deleteMutation],
  );


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
  }, [
    name,
    description,
    content,
    isEditing,
    skill,
    createMutation,
    updateMutation,
    onOpenChange,
  ]);


  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-full max-w-3xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-border bg-background shadow-2xl data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]">
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
            </div>

            <Tabs defaultValue="content" className="space-y-3">
              <TabsList>
                <TabsTrigger value="content">内容编辑</TabsTrigger>
                <TabsTrigger value="files">
                  附件{isEditing && files.length > 0 && ` (${files.length})`}
                </TabsTrigger>
              </TabsList>

              <TabsContent value="content" className="space-y-1.5">
                <Label>SKILL.md 内容</Label>
                <div className="overflow-hidden rounded-md border border-border">
                  <Suspense fallback={<EditorSkeleton />}>
                    <MonacoEditor
                      height="400px"
                      defaultLanguage="markdown"
                      theme="vs-dark"
                      value={content}
                      onChange={handleEditorChange}
                      onMount={handleEditorMount}
                      options={{
                        minimap: { enabled: false },
                        lineNumbers: 'on',
                        wordWrap: 'on',
                        fontSize: 13,
                        scrollBeyondLastLine: false,
                        padding: { top: 8, bottom: 8 },
                        renderLineHighlight: 'gutter',
                        folding: true,
                        bracketPairColorization: { enabled: true },
                      }}
                    />
                  </Suspense>
                </div>
                <p className="text-xs text-muted-foreground">
                  支持完整 Markdown 语法。以{' '}
                  <code className="rounded bg-muted px-1 py-0.5 text-[10px]">
                    ---
                  </code>{' '}
                  包裹的 YAML frontmatter 会高亮显示。
                </p>
              </TabsContent>

              <TabsContent value="files" className="space-y-3">
                {!isEditing ? (
                  <div className="rounded-md border border-border bg-muted/20 px-4 py-8 text-center">
                    <p className="text-sm text-muted-foreground">
                      请先创建技能，之后可在编辑模式中管理附件。
                    </p>
                  </div>
                ) : (
                  <>
                    <DropZone
                      onFilesSelected={handleFilesSelected}
                      disabled={uploadMutation.isPending}
                    />

                    {fileError && (
                      <div className="flex items-start gap-2 rounded-md border border-red-500/30 bg-red-500/5 px-3 py-2">
                        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
                        <p className="text-xs text-red-400">{fileError}</p>
                      </div>
                    )}

                    {uploadMutation.isPending && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        正在上传...
                      </div>
                    )}

                    {filesQuery.isLoading ? (
                      <div className="flex items-center justify-center py-6">
                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                      </div>
                    ) : files.length === 0 ? (
                      <p className="py-4 text-center text-sm text-muted-foreground">
                        暂无附件
                      </p>
                    ) : (
                      <div className="flex flex-col gap-2">
                        {files.map((f) => (
                          <FileItem
                            key={f.fileName}
                            file={f}
                            skillId={skill!.id}
                            isMainContent={
                              f.fileName.toLowerCase() === 'skill.md'
                            }
                            onDelete={handleDeleteFile}
                            isDeleting={deletingFile === f.fileName}
                          />
                        ))}
                      </div>
                    )}

                    {files.length > 0 && (
                      <p className="text-xs text-muted-foreground">
                        共 {files.length} 个文件，总计{' '}
                        {formatBytes(totalSize)} /{' '}
                        {formatBytes(SKILL_TOTAL_MAX_SIZE)}
                      </p>
                    )}
                  </>
                )}
              </TabsContent>
            </Tabs>

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
