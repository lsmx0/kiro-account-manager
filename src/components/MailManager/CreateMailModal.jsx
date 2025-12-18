import { useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { X, Mail, Loader, CheckCircle, XCircle } from 'lucide-react'
import { useTheme } from '../../contexts/ThemeContext'

function CreateMailModal({ onClose, onSuccess }) {
  const { theme, colors } = useTheme()
  const isDark = theme === 'dark'
  
  const [count, setCount] = useState(1)
  const [creating, setCreating] = useState(false)
  const [result, setResult] = useState(null)
  const [progress, setProgress] = useState(0)

  const handleCreate = async () => {
    if (count <= 0 || count > 100) {
      return
    }

    setCreating(true)
    setProgress(0)
    setResult(null)

    try {
      const res = await invoke('mail_create_users', { count })
      setResult(res)
      if (res.successCount > 0) {
        onSuccess(res)
      }
    } catch (e) {
      setResult({
        successCount: 0,
        failCount: count,
        errors: [e.toString()],
        createdAccounts: []
      })
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div 
        className={`${colors.card} rounded-2xl w-full max-w-lg shadow-2xl border ${colors.cardBorder} overflow-hidden`}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className={`flex items-center justify-between px-6 py-4 ${isDark ? 'bg-white/[0.02]' : 'bg-gray-50/50'}`}>
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl ${isDark ? 'bg-blue-500/15' : 'bg-blue-50'} flex items-center justify-center`}>
              <Mail size={20} className="text-blue-500" />
            </div>
            <h2 className={`text-lg font-semibold ${colors.text}`}>批量创建邮箱</h2>
          </div>
          <button 
            onClick={onClose} 
            disabled={creating}
            className={`p-2 rounded-lg transition-colors ${isDark ? 'hover:bg-white/10' : 'hover:bg-black/5'} disabled:opacity-50`}
          >
            <X size={18} className={colors.textMuted} />
          </button>
        </div>

        <div className="p-6">
          {!result ? (
            <>
              {/* 输入数量 */}
              <div className="mb-6">
                <label className={`block text-sm font-medium ${colors.text} mb-2`}>
                  创建数量
                </label>
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={count}
                  onChange={(e) => setCount(parseInt(e.target.value) || 0)}
                  disabled={creating}
                  className={`w-full px-4 py-3 rounded-xl border ${colors.input} ${colors.text} focus:outline-none focus:ring-2 focus:ring-blue-500/30 disabled:opacity-50`}
                />
                <p className={`mt-2 text-sm ${colors.textMuted}`}>
                  系统将自动生成邮箱地址和随机密码（1-100个）
                </p>
              </div>

              {/* 说明 */}
              <div className={`p-4 rounded-xl ${isDark ? 'bg-white/5' : 'bg-gray-50'} mb-6`}>
                <h3 className={`text-sm font-medium ${colors.text} mb-2`}>创建规则</h3>
                <ul className={`text-sm ${colors.textMuted} space-y-1`}>
                  <li>• 邮箱格式: 随机5位字符@suhengdashuaibi.xyz</li>
                  <li>• 密码: 12位强密码（大小写+数字+特殊字符）</li>
                  <li>• 默认配额: 5 MB</li>
                  <li>• is_kiro 默认为 0（未绑定）</li>
                </ul>
              </div>

              {/* 按钮 */}
              <button
                onClick={handleCreate}
                disabled={creating || count <= 0 || count > 100}
                className="w-full py-3 bg-gradient-to-r from-blue-500 to-cyan-500 text-white rounded-xl font-medium shadow-lg shadow-blue-500/25 hover:from-blue-600 hover:to-cyan-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {creating ? (
                  <>
                    <Loader size={18} className="animate-spin" />
                    创建中...
                  </>
                ) : (
                  <>
                    <Mail size={18} />
                    开始创建 {count} 个邮箱
                  </>
                )}
              </button>
            </>
          ) : (
            <>
              {/* 结果展示 */}
              <div className="text-center mb-6">
                {result.successCount > 0 ? (
                  <CheckCircle size={48} className="text-green-500 mx-auto mb-3" />
                ) : (
                  <XCircle size={48} className="text-red-500 mx-auto mb-3" />
                )}
                <h3 className={`text-xl font-semibold ${colors.text} mb-2`}>
                  创建完成
                </h3>
                <p className={colors.textMuted}>
                  成功: <span className="text-green-500 font-medium">{result.successCount}</span>
                  {result.failCount > 0 && (
                    <>, 失败: <span className="text-red-500 font-medium">{result.failCount}</span></>
                  )}
                </p>
              </div>

              {/* 创建的账号列表 */}
              {result.createdAccounts.length > 0 && (
                <div className={`max-h-60 overflow-auto rounded-xl border ${colors.cardBorder} mb-4`}>
                  <table className="w-full text-sm">
                    <thead className={`${isDark ? 'bg-white/5' : 'bg-gray-50'} sticky top-0`}>
                      <tr>
                        <th className={`px-3 py-2 text-left ${colors.textMuted}`}>邮箱</th>
                        <th className={`px-3 py-2 text-left ${colors.textMuted}`}>密码</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.createdAccounts.map((acc, idx) => (
                        <tr key={idx} className={`border-t ${colors.cardBorder}`}>
                          <td className={`px-3 py-2 ${colors.text}`}>{acc.email}</td>
                          <td className={`px-3 py-2 font-mono ${colors.text}`}>{acc.password}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* 错误信息 */}
              {result.errors.length > 0 && (
                <div className={`p-3 rounded-xl ${isDark ? 'bg-red-500/10' : 'bg-red-50'} mb-4`}>
                  <h4 className="text-sm font-medium text-red-500 mb-1">错误信息</h4>
                  <ul className="text-xs text-red-400 space-y-1 max-h-20 overflow-auto">
                    {result.errors.map((err, idx) => (
                      <li key={idx}>• {err}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* 关闭按钮 */}
              <button
                onClick={onClose}
                className={`w-full py-3 rounded-xl font-medium transition-colors ${
                  isDark ? 'bg-white/10 hover:bg-white/20 text-white' : 'bg-gray-100 hover:bg-gray-200 text-gray-900'
                }`}
              >
                关闭
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default CreateMailModal
