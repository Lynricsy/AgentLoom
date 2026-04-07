export const WORKSPACE_STORAGE_PREFIX = 'tenants';

export const MAX_WORKSPACE_SIZE = 500 * 1024 * 1024;

export const WORKSPACE_SNAPSHOT_FILENAME = 'snapshot.tar';
export const LEGACY_EMPTY_WORKSPACE_ID = 'empty';

export function buildWorkspaceStorageKey(
  tenantId: string,
  workspaceId: string,
): string {
  return `${WORKSPACE_STORAGE_PREFIX}/${tenantId}/workspaces/${workspaceId}/${WORKSPACE_SNAPSHOT_FILENAME}`;
}

export function buildLegacyEmptyWorkspaceStorageKey(tenantId: string): string {
  return buildWorkspaceStorageKey(tenantId, LEGACY_EMPTY_WORKSPACE_ID);
}

export function isLegacyEmptyWorkspaceStorageKey(
  tenantId: string,
  storageKey: string,
): boolean {
  return storageKey === buildLegacyEmptyWorkspaceStorageKey(tenantId);
}
