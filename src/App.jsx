import { useState, useEffect, useRef } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import Sidebar from './components/Sidebar'
import Home from './components/Home'
import AccountManager from './components/AccountManager/index'
import MailManager from './components/MailManager/index'
import UserManager from './components/UserManager/index'
import Settings from './components/Settings'
import KiroConfig from './components/KiroConfig/index'
import About from './components/About'
import Login from './components/Login'
import WebOAuthLogin from './components/WebOAuthLogin'
import AuthCallback from './components/AuthCallback'
import GlobalLogin from './components/GlobalLogin'
// import UpdateChecker from './components/UpdateChecker'

import { useTheme } from './contexts/ThemeContext'
import { isLoggedIn as checkSyncLogin, isAdmin as checkIsAdmin } from './services/authService'

function App() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [activeMenu, setActiveMenu] = useState('home')
  const [syncLoggedIn, setSyncLoggedIn] = useState(false)
  const { colors } = useTheme()
  const refreshTimerRef = useRef(null)

  // 检查云端同步登录状态和管理员权限
  const [isAdminUser, setIsAdminUser] = useState(false)
  
  useEffect(() => {
    setSyncLoggedIn(checkSyncLogin())
    setIsAdminUser(checkIsAdmin())
  }, [])

  // 启动时只刷新 token（不获取 usage，快速启动）
  const refreshExpiredTokensOnly = async () => {
    try {
      const settings = await invoke('get_app_settings').catch(() => ({}))
      if (!settings.autoRefresh) return
      
      const accounts = await invoke('get_accounts')
      if (!accounts || accounts.length === 0) return
      
      const now = new Date()
      const refreshThreshold = 5 * 60 * 1000 // 提前 5 分钟
      
      const expiredAccounts = accounts.filter(acc => {
        // 跳过已封禁账号
        if (acc.status === '已封禁' || acc.status === '封禁') return false
        if (!acc.expiresAt) return false
        const expiresAt = new Date(acc.expiresAt.replace(/\//g, '-'))
        return (expiresAt.getTime() - now.getTime()) < refreshThreshold
      })
      
      if (expiredAccounts.length === 0) {
        console.log('[AutoRefresh] 没有需要刷新的 token')
        return
      }
      
      console.log(`[AutoRefresh] 刷新 ${expiredAccounts.length} 个过期 token...`)
      
      // 并发刷新
      await Promise.allSettled(
        expiredAccounts.map(async (account) => {
          try {
            await invoke('refresh_account_token', { id: account.id })
            console.log(`[AutoRefresh] ${account.email} token 刷新成功`)
          } catch (e) {
            console.warn(`[AutoRefresh] ${account.email} token 刷新失败:`, e)
          }
        })
      )
      
      console.log('[AutoRefresh] token 刷新完成')
    } catch (e) {
      console.error('[AutoRefresh] 刷新失败:', e)
    }
  }

  // 定时刷新：只刷新 token
  const checkAndRefreshExpiringTokens = async () => {
    try {
      const settings = await invoke('get_app_settings').catch(() => ({}))
      if (!settings.autoRefresh) return
      
      const accounts = await invoke('get_accounts')
      if (!accounts || accounts.length === 0) return
      
      const now = new Date()
      const refreshThreshold = 5 * 60 * 1000
      
      const expiredAccounts = accounts.filter(acc => {
        // 跳过已封禁账号
        if (acc.status === '已封禁' || acc.status === '封禁') return false
        if (!acc.expiresAt) return false
        const expiresAt = new Date(acc.expiresAt.replace(/\//g, '-'))
        return (expiresAt.getTime() - now.getTime()) < refreshThreshold
      })
      
      if (expiredAccounts.length === 0) {
        console.log('[AutoRefresh] 没有需要刷新的 token')
        return
      }
      
      console.log(`[AutoRefresh] 刷新 ${expiredAccounts.length} 个 token...`)
      
      await Promise.allSettled(
        expiredAccounts.map(async (account) => {
          try {
            await invoke('refresh_account_token', { id: account.id })
            console.log(`[AutoRefresh] ${account.email} token 刷新成功`)
          } catch (e) {
            console.warn(`[AutoRefresh] ${account.email} token 刷新失败:`, e)
          }
        })
      )
      
      console.log('[AutoRefresh] token 刷新完成')
    } catch (e) {
      console.error('[AutoRefresh] 刷新失败:', e)
    }
  }

  // 首次启动：自动保存本地 Kiro 账号并同步
  const autoSaveAndSync = async () => {
    try {
      // 检查是否有本地 Kiro 账号
      const localToken = await invoke('get_kiro_local_token').catch(() => null)
      if (!localToken) {
        console.log('[AutoSync] 未检测到本地 Kiro 账号')
        return
      }
      
      // 检查该账号是否已存在
      const accounts = await invoke('get_accounts').catch(() => [])
      const exists = accounts.some(acc => 
        acc.refreshToken === localToken.refreshToken ||
        acc.accessToken === localToken.accessToken
      )
      
      if (!exists) {
        // 自动添加本地账号
        console.log('[AutoSync] 自动保存本地 Kiro 账号...')
        await invoke('add_local_kiro_account').catch(e => {
          console.warn('[AutoSync] 保存本地账号失败:', e)
        })
      }
      
      // 使用新的前端同步服务执行云端同步
      console.log('[AutoSync] 执行云端同步...')
      try {
        const { performSync } = await import('./services/syncService')
        const result = await performSync()
        if (result.success) {
          console.log('[AutoSync] 同步完成:', result.message)
        } else {
          console.warn('[AutoSync] 云端同步失败:', result.error || result.message)
        }
      } catch (e) {
        console.warn('[AutoSync] 云端同步失败:', e)
      }
    } catch (e) {
      console.error('[AutoSync] 自动同步失败:', e)
    }
  }

  // 启动自动刷新定时器
  const startAutoRefreshTimer = async () => {
    if (refreshTimerRef.current) {
      clearInterval(refreshTimerRef.current)
    }
    
    // 首次启动：自动保存本地账号并同步
    await autoSaveAndSync()
    
    // 启动时只刷新 token（快速启动）
    refreshExpiredTokensOnly()
    
    // 从设置读取刷新间隔
    const settings = await invoke('get_app_settings').catch(() => ({}))
    const intervalMs = (settings.autoRefreshInterval || 50) * 60 * 1000
    
    console.log(`[AutoRefresh] 定时器间隔: ${settings.autoRefreshInterval || 50} 分钟`)
    refreshTimerRef.current = setInterval(checkAndRefreshExpiringTokens, intervalMs)
  }

  useEffect(() => {
    checkAuth()
    
    // 检查是否是回调页面
    const url = new URL(window.location.href)
    if (url.pathname === '/callback' && (url.searchParams.has('code') || url.searchParams.has('state'))) {
      setActiveMenu('callback')
      return
    }
    
    // 监听登录成功事件
    const unlisten = listen('login-success', (event) => {
      console.log('Login success in App:', event.payload)
      checkAuth()
      setActiveMenu('token')
    })
    
    // 监听设置变化，重启定时器
    const unlistenSettings = listen('settings-changed', () => {
      console.log('[AutoRefresh] 设置已变化，重启定时器')
      startAutoRefreshTimer()
    })
    
    // 启动自动刷新定时器
    startAutoRefreshTimer()
    
    return () => { 
      unlisten.then(fn => fn())
      unlistenSettings.then(fn => fn())
      if (refreshTimerRef.current) {
        clearInterval(refreshTimerRef.current)
      }
    }
  }, [])

  const checkAuth = async () => {
    try {
      const currentUser = await invoke('get_current_user')
      setUser(currentUser)
    } catch (e) {
      console.error('Auth check failed:', e)
    } finally {
      setLoading(false)
    }
  }

  const handleLogin = (loggedInUser) => {
    if (loggedInUser) {
      setUser(loggedInUser)
    }
    checkAuth()
  }

  const handleLogout = async () => {
    await invoke('logout')
    setUser(null)
  }

  const renderContent = () => {
    switch (activeMenu) {
      case 'home': return <Home onNavigate={setActiveMenu} />
      case 'token': return <AccountManager />
      case 'mail-manager': return <MailManager />
      case 'user-manager': return <UserManager />
      case 'kiro-config': return <KiroConfig />
      case 'login': return <Login onLogin={(user) => { handleLogin(user); setActiveMenu('token'); }} />
      case 'web-oauth': return <WebOAuthLogin onLogin={(user) => { handleLogin(user); setActiveMenu('token'); }} />
      case 'callback': return <AuthCallback />
      case 'settings': return <Settings />
      case 'about': return <About />
      default: return <Home />
    }
  }

  if (loading) {
    return (
      <div className="h-screen bg-[#0d0d0d] flex items-center justify-center">
        <div className="text-white">加载中...</div>
      </div>
    )
  }

  // 全局登录拦截：未登录云端同步时显示登录页
  if (!syncLoggedIn) {
    return (
      <GlobalLogin 
        onLoginSuccess={() => {
          setSyncLoggedIn(true)
          startAutoRefreshTimer()
        }} 
      />
    )
  }

  return (
    <div className={`flex h-screen ${colors.main}`}>
      <Sidebar 
        activeMenu={activeMenu} 
        onMenuChange={setActiveMenu}
        user={user}
        onLogout={handleLogout}
        isAdmin={isAdminUser}
        onSyncLogout={() => {
          setSyncLoggedIn(false)
          setIsAdminUser(false)
        }}
      />
      <main className="flex-1 overflow-hidden">
        {renderContent()}
      </main>
      
      {/* <UpdateChecker /> */}
    </div>
  )
}

export default App
