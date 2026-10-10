const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('yanxu', {
  loadState: () => ipcRenderer.invoke('data:load'),
  saveState: (data) => ipcRenderer.invoke('data:save', data),
  getSystemSettings: () => ipcRenderer.invoke('settings:system'),
  setLaunchAtLogin: (enabled) => ipcRenderer.invoke('settings:launch-at-login', enabled),
  openDataFolder: () => ipcRenderer.invoke('settings:open-data-folder'),
  exportBackup: () => ipcRenderer.invoke('settings:export-backup'),
  importBackup: () => ipcRenderer.invoke('settings:import-backup'),
  createExampleData: () => ipcRenderer.invoke('settings:example-data'),
  windowAction: (action) => ipcRenderer.invoke('window:action', action),
  onStateChanged: (callback) => {
    const listener = (_event, value) => callback(value);
    ipcRenderer.on('state:changed', listener);
    return () => ipcRenderer.removeListener('state:changed', listener);
  }
});
