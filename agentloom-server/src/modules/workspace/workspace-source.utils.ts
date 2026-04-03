import type { WorkspaceSnapshot } from '../../database/schema';

export type WorkspaceSourceKind =
  | 'manual'
  | 'sandbox_snapshot'
  | 'execution_archive';

export type WorkspaceListItem = WorkspaceSnapshot & {
  sourceKind: WorkspaceSourceKind;
  isAutoArchived: boolean;
};

const EXECUTION_ARCHIVE_NAME_PATTERN = /^execution-.+-step-.+-workspace$/i;

function hasSourceSandboxSessionId(
  config: WorkspaceSnapshot['config'],
): boolean {
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    return false;
  }

  return typeof config['sourceSandboxSessionId'] === 'string';
}

export function deriveWorkspaceSourceKind(
  snapshot: Pick<WorkspaceSnapshot, 'name' | 'config'>,
): WorkspaceSourceKind {
  if (EXECUTION_ARCHIVE_NAME_PATTERN.test(snapshot.name)) {
    return 'execution_archive';
  }

  if (hasSourceSandboxSessionId(snapshot.config)) {
    return 'sandbox_snapshot';
  }

  return 'manual';
}

export function enrichWorkspaceSnapshot(
  snapshot: WorkspaceSnapshot,
): WorkspaceListItem {
  const sourceKind = deriveWorkspaceSourceKind(snapshot);

  return {
    ...snapshot,
    sourceKind,
    isAutoArchived: sourceKind === 'execution_archive',
  };
}
