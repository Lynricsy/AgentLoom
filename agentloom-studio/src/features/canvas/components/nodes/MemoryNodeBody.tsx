import { memo } from 'react';
import { useViewport } from '@xyflow/react';
import { BrainCircuit } from 'lucide-react';

// -- helpers ----------------------------------------------------------------

function readStringValue(
  config: Record<string, unknown>,
  key: string,
): string | undefined {
  const v = config[key];
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

function readNumericValue(
  config: Record<string, unknown>,
  key: string,
): number | undefined {
  const v = config[key];
  return typeof v === 'number' ? v : undefined;
}

function isMemoryConfigured(config: Record<string, unknown>): boolean {
  return !!readStringValue(config, 'memoryInstanceId');
}

// -- component --------------------------------------------------------------

export const MemoryNodeBody = memo(function MemoryNodeBody({
  config,
}: {
  config: Record<string, unknown>;
}) {
  const { zoom } = useViewport();

  const isHighDetail = zoom >= 0.7;
  const isMedDetail = zoom >= 0.4;

  const configured = isMemoryConfigured(config);
  const instanceName =
    readStringValue(config, 'memoryInstanceName') ??
    readStringValue(config, 'label') ??
    'Memory';
  const role = readStringValue(config, 'role') ?? 'primary';
  const priority = readNumericValue(config, 'fusionPriority') ?? 1;

  return (
    <div
      className="flex flex-col items-center gap-0.5 px-1"
      data-testid="memory-node-body"
    >
      {/* Icon — always visible */}
      <BrainCircuit className="h-4 w-4 shrink-0 text-purple-400" />

      {/* Low LOD: just the label */}
      {!isMedDetail && (
        <span className="text-[10px] leading-tight text-neutral-400">
          Memory
        </span>
      )}

      {/* Medium LOD: + instance name */}
      {isMedDetail && !isHighDetail && (
        <span
          className="max-w-[100px] truncate text-[10px] leading-tight text-neutral-300"
          data-testid="memory-instance-name"
        >
          {configured ? instanceName : 'Not configured'}
        </span>
      )}

      {/* High LOD: instance name + role badge + priority */}
      {isHighDetail && (
        <>
          <span
            className="max-w-[120px] truncate text-xs leading-tight text-neutral-200"
            data-testid="memory-instance-name"
          >
            {configured ? instanceName : 'Not configured'}
          </span>

          {configured && (
            <div className="flex items-center gap-1">
              <span
                className={`rounded px-1 text-[10px] leading-tight ${
                  role === 'primary'
                    ? 'bg-purple-500/20 text-purple-300'
                    : 'bg-neutral-600/40 text-neutral-400'
                }`}
                data-testid="memory-role-badge"
              >
                {role}
              </span>
              <span
                className="text-[10px] leading-tight text-neutral-500"
                data-testid="memory-priority"
              >
                P{priority}
              </span>
            </div>
          )}
        </>
      )}
    </div>
  );
});
