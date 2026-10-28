/* ============================================================
   tools/build.mjs — zero-dependency single-file build
   ------------------------------------------------------------
   Bundles the ES modules into `dist/arrow-escape.html`, a fully
   self-contained game that works from file:// (double-click),
   from a USB stick, or as the web-dir of a Capacitor shell.

   run: node tools/build.mjs
   ============================================================ */

import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

/* module order matters only for readability — the loader is lazy */
const MODULES = [
  'js/utils.js',
  'js/storage.js',
  'js/icons.js',
  'js/levels.js',
  'js/engine.js',
  'js/haptics.js',
  'js/audio.js',
  'js/fx.js',
  'js/ui.js',
  'js/achievements.js',
  'js/board.js',
  'js/game.js',
  'js/main.js',
];

/** canonical module id, always "./"-prefixed and posix */
const norm = (p) => './' + p.replace(/^\.\//, '');

const IMPORT_RE = /^\s*import\s+(?:([\w$]+)\s*,\s*)?(?:\{([^}]*)\}|\*\s+as\s+([\w$]+)|([\w$]+))\s+from\s+['"]([^'"]+)['"];?/gm;
const EXPORT_DECL_RE = /^\s*export\s+(const|let|var|function|async function|class)\s+([\w$]+)/gm;
const EXPORT_LIST_RE = /^\s*export\s*\{([^}]*)\};?/gm;

function transform(id) {
  let src = read(id);
  const imports = [];
  const exports = new Set();

  src = src.replace(IMPORT_RE, (_m, def, named, ns, _single, from) => {
    const target = norm(path.posix.normalize(path.posix.join(path.posix.dirname(id), from)));
    if (ns) {
      imports.push(`const ${ns} = __m(${JSON.stringify(target)});`);
    } else {
      const names = (named || '').split(',').map((n) => n.trim().split(/\s+as\s+/)).filter((p) => p[0]);
      const list = names.map(([a, b]) => (b ? `${a}: ${b}` : a)).join(', ');
      imports.push(`const { ${list} } = __m(${JSON.stringify(target)});`);
    }
    return '';
  });

  src = src.replace(EXPORT_LIST_RE, (_m, list) => {
    list.split(',').map((s) => s.trim().split(/\s+as\s+/).pop()).filter(Boolean).forEach((n) => exports.add(n));
    return '';
  });

  src = src.replace(EXPORT_DECL_RE, (_m, kind, name) => {
    exports.add(name);
    return _m.replace(/^\s*export\s+/, '');
  });

  const exportLine = exports.size ? `\n__exports(Object.fromEntries([${[...exports].map((n) => `[${JSON.stringify(n)}, ${n}]`).join(', ')}]));` : '';
  return `${imports.join('\n')}\n${src}${exportLine}`;
}

/* ---------------- assemble ---------------- */

const defs = MODULES.map((id) => `__defs[${JSON.stringify(norm(path.posix.normalize(id)))}] = function (exports, __exports) {\n${transform(id)}\n};`).join('\n\n');

const runtime = `(function () {
  'use strict';
  const __defs = {};
  const __cache = {};
  function __m(id) {
    if (__cache[id]) return __cache[id];
    const exports = {};
    __cache[id] = exports;
    if (!__defs[id]) throw new Error('missing module ' + id);
    __defs[id](exports, (more) => Object.assign(exports, more));
    return exports;
  }

${defs}

  __m('./js/main.js');
})();`;

const css = [read('styles/app.css'), read('styles/game.css')].join('\n\n');
const iconSvg = read('assets/icon.svg');
const iconData = `data:image/svg+xml;base64,${Buffer.from(iconSvg).toString('base64')}`;

let html = read('index.html');

/* NOTE: replacements are passed as functions so that "$" sequences inside the
   bundle (e.g. the $$ helper) are inserted verbatim instead of being treated
   as replacement patterns. */
const swap = (needle, replacement) => {
  if (!html.includes(needle)) throw new Error(`index.html changed shape — missing: ${needle}`);
  html = html.replace(needle, () => replacement);
};

swap('<link rel="manifest" href="manifest.webmanifest" />', '');
swap('<link rel="icon" href="assets/icon.svg" type="image/svg+xml" />', `<link rel="icon" href="${iconData}" />`);
swap('<link rel="apple-touch-icon" href="assets/icon.svg" />', `<link rel="apple-touch-icon" href="${iconData}" />`);
swap('<link rel="stylesheet" href="styles/app.css" />', `<style>\n${css}\n</style>`);
swap('<link rel="stylesheet" href="styles/game.css" />', '');
swap('<script type="module" src="js/main.js"></script>', `<script>\n${runtime}\n</script>`);

if (html.includes('<script type="module"') || html.includes('href="styles/app.css"')) {
  throw new Error('index.html changed shape — update the build replacements');
}

const outDir = path.join(root, 'dist');
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, 'arrow-escape.html');
fs.writeFileSync(outFile, html);

const kb = (Buffer.byteLength(html) / 1024).toFixed(0);
console.log(`✅ built dist/arrow-escape.html (${kb} kB, ${MODULES.length} modules inlined)`);
