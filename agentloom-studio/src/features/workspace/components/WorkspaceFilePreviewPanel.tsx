import { memo, useCallback, useEffect, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import {
  Download,
  FileCode2,
  FileWarning,
  Image as ImageIcon,
  Loader2,
} from "lucide-react";
import { Button } from "@/shared/ui/button";
import type { WorkspaceFilePreview } from "../types";
import { fetchWorkspaceFileRaw } from "../api/workspaceApi";
import { formatWorkspaceSize } from "../lib/formatSize";

import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

interface WorkspaceFilePreviewPanelProps {
  workspaceId: string;
  selectedPath: string | null;
  preview: WorkspaceFilePreview | null;
  isLoading: boolean;
  error: string | null;
}

export const WorkspaceFilePreviewPanel = memo(
  function WorkspaceFilePreviewPanel({
    workspaceId,
    selectedPath,
    preview,
    isLoading,
    error,
  }: WorkspaceFilePreviewPanelProps) {
    const [rawUrl, setRawUrl] = useState<string | null>(null);
    const [rawLoading, setRawLoading] = useState(false);
    const [rawError, setRawError] = useState<string | null>(null);
    const [downloading, setDownloading] = useState(false);
    const [pdfPageCount, setPdfPageCount] = useState(0);

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
    }, [preview?.kind, preview?.path, workspaceId]);

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

    const fileName =
      preview?.fileName ?? selectedPath?.split("/").pop() ?? null;

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
            <div className="h-full overflow-auto bg-background p-3">
              <pre
                data-testid="workspace-preview-text"
                className="whitespace-pre-wrap break-all font-mono text-xs leading-relaxed text-foreground/90"
              >
                {preview.content}
              </pre>
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
            </div>
          </div>
        )}
      </section>
    );
  },
);
