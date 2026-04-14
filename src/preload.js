const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  loadData: () => ipcRenderer.invoke('data:load'),
  saveData: (data) => ipcRenderer.invoke('data:save', data),
  getOpenRouterConfig: () => ipcRenderer.invoke('openrouter:config'),
  sendAIRequest: (sessions, apiKey) => ipcRenderer.invoke('ai:request', sessions, apiKey),
  saveImage: (dataURL) => ipcRenderer.invoke('image:save', dataURL),
  copyToClipboard: (text) => ipcRenderer.invoke('clipboard:copy', text),
  setDockBadge: (badgeText) => ipcRenderer.invoke('dock:setBadge', badgeText),
  openExternal: (url) => ipcRenderer.invoke('external:open', url),
  minimizeWindow: () => ipcRenderer.invoke('window:minimize'),
  closeWindow: () => ipcRenderer.invoke('window:close')
});
