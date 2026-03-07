import { useTranslation } from 'react-i18next'
import { Download, AlertTriangle, RefreshCw, ChevronDown, Check } from 'lucide-react'
import { useState } from 'react'
import { useUpdate } from '@/lib/update/use-update'

export function UpdateButton() {
  const { t } = useTranslation()
  const { updateInfo, downloadUpdate, retryDownload } = useUpdate()
  const [showErrorDetails, setShowErrorDetails] = useState(false)

  // Hide update button in development mode
  if (import.meta.env.DEV || !updateInfo.available) {
    return null
  }

  return (
    <div className="border-t border-[#dcdddf] px-3 py-3">
      {updateInfo.error ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <button
              type="button"
              className="sidebar-item text-red-500 flex-1 text-left"
              onClick={() => setShowErrorDetails(!showErrorDetails)}
            >
              <AlertTriangle className="h-4 w-4 flex-shrink-0" />
              <span className="flex-1 line-clamp-1">{t('Erreur lors de la mise à jour')}</span>
              <ChevronDown className={`h-4 w-4 flex-shrink-0 transition-transform ${showErrorDetails ? 'rotate-180' : ''}`} />
            </button>
            <button
              type="button"
              className="ml-2 p-1 text-blue-500 hover:text-blue-600 flex-shrink-0"
              onClick={retryDownload}
              title={t('Réessayer') || 'Retry'}
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
          {showErrorDetails && (
            <div className="ml-7 rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
              <p className="break-words whitespace-pre-wrap">{updateInfo.error}</p>
            </div>
          )}
        </div>
      ) : updateInfo.installing ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <button
              type="button"
              className="sidebar-item text-green-600 flex-1 text-left"
              disabled
            >
              <Check className="h-4 w-4 animate-pulse" />
              <span>{t('Installation en cours')}...</span>
            </button>
          </div>
          <div className="ml-7 rounded border border-green-200 bg-green-50 p-2 text-sm text-green-700 dark:border-green-900 dark:bg-green-950 dark:text-green-200">
            <p className="break-words">
              {typeof window !== 'undefined' && window.desktop?.platform === 'darwin'
                ? t('Le fichier de mise à jour est ouvert. Complétez l\'installation dans Finder.')
                : t('L\'application va redémarrer pour installer la mise à jour.')}
            </p>
          </div>
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
