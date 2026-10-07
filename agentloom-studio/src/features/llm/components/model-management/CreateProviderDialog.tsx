import { useCallback, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/shared/ui/button";
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import { useToast } from "@/shared/ui/toast";
import type { ApiProtocol, CreateLlmProviderInput } from "../../types";
import { API_PROTOCOL_VALUES } from "../../types";
import { useCreateProvider } from "../../hooks/useLlmModels";
import { ManagedApiKeyField } from "../ManagedApiKeyField";
import { PROTOCOL_LABELS } from "./modelMeta";

interface CreateProviderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateProviderDialog({
  open,
  onOpenChange,
}: CreateProviderDialogProps) {
  const { notify } = useToast();
  const createMutation = useCreateProvider();

  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [apiProtocol, setApiProtocol] = useState<ApiProtocol>("openai_chat");

  const handleSubmit = useCallback(async () => {
    if (!name.trim()) {
      notify({ description: "请输入提供商名称", variant: "error" });
      return;
    }
    if (!baseUrl.trim()) {
      notify({ description: "请输入 Base URL", variant: "error" });
      return;
    }

    const input: CreateLlmProviderInput = {
      name: name.trim(),
      baseUrl: baseUrl.trim(),
      apiKey: apiKey.trim() || undefined,
      apiProtocol,
      isEnabled: true,
    };

    try {
      await createMutation.mutateAsync(input);
      notify({
        title: "提供商已创建",
        description: `${name.trim()} 已添加`,
        variant: "success",
      });
      setName("");
      setBaseUrl("");
      setApiKey("");
      setApiProtocol("openai_chat");
      onOpenChange(false);
    } catch (err) {
      notify({
        title: "创建失败",
        description: err instanceof Error ? err.message : "请稍后重试",
        variant: "error",
      });
    }
  }, [name, baseUrl, apiProtocol, createMutation, notify, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md" aria-describedby="create-provider-dialog-desc">
        <DialogHeader>
          <DialogTitle>添加自定义提供商</DialogTitle>
          <DialogDescription id="create-provider-dialog-desc">
            配置自定义 LLM 提供商，通常为 OpenAI 兼容 API。
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-4">
            <div className="space-y-2">
              <Label>名称</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="例如: DeepSeek, Groq..."
              />
            </div>

            <div className="space-y-2">
              <Label>Base URL</Label>
              <Input
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="https://api.example.com/v1"
              />
            </div>

            <div className="space-y-2">
              <Label>API 协议</Label>
              <Select
                value={apiProtocol}
                onValueChange={(v) => setApiProtocol(v as ApiProtocol)}
              >
                <SelectTrigger aria-label="API 协议">
                  <SelectValue placeholder="请选择 API 协议" />
                </SelectTrigger>
                <SelectContent>
                  {API_PROTOCOL_VALUES.map((p) => (
                    <SelectItem key={p} value={p}>
                      {PROTOCOL_LABELS[p]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>API Key</Label>
              <ManagedApiKeyField
                value={apiKey}
                onValueChange={setApiKey}
                hasStoredApiKey={false}
                clearRequested={false}
                onClearRequestedChange={() => undefined}
                helperText="可选。若填写，会在创建 Provider 时由服务端直接加密托管。"
                inputTestId="create-provider-api-key-input"
              />
            </div>
        </DialogBody>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">取消</Button>
          </DialogClose>
          <Button
            onClick={() => void handleSubmit()}
            disabled={createMutation.isPending}
          >
            {createMutation.isPending && (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            )}
            创建
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
