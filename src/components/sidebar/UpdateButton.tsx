import { useTranslation } from 'react-i18next'
import { Download } from 'lucide-react'
import { useUpdate } from '@/lib/update/use-update'

export function UpdateButton() {
  const { t } = useTranslation()
  const { updateInfo, downloadUpdate } = useUpdate()

  if (!updateInfo.available) {
    return null
  }

  return (
    <div className="border-t border-[#dcdddf] px-3 py-3">
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
    </div>
  )
}
