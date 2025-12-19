import { useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { Trash2, Copy, Check, Eye, EyeOff, Key, Edit2, Loader2 } from 'lucide-react'
import { useTheme } from '../../contexts/ThemeContext'

function MailTable({ accounts, loading, selectedIds, onSelectChange, onDelete, onRefresh }) {
  const { theme, colors } = useTheme()
  const isDark = theme === 'dark'
  const [copiedId, setCopiedId] = useState(null)
  const [showPasswords, setShowPasswords] = useState({})
  const [loadingCode, setLoadingCode] = useState(null) // 正在获取验证码的邮箱ID
  const [editingKiro, setEditingKiro] = useState(null) // 正在编辑 Kiro 密码的账号
  const [kiroPassword, setKiroPassword] = useState('')
  const [toast, setToast] = useState(null) // Toast 提示 { message, type }

  // 显示 Toast 提示
  const showToast = (message, type = 'success') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 2000)
  }

  // 复制到剪贴板
  const handleCopy = (text, id) => {
    navigator.clipboard.writeText(text)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 1500)
  }

  // 切换密码显示
  const togglePassword = (id) => {
    setShowPasswords(prev => ({ ...prev, [id]: !prev[id] }))
  }

  // 获取验证码
  const handleGetCode = async (account) => {
    setLoadingCode(account.id)
    try {
      const result = await invoke('mail_get_verification_code', { email: account.email })
      if (result.success && result.code) {
        // 复制验证码到剪贴板
        navigator.clipboard.writeText(result.code)
        setCopiedId(`code-${account.id}`)
        showToast(`验证码 ${result.code} 已复制`, 'success')
        setTimeout(() => setCopiedId(null), 2000)
      } else {
        showToast(result.message || '获取验证码失败', 'error')
      }
    } catch (e) {
      showToast('获取验证码失败: ' + e, 'error')
    } finally {
      setLoadingCode(null)
    }
  }

  // 开始编辑 Kiro 密码
  const startEditKiro = (account) => {
    setEditingKiro(account.id)
    setKiroPassword(account.kiroPawd || '')
  }

  // 保存 Kiro 密码
  const saveKiroPassword = async (account) => {
    try {
      await invoke('mail_update_kiro_password', { 
        id: account.id, 
        kiroPawd: kiroPassword 
      })
      setEditingKiro(null)
      setKiroPassword('')
      onRefresh?.() // 刷新列表
    } catch (e) {
      alert('保存失败: ' + e)
    }
  }

  // 取消编辑
  const cancelEditKiro = () => {
    setEditingKiro(null)
    setKiroPassword('')
  }

  // 全选
  const handleSelectAll = (checked) => {
    if (checked) {
      onSelectChange(accounts.map(a => a.id))
    } else {
      onSelectChange([])
    }
  }

  // 单选
  const handleSelectOne = (id, checked) => {
    if (checked) {
      onSelectChange([...selectedIds, id])
    } else {
      onSelectChange(selectedIds.filter(i => i !== id))
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className={`text-lg ${colors.textMuted}`}>加载中...</div>
      </div>
    )
  }

  if (accounts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64">
        <div className={`text-lg ${colors.textMuted} mb-2`}>暂无数据</div>
        <div className={`text-sm ${colors.textMuted}`}>点击"批量创建"添加邮箱账号</div>
      </div>
    )
  }

  return (
    <div className={`${colors.card} rounded-xl border ${colors.cardBorder} overflow-hidden`}>
      <table className="w-full">
        <thead>
          <tr className={`${isDark ? 'bg-white/5' : 'bg-gray-50'} border-b ${colors.cardBorder}`}>
            <th className="w-12 px-4 py-3">
              <input
                type="checkbox"
                checked={selectedIds.length === accounts.length && accounts.length > 0}
                onChange={(e) => handleSelectAll(e.target.checked)}
                className="w-4 h-4 rounded"
              />
            </th>
            <th className={`px-4 py-3 text-left text-sm font-medium ${colors.textMuted}`}>序号</th>
            <th className={`px-4 py-3 text-left text-sm font-medium ${colors.textMuted}`}>邮箱地址</th>
            <th className={`px-4 py-3 text-left text-sm font-medium ${colors.textMuted}`}>邮箱密码</th>
            <th className={`px-4 py-3 text-left text-sm font-medium ${colors.textMuted}`}>Kiro 密码</th>
            <th className={`px-4 py-3 text-left text-sm font-medium ${colors.textMuted}`}>状态</th>
            <th className={`px-4 py-3 text-right text-sm font-medium ${colors.textMuted}`}>操作</th>
          </tr>
        </thead>
        <tbody>
          {accounts.map((account, index) => (
            <tr 
              key={account.id} 
              className={`border-b ${colors.cardBorder} ${isDark ? 'hover:bg-white/5' : 'hover:bg-gray-50'} transition-colors`}
            >
              <td className="px-4 py-3">
                <input
                  type="checkbox"
                  checked={selectedIds.includes(account.id)}
                  onChange={(e) => handleSelectOne(account.id, e.target.checked)}
                  className="w-4 h-4 rounded"
                />
              </td>
              <td className={`px-4 py-3 text-sm ${colors.textMuted}`}>{index + 1}</td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className={`text-sm ${colors.text}`}>{account.email}</span>
                  <button
                    onClick={() => handleCopy(account.email, `email-${account.id}`)}
                    className={`p-1 rounded ${isDark ? 'hover:bg-white/10' : 'hover:bg-gray-200'}`}
                  >
                    {copiedId === `email-${account.id}` ? (
                      <Check size={14} className="text-green-500" />
                    ) : (
                      <Copy size={14} className={colors.textMuted} />
                    )}
                  </button>
                </div>
              </td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className={`text-sm font-mono ${colors.text}`}>
                    {showPasswords[account.id] ? account.emailPawd : '••••••••'}
                  </span>
                  <button
                    onClick={() => togglePassword(account.id)}
                    className={`p-1 rounded ${isDark ? 'hover:bg-white/10' : 'hover:bg-gray-200'}`}
                  >
                    {showPasswords[account.id] ? (
                      <EyeOff size={14} className={colors.textMuted} />
                    ) : (
                      <Eye size={14} className={colors.textMuted} />
                    )}
                  </button>
                  <button
                    onClick={() => handleCopy(account.emailPawd, `pwd-${account.id}`)}
                    className={`p-1 rounded ${isDark ? 'hover:bg-white/10' : 'hover:bg-gray-200'}`}
                  >
                    {copiedId === `pwd-${account.id}` ? (
                      <Check size={14} className="text-green-500" />
                    ) : (
                      <Copy size={14} className={colors.textMuted} />
                    )}
                  </button>
                </div>
              </td>
              <td className="px-4 py-3">
                {editingKiro === account.id ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={kiroPassword}
                      onChange={(e) => setKiroPassword(e.target.value)}
                      className={`w-32 px-2 py-1 text-sm rounded border ${colors.input} ${colors.text}`}
                      placeholder="输入密码"
                      autoFocus
                    />
                    <button
                      onClick={() => saveKiroPassword(account)}
                      className="p-1 rounded text-green-500 hover:bg-green-500/10"
                    >
                      <Check size={14} />
                    </button>
                    <button
                      onClick={cancelEditKiro}
                      className={`p-1 rounded ${colors.textMuted} hover:bg-red-500/10`}
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className={`text-sm ${account.kiroPawd ? colors.text : colors.textMuted}`}>
                      {account.kiroPawd || '-'}
                    </span>
                    <button
                      onClick={() => startEditKiro(account)}
                      className={`p-1 rounded ${isDark ? 'hover:bg-white/10' : 'hover:bg-gray-200'}`}
                      title="编辑 Kiro 密码"
                    >
                      <Edit2 size={14} className={colors.textMuted} />
                    </button>
                    {account.kiroPawd && (
                      <button
                        onClick={() => handleCopy(account.kiroPawd, `kiro-${account.id}`)}
                        className={`p-1 rounded ${isDark ? 'hover:bg-white/10' : 'hover:bg-gray-200'}`}
                      >
                        {copiedId === `kiro-${account.id}` ? (
                          <Check size={14} className="text-green-500" />
                        ) : (
                          <Copy size={14} className={colors.textMuted} />
                        )}
                      </button>
                    )}
                  </div>
                )}
              </td>
              <td className="px-4 py-3">
                {account.isKiro === 1 ? (
                  <span className="px-2 py-1 text-xs rounded-full bg-green-500/20 text-green-500">
                    已绑定
                  </span>
                ) : (
                  <span className={`px-2 py-1 text-xs rounded-full ${isDark ? 'bg-white/10 text-gray-400' : 'bg-gray-100 text-gray-500'}`}>
                    未绑定
                  </span>
                )}
              </td>
              <td className="px-4 py-3">
                <div className="flex items-center justify-end gap-1">
                  {/* 获取验证码按钮 */}
                  <button
                    onClick={() => handleGetCode(account)}
                    disabled={loadingCode === account.id}
                    className={`p-2 rounded-lg transition-colors ${
                      copiedId === `code-${account.id}`
                        ? 'text-green-500 bg-green-500/10'
                        : 'text-blue-500 hover:bg-blue-500/10'
                    }`}
                    title="获取验证码"
                  >
                    {loadingCode === account.id ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : copiedId === `code-${account.id}` ? (
                      <Check size={16} />
                    ) : (
                      <Key size={16} />
                    )}
                  </button>
                  {/* 删除按钮 */}
                  <button
                    onClick={() => onDelete(account)}
                    className="p-2 rounded-lg text-red-500 hover:bg-red-500/10 transition-colors"
                    title="删除"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Toast 提示 */}
      {toast && (
        <div 
          className={`fixed bottom-4 right-4 px-4 py-3 rounded-xl shadow-lg z-50 flex items-center gap-2 animate-slide-in ${
            toast.type === 'success' 
              ? 'bg-green-500/90 text-white' 
              : 'bg-red-500/90 text-white'
          }`}
        >
          {toast.type === 'success' ? <Check size={18} /> : <Key size={18} />}
          <span>{toast.message}</span>
        </div>
      )}
    </div>
  )
}

export default MailTable
