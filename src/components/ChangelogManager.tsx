import { useState, useEffect, useCallback, useImperativeHandle, forwardRef } from 'react'
import { ChangelogDialog } from './ChangelogDialog'
import { readChangelogFromFile, fetchChangelogFromGitHub } from '@/lib/update/changelog-reader'

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
        // Try to read changelog from file system
        const changelogData = await readChangelogFromFile(version)
        
        if (changelogData) {
          setChangelogVersion(changelogData.version)
          setChangelogContent(changelogData.content)
          setShowChangelog(true)
        } else {
          // If no local changelog found, try to fetch it from GitHub
          console.log(`No local changelog found for version ${version}, attempting to fetch from GitHub...`)
          
          // Show a loading message while we fetch from GitHub
          const loadingChangelog = `Chargement des notes de version pour v${version}...

Veuillez patienter pendant que nous récupérons les informations depuis GitHub...`
          
          setChangelogVersion(version)
          setChangelogContent(loadingChangelog)
          setShowChangelog(true)
          
          // Try to fetch from GitHub
          try {
            const fetchedChangelog = await fetchChangelogFromGitHub(version)
            
            if (fetchedChangelog) {
              // Update the dialog with the real changelog content
              setChangelogVersion(fetchedChangelog.version)
              setChangelogContent(fetchedChangelog.content)
            } else {
              // If still no changelog found, show an error message
              const errorChangelog = `Impossible de charger les notes de version pour v${version}

Les notes de version pour cette version ne sont pas disponibles.`
              setChangelogContent(errorChangelog)
            }
          } catch (fetchError) {
            console.error(`Error fetching changelog for version ${version}:`, fetchError)
            const errorChangelog = `Erreur de chargement des notes de version

Une erreur s'est produite lors de la récupération des notes de version pour v${version}.`
            setChangelogContent(errorChangelog)
          }
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
