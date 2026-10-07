import { memo } from "react";
import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Card } from "@/shared/ui/card";
import { Input } from "@/shared/ui/input";

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
    <Card className="space-y-2 p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-foreground">{title}</p>
          <p className="mt-1 text-2xs leading-5 text-muted-foreground">
            {description}
          </p>
        </div>
        <Button variant="outline" size="xs" onClick={onAdd}>
          <Plus />
          <span>{addLabel}</span>
        </Button>
      </div>

      {extraInputIds.length === 0 ? (
        <p className="text-2xs text-muted-foreground">{emptyText}</p>
      ) : (
        <div className="space-y-1.5">
          {extraInputIds.map((portId, index) => (
            <div
              key={portId}
              className="flex items-center gap-2 rounded-md border border-border bg-muted px-2 py-2"
            >
              <div className="min-w-0 flex-1">
                <Input
                  type="text"
                  value={portLabels?.[portId] ?? `输入 ${index + 1}`}
                  onChange={(event) =>
                    onRename(portId, event.target.value, index)
                  }
                  placeholder={`输入 ${index + 1}`}
                  className="h-7 border-transparent bg-transparent px-1 text-xs font-medium shadow-none hover:border-border"
                />
                <p className="px-1 text-2xs font-mono text-muted-foreground">
                  {portId}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => onMove(index, -1)}
                disabled={index === 0}
                aria-label="上移输入端口"
                className="text-muted-foreground hover:text-foreground disabled:opacity-30"
              >
                <ChevronUp />
              </Button>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => onMove(index, 1)}
                disabled={index === extraInputIds.length - 1}
                aria-label="下移输入端口"
                className="text-muted-foreground hover:text-foreground disabled:opacity-30"
              >
                <ChevronDown />
              </Button>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => onRemove(portId)}
                aria-label="删除输入端口"
                className="text-muted-foreground hover:bg-error/10 hover:text-error"
              >
                <Trash2 />
              </Button>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
});
