// Test script to verify changelog fetching functionality
// This would be run in the Electron main process context

const { join } = require('path')
const { existsSync, readdirSync, readFileSync } = require('fs')
const { app } = require('electron')

// Mock the UpdateService methods for testing
class MockUpdateService {
  static async fetchReleases() {
    // Mock data that simulates GitHub API response
    return [
      {
        tag_name: 'v1.2.0',
        name: 'Version 1.2.0',
        body: '# Release Notes v1.2.0\n\n## New Features\n- Feature A\n- Feature B\n\n## Bug Fixes\n- Fixed issue X\n- Fixed issue Y',
        assets: [],
        published_at: '2023-01-01T00:00:00Z'
      },
      {
        tag_name: 'v1.1.0',
        name: 'Version 1.1.0',
        body: '# Release Notes v1.1.0\n\n## Improvements\n- Performance enhancements\n- UI improvements',
        assets: [],
        published_at: '2022-12-01T00:00:00Z'
      }
    ]
  }

  static async prefetchAndStoreChangelogs() {
    try {
      console.log('Testing changelog prefetch...')
      const releases = await this.fetchReleases()
      
      const changelogDir = join(app.getPath('userData'), 'changelogs')
      console.log('Changelog directory:', changelogDir)
      
      if (!existsSync(changelogDir)) {
        console.log('Changelog directory does not exist yet')
        const { mkdirSync } = require('fs')
        mkdirSync(changelogDir, { recursive: true })
      }

      // Store changelogs for all releases
      for (const release of releases) {
        const changelogData = {
          version: release.tag_name,
          content: release.body,
          timestamp: new Date().toISOString()
        }

        const { writeFileSync } = require('fs')
        const changelogFile = join(changelogDir, `changelog-${release.tag_name.replace(/\//g, '-')}.json`)
        
        writeFileSync(changelogFile, JSON.stringify(changelogData, null, 2))
        console.log(`Test changelog stored for version ${release.tag_name}`)
      }
      
      console.log('Test changelog prefetch completed')
      
      // Verify the files were created
      const files = readdirSync(changelogDir)
      console.log('Stored changelog files:', files)
      
      // Read and display one of the stored changelogs
      if (files.length > 0) {
        const firstFile = files[0]
        const filePath = join(changelogDir, firstFile)
        const content = readFileSync(filePath, 'utf-8')
        console.log('Sample stored changelog:', content)
      }
      
    } catch (error) {
      console.error('Error in test prefetch:', error)
    }
  }
}

// Run the test
MockUpdateService.prefetchAndStoreChangelogs().catch(console.error)