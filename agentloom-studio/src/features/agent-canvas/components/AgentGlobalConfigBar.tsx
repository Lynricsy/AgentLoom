import { memo, useCallback, useState } from 'react';
import { Slider } from '@/shared/ui/slider';
import { Switch } from '@/shared/ui/switch';
import { Select } from '@/shared/ui/select';
import { Button } from '@/shared/ui/button';
import { cn } from '@/shared/lib/utils';
import {
  useAgentCanvasActions,
  useAgentGlobalSandboxConfig,
  useAgentSandboxLifecycle,
  useAgentWorkspaceId,
  useAgentInputSchema,
  useAgentCanvasSaveStatus,
} from '../stores/agent-canvas.store';
import type { AgentInputSchema } from '../stores/agent-canvas.store';

const WORKSPACE_OPTIONS = [
  { value: '__none__', label: '(None)' },
  { value: 'default', label: 'Default Workspace' },
];

const CPU_LIMITS = { min: 0.5, max: 8, step: 0.5 };
const MEMORY_LIMITS = { min: 128, max: 8192, step: 128 };
const TIMEOUT_LIMITS = { min: 30, max: 3600, step: 30 };

interface ConfigSliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  onChange: (value: number) => void;
}

const ConfigSlider = memo(function ConfigSlider({
  label,
  value,
  min,
  max,
  step,
  unit,
  onChange,
}: ConfigSliderProps) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span className="text-xs text-neutral-400">{label}</span>
        <span className="text-xs font-mono text-neutral-300">
          {value}
          {unit}
        </span>
      </div>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={(vals) => onChange(vals[0] ?? value)}
      />
    </div>
  );
});

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
  const sandboxConfig = useAgentGlobalSandboxConfig();
  const lifecycle = useAgentSandboxLifecycle();
  const workspaceId = useAgentWorkspaceId();
  const inputSchema = useAgentInputSchema();
  const { isDirty, isSaving } = useAgentCanvasSaveStatus();
  const {
    setGlobalSandboxConfig,
    setSandboxLifecycle,
    setWorkspaceId,
    setInputSchema,
    saveCanvas,
    compileConfig,
  } = useAgentCanvasActions();

  const [isExpanded, setIsExpanded] = useState(true);

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
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-neutral-300">
                Sandbox
              </span>
              <Switch
                checked={sandboxConfig.enabled ?? true}
                onCheckedChange={(checked) =>
                  setGlobalSandboxConfig({ enabled: checked })
                }
              />
            </div>

            {sandboxConfig.enabled !== false && (
              <>
                <ConfigSlider
                  label="CPU"
                  value={sandboxConfig.cpuLimit ?? 1}
                  {...CPU_LIMITS}
                  unit=" cores"
                  onChange={(v) => setGlobalSandboxConfig({ cpuLimit: v })}
                />
                <ConfigSlider
                  label="Memory"
                  value={sandboxConfig.memoryLimitMb ?? 512}
                  {...MEMORY_LIMITS}
                  unit=" MB"
                  onChange={(v) =>
                    setGlobalSandboxConfig({ memoryLimitMb: v })
                  }
                />
                <ConfigSlider
                  label="Timeout"
                  value={sandboxConfig.timeoutSeconds ?? 300}
                  {...TIMEOUT_LIMITS}
                  unit="s"
                  onChange={(v) =>
                    setGlobalSandboxConfig({ timeoutSeconds: v })
                  }
                />
              </>
            )}
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

          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="flex-1 text-xs"
              onClick={() => void saveCanvas()}
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
