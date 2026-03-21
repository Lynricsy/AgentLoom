import { memo, useCallback, useState } from 'react';
import { Bot, Plus, Trash2 } from 'lucide-react';

interface SubAgentConfigPanelProps {
  config: Record<string, unknown>;
  onApply: (patch: Record<string, unknown>) => void;
}

interface MappingEntry {
  uid: string;
  key: string;
  value: string;
}

function buildInitialMappings(config: Record<string, unknown>): MappingEntry[] {
  const raw = config.inputMapping;
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return Object.entries(raw as Record<string, unknown>).map(([k, v]) => ({
      uid: crypto.randomUUID(),
      key: k,
      value: String(v),
    }));
  }
  return [];
}

export const SubAgentConfigPanel = memo(function SubAgentConfigPanel({
  config,
  onApply,
}: SubAgentConfigPanelProps) {
  const [agentDefinitionId, setAgentDefinitionId] = useState<string>(
    typeof config.agentDefinitionId === 'string' ? config.agentDefinitionId : '',
  );
  const [agentVersionId, setAgentVersionId] = useState<string>(
    typeof config.agentVersionId === 'string' ? config.agentVersionId : '',
  );
  const [mappingEntries, setMappingEntries] = useState<MappingEntry[]>(() =>
    buildInitialMappings(config),
  );

  const handleApply = useCallback(() => {
    const inputMapping: Record<string, string> = {};
    for (const entry of mappingEntries) {
      if (entry.key.trim()) {
        inputMapping[entry.key.trim()] = entry.value;
      }
    }
    const next: Record<string, unknown> = {
      agentDefinitionId: agentDefinitionId.trim(),
    };
    if (agentVersionId.trim()) {
      next.agentVersionId = agentVersionId.trim();
    }
    if (Object.keys(inputMapping).length > 0) {
      next.inputMapping = inputMapping;
    }
    onApply({ config: next });
  }, [agentDefinitionId, agentVersionId, mappingEntries, onApply]);

  const handleAddMapping = useCallback(() => {
    setMappingEntries((prev) => [
      ...prev,
      { uid: crypto.randomUUID(), key: '', value: '' },
    ]);
  }, []);

  const handleRemoveMapping = useCallback((uid: string) => {
    setMappingEntries((prev) => prev.filter((e) => e.uid !== uid));
  }, []);

  const handleMappingKeyChange = useCallback((uid: string, key: string) => {
    setMappingEntries((prev) =>
      prev.map((e) => (e.uid === uid ? { ...e, key } : e)),
    );
  }, []);

  const handleMappingValueChange = useCallback((uid: string, value: string) => {
    setMappingEntries((prev) =>
      prev.map((e) => (e.uid === uid ? { ...e, value } : e)),
    );
  }, []);

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Bot className="h-4 w-4 text-sky-400" />
          <span className="text-sm font-medium text-slate-200">子 Agent</span>
        </div>
        <div className="flex flex-col gap-1">
          <label
            htmlFor="sub-agent-def-id"
            className="text-xs text-slate-400"
          >
            Agent 定义 ID
          </label>
          <input
            id="sub-agent-def-id"
            type="text"
            value={agentDefinitionId}
            onChange={(e) => setAgentDefinitionId(e.target.value)}
            placeholder="输入 Agent 定义 UUID"
            className="rounded border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm text-slate-200 placeholder:text-slate-500 focus:border-sky-500 focus:outline-none"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label
            htmlFor="sub-agent-version-id"
            className="text-xs text-slate-400"
          >
            指定版本 ID（可选，留空则使用已发布版本）
          </label>
          <input
            id="sub-agent-version-id"
            type="text"
            value={agentVersionId}
            onChange={(e) => setAgentVersionId(e.target.value)}
            placeholder="输入版本 UUID（可选）"
            className="rounded border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm text-slate-200 placeholder:text-slate-500 focus:border-sky-500 focus:outline-none"
          />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-slate-200">输入映射</span>
          <button
            type="button"
            onClick={handleAddMapping}
            className="flex items-center gap-1 rounded px-2 py-1 text-xs text-sky-400 hover:bg-slate-700"
          >
            <Plus className="h-3 w-3" />
            添加
          </button>
        </div>
        {mappingEntries.length === 0 && (
          <p className="text-xs text-slate-500">暂无输入映射</p>
        )}
        {mappingEntries.map((entry) => (
          <div key={entry.uid} className="flex items-center gap-2">
            <input
              type="text"
              value={entry.key}
              onChange={(e) => handleMappingKeyChange(entry.uid, e.target.value)}
              placeholder="键"
              aria-label="映射键"
              className="flex-1 rounded border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-200 placeholder:text-slate-500 focus:border-sky-500 focus:outline-none"
            />
            <span className="text-slate-500">→</span>
            <input
              type="text"
              value={entry.value}
              onChange={(e) =>
                handleMappingValueChange(entry.uid, e.target.value)
              }
              placeholder="值"
              aria-label="映射值"
              className="flex-1 rounded border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-200 placeholder:text-slate-500 focus:border-sky-500 focus:outline-none"
            />
            <button
              type="button"
              onClick={() => handleRemoveMapping(entry.uid)}
              className="rounded p-1 text-slate-500 hover:bg-slate-700 hover:text-red-400"
              aria-label="删除映射"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={handleApply}
        className="mt-2 rounded bg-sky-500 px-4 py-2 text-sm font-medium text-white hover:bg-sky-600 focus:outline-none"
      >
        应用
      </button>
    </div>
  );
});
