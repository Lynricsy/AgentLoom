import { memo, useCallback, useEffect, useRef } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { BookOpen, Loader2 } from "lucide-react";
import {
  buildKnowledgeBaseNodeConfig,
  getKnowledgeBaseStatusLabel,
  getKnowledgeNodeCountLabel,
  isKnowledgeBaseConfigured,
} from "@/features/knowledge";
import { useAllKnowledgeBases } from "@/features/knowledge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";

const EMPTY_KNOWLEDGE_BASES = [] as const;

const knowledgeBaseSchema = z.object({
  knowledgeBaseId: z.string().min(1, "此字段为必填项"),
});

type KnowledgeBaseFormValues = z.infer<typeof knowledgeBaseSchema>;

interface KnowledgeBaseConfigPanelProps {
  config: Record<string, unknown>;
  onApply: (patch: Record<string, unknown>) => void;
  onValidationChange?: (hasErrors: boolean) => void;
}

export const KnowledgeBaseConfigPanel = memo(function KnowledgeBaseConfigPanel({
  config,
  onApply,
  onValidationChange,
}: KnowledgeBaseConfigPanelProps) {
  const {
    control,
    reset,
    trigger,
    formState: { errors },
  } = useForm<KnowledgeBaseFormValues>({
    resolver: zodResolver(knowledgeBaseSchema),
    defaultValues: {
      knowledgeBaseId: isKnowledgeBaseConfigured(config)
        ? config.knowledgeBaseId
        : "",
    },
    mode: "onBlur",
  });
  const { data, isLoading } = useAllKnowledgeBases();
  const knowledgeBases = data ?? EMPTY_KNOWLEDGE_BASES;

  const currentId = useWatch({
    control,
    name: "knowledgeBaseId",
  });

  const didMountRef = useRef(false);
  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }

    reset({
      knowledgeBaseId: isKnowledgeBaseConfigured(config)
        ? config.knowledgeBaseId
        : "",
    });
  }, [config, reset]);

  const hasErrors = Object.keys(errors).length > 0;
  useEffect(() => {
    onValidationChange?.(hasErrors);
  }, [hasErrors, onValidationChange]);

  const handleSelect = useCallback(
    (selectedId: string) => {
      if (!selectedId) {
        onApply({
          config: {},
          label: "知识库",
        });
        return;
      }

      const selectedKb = knowledgeBases.find((kb) => kb.id === selectedId);

      if (!selectedKb) {
        return;
      }

      onApply({
        config: buildKnowledgeBaseNodeConfig(selectedKb),
        label: selectedKb.name,
      });
    },
    [knowledgeBases, onApply],
  );

  const selectedKnowledgeBase = knowledgeBases.find(
    (kb) => kb.id === currentId,
  );
  const showMissingKnowledgeBaseWarning =
    Boolean(currentId) && !selectedKnowledgeBase && !isLoading;

  return (
    <div className="space-y-5 px-4 py-4">
      <div className="flex items-center gap-2">
        <BookOpen className="h-4 w-4 text-type-knowledge" />
        <span className="rounded-full bg-type-knowledge/10 px-2 py-0.5 text-xs font-medium text-type-knowledge">
          知识库
        </span>
      </div>

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="kb-select"
          className="inline-flex items-center gap-0.5 text-xs font-medium text-foreground"
        >
          选择知识库
          <span className="text-error">*</span>
        </label>
        {isLoading ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            <span>加载中...</span>
          </div>
        ) : (
          <Controller
            name="knowledgeBaseId"
            control={control}
            render={({ field }) => (
              <>
                <Select
                  value={field.value}
                  onValueChange={(selectedId) => {
                    field.onChange(selectedId);
                    handleSelect(selectedId);
                    void trigger("knowledgeBaseId", { shouldFocus: false });
                  }}
                >
                  <SelectTrigger
                    aria-label="选择知识库"
                    id="kb-select"
                    onBlur={() => {
                      field.onBlur();
                      void trigger(undefined, { shouldFocus: false });
                    }}
                  >
                    <SelectValue placeholder="请选择知识库" />
                  </SelectTrigger>
                  <SelectContent>
                    {knowledgeBases.map((kb) => (
                      <SelectItem key={kb.id} value={kb.id}>
                        {kb.name} · {kb.documentCount} 文档 ·{" "}
                        {getKnowledgeNodeCountLabel(kb)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.knowledgeBaseId && (
                  <p className="text-xs font-medium text-error">
                    {errors.knowledgeBaseId.message}
                  </p>
                )}
              </>
            )}
          />
        )}
      </div>

      {selectedKnowledgeBase && (
        <div className="space-y-2 rounded-card border border-border bg-surface-elevated p-3 text-xs">
          <p className="font-medium text-foreground">
            {selectedKnowledgeBase.name}
          </p>
          <div className="flex flex-wrap items-center gap-2 text-muted-foreground">
            <span>{selectedKnowledgeBase.documentCount} 个文档</span>
            <span>·</span>
            <span>{getKnowledgeNodeCountLabel(selectedKnowledgeBase)}</span>
            <span>·</span>
            <span>
              {getKnowledgeBaseStatusLabel(selectedKnowledgeBase.status)}
            </span>
          </div>
          <p className="break-all text-muted">ID: {currentId}</p>
        </div>
      )}

      {showMissingKnowledgeBaseWarning && (
        <div
          className="space-y-2 rounded-card border border-warning/30 bg-warning/10 p-3 text-xs"
          data-testid="knowledge-base-missing-warning"
        >
          <p className="font-medium text-warning">
            当前已选择的知识库不可用或已删除，请重新选择。
          </p>
          <p className="break-all text-warning/80">
            ID: {currentId}
          </p>
        </div>
      )}
    </div>
  );
});
