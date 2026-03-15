export interface PlatformApiTokenResponse {
  id: string;
  name: string;
  tokenPrefix: string;
  scopes: string | null;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  isRevoked: boolean;
  createdAt: Date;
}

/** 仅在创建时一次性返回完整明文 token */
export interface PlatformApiTokenCreateResponse
  extends PlatformApiTokenResponse {
  token: string;
}
