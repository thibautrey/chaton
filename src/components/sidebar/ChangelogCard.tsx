import { useTranslation } from 'react-i18next'
import { BookOpen } from 'lucide-react'
import { useState, useEffect } from 'react'

interface ChangelogCardProps {
  version: string
  onClick: () => void
}

export function ChangelogCard({ version, onClick }: ChangelogCardProps) {
  const { t } = useTranslation()
  const [showCard, setShowCard] = useState(false)

  useEffect(() => {
    // Check if this version's changelog has been seen
    const lastSeenVersion = localStorage.getItem('lastSeenChangelogVersion')
    setShowCard(version !== lastSeenVersion)
  }, [version])

  useEffect(() => {
    const handleSeen = (event: Event) => {
      const detail = (event as CustomEvent<{ version?: string }>).detail
      if (detail?.version && detail.version === version) {
        setShowCard(false)
      }
    }

    window.addEventListener('changelog:seen', handleSeen)
    return () => window.removeEventListener('changelog:seen', handleSeen)
  }, [version])

  // Hide changelog card in development mode
  if (import.meta.env.DEV || !showCard) {
    return null
  }

  return (
    <div className="border-t border-[#dcdddf] px-3 py-3">
      <button
        type="button"
        className="sidebar-item text-green-500 hover:text-green-600 w-full text-left"
        onClick={onClick}
      >
        <BookOpen className="h-4 w-4" />
        <span>{t('Changelog')} v{version}</span>
      </button>
    </div>
  )
}
