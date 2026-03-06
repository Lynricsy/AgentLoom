import type { OrgRole } from '../types/org-role.type';

export type Permission =
  | 'workflow:edit'
  | 'workflow:run'
  | 'marketplace:publish'
  | 'org:settings'
  | 'org:members'
  | 'audit:read';

export const RBAC_PERMISSION_MATRIX: Record<Permission, OrgRole[]> = {
  'workflow:edit': ['owner', 'admin', 'creator'],
  'workflow:run': ['owner', 'admin', 'creator', 'operator'],
  'marketplace:publish': ['owner', 'admin', 'creator'],
  'org:settings': ['owner', 'admin'],
  'org:members': ['owner', 'admin'],
  'audit:read': ['owner', 'admin'],
};

export function hasPermission(role: OrgRole, permission: Permission): boolean {
  return RBAC_PERMISSION_MATRIX[permission].includes(role);
}
