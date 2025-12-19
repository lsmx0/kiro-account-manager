import { useState, useEffect } from 'react'
import { Download, X, RefreshCw, CheckCircle } from 'lucide-react'
import { check } from '@tauri-apps/plugin-updater'
import { relaunch } from '@tauri-apps/plugin-process'
import { useTheme } from '../contexts/ThemeContext'
import { useI18n } from '../i18n.jsx'

function UpdateNotification() {
  const { theme, colors } = useTheme()
  const { t } = useI18n()
  const isDark = theme === 'dark'
  
  const [updateInfo, setUpdateInfo] = useState(null)
  const [dismissed, setDismissed] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [downloadProgress, setDownloadProgress] = useState(0)
  const [downloadComplete, setDownloadComplete] = useState(false)

  useEffect(() => {
    // 启动时自动检查更新
    const checkForUpdate = async () => {
      try {
        console.log('[AutoUpdate] 检查更新...')
        const update = await check()
        console.log('[AutoUpdate] 检查结果:', update)
        
        if (update) {
          const version = update.version || '新版本'
          console.log('[AutoUpdate] 发现新版本:', version)
          setUpdateInfo({ update, version })
        } else {
          console.log('[AutoUpdate] 已是最新版本')
        }
      } catch (e) {
        console.error('[AutoUpdate] 检查更新失败:', e)
      }
    }

    // 延迟 3 秒检查，避免影响启动速度
    const timer = setTimeout(checkForUpdate, 3000)
    return () => clearTimeout(timer)
  }, [])

  const handleUpdate = async () => {
    if (!updateInfo?.update) return
    
    setDownloading(true)
    setDownloadProgress(0)
    
    let downloaded = 0
    let total = 0
    
    try {
      await updateInfo.update.downloadAndInstall((event) => {
        if (event.event === 'Started') {
          total = event.data.contentLength || 0
          downloaded = 0
        } else if (event.event === 'Progress') {
          downloaded += event.data.chunkLength
          if (total > 0) {
            setDownloadProgress(Math.round((downloaded / total) * 100))
          }
        } else if (event.event === 'Finished') {
          setDownloadProgress(100)
          setDownloadComplete(true)
        }
      })
      
      // 下载完成后重启
      await relaunch()
    } catch (e) {
      console.error('[AutoUpdate] 更新失败:', e)
      setDownloading(false)
    }
  }

  const handleDismiss = () => {
    setDismissed(true)
  }

  // 不显示的情况
  if (!updateInfo || dismissed) {
    return null
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 animate-slide-in-up">
      <div className={`${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} 
        rounded-xl shadow-2xl border p-4 max-w-sm`}>
        {/* 关闭按钮 */}
        <button
          onClick={handleDismiss}
          className={`absolute top-2 right-2 p-1 rounded-full 
            ${isDark ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-100 text-gray-500'}
            transition-colors`}
        >
          <X size={14} />
        </button>

        {/* 内容 */}
        <div className="flex items-start gap-3 pr-6">
          <div className={`p-2 rounded-lg ${isDark ? 'bg-blue-500/20' : 'bg-blue-100'}`}>
            {downloading ? (
              <RefreshCw size={20} className="text-blue-500 animate-spin" />
            ) : downloadComplete ? (
              <CheckCircle size={20} className="text-green-500" />
            ) : (
              <Download size={20} className="text-blue-500" />
            )}
          </div>
          
          <div className="flex-1">
            <h4 className={`font-medium ${colors.text} text-sm`}>
              {t('update.newVersionAvailable') || '发现新版本'}
            </h4>
            <p className={`text-xs ${colors.textMuted} mt-0.5`}>
              v{updateInfo.version} {t('update.readyToInstall') || '可供安装'}
            </p>
            
            {/* 下载进度 */}
            {downloading && (
              <div className="mt-2">
                <div className={`h-1.5 rounded-full ${isDark ? 'bg-gray-700' : 'bg-gray-200'} overflow-hidden`}>
                  <div 
                    className="h-full bg-blue-500 rounded-full transition-all duration-300"
                    style={{ width: `${downloadProgress}%` }}
                  />
                </div>
                <p className={`text-xs ${colors.textMuted} mt-1`}>
                  {t('update.downloading') || '下载中'} {downloadProgress}%
                </p>
              </div>
            )}
            
            {/* 操作按钮 */}
            {!downloading && (
              <div className="flex gap-2 mt-3">
                <button
                  onClick={handleUpdate}
                  className="px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white text-xs 
                    font-medium rounded-lg transition-colors flex items-center gap-1.5"
                >
                  <Download size={12} />
                  {t('update.updateNow') || '立即更新'}
                </button>
                <button
                  onClick={handleDismiss}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors
                    ${isDark ? 'bg-gray-700 hover:bg-gray-600 text-gray-300' : 'bg-gray-100 hover:bg-gray-200 text-gray-600'}`}
                >
                  {t('update.later') || '稍后'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default UpdateNotification
