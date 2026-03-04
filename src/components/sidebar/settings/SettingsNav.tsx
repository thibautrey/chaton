import type { SettingsSection } from './sections/constants'
import { SECTION_LABELS, SETTINGS_SECTIONS } from './sections/constants'
import { useTranslation } from 'react-i18next'

export function SettingsNav({
  active,
  onChange,
}: {
  active: SettingsSection
  onChange: (value: SettingsSection) => void
}) {
  const { t } = useTranslation()
  
  return (
    <nav className="settings-nav" aria-label={t('Navigation paramètres Pi')}>
      {SETTINGS_SECTIONS.map((section) => (
        <button
          key={section}
          type="button"
          className={`settings-nav-item ${active === section ? 'settings-nav-item-active' : ''}`}
          onClick={() => onChange(section)}
        >
          {t(SECTION_LABELS[section])}
        </button>
      ))}
    </nav>
  )
}
