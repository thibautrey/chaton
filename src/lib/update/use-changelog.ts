import { useState, useEffect } from 'react'

export function useChangelog() {
  const [showChangelog, setShowChangelog] = useState(false)
  const [changelogVersion, setChangelogVersion] = useState<string | null>(null)
  const [changelogContent, setChangelogContent] = useState('')

  // Check if there's a new version that needs changelog display
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const lastSeenVersion = localStorage.getItem('lastSeenChangelogVersion')
    const currentVersion = import.meta.env.VITE_APP_VERSION || '0.1.0'

    // In a real app, you would compare versions and fetch changelog
    // For now, we'll simulate this by checking if we have a stored version
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
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [])

  const markChangelogAsSeen = () => {
    if (changelogVersion) {
      localStorage.setItem('lastSeenChangelogVersion', changelogVersion)
      setShowChangelog(false)
    }
  }

  return {
    showChangelog,
    changelogVersion,
    changelogContent,
    markChangelogAsSeen
  }
}
