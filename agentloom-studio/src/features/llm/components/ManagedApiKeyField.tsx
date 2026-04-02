import { memo } from "react";

import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";

interface ManagedApiKeyFieldProps {
  value: string;
  onValueChange: (value: string) => void;
  hasStoredApiKey: boolean;
  clearRequested: boolean;
  onClearRequestedChange: (next: boolean) => void;
  disabled?: boolean;
  placeholder?: string;
  helperText?: string | null;
  warningText?: string | null;
  errorText?: string | null;
  inputTestId?: string;
  sectionTestId?: string;
}

export const ManagedApiKeyField = memo(function ManagedApiKeyField({
  value,
  onValueChange,
  hasStoredApiKey,
  clearRequested,
  onClearRequestedChange,
  disabled = false,
  placeholder,
  helperText = "输入后会由服务端加密托管，不会回显明文。",
  warningText,
  errorText,
  inputTestId,
  sectionTestId,
}: ManagedApiKeyFieldProps) {
  const hasConfiguredKey = hasStoredApiKey && !clearRequested;
  const resolvedPlaceholder =
    placeholder ??
    (hasConfiguredKey ? "留空表示保持当前 API Key" : "输入 API Key");

  return (
    <div className="space-y-2" data-testid={sectionTestId}>
      <Input
        type="password"
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        placeholder={resolvedPlaceholder}
        autoComplete="new-password"
        data-testid={inputTestId}
        disabled={disabled}
      />

      {errorText ? (
        <p className="text-[11px] text-error">{errorText}</p>
      ) : warningText ? (
        <p className="text-[11px] text-warning">{warningText}</p>
      ) : clearRequested ? (
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[11px] text-warning">保存后会移除当前 API Key。</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7"
            onClick={() => onClearRequestedChange(false)}
            disabled={disabled}
          >
            保留当前
          </Button>
        </div>
      ) : hasConfiguredKey ? (
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[11px] text-muted-foreground">
            当前已配置 API Key，留空表示保持不变；输入新 key 会替换。
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7"
            onClick={() => onClearRequestedChange(true)}
            disabled={disabled}
          >
            移除当前 Key
          </Button>
        </div>
      ) : helperText ? (
        <p className="text-[11px] text-muted-foreground">{helperText}</p>
      ) : null}
    </div>
  );
});
