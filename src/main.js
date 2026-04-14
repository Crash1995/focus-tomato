const { app, BrowserWindow, clipboard, dialog, ipcMain, nativeImage, shell } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');

const { createDataStore } = require('./main/dataStore');
const { sendAIRequest } = require('./main/openRouterClient');

let mainWindow = null;
let dataStore = null;
const isE2EMode = process.env.FOCUSFORGE_E2E === '1';

app.setName('FocusForge');

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 560,
    minWidth: 900,
    minHeight: 560,
    maxWidth: 900,
    maxHeight: 560,
    resizable: false,
    frame: false,
    title: 'FocusForge',
    backgroundColor: '#0a0a0f',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));
}

function registerIPC() {
  ipcMain.handle('data:load', async () => dataStore.loadData());
  ipcMain.handle('data:save', async (_event, data) => dataStore.saveData(data));
  ipcMain.handle('ai:request', async (_event, sessions, apiKey) => {
    if (isE2EMode && process.env.FOCUSFORGE_E2E_AI_RESPONSE) {
      return process.env.FOCUSFORGE_E2E_AI_RESPONSE;
    }
    return sendAIRequest({
      sessions,
      apiKey: apiKey || process.env.OPENROUTER_API_KEY,
      model: process.env.OPENROUTER_DEFAULT_MODEL || undefined
    });
  });
  ipcMain.handle('openrouter:config', async () => ({
    hasEnvAPIKey: Boolean(process.env.OPENROUTER_API_KEY),
    defaultModel: process.env.OPENROUTER_DEFAULT_MODEL || 'openai/gpt-4o-mini'
  }));
  ipcMain.handle('image:save', async (_event, dataURL) => saveImage(dataURL));
  ipcMain.handle('clipboard:copy', async (_event, text) => {
    clipboard.writeText(String(text || ''));
  });
  ipcMain.handle('dock:setBadge', async (_event, badgeText) => {
    if (process.platform === 'darwin') {
      app.dock.setBadge(String(badgeText || ''));
    }
  });
  ipcMain.handle('external:open', async (_event, url) => {
    if (String(url).startsWith('https://openrouter.ai/')) {
      await shell.openExternal(url);
    }
  });
  ipcMain.handle('window:minimize', () => mainWindow?.minimize());
  ipcMain.handle('window:close', () => mainWindow?.close());
}

async function saveImage(dataURL) {
  if (isE2EMode && process.env.FOCUSFORGE_E2E_SAVE_PATH) {
    const base64Data = String(dataURL).replace(/^data:image\/png;base64,/, '');
    await fs.writeFile(process.env.FOCUSFORGE_E2E_SAVE_PATH, Buffer.from(base64Data, 'base64'));
    return { saved: true, filePath: process.env.FOCUSFORGE_E2E_SAVE_PATH };
  }

  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Сохранить карточку',
    defaultPath: `FocusForge-${new Date().toISOString().slice(0, 10)}.png`,
    filters: [{ name: 'PNG Image', extensions: ['png'] }]
  });

  if (result.canceled || !result.filePath) {
    return { saved: false };
  }

  const base64Data = String(dataURL).replace(/^data:image\/png;base64,/, '');
  await fs.writeFile(result.filePath, Buffer.from(base64Data, 'base64'));
  return { saved: true, filePath: result.filePath };
}

app.whenReady().then(() => {
  dataStore = createDataStore(path.join(app.getPath('appData'), 'FocusForge'));
  registerIPC();

  const iconPath = path.join(__dirname, '..', 'assets', 'icon.png');
  if (process.platform === 'darwin') {
    app.dock.setIcon(nativeImage.createFromPath(iconPath));
  }

  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  app.quit();
});
