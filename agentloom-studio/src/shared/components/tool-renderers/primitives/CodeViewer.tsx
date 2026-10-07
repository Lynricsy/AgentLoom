import { memo, useCallback, useEffect, useMemo, useState } from "react";
import hljs from "highlight.js/lib/core";
import { Check, Copy } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";
import { detectLanguage } from "./codeLanguage";

import "highlight.js/styles/github-dark.css";

// eslint-disable-next-line react-refresh/only-export-components
export { detectLanguage };

// Register common languages lazily
type HighlightLanguageDefinition = Parameters<typeof hljs.registerLanguage>[1];

interface HighlightApi {
  registerLanguage(languageName: string, language: HighlightLanguageDefinition): void;
  highlight(code: string, options: { language: string }): { value: string };
}

const highlighter: HighlightApi = hljs;

interface HighlightLanguageModule {
  default: HighlightLanguageDefinition;
}
const REGISTERED_LANGUAGES = new Set<string>();
const LANGUAGE_IMPORTS: Record<string, () => Promise<HighlightLanguageModule>> = {
  javascript: () => import("highlight.js/lib/languages/javascript"),
  typescript: () => import("highlight.js/lib/languages/typescript"),
  python: () => import("highlight.js/lib/languages/python"),
  json: () => import("highlight.js/lib/languages/json"),
  bash: () => import("highlight.js/lib/languages/bash"),
  shell: () => import("highlight.js/lib/languages/shell"),
  css: () => import("highlight.js/lib/languages/css"),
  xml: () => import("highlight.js/lib/languages/xml"),
  markdown: () => import("highlight.js/lib/languages/markdown"),
  yaml: () => import("highlight.js/lib/languages/yaml"),
  sql: () => import("highlight.js/lib/languages/sql"),
  rust: () => import("highlight.js/lib/languages/rust"),
  go: () => import("highlight.js/lib/languages/go"),
  java: () => import("highlight.js/lib/languages/java"),
  cpp: () => import("highlight.js/lib/languages/cpp"),
  c: () => import("highlight.js/lib/languages/c"),
  ruby: () => import("highlight.js/lib/languages/ruby"),
  php: () => import("highlight.js/lib/languages/php"),
  swift: () => import("highlight.js/lib/languages/swift"),
  kotlin: () => import("highlight.js/lib/languages/kotlin"),
  dockerfile: () => import("highlight.js/lib/languages/dockerfile"),
  diff: () => import("highlight.js/lib/languages/diff"),
  ini: () => import("highlight.js/lib/languages/ini"),
  plaintext: () => import("highlight.js/lib/languages/plaintext"),
};

async function ensureLanguage(lang: string): Promise<boolean> {
  if (REGISTERED_LANGUAGES.has(lang)) return true;

  const importFn = LANGUAGE_IMPORTS[lang];
  if (!importFn) return false;

  try {
    const mod = await importFn();
    highlighter.registerLanguage(lang, mod.default);
    REGISTERED_LANGUAGES.add(lang);
    return true;
  } catch {
    return false;
  }
}

export interface CodeViewerProps {
  code: string;
  language?: string;
  fileName?: string;
  startLine?: number;
  maxHeight?: string;
  className?: string;
}

export const CodeViewer = memo(function CodeViewer({
  code,
  language,
  fileName,
  startLine = 1,
  maxHeight = "480px",
  className,
}: CodeViewerProps) {
  const [copied, setCopied] = useState(false);
  const [highlightedHtml, setHighlightedHtml] = useState<string | null>(null);

  const resolvedLanguage =
    language ?? (fileName ? detectLanguage(fileName) : undefined);

  // Highlight the code: sync when language is already registered,
  // async load otherwise via useEffect.
  useEffect(() => {
    if (!resolvedLanguage) {
      setHighlightedHtml(null);
      return;
    }

    // If already registered, highlight synchronously
    if (REGISTERED_LANGUAGES.has(resolvedLanguage)) {
      try {
        const result = highlighter.highlight(code, { language: resolvedLanguage });
        setHighlightedHtml(result.value);
      } catch {
        setHighlightedHtml(null);
      }
      return;
    }

    // Async language registration
    let cancelled = false;
    void ensureLanguage(resolvedLanguage).then((ok) => {
      if (cancelled) return;
      if (ok) {
        try {
          const result = highlighter.highlight(code, { language: resolvedLanguage });
          setHighlightedHtml(result.value);
        } catch {
          setHighlightedHtml(null);
        }
      } else {
        setHighlightedHtml(null);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [code, resolvedLanguage]);

  const lines = useMemo(() => code.split("\n"), [code]);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API may fail in non-secure contexts
    }
  }, [code]);

  const lineNumberWidth = String(startLine + lines.length - 1).length;

  return (
    <div className={cn("group relative rounded-lg bg-muted", className)}>
      {/* Header with language label and copy button */}
      {(resolvedLanguage ?? fileName) && (
        <div className="flex items-center justify-between border-b border-border px-3 py-1.5">
          <span className="text-2xs font-medium text-muted-foreground">
            {fileName ?? resolvedLanguage}
          </span>
          <Button
            variant="ghost"
            size="xs"
            onClick={() => void handleCopy()}
            className="h-6 gap-1 px-1.5 text-2xs text-muted-foreground hover:text-foreground [&_svg]:size-3"
          >
            {copied ? (
              <>
                <Check />
                已复制
              </>
            ) : (
              <>
                <Copy />
                复制
              </>
            )}
          </Button>
        </div>
      )}

      {/* No header: floating copy button */}
      {!resolvedLanguage && !fileName && (
        <Button
          variant="outline"
          size="icon-xs"
          onClick={() => void handleCopy()}
          aria-label="复制"
          className="absolute right-2 top-2 z-10 size-6 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100 [&_svg]:size-3"
        >
          {copied ? <Check /> : <Copy />}
        </Button>
      )}

      {/* Code area */}
      <div className="overflow-auto" style={{ maxHeight }}>
        <table className="w-full border-collapse font-mono text-xs leading-relaxed">
          <tbody>
            {lines.map((line, i) => (
              <tr key={`${startLine + i}`} className="hover:bg-border/40">
                <td
                  className="select-none border-r border-border px-3 py-0 text-right align-top text-subtle-foreground"
                  style={{ minWidth: `${lineNumberWidth + 2}ch` }}
                >
                  {startLine + i}
                </td>
                <td className="px-3 py-0">
                  {highlightedHtml ? (
                    <span
                      dangerouslySetInnerHTML={{
                        __html: getHighlightedLine(highlightedHtml, i),
                      }}
                    />
                  ) : (
                    <span className="text-foreground/90">
                      {line || "\u00A0"}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
});

/**
 * Extract a single line from already-highlighted HTML.
 * hljs returns the entire code as one HTML string; we split on newlines
 * while trying to preserve open tags across lines.
 */
function getHighlightedLine(html: string, lineIndex: number): string {
  const lines = html.split("\n");
  return lines[lineIndex] ?? "";
}
