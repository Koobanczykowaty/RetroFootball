// ============================================================
// RetroFootball desktop (Electron main process, P3 stage 2).
// Opens the game (the single-file web build, desktop/web/index.html
// inside the app) in a window. No network yet: LAN comes in stage 3.
//
// - Starts in a 1280x720 window; F11 (and the game's FULL SCREEN
//   button) toggle full screen. Size, position and full screen are
//   remembered in <userData>/window.json.
// - Settings and saves use the game's normal localStorage, kept by
//   Electron in <userData> (separate from any browser).
// - The main menu's red X (window.retroDesktop.quit from preload.cjs)
//   closes the app.
// - RF_QUERY=... (e.g. "?sim=1&minutes=0.3") loads the page with that
//   query and, for ?sim, prints the result JSON to stdout and quits
//   (scripts/desktop-test.mjs uses this to smoke-test the real app).
//   RF_SCREENSHOT=<png> instead saves a screenshot after a few seconds
//   (RF_KEYS=Escape,... presses keys first).
// ============================================================

const { app, BrowserWindow, Menu, ipcMain } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_BOUNDS = { width: 1280, height: 720 };
const testQuery = process.env.RF_QUERY || '';
const isTest = testQuery.length > 0;

// One instance only: a second launch focuses the running game
if (!isTest && !app.requestSingleInstanceLock()) {
  app.quit();
}

function stateFile() {
  return path.join(app.getPath('userData'), 'window.json');
}

function loadWindowState() {
  try {
    const s = JSON.parse(fs.readFileSync(stateFile(), 'utf8'));
    const ok = (v) => Number.isFinite(v);
    return {
      width: ok(s.width) && s.width >= 640 ? s.width : DEFAULT_BOUNDS.width,
      height: ok(s.height) && s.height >= 360 ? s.height : DEFAULT_BOUNDS.height,
      x: ok(s.x) ? s.x : undefined,
      y: ok(s.y) ? s.y : undefined,
      fullscreen: s.fullscreen === true,
    };
  } catch {
    return { ...DEFAULT_BOUNDS, fullscreen: false };
  }
}

function saveWindowState(win) {
  try {
    const fullscreen = win.isFullScreen();
    // Remember the windowed size even when closing in full screen
    const b = fullscreen ? (win.__lastBounds || win.getBounds()) : win.getBounds();
    fs.writeFileSync(stateFile(), JSON.stringify({ ...b, fullscreen }));
  } catch {
    // Not critical: the window just opens with the default size next time
  }
}

function createWindow() {
  const state = isTest ? { ...DEFAULT_BOUNDS, fullscreen: false } : loadWindowState();
  const win = new BrowserWindow({
    width: state.width,
    height: state.height,
    x: state.x,
    y: state.y,
    minWidth: 640,
    minHeight: 360,
    fullscreen: state.fullscreen,
    backgroundColor: '#0a1628',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // Keep the game loop running when the window is hidden (test runs)
      backgroundThrottling: !isTest,
    },
  });

  // No menu bar; the shortcuts we want are handled below
  Menu.setApplicationMenu(null);

  win.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.key === 'F11') {
      win.setFullScreen(!win.isFullScreen());
      event.preventDefault();
    }
  });
  // The game never opens other pages or windows
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event) => event.preventDefault());

  win.on('resize', () => {
    if (!win.isFullScreen()) win.__lastBounds = win.getBounds();
  });
  win.on('move', () => {
    if (!win.isFullScreen()) win.__lastBounds = win.getBounds();
  });
  win.on('close', () => {
    if (!isTest) saveWindowState(win);
  });

  const page = path.join(__dirname, 'web', 'index.html');
  win.loadFile(page, testQuery ? { search: testQuery.replace(/^\?/, '') } : undefined);
  if (process.env.RF_SCREENSHOT) {
    takeScreenshot(win, process.env.RF_SCREENSHOT);
  } else if (isTest) {
    watchTestResult(win);
  } else {
    win.once('ready-to-show', () => win.show());
  }
  return win;
}

/** Test mode: save a screenshot of the page after it has settled, then quit. */
function takeScreenshot(win, file) {
  // Shown: a hidden window doesn't run the game loop (requestAnimationFrame)
  win.once('ready-to-show', () => win.show());
  win.webContents.once('did-finish-load', () => {
    setTimeout(async () => {
      // Optional RF_KEYS: comma-separated keys pressed first (e.g. "Escape,Right")
      for (const key of (process.env.RF_KEYS || '').split(',').filter(Boolean)) {
        win.webContents.sendInputEvent({ type: 'keyDown', keyCode: key });
        win.webContents.sendInputEvent({ type: 'keyUp', keyCode: key });
        await new Promise((r) => setTimeout(r, 300));
      }
      const image = await win.webContents.capturePage();
      fs.writeFileSync(file, image.toPNG());
      app.exit(0);
    }, Number(process.env.RF_SCREENSHOT_DELAY_MS) || 4000);
  });
}

/** Test mode: wait for the simulation result in the page, print it, quit. */
function watchTestResult(win) {
  const started = Date.now();
  const timeoutMs = Number(process.env.RF_TIMEOUT_MS) || 180000;
  const poll = async () => {
    try {
      const json = await win.webContents.executeJavaScript(
        'window.__RF_SIM__ && window.__RF_SIM__.done ? JSON.stringify(window.__RF_SIM__) : null',
      );
      if (json) {
        // The desktop bridge must be visible to the page (the red X needs it)
        const bridge = await win.webContents.executeJavaScript('typeof window.retroDesktop?.quit');
        process.stdout.write(`RF_BRIDGE ${bridge}\n`);
        process.stdout.write(`RF_RESULT ${json}\n`);
        app.exit(0);
        return;
      }
    } catch {
      // Page not ready yet
    }
    if (Date.now() - started > timeoutMs) {
      process.stdout.write('RF_TIMEOUT\n');
      app.exit(2);
      return;
    }
    setTimeout(poll, 500);
  };
  win.webContents.once('did-finish-load', poll);
}

app.on('second-instance', () => {
  const win = BrowserWindow.getAllWindows()[0];
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});

ipcMain.on('rf:quit', () => app.quit());

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
