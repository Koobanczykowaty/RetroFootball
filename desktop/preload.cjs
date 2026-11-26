// ============================================================
// Desktop preload: the only bridge between the game page and the
// Electron app. The page sees window.retroDesktop (absent in a
// browser, which is how the game knows it runs as the desktop app).
// ============================================================

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('retroDesktop', {
  /** Close the game (the main menu's red X, after confirmation). */
  quit: () => ipcRenderer.send('rf:quit'),
});
