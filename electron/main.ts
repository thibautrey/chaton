import electron from "electron";
const { BrowserWindow, app, shell } = electron;
import {
  getLanguagePreference,
  getWindowBounds,
  saveWindowBounds,
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

import { fileURLToPath } from "node:url";
import { getDb } from "./db/index.js";
import path from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Set the app name before readiness so macOS menu uses Chatons instead of Electron.
app.setName("Chatons");

// Set custom userData path to use Chatons-specific directory instead of Electron
const userDataPath = path.join(app.getPath('appData'), 'Chatons');
app.setPath('userData', userDataPath);

const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);
const appIconPath = path.join(__dirname, "../build/icons/icon.png");

function createWindow() {
  const db = getDb();
  const initialBounds = getWindowBounds(db);
  const languagePreference = getLanguagePreference(db);

  const win = new BrowserWindow({
    x: initialBounds.x,
    y: initialBounds.y,
    width: initialBounds.width,
    height: initialBounds.height,
    minWidth: 1200,
    minHeight: 780,
    frame: true,
    titleBarStyle: "hiddenInset",
    backgroundColor: "#f5f5f7",
    vibrancy: "under-window",
    visualEffectState: "active",
    icon: appIconPath,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  if (isDev && process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(
      `${process.env.VITE_DEV_SERVER_URL}?language=${languagePreference}`,
    );
    win.webContents.openDevTools({ mode: "detach" });
  } else {
    win.loadFile(path.join(__dirname, "../dist/index.html"), {
      query: { language: languagePreference },
    });
  }

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  let saveTimeout: NodeJS.Timeout | null = null;
  const scheduleBoundsSave = () => {
    if (win.isDestroyed()) {
      return;
    }

    if (saveTimeout) {
      clearTimeout(saveTimeout);
    }

    saveTimeout = setTimeout(() => {
      if (win.isDestroyed() || win.isMinimized() || win.isMaximized()) {
        return;
      }

      saveWindowBounds(db, win.getBounds());
    }, 200);
  };

  win.on("move", scheduleBoundsSave);
  win.on("resize", scheduleBoundsSave);
  win.on("close", () => {
    if (saveTimeout) {
      clearTimeout(saveTimeout);
    }

    if (!win.isMinimized() && !win.isMaximized()) {
      saveWindowBounds(db, win.getBounds());
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
    initLogging();
    console.log('Système de logging initialisé');
  } catch (error) {
    console.error('Erreur lors de l\'initialisation du système de logging:', error);
  }

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

  registerWorkspaceIpc();
  registerPiIpc();
  registerUpdateIpc();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
}).catch((error) => {
  console.error("Erreur fatale au démarrage de l'application:", error);
});

app.on("before-quit", () => {
  void stopPiRuntimes();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
