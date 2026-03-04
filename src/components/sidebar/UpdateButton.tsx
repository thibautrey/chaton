import { useTranslation } from 'react-i18next'
import { Download, AlertTriangle, RefreshCw } from 'lucide-react'
import { useUpdate } from '@/lib/update/use-update'

export function UpdateButton() {
  const { t } = useTranslation()
  const { updateInfo, downloadUpdate, retryDownload } = useUpdate()

  // Hide update button in development mode
  if (import.meta.env.DEV || !updateInfo.available) {
    return null
  }

  return (
    <div className="border-t border-[#dcdddf] px-3 py-3">
      {updateInfo.error ? (
        <div className="flex items-center justify-between">
          <div className="sidebar-item text-red-500 flex-1">
            <AlertTriangle className="h-4 w-4" />
            <span className="truncate">{updateInfo.error}</span>
          </div>
          <button
            type="button"
            className="ml-2 p-1 text-blue-500 hover:text-blue-600"
            onClick={retryDownload}
            title={t('Réessayer') || 'Retry'}
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="sidebar-item text-blue-500 hover:text-blue-600"
          onClick={downloadUpdate}
          disabled={updateInfo.downloading}
        >
          {updateInfo.downloading ? (
            <>
              <Download className="h-4 w-4 animate-pulse" />
              <span>{t('Téléchargement')}... {Math.round(updateInfo.downloadProgress)}%</span>
            </>
          ) : (
            <>
              <Download className="h-4 w-4" />
              <span>{t('Mise à jour disponible')}</span>
            </>
          )}
        </button>
      )}
    </div>
  )
}
