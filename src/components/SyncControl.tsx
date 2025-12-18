// 云端同步控制组件
import { useState, useEffect } from 'react';
import { Cloud, Upload, Download, Check, AlertCircle, Loader2 } from 'lucide-react';
import { performSync, pullFromCloud, getSyncState, getLastSyncedAt } from '../services/syncService';
import { isLoggedIn, isAdmin } from '../services/authService';
import SyncLogin from './SyncLogin';
import type { SyncStatus } from '../services/types';

interface SyncControlProps {
  onSyncComplete?: () => void;
  isDark?: boolean;
}

export default function SyncControl({ onSyncComplete, isDark = true }: SyncControlProps) {
  const [status, setStatus] = useState<SyncStatus>('synced');
  const [statusText, setStatusText] = useState('');
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [toastType, setToastType] = useState<'success' | 'error'>('success');
  const [, forceUpdate] = useState(0);

  const loggedIn = isLoggedIn();
  const admin = isAdmin();

  useEffect(() => {
    const state = getSyncState();
    setLastSyncTime(state.lastSyncedAt);
  }, []);

  const handleLoginChange = () => {
    forceUpdate((n) => n + 1);
  };

  const showNotification = (message: string, type: 'success' | 'error') => {
    setToastMessage(message);
    setToastType(type);
    setShowToast(true);
    setTimeout(() => setShowToast(false), 3000);
  };

  const handleSync = async () => {
    setStatus('merging');
    setStatusText('正在同步...');
    
    const result = await performSync((text) => setStatusText(text));
    
    if (result.success) {
      setStatus('synced');
      setStatusText('');
      setLastSyncTime(getLastSyncedAt());
      showNotification(result.message, 'success');
      onSyncComplete?.();
    } else {
      setStatus('error');
      setStatusText(result.error || '');
      showNotification(result.error || result.message, 'error');
    }
  };


  const handlePull = async () => {
    setStatus('merging');
    setStatusText('正在拉取...');
    
    const result = await pullFromCloud((text) => setStatusText(text));
    
    if (result.success) {
      setStatus('synced');
      setStatusText('');
      setLastSyncTime(getLastSyncedAt());
      showNotification(result.message, 'success');
      onSyncComplete?.();
    } else {
      setStatus('error');
      setStatusText(result.error || '');
      showNotification(result.error || result.message, 'error');
    }
  };

  const getStatusIcon = () => {
    switch (status) {
      case 'synced':
        return <Check size={14} className="text-green-400" />;
      case 'local_changes':
        return <Upload size={14} className="text-yellow-400" />;
      case 'merging':
        return <Loader2 size={14} className="text-blue-400 animate-spin" />;
      case 'error':
        return <AlertCircle size={14} className="text-red-400" />;
    }
  };

  const getStatusText = () => {
    switch (status) {
      case 'synced':
        return '已同步';
      case 'local_changes':
        return '有变更未上传';
      case 'merging':
        return statusText || '正在合并...';
      case 'error':
        return '同步失败';
    }
  };

  const formatTime = (isoString: string | null) => {
    if (!isoString) return '';
    const date = new Date(isoString);
    return date.toLocaleString('zh-CN', { 
      month: 'numeric', 
      day: 'numeric',
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  const isLoading = status === 'merging';
  const bgColor = isDark ? 'bg-white/5 hover:bg-white/10' : 'bg-gray-100 hover:bg-gray-200';
  const textColor = isDark ? 'text-gray-300' : 'text-gray-600';
  const borderColor = isDark ? 'border-white/10' : 'border-gray-200';

  return (
    <>
      <div className="flex items-center gap-2">
        {/* 登录组件 */}
        <SyncLogin onLoginSuccess={handleLoginChange} isDark={isDark} />

        {loggedIn && (
          <>
            {/* 状态显示 */}
            <div className={`flex items-center gap-1.5 px-2 py-1 rounded-lg ${bgColor} ${textColor} text-xs`}>
              {getStatusIcon()}
              <span>{getStatusText()}</span>
              {lastSyncTime && status === 'synced' && (
                <span className="opacity-60 ml-1">{formatTime(lastSyncTime)}</span>
              )}
            </div>

            {/* 同步按钮（所有登录用户可用） */}
            <button
              onClick={handleSync}
              disabled={isLoading}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border ${borderColor} ${bgColor} ${textColor} text-sm transition-all disabled:opacity-50`}
              title="上传并同步"
            >
              <Cloud size={16} className={isLoading ? 'animate-pulse' : ''} />
              <span>同步</span>
            </button>

            {/* 拉取按钮（所有登录用户可用） */}
            <button
              onClick={handlePull}
              disabled={isLoading}
              className={`p-1.5 rounded-lg border ${borderColor} ${bgColor} transition-all disabled:opacity-50`}
              title="从云端拉取"
            >
              <Download size={16} className={textColor} />
            </button>
          </>
        )}
      </div>

      {/* Toast 通知 */}
      {showToast && (
        <div 
          className={`fixed bottom-4 right-4 px-4 py-3 rounded-xl shadow-lg z-50 flex items-center gap-2 animate-slide-in ${
            toastType === 'success' 
              ? 'bg-green-500/90 text-white' 
              : 'bg-red-500/90 text-white'
          }`}
        >
          {toastType === 'success' ? <Check size={18} /> : <AlertCircle size={18} />}
          <span>{toastMessage}</span>
        </div>
      )}
    </>
  );
}
