import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, Plugin } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

/** Project root (this config is an ES module, so there is no __dirname). */
const root = dirname(fileURLToPath(import.meta.url));

/**
 * Single-file build only: replace the /favicon.svg link with an inline data
 * URI, because a lone HTML file opened from disk can't load public/ files.
 */
function inlineFavicon(): Plugin {
  return {
    name: 'inline-favicon',
    transformIndexHtml(html) {
      const svg = readFileSync(resolve(root, 'public/favicon.svg'), 'utf8');
      const dataUri = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
      return html.replace(/href="[^"]*favicon\.svg"/, `href="${dataUri}"`);
    },
  };
}

export default defineConfig(({ mode }) => {
  // `vite build --mode single` → release/RetroFootball.html: everything in one
  // file that runs by double-click (no server, no install).
  const single = mode === 'single';
  return {
    // Relative paths: the build works from any sub-path (GitHub Pages serves
    // the game under /<repo>/) and from a local folder.
    base: './',
    resolve: {
      alias: {
        '@': resolve(root, 'src'),
      },
    },
    plugins: single ? [viteSingleFile(), inlineFavicon()] : [],
    publicDir: single ? false : 'public',
    build: {
      target: 'es2020',
      outDir: single ? 'release' : 'dist',
      assetsDir: 'assets',
      sourcemap: !single,
      emptyOutDir: true,
      rolldownOptions: single ? { output: { entryFileNames: 'RetroFootball.js' } } : undefined,
    },
    server: {
      port: 3000,
      open: true,
    },
  };
});
