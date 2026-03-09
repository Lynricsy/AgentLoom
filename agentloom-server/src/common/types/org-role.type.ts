export type OrgRole = 'owner' | 'admin' | 'creator' | 'operator' | 'viewer';

export const ORG_ROLES = [
  'owner',
  'admin',
  'creator',
  'operator',
  'viewer',
] as const;
