// 全局登录页面
import { useState } from 'react';
import { LogIn, User, Lock, Loader2, Sparkles } from 'lucide-react';
import { login } from '../services/authService';

interface GlobalLoginProps {
  onLoginSuccess: () => void;
}

export default function GlobalLogin({ onLoginSuccess }: GlobalLoginProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      await login(username, password);
      onLoginSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-screen bg-[#0d0d0d] flex items-center justify-center">
      <div className="w-96 p-8">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-500/30 mb-4">
            <Sparkles size={32} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">Kiro Account Manager</h1>
          <p className="text-gray-400 text-sm mt-2">请登录以继续使用</p>
        </div>

        {/* 登录表单 */}
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white/5 border border-white/10 focus-within:border-blue-500/50 transition-all">
              <User size={20} className="text-gray-400" />
              <input
                type="text"
                placeholder="用户名"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="flex-1 bg-transparent outline-none text-white placeholder-gray-500"
                required
                autoFocus
              />
            </div>
          </div>

          <div>
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white/5 border border-white/10 focus-within:border-blue-500/50 transition-all">
              <Lock size={20} className="text-gray-400" />
              <input
                type="password"
                placeholder="密码"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="flex-1 bg-transparent outline-none text-white placeholder-gray-500"
                required
              />
            </div>
          </div>

          {error && (
            <div className="text-red-400 text-sm text-center py-2 px-4 bg-red-500/10 rounded-xl">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-xl font-medium hover:from-blue-600 hover:to-blue-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-blue-500/25"
          >
            {loading ? (
              <>
                <Loader2 size={20} className="animate-spin" />
                登录中...
              </>
            ) : (
              <>
                <LogIn size={20} />
                登录
              </>
            )}
          </button>
        </form>

        <p className="mt-6 text-xs text-center text-gray-500">
          登录后可管理 Kiro 账号并同步到云端
        </p>
      </div>
    </div>
  );
}
