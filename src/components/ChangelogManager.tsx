/* eslint-disable react-refresh/only-export-components */
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
      const normalizedVersion = version.replace(/^v/i, '').trim()
      const lastSeenVersion = localStorage.getItem('lastSeenChangelogVersion')
      
      if (normalizedVersion && normalizedVersion !== lastSeenVersion) {
        // Try to read changelog from file system
        const changelogData = await readChangelogFromFile(normalizedVersion)
        
        if (changelogData) {
          setChangelogVersion(changelogData.version.replace(/^v/i, ''))
          setChangelogContent(changelogData.content)
          setShowChangelog(true)
        } else {
          // If no local changelog found, try to fetch it from GitHub
          console.log(`No local changelog found for version ${normalizedVersion}, attempting to fetch from GitHub...`)
          
          // Show a loading message while we fetch from GitHub
          const loadingChangelog = `Chargement des notes de version pour v${normalizedVersion}...

Veuillez patienter pendant que nous récupérons les informations depuis GitHub...`
          
          setChangelogVersion(normalizedVersion)
          setChangelogContent(loadingChangelog)
          setShowChangelog(true)
          
          // Try to fetch from GitHub
          try {
            const fetchedChangelog = await fetchChangelogFromGitHub(normalizedVersion)
            
            if (fetchedChangelog) {
              // Update the dialog with the real changelog content
              setChangelogVersion(fetchedChangelog.version.replace(/^v/i, ''))
              setChangelogContent(fetchedChangelog.content)
            } else {
              // If still no changelog found, show an error message with helpful guidance
              const errorChangelog = `Impossible de charger les notes de version pour v${normalizedVersion}

Les notes de version pour cette version ne sont pas disponibles localement ni sur GitHub.

Suggestions :
1. Verifiez votre connexion Internet
2. Visitez directement : https://github.com/thibautrey/chaton/releases/tag/v${normalizedVersion}
3. Cette version peut ne pas avoir de notes de version publiees

Si le probleme persiste, veuillez verifier les logs de l'application.`
              setChangelogContent(errorChangelog)
            }
          } catch (fetchError) {
            console.error(`Error fetching changelog for version ${normalizedVersion}:`, fetchError)
            const errorMessage = fetchError instanceof Error ? fetchError.message : 'Erreur inconnue'
            const isRateLimit = errorMessage.includes('rate limit')
            const errorChangelog = isRateLimit
              ? `Les notes de version pour v${normalizedVersion} ne peuvent pas etre chargees car la limite de requetes GitHub a ete atteinte.

Veuillez reessayer dans quelques minutes, ou visitez directement :
https://github.com/thibautrey/chaton/releases/tag/v${normalizedVersion}`
              : `Erreur de chargement des notes de version

Une erreur s'est produite lors de la récupération des notes de version pour v${normalizedVersion}.

Details : ${errorMessage}

Suggestions :
1. Verifiez votre connexion Internet
2. Verifiez que GitHub est accessible
3. Visitez directement : https://github.com/thibautrey/chaton/releases/tag/v${normalizedVersion}

Si le probleme persiste, veuillez verifier les logs de l'application.`
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
      window.dispatchEvent(
        new CustomEvent('changelog:seen', {
          detail: { version: changelogVersion }
        })
      )
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
