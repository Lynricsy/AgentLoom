import {
  lazy,
  memo,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Document, Page, pdfjs } from "react-pdf";
import {
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
import { Button } from "@/shared/ui/button";
import { useToast } from "@/shared/ui/toast";
import type { WorkspaceFilePreview, WorkspaceTextFilePreview } from "../types";
import { fetchWorkspaceFileRaw } from "../api/workspaceApi";
import { useUpdateWorkspaceTextFile } from "../api/workspaceMutations";
import { formatWorkspaceSize } from "../lib/formatSize";

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
      className="flex h-full flex-col gap-3 bg-[#111827] px-4 py-5"
      data-testid="workspace-preview-text-loading"
    >
      <div className="h-4 w-40 animate-pulse rounded bg-white/10" />
      <div className="h-3 w-full animate-pulse rounded bg-white/5" />
      <div className="h-3 w-5/6 animate-pulse rounded bg-white/5" />
      <div className="h-3 w-2/3 animate-pulse rounded bg-white/5" />
      <div className="h-3 w-4/5 animate-pulse rounded bg-white/5" />
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

  return (
    <Suspense fallback={<TextEditorFallback />}>
      <div className="h-full bg-[#111827]" data-testid="workspace-preview-text">
        <MonacoEditor
          height="100%"
          language={language}
          value={value}
          onChange={(nextValue) => onChange(nextValue ?? "")}
          theme="vs-dark"
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

    return (
      <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-surface">
        <div className="flex items-center gap-2 border-b border-border bg-surface-elevated/50 px-3 py-2">
          <FileCode2 className="size-4 text-info/80" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-foreground">
              {fileName || "文件预览"}
            </p>
            <p className="truncate text-[11px] text-muted-foreground">
              {selectedPath || "选择左侧文件后显示当前内容"}
            </p>
          </div>
          {preview && (
            <span className="text-[10px] text-muted-foreground">
              {formatWorkspaceSize(preview.size)}
            </span>
          )}
          {textPreview && isDirty && (
            <span className="rounded-full bg-warning/10 px-2 py-0.5 text-[10px] font-medium text-warning">
              未保存
            </span>
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
                  <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                  撤销
                </Button>
                <Button
                  size="sm"
                  onClick={() => void handleSaveText()}
                  disabled={!isDirty || updateTextMutation.isPending}
                >
                  {updateTextMutation.isPending ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Save className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  保存
                </Button>
              </>
            ) : (
              <Button variant="ghost" size="sm" onClick={handleStartEditing}>
                <PencilLine className="mr-1.5 h-3.5 w-3.5" />
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
              {downloading ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Download className="mr-1.5 h-3.5 w-3.5" />
              )}
              下载
            </Button>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-hidden">
          {!selectedPath ? (
            <div className="flex h-full items-center justify-center px-4 text-center text-sm text-muted-foreground">
              <div>
                <FileCode2 className="mx-auto mb-3 size-5 opacity-40" />
                <p>选择左侧文件后，这里会显示当前持久化 workspace 的内容。</p>
              </div>
            </div>
          ) : isLoading ? (
            <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>正在加载文件预览…</span>
            </div>
          ) : error ? (
            <div className="flex h-full items-center justify-center px-4 text-center text-sm text-muted-foreground">
              <p>{error}</p>
            </div>
          ) : !preview ? (
            <div className="flex h-full items-center justify-center px-4 text-center text-sm text-muted-foreground">
              <p>当前文件暂时不可读取。</p>
            </div>
          ) : preview.kind === "text" ? (
            <div className="flex h-full min-h-0 flex-col bg-background">
              {textEditor.saveError && (
                <div className="border-b border-border bg-error/10 px-3 py-2 text-xs text-error">
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
          ) : rawLoading ? (
            <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>正在加载二进制预览…</span>
            </div>
          ) : rawError ? (
            <div className="flex h-full items-center justify-center px-4 text-center text-sm text-muted-foreground">
              <p>{rawError}</p>
            </div>
          ) : preview.kind === "image" && rawUrl ? (
            <div className="flex h-full items-center justify-center overflow-auto bg-background p-4">
              <img
                data-testid="workspace-preview-image"
                src={rawUrl}
                alt={preview.fileName}
                className="max-h-full max-w-full rounded-md border border-border object-contain"
              />
            </div>
          ) : preview.kind === "pdf" && rawUrl ? (
            <div
              className="h-full overflow-auto bg-background p-4"
              data-testid="workspace-preview-pdf"
            >
              <Document
                file={rawUrl}
                loading={
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
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
          ) : (
            <div
              className="flex h-full items-center justify-center px-4 text-center text-sm text-muted-foreground"
              data-testid="workspace-preview-unsupported"
            >
              <div>
                <FileWarning className="mx-auto mb-3 size-5 opacity-50" />
                {preview.kind === "unsupported" ? (
                  <p>{preview.reason}</p>
                ) : (
                  <p>当前文件暂不支持预览。</p>
                )}
                {preview.canDownload && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    可以使用右上角“下载”按钮在本地查看。
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {preview && (
          <div className="border-t border-border bg-surface-elevated/40 px-3 py-2 text-[11px] text-muted-foreground">
            <div className="flex items-center gap-2">
              {preview.kind === "image" ? (
                <ImageIcon className="h-3.5 w-3.5" />
              ) : (
                <FileCode2 className="h-3.5 w-3.5" />
              )}
              <span>{preview.mimeType}</span>
              {preview.kind === "text" && (
                <span>
                  {textEditor.isEditing ? "编辑模式" : "只读预览"} · UTF-8
                </span>
              )}
              <span className="truncate">{preview.path}</span>
            </div>
          </div>
        )}
      </section>
    );
  },
);
