import { useState, useEffect } from 'react'
import { ChangelogDialog } from './ChangelogDialog'

export function ChangelogManager() {
  const [showChangelog, setShowChangelog] = useState(false)
  const [changelogVersion, setChangelogVersion] = useState<string | null>(null)
  const [changelogContent, setChangelogContent] = useState('')

  useEffect(() => {
    // Check for pending changelogs on app start
    const checkForPendingChangelogs = async () => {
      try {
        // In a real implementation, you would check the file system or API
        // For now, we'll simulate this by checking localStorage
        const lastSeenVersion = localStorage.getItem('lastSeenChangelogVersion')
        const currentVersion = import.meta.env.VITE_APP_VERSION || '0.1.0'

        if (currentVersion && currentVersion !== lastSeenVersion) {
          // Simulate fetching changelog content
          const simulatedChangelog = `Version ${currentVersion}
=== 

## Nouveautés
- Système de mise à jour intégré
- Notification de changelog après mise à jour
- Interface utilisateur améliorée

## Corrections
- Correction des problèmes de compatibilité
- Amélioration des performances

## Améliorations
- Meilleure gestion des erreurs
- Interface plus intuitive`

          setChangelogVersion(currentVersion)
          setChangelogContent(simulatedChangelog)
          setShowChangelog(true)
        }
      } catch (error) {
        console.error('Error checking for changelogs:', error)
      }
    }

    checkForPendingChangelogs()
  }, [])

  const handleCloseChangelog = () => {
    if (changelogVersion) {
      localStorage.setItem('lastSeenChangelogVersion', changelogVersion)
    }
    setShowChangelog(false)
  }

  return (
    <>
      {showChangelog && changelogVersion && (
        <ChangelogDialog
          version={changelogVersion}
          changelogContent={changelogContent}
          onClose={handleCloseChangelog}
        />
      )}
    </>
  )
}
