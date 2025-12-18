// 云端同步登录组件
import { useState } from 'react';
import { LogIn, User, Lock, Loader2, X } from 'lucide-react';
import { login, logout, isLoggedIn, getStoredUser, type UserInfo } from '../services/authService';

interface SyncLoginProps {
  onLoginSuccess?: () => void;
  isDark?: boolean;
}

export default function SyncLogin({ onLoginSuccess, isDark = true }: SyncLoginProps) {
  const [showModal, setShowModal] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const currentUser = getStoredUser();
  const loggedIn = isLoggedIn();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      await login(username, password);
      setShowModal(false);
      setUsername('');
      setPassword('');
      onLoginSuccess?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    logout();
    onLoginSuccess?.(); // 触发刷新
  };

  const bgColor = isDark ? 'bg-white/5 hover:bg-white/10' : 'bg-gray-100 hover:bg-gray-200';
  const textColor = isDark ? 'text-gray-300' : 'text-gray-600';
  const borderColor = isDark ? 'border-white/10' : 'border-gray-200';

  // 格式化剩余时间（以天为单位）
  const formatTime = (seconds: number) => {
    const days = Math.floor(seconds / 86400);
    if (days >= 1) {
      return `${days}天`;
    }
    const hours = Math.floor(seconds / 3600);
    if (hours >= 1) {
      return `${hours}小时`;
    }
    return `${Math.floor(seconds / 60)}分钟`;
  };

  return (
    <>
      {loggedIn && currentUser ? (
        <div className="flex items-center gap-2">
          <div className={`flex items-center gap-1.5 px-2 py-1 rounded-lg ${bgColor} ${textColor} text-xs`}>
            <User size={14} className={currentUser.role === 'admin' ? 'text-yellow-400' : ''} />
            <span>{currentUser.username}</span>
            {currentUser.role === 'admin' && (
              <span className="text-yellow-400 text-[10px]">管理员</span>
            )}
            {currentUser.role !== 'admin' && (
              <span className="opacity-60">({formatTime(currentUser.remaining_seconds)})</span>
            )}
          </div>
          <button
            onClick={handleLogout}
            className={`px-2 py-1 rounded-lg border ${borderColor} ${bgColor} ${textColor} text-xs transition-all`}
          >
            退出
          </button>
        </div>
      ) : (
        <button
          onClick={() => setShowModal(true)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border ${borderColor} ${bgColor} ${textColor} text-sm transition-all`}
        >
          <LogIn size={16} />
          <span>登录同步</span>
        </button>
      )}

      {/* 登录弹窗 */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className={`${isDark ? 'bg-[#1a1a1a]' : 'bg-white'} rounded-2xl p-6 w-80 shadow-2xl`}>
            <div className="flex items-center justify-between mb-4">
              <h3 className={`text-lg font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                云端同步登录
              </h3>
              <button
                onClick={() => setShowModal(false)}
                className={`p-1 rounded-lg ${bgColor} transition-all`}
              >
                <X size={18} className={textColor} />
              </button>
            </div>

            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <div className={`flex items-center gap-2 px-3 py-2 rounded-xl ${isDark ? 'bg-white/5' : 'bg-gray-100'} border ${borderColor}`}>
                  <User size={18} className={textColor} />
                  <input
                    type="text"
                    placeholder="用户名"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className={`flex-1 bg-transparent outline-none ${isDark ? 'text-white' : 'text-gray-900'} placeholder-gray-500`}
                    required
                  />
                </div>
              </div>

              <div>
                <div className={`flex items-center gap-2 px-3 py-2 rounded-xl ${isDark ? 'bg-white/5' : 'bg-gray-100'} border ${borderColor}`}>
                  <Lock size={18} className={textColor} />
                  <input
                    type="password"
                    placeholder="密码"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={`flex-1 bg-transparent outline-none ${isDark ? 'text-white' : 'text-gray-900'} placeholder-gray-500`}
                    required
                  />
                </div>
              </div>

              {error && (
                <div className="text-red-400 text-sm text-center">{error}</div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-xl font-medium hover:from-blue-600 hover:to-blue-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    登录中...
                  </>
                ) : (
                  <>
                    <LogIn size={18} />
                    登录
                  </>
                )}
              </button>
            </form>

            <p className={`mt-4 text-xs text-center ${textColor} opacity-60`}>
              登录后可同步账号数据到云端
            </p>
          </div>
        </div>
      )}
    </>
  );
}
