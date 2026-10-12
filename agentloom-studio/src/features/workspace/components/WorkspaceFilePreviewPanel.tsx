import {
  lazy,
  memo,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { motion } from "motion/react";
import {
  AlertCircle,
  Download,
  FileCode2,
  FileWarning,
  Image as ImageIcon,
  Loader2,
  PencilLine,
  RotateCcw,
  Save,
} from "lucide-react";
import { detectLanguage } from "@/shared/components/tool-renderers/primitives/codeLanguage";
import { EmptyState } from "@/shared/components/empty-state/EmptyState";
import { Spinner } from "@/shared/components/spinner/Spinner";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Skeleton } from "@/shared/ui/skeleton";
import { useToast } from "@/shared/ui/toast";
import { useTheme } from "@/shared/hooks/use-theme";
import type { WorkspaceFilePreview, WorkspaceTextFilePreview } from "../types";
import { fetchWorkspaceFileRaw } from "../api/workspaceApi";
import { useUpdateWorkspaceTextFile } from "../api/workspaceMutations";
import { formatBytes } from "@/shared/lib/format";
import { fadeIn } from "@/shared/lib/motion";

import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

const MonacoEditor = lazy(() => import("@monaco-editor/react"));

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

const HIGHLIGHT_TO_MONACO_LANGUAGE: Record<string, string> = {
  bash: "shell",
  shell: "shell",
  plaintext: "plaintext",
};

interface WorkspaceFilePreviewPanelProps {
  workspaceId: string;
  selectedPath: string | null;
  preview: WorkspaceFilePreview | null;
  isLoading: boolean;
  error: string | null;
}

interface TextEditorState {
  path: string | null;
  sourceContent: string;
  draftContent: string;
  isEditing: boolean;
  saveError: string | null;
}

const INITIAL_TEXT_EDITOR_STATE: TextEditorState = {
  path: null,
  sourceContent: "",
  draftContent: "",
  isEditing: false,
  saveError: null,
};

function resolveMonacoLanguage(filePath: string): string {
  const detected = detectLanguage(filePath) ?? "plaintext";
  return HIGHLIGHT_TO_MONACO_LANGUAGE[detected] ?? detected;
}

function TextEditorFallback() {
  return (
    <div
      className="flex h-full flex-col gap-3 bg-surface px-4 py-5"
      data-testid="workspace-preview-text-loading"
    >
      <Skeleton className="h-4 w-40" />
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-5/6" />
      <Skeleton className="h-3 w-2/3" />
      <Skeleton className="h-3 w-4/5" />
    </div>
  );
}

const WorkspaceTextEditor = memo(function WorkspaceTextEditor({
  filePath,
  value,
  readOnly,
  onChange,
}: {
  filePath: string;
  value: string;
  readOnly: boolean;
  onChange: (value: string) => void;
}) {
  const language = useMemo(() => resolveMonacoLanguage(filePath), [filePath]);
  const { resolvedTheme } = useTheme();

  return (
    <Suspense fallback={<TextEditorFallback />}>
      <div className="h-full bg-surface" data-testid="workspace-preview-text">
        <MonacoEditor
          height="100%"
          language={language}
          value={value}
          onChange={(nextValue) => onChange(nextValue ?? "")}
          theme={resolvedTheme === "dark" ? "vs-dark" : "vs"}
          options={{
            readOnly,
            automaticLayout: true,
            minimap: { enabled: false },
            lineNumbers: "on",
            fontSize: 13,
            wordWrap: "on",
            scrollBeyondLastLine: false,
            renderWhitespace: "selection",
            contextmenu: !readOnly,
            padding: { top: 12, bottom: 12 },
          }}
        />
      </div>
    </Suspense>
  );
});

export const WorkspaceFilePreviewPanel = memo(
  function WorkspaceFilePreviewPanel({
    workspaceId,
    selectedPath,
    preview,
    isLoading,
    error,
  }: WorkspaceFilePreviewPanelProps) {
    const { notify } = useToast();
    const [rawUrl, setRawUrl] = useState<string | null>(null);
    const [rawLoading, setRawLoading] = useState(false);
    const [rawError, setRawError] = useState<string | null>(null);
    const [downloading, setDownloading] = useState(false);
    const [pdfPageCount, setPdfPageCount] = useState(0);
    const [textEditor, setTextEditor] = useState<TextEditorState>(
      INITIAL_TEXT_EDITOR_STATE,
    );

    const textPreview: WorkspaceTextFilePreview | null =
      preview?.kind === "text" ? preview : null;
    const updateTextMutation = useUpdateWorkspaceTextFile(
      workspaceId,
      textPreview?.path ?? null,
    );

    useEffect(() => {
      let active = true;
      let nextUrl: string | null = null;

      setPdfPageCount(0);

      if (!preview || (preview.kind !== "image" && preview.kind !== "pdf")) {
        setRawUrl(null);
        setRawLoading(false);
        setRawError(null);
        return;
      }

      setRawLoading(true);
      setRawError(null);
      setRawUrl(null);

      void fetchWorkspaceFileRaw(workspaceId, preview.path)
        .then((blob) => {
          if (!active) return;
          nextUrl = URL.createObjectURL(blob);
          setRawUrl(nextUrl);
        })
        .catch((previewError) => {
          if (!active) return;
          setRawError(
            previewError instanceof Error
              ? previewError.message
              : "文件内容加载失败",
          );
        })
        .finally(() => {
          if (active) {
            setRawLoading(false);
          }
        });

      return () => {
        active = false;
        if (nextUrl) {
          URL.revokeObjectURL(nextUrl);
        }
      };
    }, [preview, workspaceId]);

    useEffect(() => {
      if (!textPreview) {
        setTextEditor(INITIAL_TEXT_EDITOR_STATE);
        return;
      }

      setTextEditor((current) => {
        if (current.path !== textPreview.path) {
          return {
            path: textPreview.path,
            sourceContent: textPreview.content,
            draftContent: textPreview.content,
            isEditing: false,
            saveError: null,
          };
        }

        if (
          !current.isEditing ||
          current.draftContent === current.sourceContent
        ) {
          return {
            ...current,
            sourceContent: textPreview.content,
            draftContent: textPreview.content,
            saveError: null,
          };
        }

        return current;
      });
    }, [textPreview]);

    const handleDownload = useCallback(async () => {
      if (!preview?.canDownload) return;

      setDownloading(true);
      try {
        const blob = await fetchWorkspaceFileRaw(workspaceId, preview.path);
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = preview.fileName;
        document.body.appendChild(anchor);

        try {
          anchor.click();
        } finally {
          document.body.removeChild(anchor);
          URL.revokeObjectURL(url);
        }
      } catch (downloadError) {
        setRawError(
          downloadError instanceof Error
            ? downloadError.message
            : "文件下载失败",
        );
      } finally {
        setDownloading(false);
      }
    }, [preview, workspaceId]);

    const handleStartEditing = useCallback(() => {
      setTextEditor((current) => ({
        ...current,
        isEditing: true,
        saveError: null,
      }));
    }, []);

    const handleResetText = useCallback(() => {
      setTextEditor((current) => ({
        ...current,
        draftContent: current.sourceContent,
        isEditing: false,
        saveError: null,
      }));
    }, []);

    const handleTextChange = useCallback((value: string) => {
      setTextEditor((current) => ({
        ...current,
        draftContent: value,
        saveError: null,
      }));
    }, []);

    const handleSaveText = useCallback(async () => {
      if (!textPreview) {
        return;
      }

      try {
        const updatedPreview = await updateTextMutation.mutateAsync({
          content: textEditor.draftContent,
        });

        if (updatedPreview.kind !== "text") {
          throw new Error("保存后的文件不再支持文本预览");
        }

        setTextEditor({
          path: updatedPreview.path,
          sourceContent: updatedPreview.content,
          draftContent: updatedPreview.content,
          isEditing: false,
          saveError: null,
        });
        notify({
          title: "已保存",
          description: `已更新 ${updatedPreview.fileName}`,
          variant: "success",
        });
      } catch (saveError) {
        const message =
          saveError instanceof Error ? saveError.message : "文本文件保存失败";
        setTextEditor((current) => ({
          ...current,
          saveError: message,
        }));
        notify({
          title: "保存失败",
          description: message,
          variant: "error",
        });
      }
    }, [notify, textEditor.draftContent, textPreview, updateTextMutation]);

    const fileName =
      preview?.fileName ?? selectedPath?.split("/").pop() ?? null;
    const isDirty =
      textPreview !== null &&
      textEditor.path === textPreview.path &&
      textEditor.draftContent !== textEditor.sourceContent;
    const isTextReadOnly =
      !textEditor.isEditing || updateTextMutation.isPending;

    let contentKey: string;
    let content: ReactNode;
    if (!selectedPath) {
      contentKey = "idle";
      content = (
        <EmptyState
          variant="plain"
          icon={FileCode2}
          tone="var(--color-info)"
          title="未选择文件"
          description="选择左侧文件后，这里会显示当前持久化 workspace 的内容。"
          className="h-full"
        />
      );
    } else if (isLoading) {
      contentKey = "loading";
      content = (
        <div className="grid h-full place-items-center">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Spinner />
            <span>正在加载文件预览…</span>
          </div>
        </div>
      );
    } else if (error) {
      contentKey = "error";
      content = (
        <EmptyState
          variant="plain"
          icon={AlertCircle}
          tone="var(--color-error)"
          title="加载文件预览失败"
          description={<span className="break-words">{error}</span>}
          className="h-full"
        />
      );
    } else if (!preview) {
      contentKey = "unreadable";
      content = (
        <EmptyState
          variant="plain"
          icon={FileWarning}
          tone="var(--color-warning)"
          title="当前文件暂时不可读取"
          className="h-full"
        />
      );
    } else if (preview.kind === "text") {
      contentKey = `text:${preview.path}`;
      content = (
        <div className="flex h-full min-h-0 flex-col bg-surface">
          {textEditor.saveError && (
            <div
              className="shrink-0 break-words border-b border-border bg-error/10 px-3 py-2 text-xs text-error"
              role="alert"
            >
              {textEditor.saveError}
            </div>
          )}
          <div className="min-h-0 flex-1">
            <WorkspaceTextEditor
              filePath={preview.path}
              value={textEditor.draftContent}
              readOnly={isTextReadOnly}
              onChange={handleTextChange}
            />
          </div>
        </div>
      );
    } else if (rawLoading) {
      contentKey = `raw-loading:${preview.path}`;
      content = (
        <div className="grid h-full place-items-center">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Spinner />
            <span>正在加载二进制预览…</span>
          </div>
        </div>
      );
    } else if (rawError) {
      contentKey = `raw-error:${preview.path}`;
      content = (
        <EmptyState
          variant="plain"
          icon={AlertCircle}
          tone="var(--color-error)"
          title="加载预览失败"
          description={<span className="break-words">{rawError}</span>}
          className="h-full"
        />
      );
    } else if (preview.kind === "image" && rawUrl) {
      contentKey = `image:${preview.path}`;
      content = (
        <div className="grid h-full place-items-center overflow-auto bg-background p-4">
          <img
            data-testid="workspace-preview-image"
            src={rawUrl}
            alt={preview.fileName}
            className="max-h-full max-w-full rounded-md border border-border object-contain"
          />
        </div>
      );
    } else if (preview.kind === "pdf" && rawUrl) {
      contentKey = `pdf:${preview.path}`;
      content = (
        <div
          className="h-full overflow-auto bg-background p-4"
          data-testid="workspace-preview-pdf"
        >
          <Document
            file={rawUrl}
            loading={
              <div className="grid place-items-center py-12">
                <Spinner />
              </div>
            }
            onLoadSuccess={({ numPages }) => setPdfPageCount(numPages)}
          >
            <div className="space-y-4">
              {Array.from({ length: pdfPageCount || 1 }, (_, index) => (
                <Page
                  key={`${preview.path}-${index + 1}`}
                  pageNumber={index + 1}
                  renderAnnotationLayer
                  renderTextLayer
                />
              ))}
            </div>
          </Document>
        </div>
      );
    } else {
      contentKey = `unsupported:${preview.path}`;
      content = (
        <div className="h-full" data-testid="workspace-preview-unsupported">
          <EmptyState
            variant="plain"
            icon={FileWarning}
            tone="var(--color-warning)"
            title={
              preview.kind === "unsupported"
                ? preview.reason
                : "当前文件暂不支持预览。"
            }
            description={
              preview.canDownload
                ? "可以使用右上角「下载」按钮在本地查看。"
                : undefined
            }
            className="h-full"
          />
        </div>
      );
    }

    return (
      <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-surface">
        <div className="flex flex-wrap items-center gap-2 border-b border-border bg-muted px-3 py-2">
          <FileCode2 className="size-4 shrink-0 text-info/80" />
          <div className="min-w-0 flex-1 basis-40">
            <p className="truncate text-sm font-medium text-foreground">
              {fileName || "文件预览"}
            </p>
            <p className="truncate text-2xs text-muted-foreground">
              {selectedPath || "选择左侧文件后显示当前内容"}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {preview && (
              <span className="whitespace-nowrap text-2xs tabular-nums text-muted-foreground">
                {formatBytes(preview.size)}
              </span>
            )}
            {textPreview && isDirty && (
              <Badge variant="warning" size="sm" className="shrink-0">
                未保存
              </Badge>
            )}
            {textPreview &&
              (textEditor.isEditing ? (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleResetText}
                    disabled={updateTextMutation.isPending}
                  >
                    <RotateCcw />
                    撤销
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => void handleSaveText()}
                    disabled={!isDirty || updateTextMutation.isPending}
                  >
                    {updateTextMutation.isPending ? (
                      <Loader2 className="animate-spin" />
                    ) : (
                      <Save />
                    )}
                    保存
                  </Button>
                </>
              ) : (
                <Button variant="ghost" size="sm" onClick={handleStartEditing}>
                  <PencilLine />
                  编辑
                </Button>
              ))}
            {preview?.canDownload && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void handleDownload()}
                disabled={downloading}
              >
                {downloading ? <Loader2 className="animate-spin" /> : <Download />}
                下载
              </Button>
            )}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-hidden">
          <motion.div
            key={contentKey}
            initial={fadeIn.initial}
            animate={fadeIn.animate}
            transition={fadeIn.transition}
            className="h-full"
          >
            {content}
          </motion.div>
        </div>

        {preview && (
          <div className="border-t border-border bg-muted px-3 py-2 text-2xs text-muted-foreground">
            <div className="flex min-w-0 items-center gap-2">
              {preview.kind === "image" ? (
                <ImageIcon className="size-3.5 shrink-0" />
              ) : (
                <FileCode2 className="size-3.5 shrink-0" />
              )}
              <span className="shrink-0">{preview.mimeType}</span>
              {preview.kind === "text" && (
                <span className="shrink-0">
                  {textEditor.isEditing ? "编辑模式" : "只读预览"} · UTF-8
                </span>
              )}
              <span className="min-w-0 truncate" title={preview.path}>
                {preview.path}
              </span>
            </div>
          </div>
        )}
      </section>
    );
  },
);
