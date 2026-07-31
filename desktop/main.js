/**
 * Client bureau Vokatra-ko (Electron).
 *
 * Rôle : afficher, dans une fenêtre « logiciel » dédiée, l'application servie par
 * le SERVEUR LOCAL du réseau (le PC qui héberge PostgreSQL + le serveur Express).
 * L'adresse du serveur (ex. http://192.168.1.10:3001) est saisie au 1er lancement
 * et mémorisée. Aucune donnée n'est stockée ici : tout vit sur le serveur.
 */
const { app, BrowserWindow, ipcMain, Menu, dialog } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

// Fichier de config local (par utilisateur Windows) : garde l'URL du serveur.
const CONFIG_PATH = path.join(app.getPath('userData'), 'config.json');
const CONFIG_PAGE = path.join(__dirname, 'renderer', 'config.html');

let win = null;

function readConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
  } catch {
    return {};
  }
}

function writeConfig(cfg) {
  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2));
  } catch (err) {
    console.error('Écriture config impossible :', err);
  }
}

/** Normalise une saisie utilisateur en URL http complète sans slash final. */
function normalizeUrl(input) {
  let url = String(input || '').trim().replace(/\/+$/, '');
  if (!url) return '';
  if (!/^https?:\/\//i.test(url)) url = 'http://' + url;
  return url;
}

function loadServerOrConfig() {
  const cfg = readConfig();
  if (cfg.serverUrl) {
    win.loadURL(cfg.serverUrl);
  } else {
    win.loadFile(CONFIG_PAGE);
  }
}

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    title: 'Vokatra-ko',
    backgroundColor: '#0b0f19',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Autorise l'accès à la caméra (scan de code-barres à la caisse) et au micro.
  win.webContents.session.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(permission === 'media');
  });

  buildMenu();
  loadServerOrConfig();

  // Si le serveur est injoignable (éteint, mauvaise IP, hors réseau) → page de config.
  win.webContents.on('did-fail-load', (_e, errorCode, errorDesc, validatedURL) => {
    // -3 = requête annulée (navigation normale) : on ignore.
    if (errorCode === -3) return;
    if (validatedURL && validatedURL.startsWith('file://')) return; // échec sur la page locale : on ignore
    dialog.showMessageBox(win, {
      type: 'warning',
      title: 'Serveur injoignable',
      message: 'Impossible de contacter le serveur Vokatra-ko.',
      detail:
        `Adresse : ${validatedURL}\n(${errorDesc})\n\n` +
        'Vérifie que le PC serveur est allumé, sur le même réseau, et que l\'adresse est correcte.',
      buttons: ['Changer de serveur', 'Réessayer'],
      defaultId: 0,
    }).then(({ response }) => {
      if (response === 0) win.loadFile(CONFIG_PAGE);
      else loadServerOrConfig();
    });
  });
}

function buildMenu() {
  const template = [
    {
      label: 'Fichier',
      submenu: [
        { label: 'Changer de serveur…', click: () => win.loadFile(CONFIG_PAGE) },
        { label: 'Recharger', role: 'reload' },
        { type: 'separator' },
        { label: 'Quitter', role: 'quit' },
      ],
    },
    {
      label: 'Affichage',
      submenu: [
        { role: 'togglefullscreen', label: 'Plein écran' },
        { role: 'zoomIn', label: 'Zoom +' },
        { role: 'zoomOut', label: 'Zoom −' },
        { role: 'resetZoom', label: 'Zoom normal' },
        { type: 'separator' },
        { role: 'toggleDevTools', label: 'Outils de développement' },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// Ponts avec la page de config (via preload).
ipcMain.handle('get-server-url', () => readConfig().serverUrl || '');
ipcMain.handle('set-server-url', (_e, rawUrl) => {
  const url = normalizeUrl(rawUrl);
  if (!url) return '';
  writeConfig({ serverUrl: url });
  win.loadURL(url);
  return url;
});

app.whenReady().then(createWindow);

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
