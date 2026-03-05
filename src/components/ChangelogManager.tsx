import { useState, useEffect, useCallback, useImperativeHandle, forwardRef } from 'react'
import { ChangelogDialog } from './ChangelogDialog'
import { readChangelogFromFile } from '@/lib/update/changelog-reader'

export interface ChangelogManagerHandle {
  showChangelogForVersion: (version: string) => Promise<void>
}

export const ChangelogManager = forwardRef<ChangelogManagerHandle>((_, ref) => {
  const [showChangelog, setShowChangelog] = useState(false)
  const [changelogVersion, setChangelogVersion] = useState<string | null>(null)
  const [changelogContent, setChangelogContent] = useState('')

  useEffect(() => {
    // Don't show changelog automatically on app start
    // Changelog will be shown when user clicks the changelog button in sidebar
  }, [])

  const showChangelogForVersion = useCallback(async (version: string) => {
    try {
      const lastSeenVersion = localStorage.getItem('lastSeenChangelogVersion')
      
      if (version && version !== lastSeenVersion) {
        // Try to read changelog from file system first
        const changelogData = await readChangelogFromFile(version)
        
        if (changelogData) {
          setChangelogVersion(changelogData.version)
          setChangelogContent(changelogData.content)
          setShowChangelog(true)
        } else {
          // Fallback to simulated changelog if no file found
          const simulatedChangelog = `Version ${version}
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

          setChangelogVersion(version)
          setChangelogContent(simulatedChangelog)
          setShowChangelog(true)
        }
      }
    } catch (error) {
      console.error('Error showing changelog:', error)
    }
  }, [])

  const handleCloseChangelog = () => {
    if (changelogVersion) {
      localStorage.setItem('lastSeenChangelogVersion', changelogVersion)
    }
    setShowChangelog(false)
  }

  // Expose the showChangelogForVersion function to parent components
  useImperativeHandle(ref, () => ({
    showChangelogForVersion
  }))

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
})

// Export a hook to access the changelog manager
let changelogManagerRef: React.RefObject<ChangelogManagerHandle> | null = null

export function setChangelogManagerRef(ref: React.RefObject<ChangelogManagerHandle>) {
  changelogManagerRef = ref
}

export function useChangelogManager() {
  const showChangelogForVersion = async (version: string) => {
    if (changelogManagerRef?.current) {
      await changelogManagerRef.current.showChangelogForVersion(version)
    } else {
      console.warn('ChangelogManager ref not set')
    }
  }
  
  return { showChangelogForVersion }
}
