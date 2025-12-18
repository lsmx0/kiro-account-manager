import { useState } from 'react'
import { Trash2, Copy, Check, Eye, EyeOff } from 'lucide-react'
import { useTheme } from '../../contexts/ThemeContext'

function MailTable({ accounts, loading, selectedIds, onSelectChange, onDelete }) {
  const { theme, colors } = useTheme()
  const isDark = theme === 'dark'
  const [copiedId, setCopiedId] = useState(null)
  const [showPasswords, setShowPasswords] = useState({})

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
                <span className={`text-sm ${colors.textMuted}`}>
                  {account.kiroPawd || '-'}
                </span>
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
              <td className="px-4 py-3 text-right">
                <button
                  onClick={() => onDelete(account)}
                  className="p-2 rounded-lg text-red-500 hover:bg-red-500/10 transition-colors"
                  title="删除"
                >
                  <Trash2 size={16} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default MailTable
