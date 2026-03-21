export const WORKSPACE_STORAGE_PREFIX = 'tenants';

export const MAX_WORKSPACE_SIZE = 500 * 1024 * 1024;

export const WORKSPACE_SNAPSHOT_FILENAME = 'snapshot.tar';

export function buildWorkspaceStorageKey(
  tenantId: string,
  workspaceId: string,
): string {
  return `${WORKSPACE_STORAGE_PREFIX}/${tenantId}/workspaces/${workspaceId}/${WORKSPACE_SNAPSHOT_FILENAME}`;
}
