import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import type { LlmModelInfo } from "../types";

/** Radix Select 不接受空串 value，用哨兵表示「自动」，对外映射回 undefined */
const AUTO_MODEL = "__auto__";

export interface ChatModelSelectProps {
  id: string;
  /** 选中的模型配置 id；undefined 表示自动（使用账号默认对话模型） */
  value: string | undefined;
  onValueChange: (value: string | undefined) => void;
  models: LlmModelInfo[];
  disabled?: boolean;
  "data-testid"?: string;
}

/** 对话模型下拉：默认「自动」，其余选项为调用方传入的可用对话模型 */
export function ChatModelSelect({
  id,
  value,
  onValueChange,
  models,
  disabled,
  "data-testid": testId,
}: ChatModelSelectProps) {
  return (
    <Select
      value={value ?? AUTO_MODEL}
      onValueChange={(next) =>
        onValueChange(next === AUTO_MODEL ? undefined : next)
      }
      disabled={disabled}
    >
      <SelectTrigger id={id} data-testid={testId}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={AUTO_MODEL}>自动（使用账号默认对话模型）</SelectItem>
        {models.map((model) => (
          <SelectItem key={model.id} value={model.id}>
            {model.providerEntity?.name
              ? `${model.name} · ${model.providerEntity.name}`
              : model.name}
            {model.isDefault ? "（默认）" : ""}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
