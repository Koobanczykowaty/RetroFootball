// ============================================================
// Desktop — What the Electron app (desktop/preload.cjs) exposes to
// the game. Absent in a browser: that is how the game knows whether
// it runs as the desktop app.
// ============================================================

interface DesktopBridge {
  /** Close the app. */
  quit(): void;
}

declare global {
  interface Window {
    retroDesktop?: DesktopBridge;
  }
}

/** The desktop bridge, or null in a browser. */
export function desktopApp(): DesktopBridge | null {
  return typeof window !== 'undefined' && window.retroDesktop ? window.retroDesktop : null;
}
