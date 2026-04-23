import { _electron as electron } from 'playwright';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..');
const electronMain = path.join(repoRoot, 'dist-electron/electron/main.js');
const devServerUrl = process.env.VITE_DEV_SERVER_URL ?? 'http://localhost:5173';

const app = await electron.launch({
  args: [electronMain],
  cwd: repoRoot,
  env: {
    ...process.env,
    CHATON_ALLOW_AUTOMATION_INSTANCE: '1',
    CHATON_DISABLE_DEVTOOLS: '1',
    ELECTRON_ENABLE_LOGGING: '1',
    VITE_DEV_SERVER_URL: devServerUrl,
  },
});

try {
  await new Promise((resolve) => setTimeout(resolve, 2500));
  const proc = await app.evaluate(async ({ app, BrowserWindow }) => ({
    ready: app.isReady(),
    count: BrowserWindow.getAllWindows().length,
    windows: BrowserWindow.getAllWindows().map((win) => ({
      title: win.getTitle(),
      visible: win.isVisible(),
      destroyed: win.isDestroyed(),
      bounds: win.getBounds(),
    })),
  }));
  const pages = app.windows();
  const summaries = [];
  for (const page of pages) {
    summaries.push({ title: await page.title(), url: page.url() });
  }
  const window = pages.find((page) => !page.url().startsWith('devtools://'));
  if (!window) {
    console.log(JSON.stringify({ error: 'app-window-not-found', pages: summaries, proc }, null, 2));
    process.exitCode = 1;
  } else {
    await window.setViewportSize({ width: 1440, height: 960 });
    await window.waitForLoadState('domcontentloaded');
    await window.waitForTimeout(1500);
    const body = window.locator('body');
    const bodyText = ((await body.innerText({ timeoutMs: 5000 })) || '').slice(0, 1000);
    await window.screenshot({ path: path.join(repoRoot, 'output/playwright/electron-smoke.png') });
    console.log(JSON.stringify({
      selected: { title: await window.title(), url: window.url() },
      pages: summaries,
      proc,
      bodyText,
    }, null, 2));
  }
} finally {
  await app.close();
}
