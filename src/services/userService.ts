// 用户管理服务
import { fetch as tauriFetch } from '@tauri-apps/plugin-http';
import { getAuthHeaders } from './authService';

const API_BASE = 'http://47.86.24.6:8899';

export interface SyncUser {
  id: number;
  username: string;
  role: string;
  remaining_seconds: number;
  remaining_days: number;
  created_at: string;
}

export interface CreateUserData {
  username: string;
  password: string;
  role?: string;
  remaining_days?: number;
}

export interface UpdateUserData {
  password?: string;
  role?: string;
  remaining_days?: number;
}

// 获取用户列表
export async function getUsers(): Promise<SyncUser[]> {
  console.log('[UserService] 获取用户列表...');
  console.log('[UserService] Headers:', getAuthHeaders());
  
  try {
    const response = await tauriFetch(`${API_BASE}/api/users`, {
      method: 'GET',
      headers: getAuthHeaders(),
    });

    console.log('[UserService] 响应状态:', response.status);

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: '获取用户列表失败' }));
      console.error('[UserService] 错误:', error);
      throw new Error(error.error || `请求失败: ${response.status}`);
    }

    const data = await response.json();
    console.log('[UserService] 用户列表:', data);
    return data;
  } catch (e) {
    console.error('[UserService] 请求异常:', e);
    throw e;
  }
}

// 创建用户
export async function createUser(data: CreateUserData): Promise<SyncUser> {
  const response = await tauriFetch(`${API_BASE}/api/users`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: '创建用户失败' }));
    throw new Error(error.error || `请求失败: ${response.status}`);
  }

  const result = await response.json();
  return result.user;
}

// 更新用户
export async function updateUser(id: number, data: UpdateUserData): Promise<SyncUser> {
  const response = await tauriFetch(`${API_BASE}/api/users/${id}`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: '更新用户失败' }));
    throw new Error(error.error || `请求失败: ${response.status}`);
  }

  const result = await response.json();
  return result.user;
}

// 删除用户
export async function deleteUser(id: number): Promise<void> {
  const response = await tauriFetch(`${API_BASE}/api/users/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: '删除用户失败' }));
    throw new Error(error.error || `请求失败: ${response.status}`);
  }
}
