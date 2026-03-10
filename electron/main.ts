import electron from "electron";
const { BrowserWindow, app, shell, Notification } = electron;
import {
  getLanguagePreference,
  getWindowBounds,
  saveWindowBounds,
  getAppSettings,
  getSidebarSettings,
} from "./db/repos/settings.js";
import {
  registerWorkspaceIpc,
  stopPiRuntimes,
  cleanupOrphanedWorktrees,
  ensurePiAgentBootstrapped,
} from "./ipc/workspace.js";
import { registerPiIpc } from "./ipc/pi.js";
import { registerUpdateIpc } from "./ipc/update.js";
import { initPiManager } from "./lib/pi/pi-manager.js";
import { initLogging } from "./lib/logging/log-manager.js";
import { initSentryTelemetry } from "./lib/telemetry/sentry.js";

import { fileURLToPath } from "node:url";
import { getDb } from "./db/index.js";
import path from "node:path";
import { setupStatusBar, updateLaunchAtStartup, getMainWindow, setMainWindow } from "./lib/status-bar.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Set the app name before readiness so macOS menu uses Chatons instead of Electron.
app.setName("Chatons");

// Register chatons:// as the app's custom protocol for deep links.
// On macOS the protocol is handled via open-url events; on Windows/Linux
// it falls back to the single-instance lock / command-line argv.
const PROTOCOL_PREFIX = "chatons";
if (process.defaultApp) {
  // In development, register with the full path to the electron binary
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient(PROTOCOL_PREFIX, process.execPath, [
      path.resolve(process.argv[1]),
    ]);
  }
} else {
  app.setAsDefaultProtocolClient(PROTOCOL_PREFIX);
}

// Holds a pending deep-link URL that arrived before the window was ready.
let pendingDeepLinkUrl: string | null = null;

/**
 * Parse a chatons:// URL and forward the relevant IPC event to the renderer.
 * Supported routes:
 *   chatons://extensions/install/<npm-package-id>
 */
function handleDeepLink(url: string) {
  const win = getMainWindow();
  if (!win) {
    // Window not ready yet; queue for later.
    pendingDeepLinkUrl = url;
    return;
  }

  // Bring the window to the foreground
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();

  try {
    // Parse the URL: chatons://extensions/install/@scope/package
    // URL constructor needs a valid scheme so replace chatons:// with https://
    const parsed = new URL(url.replace(`${PROTOCOL_PREFIX}://`, "https://"));
    const segments = parsed.pathname.split("/").filter(Boolean);

    if (segments[0] === "extensions" && segments[1] === "install" && segments.length >= 3) {
      // Reconstruct the full npm package id (may contain a scope like @scope/name)
      const extensionId = decodeURIComponent(segments.slice(2).join("/"));
      win.webContents.send("deeplink:extension-install", { extensionId });
    }
  } catch (err) {
    console.error("Failed to parse deep link URL:", url, err);
  }
}

// Set custom userData path to use Chatons-specific directory instead of Electron
const userDataPath = path.join(app.getPath('appData'), 'Chatons');
app.setPath('userData', userDataPath);

const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);
const appIconPath = path.join(__dirname, "../build/icons/icon.png");

// Variable to keep track of the main window
let mainWindow: electron.BrowserWindow | null = null;
let isQuitting = false;
const isTelemetryEnabled = () => {
  try {
    const db = getDb();
    const settings = getSidebarSettings(db);
    return Boolean(settings.allowAnonymousTelemetry);
  } catch {
    return false;
  }
};
const telemetryClient: ReturnType<typeof initSentryTelemetry> | null = isDev
  ? null
  : initSentryTelemetry({
      appVersion: app.getVersion(),
      isEnabled: isTelemetryEnabled,
    });

function createWindow() {
  const db = getDb();
  const initialBounds = getWindowBounds(db);
  const languagePreference = getLanguagePreference(db);
  const appSettings = getAppSettings(db);

  mainWindow = new BrowserWindow({
    x: initialBounds.x,
    y: initialBounds.y,
    width: initialBounds.width,
    height: initialBounds.height,
    minWidth: 1200,
    minHeight: 780,
    frame: false,
    titleBarStyle: "hidden",
    backgroundColor: "#f5f5f7",
    icon: appIconPath,
    show: !appSettings.startMinimized, // Hide window if startMinimized is enabled
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  // Set main window reference for status bar
  setMainWindow(mainWindow);

  if (isDev && process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(
      `${process.env.VITE_DEV_SERVER_URL}?language=${languagePreference}`,
    );
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    mainWindow.loadFile(path.join(__dirname, "../dist/index.html"), {
      query: { language: languagePreference },
    });
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    telemetryClient?.send({
      timestamp: new Date().toISOString(),
      source: "electron",
      level: "error",
      message: "render_process_gone",
      data: details,
    });
  });

  mainWindow.webContents.on("unresponsive", () => {
    telemetryClient?.send({
      timestamp: new Date().toISOString(),
      source: "electron",
      level: "warn",
      message: "render_process_unresponsive",
    });
  });

  let saveTimeout: NodeJS.Timeout | null = null;
  const scheduleBoundsSave = () => {
    if (mainWindow?.isDestroyed()) {
      return;
    }

    if (saveTimeout) {
      clearTimeout(saveTimeout);
    }

    saveTimeout = setTimeout(() => {
      if (mainWindow?.isDestroyed() || mainWindow?.isMinimized() || mainWindow?.isMaximized()) {
        return;
      }

      saveWindowBounds(db, mainWindow!.getBounds());
    }, 200);
  };

  mainWindow.on("move", scheduleBoundsSave);
  mainWindow.on("resize", scheduleBoundsSave);
  mainWindow.on("close", (e) => {
    if (saveTimeout) {
      clearTimeout(saveTimeout);
    }

    if (!mainWindow!.isMinimized() && !mainWindow!.isMaximized()) {
      saveWindowBounds(db, mainWindow!.getBounds());
    }

    // Keep app alive when user closes the window on macOS, unless a real app quit is in progress.
    if (process.platform === 'darwin' && !isQuitting) {
      e.preventDefault();
      mainWindow!.hide();
    }
  });

  // Expose method to check if window is focused
  electron.ipcMain.handle('window:isFocused', () => {
    return mainWindow?.isFocused() ?? false;
  });

  // Expose method to show notification
  electron.ipcMain.handle('window:showNotification', (_event, title: string, body: string) => {
    if (!mainWindow) return false;
    
    // Only show notification if window is not focused
    if (mainWindow.isFocused()) {
      return false;
    }
    
    const notification = new Notification({
      title: title,
      body: body,
      icon: appIconPath,
    });
    
    notification.on('click', () => {
      if (mainWindow) {
        mainWindow.focus();
      }
    });
    
    notification.show();
    return true;
  });

  // Window control handlers
  electron.ipcMain.handle('window:close', () => {
    if (mainWindow) {
      mainWindow.close();
    }
  });

  electron.ipcMain.handle('window:minimize', () => {
    if (mainWindow) {
      mainWindow.minimize();
    }
  });

  electron.ipcMain.handle('window:maximize', () => {
    if (mainWindow) {
      if (mainWindow.isMaximized()) {
        mainWindow.unmaximize();
      } else {
        mainWindow.maximize();
      }
    }
  });
  // Setup status bar after window is created
  setupStatusBar(mainWindow);

  // Update launch at startup setting
  updateLaunchAtStartup(appSettings.launchAtStartup);
}

// macOS: handle chatons:// links when the app is already running
app.on("open-url", (event, url) => {
  event.preventDefault();
  handleDeepLink(url);
});

// Windows/Linux: prevent second instance and forward deep link from argv
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on("second-instance", (_event, argv) => {
    // On Windows the deep link URL is passed as the last command-line argument
    const url = argv.find((arg) => arg.startsWith(`${PROTOCOL_PREFIX}://`));
    if (url) {
      handleDeepLink(url);
    } else {
      // Just focus the existing window
      const win = getMainWindow();
      if (win) {
        if (win.isMinimized()) win.restore();
        win.show();
        win.focus();
      }
    }
  });
}

app.whenReady().then(async () => {
  if (process.platform === "darwin" && app.dock) {
    app.dock.setIcon(appIconPath);
  }

  // Ensure Chatons-owned Pi agent directory and base config files exist.
  try {
    ensurePiAgentBootstrapped();
  } catch (error) {
    console.error("Erreur lors de l'initialisation du répertoire Pi local:", error);
  }

  // Initialiser le système de logging
  try {
    initLogging({
      onLog: (entry) => telemetryClient?.send(entry),
    });
    console.log('Système de logging initialisé');
  } catch (error) {
    console.error('Erreur lors de l\'initialisation du système de logging:', error);
  }

  process.on("uncaughtException", (error) => {
    telemetryClient?.send({
      timestamp: new Date().toISOString(),
      source: "electron",
      level: "error",
      message: "uncaughtException",
      data: {
        name: error?.name,
        message: error?.message,
        stack: error?.stack,
      },
    });
  });

  process.on("unhandledRejection", (reason) => {
    telemetryClient?.send({
      timestamp: new Date().toISOString(),
      source: "electron",
      level: "error",
      message: "unhandledRejection",
      data: {
        reason:
          reason instanceof Error
            ? {
                name: reason.name,
                message: reason.message,
                stack: reason.stack,
              }
            : reason,
      },
    });
  });

  // Initialiser Pi Manager
  try {
    await initPiManager();
    console.log('Pi Manager initialisé avec succès');
  } catch (error) {
    console.error('Erreur lors de l\'initialisation de Pi Manager:', error);
  }

  // Initialiser Sandbox Manager
  try {
    // Import sandbox manager to ensure it's initialized
    const { sandboxManager } = await import('./lib/sandbox/sandbox-manager.js');
    console.log('Sandbox Manager initialisé avec succès');
  } catch (error) {
    console.error('Erreur lors de l\'initialisation de Sandbox Manager:', error);
  }

  // Clean up orphaned worktrees at startup
  try {
    const cleanedCount = await cleanupOrphanedWorktrees();
    if (cleanedCount > 0) {
      console.log(`Nettoyage terminé: ${cleanedCount} worktrees orphelins supprimés`);
    }
  } catch (error) {
    console.error('Erreur lors du nettoyage des worktrees orphelins:', error);
    // Ne pas bloquer le démarrage pour cette erreur
  }

  // Prefetch changelogs from GitHub (skip if update check already ran)
  try {
    const { UpdateService } = await import('./lib/update/update-service.js');
    await UpdateService.prefetchAndStoreChangelogs();
    console.log('Changelogs prefetched and stored successfully');
  } catch (error) {
    console.error('Erreur lors de la pré-récupération des changelogs:', error);
    // Ne pas bloquer le démarrage pour cette erreur
  }

  // Set anonymous user identity for Sentry user counting (opt-in only)
  if (telemetryClient && isTelemetryEnabled()) {
    try {
      const db = getDb();
      const settings = getSidebarSettings(db);
      if (settings.anonymousInstallId) {
        telemetryClient.setAnonymousUser(settings.anonymousInstallId);
      }
    } catch {
      // Non-critical: user counting will still work from future events
    }
  }

  registerWorkspaceIpc();
  registerPiIpc();
  registerUpdateIpc();
  createWindow();

  // Send a single startup heartbeat so Sentry can count active users
  telemetryClient?.send({
    timestamp: new Date().toISOString(),
    source: "electron",
    level: "info",
    message: "app_started",
    data: { version: app.getVersion() },
  });

  // Flush any deep link URL that arrived before the window was ready
  if (pendingDeepLinkUrl) {
    const url = pendingDeepLinkUrl;
    pendingDeepLinkUrl = null;
    // Small delay to let the renderer finish mounting
    setTimeout(() => handleDeepLink(url), 1500);
  }

  // On Windows/Linux, check startup argv for a deep link URL
  if (process.platform !== "darwin") {
    const url = process.argv.find((arg) => arg.startsWith(`${PROTOCOL_PREFIX}://`));
    if (url) {
      setTimeout(() => handleDeepLink(url), 1500);
    }
  }

  app.on("activate", () => {
    const mainWin = getMainWindow();
    if (mainWin) {
      mainWin.show();
      mainWin.focus();
    } else if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
}).catch((error) => {
  console.error("Erreur fatale au démarrage de l'application:", error);
});

app.on("before-quit", () => {
  isQuitting = true;
  void stopPiRuntimes();
});

app.on("window-all-closed", () => {
  // Don't quit the app on any platform when windows are closed
  // The app will continue running in the background
});
