// 账号占用服务
import { fetch as tauriFetch } from '@tauri-apps/plugin-http';
import { getAuthHeaders, getStoredUser } from './authService';

const API_BASE = 'http://47.86.24.6:8899';

export interface OccupancyInfo {
  kiro_account_id: string;
  user_id: number;
  username: string;
}

export interface OccupyResponse {
  success: boolean;
  message: string;
  occupied_by?: string;
}

export interface HeartbeatResponse {
  status: string;
  remaining_seconds: number;
  occupancy_map: OccupancyInfo[];
}

// 占用账号
export async function occupyAccount(kiroAccountId: string): Promise<OccupyResponse> {
  const response = await tauriFetch(`${API_BASE}/api/account/occupy`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ kiro_account_id: kiroAccountId }),
  });

  const data = await response.json();
  
  if (!response.ok && response.status !== 200) {
    throw new Error(data.error || `请求失败: ${response.status}`);
  }

  return data;
}

// 发送心跳（续期占用 + 获取全量状态）
export async function sendHeartbeat(activeKiroAccountId?: string): Promise<HeartbeatResponse> {
  const response = await tauriFetch(`${API_BASE}/api/heartbeat`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ active_kiro_account_id: activeKiroAccountId || null }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: '心跳失败' }));
    throw new Error(error.error || `请求失败: ${response.status}`);
  }

  return response.json();
}

// 将 occupancy_map 数组转换为 Record<string, string> 格式
export function toOccupancyRecord(occupancyMap: OccupancyInfo[]): Record<string, string> {
  const record: Record<string, string> = {};
  for (const item of occupancyMap) {
    record[item.kiro_account_id] = item.username;
  }
  return record;
}

// 获取当前用户名
export function getCurrentUsername(): string | null {
  const user = getStoredUser();
  return user?.username || null;
}
