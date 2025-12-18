// 云端同步服务 - 乐观并发控制实现
// 使用 Tauri HTTP 插件绕过浏览器 CORS 限制
import { invoke } from '@tauri-apps/api/core';
import { fetch as tauriFetch } from '@tauri-apps/plugin-http';
import type { Account, SyncGetResponse, SyncState } from './types';

// 同步 API 配置
const SYNC_API_BASE = 'http://47.86.24.6:8899';
const SYNC_KEY = 'xq7JpzqZ1OCYPj5nAnMJtuwshoC8gqHi'; // API 鉴权密钥
const ENCRYPTION_KEY = 'xq7JpzqZ1OCYPj5nAnMJtuwshoC8gqHi'; // 加密密钥

// localStorage 键名
const VERSION_KEY = 'last_synced_version';
const SYNC_TIME_KEY = 'last_synced_at';

// 简单的 XOR 加密（支持 UTF-8）
function encrypt(data: string): string {
  const key = ENCRYPTION_KEY;
  // 先转成 UTF-8 字节数组
  const encoder = new TextEncoder();
  const dataBytes = encoder.encode(data);
  const keyBytes = encoder.encode(key);
  
  // XOR 加密
  const encrypted = new Uint8Array(dataBytes.length);
  for (let i = 0; i < dataBytes.length; i++) {
    encrypted[i] = dataBytes[i] ^ keyBytes[i % keyBytes.length];
  }
  
  // 转成 Base64
  return btoa(String.fromCharCode(...encrypted));
}

function decrypt(encoded: string): string {
  try {
    // Base64 解码
    const binaryStr = atob(encoded);
    const encrypted = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      encrypted[i] = binaryStr.charCodeAt(i);
    }
    
    // XOR 解密
    const encoder = new TextEncoder();
    const keyBytes = encoder.encode(ENCRYPTION_KEY);
    const decrypted = new Uint8Array(encrypted.length);
    for (let i = 0; i < encrypted.length; i++) {
      decrypted[i] = encrypted[i] ^ keyBytes[i % keyBytes.length];
    }
    
    // 转回字符串
    const decoder = new TextDecoder();
    return decoder.decode(decrypted);
  } catch (e) {
    throw new Error('解密失败：数据格式错误或密钥不匹配');
  }
}

// ==================== 版本管理 ====================

export function getLastSyncedVersion(): number | null {
  const v = localStorage.getItem(VERSION_KEY);
  return v ? parseInt(v, 10) : null;
}

export function setLastSyncedVersion(version: number): void {
  localStorage.setItem(VERSION_KEY, version.toString());
  localStorage.setItem(SYNC_TIME_KEY, new Date().toISOString());
}


export function getLastSyncedAt(): string | null {
  return localStorage.getItem(SYNC_TIME_KEY);
}

// ==================== 合并算法 ====================

/**
 * 智能合并账号数据
 * 策略：并集 (Union)，本地优先 (Local Wins)
 */
export function mergeAccounts(localAccounts: Account[], remoteAccounts: Account[]): Account[] {
  const merged = new Map<string, Account>();
  
  // 1. 先放入远程数据
  for (const acc of remoteAccounts) {
    merged.set(acc.id, acc);
  }
  
  // 2. 遍历本地数据
  for (const acc of localAccounts) {
    // 本地数据覆盖远程（Local Wins）
    // 或者是本地新增的账号
    merged.set(acc.id, acc);
  }
  
  return Array.from(merged.values());
}

// ==================== API 调用 (使用 Tauri HTTP 插件) ====================

// 通用请求头（包含鉴权）
const getHeaders = () => ({
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${SYNC_KEY}`,
});

async function fetchFromCloud(): Promise<SyncGetResponse> {
  const response = await tauriFetch(`${SYNC_API_BASE}/sync`, {
    method: 'GET',
    headers: getHeaders(),
  });

  if (!response.ok) {
    throw new Error(`获取云端数据失败: ${response.status}`);
  }

  return response.json();
}

async function pushToCloud(
  data: string,
  basedOnVersion: number
): Promise<{
  success: boolean;
  newVersion?: number;
  conflict?: boolean;
  serverVersion?: number;
}> {
  const response = await tauriFetch(`${SYNC_API_BASE}/sync`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ data, basedOnVersion }),
  });

  if (response.status === 200) {
    const result = await response.json();
    return { success: true, newVersion: result.newVersion };
  }

  if (response.status === 409) {
    const result = await response.json();
    return { success: false, conflict: true, serverVersion: result.serverVersion };
  }

  throw new Error(`上传失败: ${response.status}`);
}

// ==================== 本地数据操作 ====================

async function getLocalAccounts(): Promise<Account[]> {
  return invoke('get_accounts');
}

async function saveLocalAccounts(accounts: Account[]): Promise<void> {
  // 通过导入功能保存
  const json = JSON.stringify(accounts);
  await invoke('import_accounts', { json });
}


// ==================== 核心同步逻辑 ====================

export interface SyncResult {
  success: boolean;
  message: string;
  merged?: boolean;
  error?: string;
}

/**
 * 执行完整同步流程
 * 处理 409 冲突和自动合并
 */
export async function performSync(
  onStatusChange?: (status: string) => void
): Promise<SyncResult> {
  try {
    onStatusChange?.('正在读取本地数据...');
    
    // 1. 读取本地数据
    const localAccounts = await getLocalAccounts();
    const localVersion = getLastSyncedVersion() || 0;
    
    // 2. 加密本地数据
    const encryptedData = encrypt(JSON.stringify(localAccounts));
    
    onStatusChange?.('正在上传到云端...');
    
    // 3. 尝试推送
    const pushResult = await pushToCloud(encryptedData, localVersion);
    
    if (pushResult.success && pushResult.newVersion) {
      // 成功
      setLastSyncedVersion(pushResult.newVersion);
      return { success: true, message: '同步成功' };
    }
    
    // 4. 处理 409 冲突
    if (pushResult.conflict) {
      onStatusChange?.('检测到冲突，正在自动合并...');
      
      // Step 1: 获取云端最新数据
      const cloudData = await fetchFromCloud();
      
      // Step 2: 解密云端数据
      let remoteAccounts: Account[];
      try {
        const decrypted = decrypt(cloudData.data);
        remoteAccounts = JSON.parse(decrypted);
      } catch (e) {
        return {
          success: false,
          message: '合并失败',
          error: '无法解密云端数据，可能是密钥不匹配',
        };
      }
      
      // Step 3: 重新读取本地数据（可能已变化）
      const currentLocalAccounts = await getLocalAccounts();
      
      // Step 4: 智能合并
      const mergedAccounts = mergeAccounts(currentLocalAccounts, remoteAccounts);
      
      // Step 5: 保存合并结果到本地
      await saveLocalAccounts(mergedAccounts);
      
      // Step 6: 重试推送
      onStatusChange?.('正在上传合并后的数据...');
      const mergedEncrypted = encrypt(JSON.stringify(mergedAccounts));
      const retryResult = await pushToCloud(mergedEncrypted, cloudData.version);
      
      if (retryResult.success && retryResult.newVersion) {
        setLastSyncedVersion(retryResult.newVersion);
        return {
          success: true,
          message: '检测到冲突，已自动合并云端变更',
          merged: true,
        };
      }
      
      // 如果再次冲突，返回错误（避免无限循环）
      return {
        success: false,
        message: '合并后仍有冲突，请稍后重试',
        error: '多次冲突',
      };
    }
    
    return { success: false, message: '未知错误' };
  } catch (e) {
    return {
      success: false,
      message: '同步失败',
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

/**
 * 从云端拉取数据（仅下载，不上传）
 */
export async function pullFromCloud(
  onStatusChange?: (status: string) => void
): Promise<SyncResult> {
  try {
    onStatusChange?.('正在获取云端数据...');
    
    const cloudData = await fetchFromCloud();
    
    // 解密
    let remoteAccounts: Account[];
    try {
      const decrypted = decrypt(cloudData.data);
      remoteAccounts = JSON.parse(decrypted);
    } catch (e) {
      return {
        success: false,
        message: '拉取失败',
        error: '无法解密云端数据',
      };
    }
    
    // 获取本地数据并合并
    const localAccounts = await getLocalAccounts();
    const mergedAccounts = mergeAccounts(localAccounts, remoteAccounts);
    
    // 保存
    await saveLocalAccounts(mergedAccounts);
    setLastSyncedVersion(cloudData.version);
    
    return {
      success: true,
      message: `已从云端拉取 ${remoteAccounts.length} 个账号`,
    };
  } catch (e) {
    return {
      success: false,
      message: '拉取失败',
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

/**
 * 获取当前同步状态
 */
export function getSyncState(): SyncState {
  return {
    status: 'synced',
    lastSyncedVersion: getLastSyncedVersion(),
    lastSyncedAt: getLastSyncedAt(),
  };
}
