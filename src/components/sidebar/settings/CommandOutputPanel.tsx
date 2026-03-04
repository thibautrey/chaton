import type { PiCommandResult } from '@/features/workspace/types'
import { useTranslation } from 'react-i18next'

export function CommandOutputPanel({ result }: { result: PiCommandResult | null }) {
  const { t } = useTranslation()
  if (!result) {
    return <div className="settings-card-note">{t('Aucune commande exécutée.')}</div>
  }

  return (
    <div className="settings-output">
      <div className="settings-output-head">
        <span>{result.ok ? t('Succès') : t('Erreur')}</span>
        <span>Code: {result.code}</span>
        <span>{new Date(result.ranAt).toLocaleString()}</span>
      </div>
      <div className="settings-output-cmd">{result.command.join(' ')}</div>
      {result.message ? <div className="settings-output-err">{result.message}</div> : null}
      {result.stdout ? <pre className="settings-output-pre">{result.stdout}</pre> : null}
      {result.stderr ? <pre className="settings-output-pre settings-output-pre-err">{result.stderr}</pre> : null}
    </div>
  )
}
