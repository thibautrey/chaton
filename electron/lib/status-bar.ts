import { app, Tray, Menu, nativeImage, BrowserWindow } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getDb } from '../db/index.js'
import { getAppSettings, saveAppSettings } from '../db/repos/settings.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

let tray: Tray | null = null
let mainWindow: BrowserWindow | null = null

const statusBarIconPath = path.join(__dirname, '../../build/icons/statusbar.png')
const secondaryStatusBarIconPath = path.join(__dirname, '../../build/icons/chaton.png')
const fallbackStatusBarIconPath = path.join(__dirname, '../../build/icons/icon.png')

function loadStatusBarIcon() {
  const primaryIcon = nativeImage.createFromPath(statusBarIconPath)
  const secondaryIcon = nativeImage.createFromPath(secondaryStatusBarIconPath)
  const fallbackIcon = nativeImage.createFromPath(fallbackStatusBarIconPath)
  const icon = !primaryIcon.isEmpty()
    ? primaryIcon
    : (!secondaryIcon.isEmpty() ? secondaryIcon : fallbackIcon)

  if (icon.isEmpty()) {
    console.error('[status-bar] Unable to load status bar icon from expected paths', {
      statusBarIconPath,
      secondaryStatusBarIconPath,
      fallbackStatusBarIconPath,
    })
    return null
  }

  // macOS menu bar icons are expected to be small; large bitmaps can render poorly or not at all.
  const resized = icon.resize({ width: 18, height: 18, quality: 'best' })

  // Only force template rendering when we explicitly have a template-named asset.
  const isTemplateAsset = /template/i.test(path.basename(statusBarIconPath))
  if (isTemplateAsset) {
    resized.setTemplateImage(true)
  }

  return resized
}

export function setupStatusBar(win: BrowserWindow) {
  mainWindow = win

  if (process.platform !== 'darwin') {
    return // Only create status bar on macOS
  }

  const icon = loadStatusBarIcon()
  if (!icon) {
    return
  }

  tray = new Tray(icon)
  tray.setToolTip('Chatons')
  
  updateContextMenu()
  
  // Handle click on tray icon - only show context menu
  // Removed window toggle behavior as per requirement
}

export function updateContextMenu() {
  if (!tray) return

  const db = getDb()
  const appSettings = getAppSettings(db)

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Ouvrir',
      click: () => {
        if (mainWindow) {
          mainWindow.show()
          mainWindow.focus()
        }
      }
    },
    {
      type: 'separator'
    },
    {
      label: 'Démarrer avec la session',
      type: 'checkbox',
      checked: appSettings.launchAtStartup,
      click: () => {
        const newSettings = { ...appSettings, launchAtStartup: !appSettings.launchAtStartup }
        saveAppSettings(db, newSettings)
        updateLaunchAtStartup(newSettings.launchAtStartup)
        updateContextMenu()
      }
    },
    {
      label: 'Réduire au démarrage',
      type: 'checkbox',
      checked: appSettings.startMinimized,
      click: () => {
        const newSettings = { ...appSettings, startMinimized: !appSettings.startMinimized }
        saveAppSettings(db, newSettings)
        updateContextMenu()
      }
    },
    {
      type: 'separator'
    },
    {
      label: 'Quitter',
      click: () => {
        app.quit()
      }
    }
  ])

  tray.setContextMenu(contextMenu)
}

export function updateLaunchAtStartup(enable: boolean) {
  if (process.platform !== 'darwin') return

  // Implement macOS launch at startup logic
  const loginItems = app.getLoginItemSettings()
  
  if (enable && !loginItems.openAtLogin) {
    app.setLoginItemSettings({
      openAtLogin: true,
      openAsHidden: true
    })
  } else if (!enable && loginItems.openAtLogin) {
    app.setLoginItemSettings({
      openAtLogin: false
    })
  }
}

export function getMainWindow() {
  return mainWindow
}

export function setMainWindow(win: BrowserWindow | null) {
  mainWindow = win
}
