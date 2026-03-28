import { HTTPError } from 'ky';
import { memo, useCallback, useState } from 'react';
import { BrainCircuit, Container } from 'lucide-react';
import { Switch } from '@/shared/ui/switch';
import { Select } from '@/shared/ui/select';
import { Button } from '@/shared/ui/button';
import { cn } from '@/shared/lib/utils';
import type { ApiError } from '@/shared/types/api';
import { useToast } from '@/shared/ui/toast';
import { useAllMemoryInstances } from '@/features/canvas/hooks/useMemoryInstances';
import {
  useAgentCanvasActions,
  useAgentSandboxLifecycle,
  useAgentWorkspaceId,
  useAgentInputSchema,
  useAgentCanvasSaveStatus,
  useAgentMemoryInstanceIds,
} from '../stores/agent-canvas.store';
import type { AgentInputSchema } from '../stores/agent-canvas.store';

const WORKSPACE_OPTIONS = [
  { value: '__none__', label: '(None)' },
  { value: 'default', label: 'Default Workspace' },
];

type ApiProblemDetails = ApiError & {
  errors?: Array<{ field?: string; message?: string }>;
};

async function resolveSaveErrorMessage(error: unknown): Promise<string> {
  const fallback = 'Agent 画布保存失败，请稍后重试。';
  if (!(error instanceof HTTPError)) {
    return fallback;
  }

  try {
    const payload = (await error.response.clone().json()) as ApiProblemDetails;
    return payload.detail ?? payload.errors?.[0]?.message ?? fallback;
  } catch {
    return fallback;
  }
}

const InputSchemaEditor = memo(function InputSchemaEditor({
  schema,
  onChange,
}: {
  schema: AgentInputSchema;
  onChange: (schema: AgentInputSchema) => void;
}) {
  const [newFieldName, setNewFieldName] = useState('');

  const addField = useCallback(() => {
    const name = newFieldName.trim();
    if (!name || schema.properties[name]) return;
    onChange({
      ...schema,
      properties: {
        ...schema.properties,
        [name]: { type: 'string' },
      },
    });
    setNewFieldName('');
  }, [newFieldName, schema, onChange]);

  const removeField = useCallback(
    (fieldName: string) => {
      const { [fieldName]: _, ...rest } = schema.properties;
      onChange({
        ...schema,
        properties: rest,
        required: schema.required?.filter((r) => r !== fieldName),
      });
    },
    [schema, onChange],
  );

  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-medium text-neutral-300">Input Schema</span>
      {Object.entries(schema.properties).map(([name, field]) => (
        <div key={name} className="flex items-center gap-2">
          <span className="text-xs text-neutral-400 truncate flex-1">{name}</span>
          <span className="text-xs text-neutral-500">{field.type}</span>
          <button
            type="button"
            className="text-xs text-red-400 hover:text-red-300 cursor-pointer"
            onClick={() => removeField(name)}
          >
            x
          </button>
        </div>
      ))}
      <div className="flex items-center gap-1">
        <input
          type="text"
          value={newFieldName}
          onChange={(e) => setNewFieldName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
              e.preventDefault();
              addField();
            }
          }}
          placeholder="Field name..."
          className="flex-1 bg-neutral-800 border border-neutral-700 rounded px-2 py-1 text-xs text-neutral-200 placeholder:text-neutral-600 outline-none focus:border-blue-500"
        />
        <Button
          variant="ghost"
          size="sm"
          onClick={addField}
          disabled={!newFieldName.trim()}
          className="text-xs h-6 px-2"
        >
          +
        </Button>
      </div>
    </div>
  );
});

export const AgentGlobalConfigBar = memo(function AgentGlobalConfigBar({
  className,
}: {
  className?: string;
}) {
  const { notify } = useToast();
  const lifecycle = useAgentSandboxLifecycle();
  const workspaceId = useAgentWorkspaceId();
  const inputSchema = useAgentInputSchema();
  const memoryInstanceIds = useAgentMemoryInstanceIds();
  const { isDirty, isSaving } = useAgentCanvasSaveStatus();
  const {
    setSandboxLifecycle,
    setWorkspaceId,
    setInputSchema,
    setMemoryInstanceIds,
    saveCanvas,
    compileConfig,
  } = useAgentCanvasActions();
  const { data: memoryInstances, isLoading: isLoadingMemory } =
    useAllMemoryInstances();

  const [isExpanded, setIsExpanded] = useState(true);

  const handleToggleMemoryInstance = useCallback(
    (instanceId: string) => {
      const current = memoryInstanceIds;
      const next = current.includes(instanceId)
        ? current.filter((id) => id !== instanceId)
        : [...current, instanceId];
      setMemoryInstanceIds(next);
    },
    [memoryInstanceIds, setMemoryInstanceIds],
  );

  const handleSave = useCallback(() => {
    void saveCanvas().catch(async (error) => {
      notify({
        title: '保存失败',
        description: await resolveSaveErrorMessage(error),
        variant: 'error',
      });
    });
  }, [notify, saveCanvas]);

  return (
    <div
      className={cn(
        'absolute top-3 left-3 z-10 flex flex-col gap-3 bg-neutral-900/95 backdrop-blur-sm border border-neutral-700 rounded-lg p-3 w-72 max-h-[calc(100vh-6rem)] overflow-y-auto',
        className,
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-neutral-200">
          Agent Config
        </span>
        <div className="flex items-center gap-2">
          {isDirty && (
            <span className="text-xs text-amber-400">Unsaved</span>
          )}
          <button
            type="button"
            className="text-neutral-400 hover:text-neutral-200 text-xs cursor-pointer"
            onClick={() => setIsExpanded((v) => !v)}
          >
            {isExpanded ? 'Collapse' : 'Expand'}
          </button>
        </div>
      </div>

      {isExpanded && (
        <>
          <div className="flex flex-col gap-2 border-b border-neutral-700 pb-3">
            <div className="flex items-center gap-1.5">
              <Container className="h-3.5 w-3.5 text-teal-400" />
              <span className="text-xs font-medium text-neutral-300">
                Sandbox
              </span>
            </div>
            <p className="text-xs text-neutral-500 leading-relaxed">
              沙箱配置已迁移到画布沙箱节点，请在画布中添加「沙箱环境」节点并连接至 Agent 进行配置。
            </p>
          </div>

          <div className="flex flex-col gap-2 border-b border-neutral-700 pb-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-neutral-300">
                Lifecycle
              </span>
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-neutral-500">Session</span>
                <Switch
                  checked={lifecycle === 'persistent'}
                  onCheckedChange={(checked) =>
                    setSandboxLifecycle(checked ? 'persistent' : 'session')
                  }
                />
                <span className="text-xs text-neutral-500">Persistent</span>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2 border-b border-neutral-700 pb-3">
            <span className="text-xs font-medium text-neutral-300">
              Workspace
            </span>
            <Select
              value={workspaceId ?? '__none__'}
              onValueChange={(v) =>
                setWorkspaceId(v === '__none__' ? null : v)
              }
            >
              {WORKSPACE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </Select>
          </div>

          <InputSchemaEditor schema={inputSchema} onChange={setInputSchema} />

          {/* Memory Instances */}
          <div className="flex flex-col gap-2 border-b border-neutral-700 pb-3">
            <div className="flex items-center gap-1.5">
              <BrainCircuit className="h-3.5 w-3.5 text-purple-400" />
              <span className="text-xs font-medium text-neutral-300">
                Memory Instances
              </span>
            </div>

            {isLoadingMemory ? (
              <span className="text-xs text-neutral-500">
                Loading instances...
              </span>
            ) : !memoryInstances?.length ? (
              <span className="text-xs text-neutral-500">
                No memory instances available
              </span>
            ) : (
              <div className="flex flex-col gap-1.5">
                {memoryInstances.map((instance) => {
                  const isSelected = memoryInstanceIds.includes(instance.id);
                  const selectedIndex = memoryInstanceIds.indexOf(instance.id);
                  const isPrimary = selectedIndex === 0;
                  return (
                    <button
                      key={instance.id}
                      type="button"
                      className={cn(
                        'flex items-center justify-between rounded px-2 py-1.5 text-left text-xs transition-colors cursor-pointer',
                        isSelected
                          ? 'bg-purple-500/20 border border-purple-500/40 text-purple-200'
                          : 'bg-neutral-800 border border-neutral-700 text-neutral-400 hover:border-neutral-600 hover:text-neutral-300',
                      )}
                      onClick={() => handleToggleMemoryInstance(instance.id)}
                      data-testid={`memory-instance-toggle-${instance.id}`}
                    >
                      <span className="truncate flex-1">{instance.name}</span>
                      {isSelected && (
                        <span
                          className={cn(
                            'ml-2 shrink-0 rounded px-1 py-0.5 text-[10px] font-medium',
                            isPrimary
                              ? 'bg-purple-500/30 text-purple-300'
                              : 'bg-neutral-600/50 text-neutral-400',
                          )}
                        >
                          {isPrimary ? 'Primary' : 'Readonly'}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            {memoryInstanceIds.length > 0 && (
              <span className="text-[10px] text-neutral-500">
                First selected = primary (writeable). Rest = readonly.
              </span>
            )}
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="flex-1 text-xs"
              onClick={handleSave}
              disabled={isSaving || !isDirty}
            >
              {isSaving ? 'Saving...' : 'Save'}
            </Button>
            <Button
              size="sm"
              className="flex-1 text-xs"
              onClick={() => void compileConfig()}
            >
              Compile
            </Button>
          </div>
        </>
      )}
    </div>
  );
});
