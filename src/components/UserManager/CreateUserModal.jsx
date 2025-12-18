// 创建用户弹窗
import { useState } from 'react'
import { X, User, Lock, Shield, Clock, Loader2 } from 'lucide-react'
import { useTheme } from '../../contexts/ThemeContext'

function CreateUserModal({ onClose, onSubmit }) {
  const { theme, colors } = useTheme()
  const isDark = theme === 'dark'
  
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState('user')
  const [remainingDays, setRemainingDays] = useState(30)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    
    try {
      await onSubmit({
        username,
        password,
        role,
        remaining_days: role === 'admin' ? 999999 : remainingDays,
      })
    } catch (err) {
      setError(err.message)
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className={`${colors.card} rounded-2xl w-96 shadow-2xl`}>
        <div className={`px-5 py-4 border-b ${colors.cardBorder} flex items-center justify-between`}>
          <h2 className={`font-semibold ${colors.text}`}>添加用户</h2>
          <button onClick={onClose} className={`p-1 rounded-lg ${isDark ? 'hover:bg-white/10' : 'hover:bg-gray-100'}`}>
            <X size={18} className={colors.textMuted} />
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className={`text-sm ${colors.textMuted} mb-1 block`}>用户名</label>
            <div className={`flex items-center gap-2 px-3 py-2 rounded-xl ${isDark ? 'bg-white/5' : 'bg-gray-100'} border ${colors.cardBorder}`}>
              <User size={18} className={colors.textMuted} />
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="输入用户名"
                className={`flex-1 bg-transparent outline-none ${colors.text}`}
                required
              />
            </div>
          </div>

          <div>
            <label className={`text-sm ${colors.textMuted} mb-1 block`}>密码</label>
            <div className={`flex items-center gap-2 px-3 py-2 rounded-xl ${isDark ? 'bg-white/5' : 'bg-gray-100'} border ${colors.cardBorder}`}>
              <Lock size={18} className={colors.textMuted} />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="输入密码"
                className={`flex-1 bg-transparent outline-none ${colors.text}`}
                required
              />
            </div>
          </div>

          <div>
            <label className={`text-sm ${colors.textMuted} mb-1 block`}>角色</label>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setRole('user')}
                className={`flex-1 py-2 rounded-xl border flex items-center justify-center gap-2 transition-all ${
                  role === 'user'
                    ? 'bg-blue-500/20 border-blue-500 text-blue-400'
                    : `${colors.cardBorder} ${colors.textMuted}`
                }`}
              >
                <User size={16} />
                普通用户
              </button>
              <button
                type="button"
                onClick={() => setRole('admin')}
                className={`flex-1 py-2 rounded-xl border flex items-center justify-center gap-2 transition-all ${
                  role === 'admin'
                    ? 'bg-yellow-500/20 border-yellow-500 text-yellow-400'
                    : `${colors.cardBorder} ${colors.textMuted}`
                }`}
              >
                <Shield size={16} />
                管理员
              </button>
            </div>
          </div>

          {role === 'user' && (
            <div>
              <label className={`text-sm ${colors.textMuted} mb-1 block`}>使用时长（天）</label>
              <div className={`flex items-center gap-2 px-3 py-2 rounded-xl ${isDark ? 'bg-white/5' : 'bg-gray-100'} border ${colors.cardBorder}`}>
                <Clock size={18} className={colors.textMuted} />
                <input
                  type="number"
                  value={remainingDays}
                  onChange={(e) => setRemainingDays(Number(e.target.value))}
                  min="1"
                  className={`flex-1 bg-transparent outline-none ${colors.text}`}
                />
                <span className={colors.textMuted}>天</span>
              </div>
            </div>
          )}

          {error && (
            <div className="text-red-400 text-sm text-center py-2 px-4 bg-red-500/10 rounded-xl">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-gradient-to-r from-purple-500 to-pink-600 text-white rounded-xl font-medium hover:from-purple-600 hover:to-pink-700 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                创建中...
              </>
            ) : (
              '创建用户'
            )}
          </button>
        </form>
      </div>
    </div>
  )
}

export default CreateUserModal
