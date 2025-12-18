// 云端同步相关类型定义

export interface Account {
  id: string;
  email: string;
  label: string;
  status: string;
  addedAt: string;
  accessToken?: string;
  refreshToken?: string;
  csrfToken?: string;
  sessionToken?: string;
  expiresAt?: string;
  provider?: string;
  userId?: string;
  clientId?: string;
  clientSecret?: string;
  region?: string;
  clientIdHash?: string;
  ssoSessionId?: string;
  idToken?: string;
  profileArn?: string;
  usageData?: Record<string, unknown>;
  updatedAt?: string;
}

// API 响应类型
export interface SyncGetResponse {
  data: string;  // 加密后的 JSON 字符串
  version: number;  // 服务器版本号（时间戳）
}

export interface SyncPostRequest {
  data: string;  // 加密后的 JSON 字符串
  basedOnVersion: number;  // 基于的版本号
}

export interface SyncPostSuccessResponse {
  newVersion: number;
}

export interface SyncPostConflictResponse {
  error: 'Conflict';
  serverVersion: number;
}

// 同步状态
export type SyncStatus = 'synced' | 'local_changes' | 'merging' | 'error';

export interface SyncState {
  status: SyncStatus;
  lastSyncedVersion: number | null;
  lastSyncedAt: string | null;
  message?: string;
}
