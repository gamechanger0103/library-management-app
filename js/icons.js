/* ============================================================
   icons.js — inline SVG icon set (no font/emoji dependencies)
   ============================================================ */

const STROKE = {
  fill: 'none',
  stroke: 'currentColor',
  'stroke-width': 1.7,
  'stroke-linecap': 'round',
  'stroke-linejoin': 'round',
};

const PATHS = {
  play: ['<path d="M8.4 5.2v13.6L19.6 12z" fill="currentColor" stroke="none"/>'],
  target: [
    '<circle cx="12" cy="12" r="8.4"/>',
    '<circle cx="12" cy="12" r="4.2"/>',
    '<circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/>',
  ],
  map: [
    '<path d="M9 3.8 3.4 5.8v14.4L9 18.2l6 2 5.6-2V3.8L15 5.8z"/>',
    '<path d="M9 3.8v14.4M15 5.8v14.4"/>',
  ],
  trophy: [
    '<path d="M7.6 3.8h8.8v5.4a4.4 4.4 0 0 1-8.8 0z"/>',
    '<path d="M7.6 5.4H4.6a3 3 0 0 0 3 3.2M16.4 5.4h3a3 3 0 0 1-3 3.2"/>',
    '<path d="M12 13.6v3.4M8.6 20.4h6.8M10 20.4a2 2 0 0 1 4 0"/>',
  ],
  gear: [
    '<circle cx="12" cy="12" r="3.1"/>',
    '<path d="M12 2.9v2.3M12 18.8v2.3M4.6 4.6 6.2 6.2M17.8 17.8l1.6 1.6M2.9 12h2.3M18.8 12h2.3M4.6 19.4l1.6-1.6M17.8 6.2l1.6-1.6"/>',
  ],
  help: [
    '<circle cx="12" cy="12" r="8.6"/>',
    '<path d="M9.5 9.4a2.6 2.6 0 1 1 3.4 2.5c-.6.3-1 .9-1 1.6v.4"/>',
    '<circle cx="11.9" cy="17" r="1" fill="currentColor" stroke="none"/>',
  ],
  gift: [
    '<path d="M3.6 9.4h16.8v3.2H3.6z"/>',
    '<path d="M5.2 12.6V20h13.6v-7.4"/>',
    '<path d="M12 9.4V20"/>',
    '<path d="M12 9.4C9.4 9.4 7.2 8.5 7.2 6.8c0-1.2 1-1.8 2-1.8 2 0 2.8 2.4 2.8 4.4zM12 9.4c2.6 0 4.8-.9 4.8-2.6 0-1.2-1-1.8-2-1.8-2 0-2.8 2.4-2.8 4.4z"/>',
  ],
  pause: [
    '<rect x="7" y="4.8" width="3.6" height="14.4" rx="1.3" fill="currentColor" stroke="none"/>',
    '<rect x="13.4" y="4.8" width="3.6" height="14.4" rx="1.3" fill="currentColor" stroke="none"/>',
  ],
  bulb: [
    '<path d="M9.4 17.2h5.2M10.4 20.2h3.2"/>',
    '<path d="M12 3.2a5.7 5.7 0 0 0-3.3 10.3c.5.4.7 1 .7 1.6v1.1h5.2v-1.1c0-.6.2-1.2.7-1.6A5.7 5.7 0 0 0 12 3.2z"/>',
  ],
  undo: ['<path d="M4.2 9.4h9.6a5.4 5.4 0 0 1 0 10.8H8.4"/>', '<path d="M8 5.4 4.2 9.4 8 13.4"/>'],
  shuffle: [
    '<path d="M3.8 6.6h3.4c1.2 0 2.4.6 3.1 1.6l3.4 4.9c.7 1 1.9 1.6 3.1 1.6h2.4"/>',
    '<path d="M16.6 4.2 19.8 6.6l-3.2 2.4"/>',
    '<path d="M3.8 17.4h3.4c1.2 0 2.4-.6 3.1-1.6l1.6-2.3M13.9 9.5l1.4-2c.7-1 1.9-1.6 3.1-1.6h2.8"/>',
    '<path d="M16.6 12.4 19.8 14.8l-3.2 2.4"/>',
  ],
  heart: ['<path d="M12 20.4S3.8 15.4 3.8 10.2A4.6 4.6 0 0 1 12 7.1a4.6 4.6 0 0 1 8.2 3.1c0 5.2-8.2 10.2-8.2 10.2z" fill="currentColor" stroke="none"/>'],
  coin: [
    '<circle cx="12" cy="12" r="8.2"/>',
    '<path d="M12 7.4v9.2M9.4 10.1h4.2a1.7 1.7 0 0 1 0 3.4H9.4"/>',
  ],
  flame: [
    '<path d="M12 3.2c2.5 3 5.2 5.2 5.2 9a5.2 5.2 0 1 1-10.4 0c0-2 .9-3.6 2.1-5 .2 1.4.9 2.3 1.9 2.6.4-2.3.5-4.4 1.2-6.6z"/>',
  ],
  star: ['<path d="M12 3.6l2.6 5.3 5.9.8-4.3 4.1 1 5.8L12 16.8l-5.2 2.8 1-5.8-4.3-4.1 5.9-.8z" fill="currentColor" stroke="none"/>'],
  lock: ['<rect x="4.9" y="10.3" width="14.2" height="9.8" rx="2.4"/>', '<path d="M8.4 10.3V7.9a3.6 3.6 0 0 1 7.2 0v2.4"/>'],
  crown: ['<path d="M3.4 8.2 7 14.6h10l3.6-6.4-5.2 3L12 5.2 8.6 11.2z"/>', '<path d="M7.4 18.4h9.2"/>'],
  bolt: ['<path d="M13.4 2.8 5.6 13.6h5.2l-1.2 7.6 7.8-10.8h-5.2z"/>'],
  gem: ['<path d="M7.2 3.6h9.6l3.8 5-8.6 12-8.6-12z"/>', '<path d="M3.2 8.6h17.6M7.2 3.6l-1.4 5L12 20.6M16.8 3.6l1.4 5L12 20.6"/>'],
  calendar: ['<rect x="3.6" y="5.6" width="16.8" height="14.4" rx="2.4"/>', '<path d="M3.6 10.2h16.8M8.4 3.4v4M15.6 3.4v4"/>'],
  check: ['<path d="M4.8 12.6 9.6 17.4 19.4 6.6"/>'],
  close: ['<path d="M6.2 6.2 17.8 17.8M17.8 6.2 6.2 17.8"/>'],
  left: ['<path d="M14.6 5 8 12l6.6 7"/>'],
  right: ['<path d="M9.4 5 16 12l-6.6 7"/>'],
  sound: [
    '<path d="M4.2 9.6h3l4.2-3.6v12l-4.2-3.6h-3z"/>',
    '<path d="M15 8.8a4.8 4.8 0 0 1 0 6.4M17.6 6.2a8.2 8.2 0 0 1 0 11.6"/>',
  ],
  music: [
    '<path d="M9.2 17.8V6.7l9-2v10.9"/>',
    '<circle cx="6.7" cy="17.8" r="2.7"/>',
    '<circle cx="15.7" cy="15.4" r="2.7"/>',
  ],
  vibrate: [
    '<rect x="8.6" y="4.6" width="6.8" height="14.8" rx="1.9"/>',
    '<path d="M5.4 8.6v6.8M2.9 10.6v2.8M18.6 8.6v6.8M21.1 10.6v2.8"/>',
  ],
  medal: ['<circle cx="12" cy="15.2" r="5.2"/>', '<path d="M8.4 10.6 6 2.9h12l-2.4 7.7"/>'],
  sparkle: [
    '<path d="M11.4 3.2 13 8l4.8 1.6L13 11.2l-1.6 4.8-1.6-4.8L5 9.6 9.8 8z"/>',
    '<path d="M18 15.6l.7 1.9 1.9.7-1.9.7-.7 1.9-.7-1.9-1.9-.7 1.9-.7z"/>',
  ],
  clock: ['<circle cx="12" cy="12" r="8.4"/>', '<path d="M12 7.2V12l3.2 2"/>'],
  refresh: ['<path d="M20 12a8 8 0 1 1-2.6-5.9"/>', '<path d="M20.2 3.4v4.4h-4.4"/>'],
  home: ['<path d="M4 10.4 12 3.6l8 6.8V20h-5.4v-5.4H9.4V20H4z"/>'],
  grid: [
    '<rect x="4" y="4" width="6.4" height="6.4" rx="1.6"/>',
    '<rect x="13.6" y="4" width="6.4" height="6.4" rx="1.6"/>',
    '<rect x="4" y="13.6" width="6.4" height="6.4" rx="1.6"/>',
    '<rect x="13.6" y="13.6" width="6.4" height="6.4" rx="1.6"/>',
  ],
  arrowUp: ['<path d="M12 20V4.6M5.6 11 12 4.6 18.4 11"/>'],
};

export const ICON_NAMES = Object.keys(PATHS);

/** Returns the raw <svg> markup for an icon name. */
export function icon(name, extraClass = '') {
  const paths = PATHS[name];
  if (!paths) return '';
  const attrs = Object.entries(STROKE)
    .map(([k, v]) => `${k}="${v}"`)
    .join(' ');
  return `<svg class="ico ${extraClass}" viewBox="0 0 24 24" aria-hidden="true" focusable="false" ${attrs}>${paths.join('')}</svg>`;
}

/** Hydrate every <i data-icon="name"> placeholder in the document. */
export function hydrateIcons(root = document) {
  root.querySelectorAll('[data-icon]').forEach((node) => {
    if (node.dataset.hydrated) return;
    node.innerHTML = icon(node.dataset.icon);
    node.dataset.hydrated = '1';
  });
}
