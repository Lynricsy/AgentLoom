import { memo } from "react";
import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";

interface CompoundExtraInputEditorProps {
  extraInputIds: readonly string[];
  portLabels?: Record<string, string>;
  title: string;
  description: string;
  emptyText: string;
  addLabel?: string;
  onAdd: () => void;
  onMove: (index: number, direction: -1 | 1) => void;
  onRemove: (portId: string) => void;
  onRename: (portId: string, label: string, index: number) => void;
}

export const CompoundExtraInputEditor = memo(function CompoundExtraInputEditor({
  extraInputIds,
  portLabels,
  title,
  description,
  emptyText,
  addLabel = "添加输入",
  onAdd,
  onMove,
  onRemove,
  onRename,
}: CompoundExtraInputEditorProps) {
  return (
    <div className="space-y-2 rounded-lg border border-border bg-card p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-foreground">{title}</p>
          <p className="mt-1 text-[10px] leading-5 text-muted-foreground">
            {description}
          </p>
        </div>
        <button
          type="button"
          onClick={onAdd}
          className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] text-foreground hover:bg-muted"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>{addLabel}</span>
        </button>
      </div>

      {extraInputIds.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">{emptyText}</p>
      ) : (
        <div className="space-y-1.5">
          {extraInputIds.map((portId, index) => (
            <div
              key={portId}
              className="flex items-center gap-2 rounded-md border border-border/60 bg-background/60 px-2 py-2"
            >
              <div className="min-w-0 flex-1">
                <input
                  type="text"
                  value={portLabels?.[portId] ?? `输入 ${index + 1}`}
                  onChange={(event) =>
                    onRename(portId, event.target.value, index)
                  }
                  placeholder={`输入 ${index + 1}`}
                  className="min-w-0 w-full rounded border border-transparent bg-transparent px-1 py-0.5 text-xs font-medium text-foreground hover:border-border focus:border-primary/50 focus:outline-none"
                />
                <p className="px-1 text-[10px] font-mono text-muted-foreground">
                  {portId}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onMove(index, -1)}
                disabled={index === 0}
                aria-label="上移输入端口"
                className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
              >
                <ChevronUp className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => onMove(index, 1)}
                disabled={index === extraInputIds.length - 1}
                aria-label="下移输入端口"
                className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
              >
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => onRemove(portId)}
                aria-label="删除输入端口"
                className="rounded p-1 text-muted-foreground hover:bg-error/10 hover:text-error"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
});
