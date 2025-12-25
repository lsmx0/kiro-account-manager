import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { useTheme } from '../../contexts/ThemeContext'
import { useDialog } from '../../contexts/DialogContext'
import { useI18n } from '../../i18n'
import { useAccounts } from './hooks/useAccounts'
import { occupyAccount, sendHeartbeat, toOccupancyRecord, getCurrentUsername } from '../../services/occupyService'
import { isLoggedIn } from '../../services/authService'
import AccountHeader from './AccountHeader'
import AccountTable from './AccountTable'
import AccountPagination from './AccountPagination'
import AddAccountModal from './AddAccountModal'
import ImportAccountModal from './ImportAccountModal'
import RefreshProgressModal from './RefreshProgressModal'
import AccountDetailModal from '../AccountDetailModal'
import EditAccountModal from './EditAccountModal'
import ConfirmDialog from './ConfirmDialog'

function AccountManager() {
  const { colors } = useTheme()
  const { showConfirm } = useDialog()
  const { t } = useI18n()
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedIds, setSelectedIds] = useState([])
  const [pageSize, setPageSize] = useState(20)
  const [currentPage, setCurrentPage] = useState(1)
  const [editingAccount, setEditingAccount] = useState(null)
  const [editingLabelAccount, setEditingLabelAccount] = useState(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)
  const [copiedId, setCopiedId] = useState(null)
  
  // 切换账号弹窗状态
  const [switchDialog, setSwitchDialog] = useState(null) // { type, title, message, account }
  
  // 当前登录的本地 token
  const [localToken, setLocalToken] = useState(null)
  
  // 刷新同步状态
  const [isRefreshing, setIsRefreshing] = useState(false)
  
  // 占用状态 Map: { kiro_account_id: username }
  const [occupancyMap, setOccupancyMap] = useState({})
  const [activeAccountId, setActiveAccountId] = useState(null)
  const heartbeatRef = useRef(null)
  const currentUsername = getCurrentUsername()

  const {
    accounts,
    loadAccounts,
    autoRefreshing,
    refreshProgress,
    lastRefreshTime,
    refreshingId,
    switchingId,
    setSwitchingId,
    autoRefreshAll,
    handleRefreshStatus,
    handleExport,
  } = useAccounts()
  
  useEffect(() => {
    invoke('get_kiro_local_token').then(setLocalToken).catch(() => setLocalToken(null))
  }, [])

  // 启动时自动占用当前正在使用的账号
  useEffect(() => {
    if (!isLoggedIn() || !localToken?.refreshToken || accounts.length === 0) return

    const currentAccount = accounts.find(acc => acc.refreshToken === localToken.refreshToken)
    if (currentAccount && !activeAccountId) {
      console.log('[AutoOccupy] 检测到当前使用账号:', currentAccount.email)
      // 自动占用当前账号并立即更新状态
      const doAutoOccupy = async () => {
        try {
          const occupyResult = await occupyAccount(currentAccount.id)
          if (occupyResult.success) {
            console.log('[AutoOccupy] 自动占用成功')
            setActiveAccountId(currentAccount.id)
          }
          // 立即发送心跳获取最新占用状态
          const heartbeatResult = await sendHeartbeat(currentAccount.id)
          const map = toOccupancyRecord(heartbeatResult.occupancy_map)
          console.log('[AutoOccupy] 占用状态已更新:', map)
          setOccupancyMap(map)
        } catch (e) {
          console.warn('[AutoOccupy] 自动占用失败:', e)
        }
      }
      doAutoOccupy()
    }
  }, [localToken, accounts, activeAccountId])

  // 心跳定时器：每 60 秒发送一次
  useEffect(() => {
    if (!isLoggedIn()) return

    const doHeartbeat = async () => {
      try {
        console.log('[Heartbeat] 发送心跳请求...')
        const result = await sendHeartbeat(activeAccountId)
        console.log('[Heartbeat] 响应:', result)
        const map = toOccupancyRecord(result.occupancy_map)
        console.log('[Heartbeat] 占用状态:', map)
        setOccupancyMap(map)
        
        // 如果时长耗尽，可以在这里处理
        if (result.status === 'expired') {
          console.warn('[Heartbeat] 用户时长已耗尽')
        }
      } catch (e) {
        console.error('[Heartbeat] 心跳失败:', e)
      }
    }

    // 立即执行一次
    doHeartbeat()

    // 每 60 秒执行一次
    heartbeatRef.current = setInterval(doHeartbeat, 60000)

    return () => {
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current)
      }
    }
  }, [activeAccountId])

  // 状态文本
  const [statusText, setStatusText] = useState('')

  // 同步刷新（合并流程：拉取→刷新→上传）
  const handleSyncAndRefresh = useCallback(async () => {
    setIsRefreshing(true)
    try {
      const { pullFromCloud, performSync } = await import('../../services/syncService')
      
      // Step 1: 拉取云端数据
      setStatusText('拉取云端...')
      try {
        const pullResult = await pullFromCloud()
        if (pullResult.success) {
          await loadAccounts()
        } else {
          console.warn('[SyncRefresh] 拉取云端失败:', pullResult.error)
        }
      } catch (pullErr) {
        console.warn('[SyncRefresh] 拉取云端异常:', pullErr)
      }
      
      // Step 2: 刷新所有账号 Token
      setStatusText('刷新账号...')
      try {
        const currentAccounts = await invoke('get_accounts')
        if (currentAccounts && currentAccounts.length > 0) {
          await autoRefreshAll(currentAccounts, true)
        }
      } catch (refreshErr) {
        console.warn('[SyncRefresh] 刷新账号异常:', refreshErr)
      }
      
      // Step 3: 上传到云端
      setStatusText('上传云端...')
      try {
        const syncResult = await performSync()
        
        if (syncResult.success) {
          setSwitchDialog({
            type: 'success',
            title: '同步刷新完成',
            message: syncResult.merged ? '检测到冲突，已自动合并' : '数据已同步到云端',
            account: null,
          })
        } else {
          setSwitchDialog({
            type: 'error',
            title: '上传失败',
            message: syncResult.error || syncResult.message,
            account: null,
          })
        }
      } catch (syncErr) {
        console.error('[SyncRefresh] 上传云端异常:', syncErr)
        setSwitchDialog({
          type: 'error',
          title: '上传失败',
          message: String(syncErr),
          account: null,
        })
      }
      
      await loadAccounts()
    } catch (e) {
      console.error('[SyncRefresh] 整体异常:', e)
      setSwitchDialog({
        type: 'error',
        title: '同步刷新失败',
        message: String(e),
        account: null,
      })
    } finally {
      setIsRefreshing(false)
      setStatusText('')
    }
  }, [autoRefreshAll, loadAccounts])

  const filteredAccounts = useMemo(() =>
    accounts.filter(a =>
      a.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      a.label.toLowerCase().includes(searchTerm.toLowerCase())
    ),
    [accounts, searchTerm]
  )

  const totalPages = Math.ceil(filteredAccounts.length / pageSize) || 1
  const paginatedAccounts = useMemo(() =>
    filteredAccounts.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [filteredAccounts, currentPage, pageSize]
  )

  const handleSearchChange = useCallback((term) => { setSearchTerm(term); setCurrentPage(1) }, [])
  const handlePageSizeChange = useCallback((size) => { setPageSize(size); setCurrentPage(1) }, [])
  const handleSelectAll = useCallback((checked) => { setSelectedIds(checked ? filteredAccounts.map(a => a.id) : []) }, [filteredAccounts])
  const handleSelectOne = useCallback((id, checked) => { setSelectedIds(prev => checked ? [...prev, id] : prev.filter(i => i !== id)) }, [])
  const handleCopy = useCallback((text, id) => { navigator.clipboard.writeText(text); setCopiedId(id); setTimeout(() => setCopiedId(null), 1500) }, [])
  
  // 删除单个账号（同时同步到云端）
  const handleDelete = useCallback(async (id) => {
    const confirmed = await showConfirm(t('accounts.delete'), t('accounts.confirmDelete'))
    if (confirmed) {
      // 1. 删除本地账号
      await invoke('delete_account', { id })
      
      // 2. 同步删除到云端（如果已登录）
      if (isLoggedIn()) {
        try {
          const { deleteAccountFromCloud } = await import('../../services/syncService')
          const result = await deleteAccountFromCloud(id)
          if (!result.success) {
            console.warn('[Delete] 云端同步删除失败:', result.error)
          }
        } catch (e) {
          console.warn('[Delete] 云端同步删除异常:', e)
        }
      }
      
      loadAccounts()
    }
  }, [showConfirm, loadAccounts, t])

  // 批量删除（同时同步到云端）
  const onBatchDelete = useCallback(async () => {
    if (selectedIds.length === 0) return
    const confirmed = await showConfirm(t('accounts.batchDelete'), t('accounts.confirmDeleteMultiple', { count: selectedIds.length }))
    if (confirmed) {
      // 1. 删除本地账号
      await invoke('delete_accounts', { ids: selectedIds })
      
      // 2. 同步删除到云端（如果已登录）
      if (isLoggedIn()) {
        try {
          const { deleteAccountFromCloud } = await import('../../services/syncService')
          // 逐个删除云端账号
          for (const id of selectedIds) {
            await deleteAccountFromCloud(id)
          }
        } catch (e) {
          console.warn('[BatchDelete] 云端同步删除异常:', e)
        }
      }
      
      setSelectedIds([])
      loadAccounts()
    }
  }, [selectedIds, showConfirm, loadAccounts, t])

  // 切换账号 - 显示确认弹窗
  const handleSwitchAccount = useCallback((account) => {
    if (!account.accessToken || !account.refreshToken) {
      setSwitchDialog({ type: 'error', title: t('switch.failed'), message: t('switch.missingAuth'), account: null })
      return
    }
    setSwitchDialog({
      type: 'confirm',
      title: t('switch.title'),
      message: `${t('switch.confirmSwitch')} ${account.email}？`,
      account,
    })
  }, [t])

  // 确认切换
  const confirmSwitch = useCallback(async () => {
    const account = switchDialog?.account
    if (!account) return
    
    setSwitchDialog(null)
    setSwitchingId(account.id)
    
    try {
      // Step 1: 先尝试占用账号（防抢号）
      if (isLoggedIn()) {
        try {
          const occupyResult = await occupyAccount(account.id)
          if (!occupyResult.success) {
            // 被其他用户占用
            setSwitchDialog({
              type: 'error',
              title: '账号被占用',
              message: `手慢了！${occupyResult.message}`,
              account: null,
            })
            setSwitchingId(null)
            // 刷新占用状态
            const heartbeatResult = await sendHeartbeat()
            setOccupancyMap(toOccupancyRecord(heartbeatResult.occupancy_map))
            return
          }
          // 占用成功，更新当前活跃账号
          setActiveAccountId(account.id)
        } catch (occupyErr) {
          console.warn('[Occupy] 占用请求失败:', occupyErr)
          // 占用失败不阻止切换，继续执行
        }
      }

      // Step 2: 读取设置，判断是否自动更换机器码
      const appSettings = await invoke('get_app_settings').catch(() => ({}))
      const autoChangeMachineId = appSettings.autoChangeMachineId ?? false
      const bindMachineIdToAccount = appSettings.bindMachineIdToAccount ?? false
      const useBoundMachineId = appSettings.useBoundMachineId ?? true
      
      // 处理账号绑定机器码逻辑
      if (autoChangeMachineId && bindMachineIdToAccount) {
        try {
          // 获取账号绑定的机器码
          let boundMachineId = await invoke('get_bound_machine_id', { accountId: account.id }).catch(() => null)
          
          if (!boundMachineId) {
            // 没有绑定机器码，生成一个新的并绑定
            boundMachineId = await invoke('generate_machine_guid')
            await invoke('bind_machine_id_to_account', { accountId: account.id, machineId: boundMachineId })
            console.log(`[MachineId] Generated and bound new machine ID for account: ${account.email}`)
          }
          
          if (useBoundMachineId) {
            // 使用绑定的机器码
            await invoke('set_custom_machine_guid', { newGuid: boundMachineId })
            console.log(`[MachineId] Switched to bound machine ID for account: ${account.email}`)
          }
          // 如果不使用绑定的机器码，后面的 resetMachineId 会随机生成
        } catch (e) {
          console.error('[MachineId] Failed to handle bound machine ID:', e)
        }
      }
      
      const isIdC = account.provider === 'BuilderId' || account.provider === 'Enterprise' || account.clientIdHash
      const authMethod = isIdC ? 'IdC' : 'social'
      
      // 直接使用账号中的 token 进行切换，不再刷新
      // 如果启用了绑定机器码且使用绑定的，不需要再 resetMachineId
      const shouldResetMachineId = autoChangeMachineId && !(bindMachineIdToAccount && useBoundMachineId)
      const params = {
        accessToken: account.accessToken,
        refreshToken: account.refreshToken,
        provider: account.provider || 'Google',
        authMethod,
        resetMachineId: shouldResetMachineId,
        autoRestart: false
      }
      
      if (isIdC) {
        params.clientIdHash = account.clientIdHash || null
        params.region = account.region || 'us-east-1'
        params.clientId = account.clientId || null
        params.clientSecret = account.clientSecret || null
      } else {
        params.profileArn = account.profileArn || 'arn:aws:codewhisperer:us-east-1:699475941385:profile/EHGA3GRVQMUK'
      }
      
      await invoke('switch_kiro_account', { params })
      
      // 更新当前账号标识
      invoke('get_kiro_local_token').then(setLocalToken).catch(() => setLocalToken(null))
      
      // 从 usage_data 获取配额信息
      const usageData = account.usageData
      const breakdown = usageData?.usage_breakdown_list?.[0] || usageData?.usageBreakdownList?.[0]
      const used = breakdown?.current_usage ?? breakdown?.currentUsage ?? 0
      const limit = breakdown?.usage_limit ?? breakdown?.usageLimit ?? 50
      const remaining = limit - used
      const provider = account.provider || 'Unknown'
      setSwitchDialog({
        type: 'success',
        title: t('switch.success'),
        message: `${account.email}\n\n📊 ${t('switch.quota')}: ${used}/${limit} (${t('switch.remaining')} ${remaining})\n🏷️ ${t('switch.type')}: ${provider}`,
        account: null,
      })
    } catch (e) {
      setSwitchDialog({
        type: 'error',
        title: t('switch.failed'),
        message: String(e),
        account: null,
      })
    } finally {
      setSwitchingId(null)
    }
  }, [switchDialog, setSwitchingId])

  return (
    <div className={`h-full flex flex-col ${colors.main}`}>
      <AccountHeader
        searchTerm={searchTerm}
        onSearchChange={handleSearchChange}
        selectedCount={selectedIds.length}
        onBatchDelete={onBatchDelete}
        onAdd={() => setShowAddModal(true)}
        onImport={() => setShowImportModal(true)}
        onExport={() => handleExport(selectedIds)}
        onSyncAndRefresh={handleSyncAndRefresh}
        isProcessing={isRefreshing || autoRefreshing}
        lastRefreshTime={lastRefreshTime}
        refreshProgress={refreshProgress}
        statusText={statusText}
      />
      <div className="flex-1 overflow-auto">
      <AccountTable
        accounts={paginatedAccounts}
        filteredAccounts={filteredAccounts}
        selectedIds={selectedIds}
        onSelectAll={handleSelectAll}
        onSelectOne={handleSelectOne}
        copiedId={copiedId}
        onCopy={handleCopy}
        onSwitch={handleSwitchAccount}
        onRefresh={handleRefreshStatus}
        onEdit={setEditingAccount}
        onEditLabel={setEditingLabelAccount}
        onDelete={handleDelete}
        onAdd={() => setShowAddModal(true)}
        refreshingId={refreshingId}
        switchingId={switchingId}
        localToken={localToken}
        occupancyMap={occupancyMap}
        currentUsername={currentUsername}
      />
      </div>
      <div className="animate-slide-in-right delay-200">
      <AccountPagination
        totalCount={filteredAccounts.length}
        pageSize={pageSize}
        currentPage={currentPage}
        totalPages={totalPages}
        onPageSizeChange={handlePageSizeChange}
        onPageChange={setCurrentPage}
      />
      </div>
      {editingAccount && (
        <AccountDetailModal
          account={editingAccount}
          onClose={() => { setEditingAccount(null); loadAccounts() }}
        />
      )}
      {showAddModal && (<AddAccountModal onClose={() => setShowAddModal(false)} onSuccess={loadAccounts} />)}
      {editingLabelAccount && (<EditAccountModal account={editingLabelAccount} onClose={() => setEditingLabelAccount(null)} onSuccess={loadAccounts} />)}
      {showImportModal && (<ImportAccountModal onClose={() => setShowImportModal(false)} onSuccess={loadAccounts} />)}
      {(isRefreshing || autoRefreshing) && (<RefreshProgressModal refreshProgress={refreshProgress} statusText={statusText} />)}
      
      {/* 切换账号弹窗 */}
      {switchDialog && (
        <ConfirmDialog
          type={switchDialog.type}
          title={switchDialog.title}
          message={switchDialog.message}
          onConfirm={switchDialog.type === 'confirm' ? confirmSwitch : () => setSwitchDialog(null)}
          onCancel={() => setSwitchDialog(null)}
          confirmText={switchDialog.type === 'confirm' ? t('switch.confirmBtn') : t('common.ok')}
        />
      )}
    </div>
  )
}

export default AccountManager

