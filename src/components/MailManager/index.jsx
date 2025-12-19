import { useState, useEffect, useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { Mail, Plus, Trash2, Search, RefreshCw, Users, UserCheck, UserX } from 'lucide-react'
import { useTheme } from '../../contexts/ThemeContext'
import { useDialog } from '../../contexts/DialogContext'
import MailTable from './MailTable'
import CreateMailModal from './CreateMailModal'

function MailManager() {
  const { theme, colors } = useTheme()
  const { showConfirm, showError, showSuccess } = useDialog()
  const isDark = theme === 'dark'
  
  const [accounts, setAccounts] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterType, setFilterType] = useState('all') // all, kiro, non-kiro
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [selectedIds, setSelectedIds] = useState([])

  // 加载账号列表
  const loadAccounts = useCallback(async () => {
    setLoading(true)
    try {
      let data
      if (filterType === 'kiro') {
        data = await invoke('mail_get_kiro_users')
      } else if (filterType === 'non-kiro') {
        data = await invoke('mail_get_non_kiro_users')
      } else {
        data = await invoke('mail_get_all_users')
      }
      setAccounts(data)
    } catch (e) {
      console.error('加载邮箱账号失败:', e)
      showError('加载失败', e.toString())
    } finally {
      setLoading(false)
    }
  }, [filterType, showError])

  useEffect(() => {
    loadAccounts()
  }, [loadAccounts])

  // 搜索过滤
  const filteredAccounts = accounts.filter(acc =>
    acc.email.toLowerCase().includes(searchTerm.toLowerCase())
  )

  // 删除单个账号
  const handleDelete = async (account) => {
    const confirmed = await showConfirm(
      '删除确认',
      `确定要删除邮箱 ${account.email} 吗？\n\n此操作将同时删除邮局中的账户和本地记录。`
    )
    if (!confirmed) return

    try {
      const result = await invoke('mail_delete_user', { email: account.email })
      if (result.success) {
        showSuccess('删除成功', result.message)
        loadAccounts()
      } else {
        showError('删除失败', result.message)
      }
    } catch (e) {
      showError('删除失败', e.toString())
    }
  }

  // 批量删除
  const handleBatchDelete = async () => {
    if (selectedIds.length === 0) return
    
    const confirmed = await showConfirm(
      '批量删除',
      `确定要删除选中的 ${selectedIds.length} 个邮箱账号吗？`
    )
    if (!confirmed) return

    let successCount = 0
    let failCount = 0

    for (const id of selectedIds) {
      try {
        const result = await invoke('mail_delete_user', { id })
        if (result.success) {
          successCount++
        } else {
          failCount++
        }
      } catch {
        failCount++
      }
    }

    showSuccess('批量删除完成', `成功: ${successCount}, 失败: ${failCount}`)
    setSelectedIds([])
    loadAccounts()
  }

  // 创建成功回调
  const handleCreateSuccess = (result) => {
    showSuccess(
      '创建完成',
      `成功创建 ${result.successCount} 个邮箱账号${result.failCount > 0 ? `，失败 ${result.failCount} 个` : ''}`
    )
    loadAccounts()
  }

  // 统计数据
  const stats = {
    total: accounts.length,
    kiro: accounts.filter(a => a.isKiro === 1).length,
    nonKiro: accounts.filter(a => a.isKiro === 0 || a.isKiro === null).length,
  }

  return (
    <div className={`h-full flex flex-col ${colors.main}`}>
      {/* 头部 */}
      <div className={`${colors.card} border-b ${colors.cardBorder} px-6 py-4`}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-cyan-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/20">
              <Mail size={20} className="text-white" />
            </div>
            <div>
              <h1 className={`text-xl font-bold ${colors.text}`}>邮局账号管理</h1>
              <p className={`text-sm ${colors.textMuted}`}>管理宝塔邮局账号，支持批量创建和删除</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
            >
              <Plus size={16} />
              批量创建
            </button>
            {selectedIds.length > 0 && (
              <button
                onClick={handleBatchDelete}
                className="flex items-center gap-2 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
              >
                <Trash2 size={16} />
                删除选中 ({selectedIds.length})
              </button>
            )}
          </div>
        </div>

        {/* 统计卡片 */}
        <div className="flex gap-4 mb-4">
          <div 
            onClick={() => setFilterType('all')}
            className={`flex items-center gap-3 px-4 py-2 rounded-lg cursor-pointer transition-all ${
              filterType === 'all' 
                ? 'bg-blue-500 text-white' 
                : `${isDark ? 'bg-white/5 hover:bg-white/10' : 'bg-gray-100 hover:bg-gray-200'} ${colors.text}`
            }`}
          >
            <Users size={18} />
            <span>全部 ({stats.total})</span>
          </div>
          <div 
            onClick={() => setFilterType('non-kiro')}
            className={`flex items-center gap-3 px-4 py-2 rounded-lg cursor-pointer transition-all ${
              filterType === 'non-kiro' 
                ? 'bg-orange-500 text-white' 
                : `${isDark ? 'bg-white/5 hover:bg-white/10' : 'bg-gray-100 hover:bg-gray-200'} ${colors.text}`
            }`}
          >
            <UserX size={18} />
            <span>未绑定 ({stats.nonKiro})</span>
          </div>
          <div 
            onClick={() => setFilterType('kiro')}
            className={`flex items-center gap-3 px-4 py-2 rounded-lg cursor-pointer transition-all ${
              filterType === 'kiro' 
                ? 'bg-green-500 text-white' 
                : `${isDark ? 'bg-white/5 hover:bg-white/10' : 'bg-gray-100 hover:bg-gray-200'} ${colors.text}`
            }`}
          >
            <UserCheck size={18} />
            <span>已绑定 ({stats.kiro})</span>
          </div>
        </div>

        {/* 搜索和刷新 */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-md">
            <Search size={16} className={`absolute left-3 top-1/2 -translate-y-1/2 ${colors.textMuted}`} />
            <input
              type="text"
              placeholder="搜索邮箱..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className={`w-full pl-10 pr-4 py-2 rounded-lg border ${colors.input} ${colors.text} focus:outline-none focus:ring-2 focus:ring-blue-500/30`}
            />
          </div>
          <button
            onClick={loadAccounts}
            disabled={loading}
            className={`p-2 rounded-lg ${isDark ? 'hover:bg-white/10' : 'hover:bg-gray-100'} transition-colors`}
          >
            <RefreshCw size={18} className={`${colors.textMuted} ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* 表格 */}
      <div className="flex-1 overflow-auto p-6">
        <MailTable
          accounts={filteredAccounts}
          loading={loading}
          selectedIds={selectedIds}
          onSelectChange={setSelectedIds}
          onDelete={handleDelete}
          onRefresh={loadAccounts}
        />
      </div>

      {/* 创建弹窗 */}
      {showCreateModal && (
        <CreateMailModal
          onClose={() => setShowCreateModal(false)}
          onSuccess={handleCreateSuccess}
        />
      )}
    </div>
  )
}

export default MailManager
