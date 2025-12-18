// 用户管理组件（仅管理员可见）
import { useState, useEffect, useCallback } from 'react'
import { Users, Plus, Pencil, Trash2, RefreshCw, Shield, User, Clock } from 'lucide-react'
import { useTheme } from '../../contexts/ThemeContext'
import { getUsers, createUser, updateUser, deleteUser } from '../../services/userService'
import CreateUserModal from './CreateUserModal'
import EditUserModal from './EditUserModal'

function UserManager() {
  const { theme, colors } = useTheme()
  const isDark = theme === 'dark'
  
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editingUser, setEditingUser] = useState(null)
  const [deleteConfirm, setDeleteConfirm] = useState(null)

  const loadUsers = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await getUsers()
      setUsers(data)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadUsers()
  }, [loadUsers])

  const handleCreate = async (data) => {
    await createUser(data)
    setShowCreateModal(false)
    loadUsers()
  }

  const handleUpdate = async (id, data) => {
    await updateUser(id, data)
    setEditingUser(null)
    loadUsers()
  }

  const handleDelete = async (id) => {
    await deleteUser(id)
    setDeleteConfirm(null)
    loadUsers()
  }

  const formatDays = (days) => {
    if (days >= 365) return `${Math.floor(days / 365)}年${Math.floor((days % 365) / 30)}月`
    if (days >= 30) return `${Math.floor(days / 30)}月${Math.floor(days % 30)}天`
    return `${Math.floor(days)}天`
  }

  return (
    <div className={`h-full flex flex-col ${colors.main}`}>
      {/* 头部 */}
      <div className={`${colors.card} border-b ${colors.cardBorder} px-6 py-4`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-600 rounded-xl flex items-center justify-center shadow-lg">
              <Users size={20} className="text-white" />
            </div>
            <div>
              <h1 className={`text-xl font-bold ${colors.text}`}>用户管理</h1>
              <p className={`text-sm ${colors.textMuted}`}>管理系统登录用户</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={loadUsers}
              disabled={loading}
              className={`p-2 rounded-xl ${colors.card} border ${colors.cardBorder} ${isDark ? 'hover:bg-white/5' : 'hover:bg-gray-50'} transition-all`}
            >
              <RefreshCw size={18} className={`${loading ? 'animate-spin' : ''} ${colors.textMuted}`} />
            </button>
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-600 text-white rounded-xl text-sm font-medium hover:from-purple-600 hover:to-pink-700 flex items-center gap-1.5 shadow-lg"
            >
              <Plus size={16} />
              添加用户
            </button>
          </div>
        </div>
      </div>

      {/* 内容 */}
      <div className="flex-1 overflow-auto p-6">
        {error && (
          <div className="mb-4 px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center h-64">
            <RefreshCw size={24} className="animate-spin text-purple-500" />
          </div>
        ) : users.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-500">
            <Users size={48} className="mb-4 opacity-50" />
            <p>暂无用户</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {users.map((user) => (
              <div
                key={user.id}
                className={`${colors.card} border ${colors.cardBorder} rounded-xl p-4 flex items-center justify-between`}
              >
                <div className="flex items-center gap-4">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                    user.role === 'admin' 
                      ? 'bg-gradient-to-br from-yellow-500 to-orange-600' 
                      : 'bg-gradient-to-br from-blue-500 to-cyan-600'
                  }`}>
                    {user.role === 'admin' ? (
                      <Shield size={24} className="text-white" />
                    ) : (
                      <User size={24} className="text-white" />
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className={`font-medium ${colors.text}`}>{user.username}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        user.role === 'admin'
                          ? 'bg-yellow-500/20 text-yellow-400'
                          : 'bg-blue-500/20 text-blue-400'
                      }`}>
                        {user.role === 'admin' ? '管理员' : '用户'}
                      </span>
                    </div>
                    <div className={`text-sm ${colors.textMuted} flex items-center gap-4 mt-1`}>
                      <span className="flex items-center gap-1">
                        <Clock size={14} />
                        剩余: {user.role === 'admin' ? '无限制' : formatDays(user.remaining_days)}
                      </span>
                      <span>创建于: {user.created_at}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setEditingUser(user)}
                    className={`p-2 rounded-lg ${isDark ? 'hover:bg-white/10' : 'hover:bg-gray-100'} transition-all`}
                    title="编辑"
                  >
                    <Pencil size={16} className={colors.textMuted} />
                  </button>
                  <button
                    onClick={() => setDeleteConfirm(user)}
                    className={`p-2 rounded-lg hover:bg-red-500/20 transition-all`}
                    title="删除"
                  >
                    <Trash2 size={16} className="text-red-400" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 创建用户弹窗 */}
      {showCreateModal && (
        <CreateUserModal
          onClose={() => setShowCreateModal(false)}
          onSubmit={handleCreate}
        />
      )}

      {/* 编辑用户弹窗 */}
      {editingUser && (
        <EditUserModal
          user={editingUser}
          onClose={() => setEditingUser(null)}
          onSubmit={(data) => handleUpdate(editingUser.id, data)}
        />
      )}

      {/* 删除确认弹窗 */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className={`${colors.card} rounded-2xl p-6 w-80 shadow-2xl`}>
            <h3 className={`text-lg font-semibold ${colors.text} mb-2`}>确认删除</h3>
            <p className={`${colors.textMuted} mb-4`}>
              确定要删除用户 <span className="text-red-400">{deleteConfirm.username}</span> 吗？
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                className={`flex-1 py-2 rounded-xl ${colors.card} border ${colors.cardBorder}`}
              >
                取消
              </button>
              <button
                onClick={() => handleDelete(deleteConfirm.id)}
                className="flex-1 py-2 rounded-xl bg-red-500 text-white hover:bg-red-600"
              >
                删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default UserManager
