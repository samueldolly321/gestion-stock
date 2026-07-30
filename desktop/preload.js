/**
 * Pont sécurisé entre la page de configuration (renderer) et le process principal.
 * contextIsolation activé : le renderer n'a accès QU'À ces deux fonctions.
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktop', {
  getServerUrl: () => ipcRenderer.invoke('get-server-url'),
  setServerUrl: (url) => ipcRenderer.invoke('set-server-url', url),
});
