// 用户认证服务
import { fetch as tauriFetch } from '@tauri-apps/plugin-http';

const API_BASE = 'http://47.86.24.6:8899';

// localStorage 键名
const TOKEN_KEY = 'sync_auth_token';
const USER_KEY = 'sync_auth_user';

export interface UserInfo {
  id: number;
  username: string;
  role: string;
  remaining_seconds: number;
}

export interface LoginResponse {
  token: string;
  user: UserInfo;
}

// ==================== Token 管理 ====================

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function getStoredUser(): UserInfo | null {
  const data = localStorage.getItem(USER_KEY);
  return data ? JSON.parse(data) : null;
}

export function setStoredUser(user: UserInfo): void {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function isLoggedIn(): boolean {
  return !!getToken();
}

export function isAdmin(): boolean {
  const user = getStoredUser();
  return user?.role === 'admin';
}

// ==================== API 调用 ====================

export async function login(username: string, password: string): Promise<LoginResponse> {
  const response = await tauriFetch(`${API_BASE}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: '登录失败' }));
    throw new Error(error.error || `登录失败: ${response.status}`);
  }

  const data: LoginResponse = await response.json();
  
  // 保存 token 和用户信息
  setToken(data.token);
  setStoredUser(data.user);
  
  return data;
}

export function logout(): void {
  clearToken();
}

// ==================== 获取认证头 ====================

export function getAuthHeaders(): Record<string, string> {
  const token = getToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
  };
}

// ==================== 验证 Token ====================

/**
 * 验证当前 token 是否有效
 * 通过调用一个需要认证的 API 来检查
 */
export async function verifyToken(): Promise<boolean> {
  const token = getToken();
  if (!token) {
    return false;
  }

  try {
    const response = await tauriFetch(`${API_BASE}/api/me`, {
      method: 'GET',
      headers: getAuthHeaders(),
    });

    if (response.status === 401) {
      // Token 过期，清除登录状态
      clearToken();
      return false;
    }

    if (response.ok) {
      // 更新用户信息
      const user: UserInfo = await response.json();
      setStoredUser(user);
      return true;
    }

    return false;
  } catch (e) {
    console.error('[AuthService] 验证 token 失败:', e);
    // 网络错误时不清除 token，保持登录状态
    return true;
  }
}
