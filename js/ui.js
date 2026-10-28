/* ============================================================
   ui.js — toasts + accessibile modal stack
   ============================================================ */

import { el } from './utils.js';
import { icon, ICON_NAMES } from './icons.js';

const hasIcon = (name) => typeof name === 'string' && ICON_NAMES.includes(name);

const modalRoot = () => document.getElementById('modal-root');
const toastRoot = () => document.getElementById('toast-root');

let current = null;

export function isModalOpen() {
  return !!current;
}

/**
 * @param {{
 *  title?: string, sub?: string, bodyHTML?: string,
 *  actions?: Array<{label:string, sub?:string, icon?:string, variant?:string, onClick?:Function}>,
 *  dismissible?: boolean, onClose?: Function, wide?: boolean, mount?: Function
 * }} cfg
 */
export function openModal(cfg = {}) {
  closeModal(true);
  const root = modalRoot();
  const modal = el('div', 'modal');
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  if (cfg.title) modal.setAttribute('aria-label', cfg.title);

  if (cfg.dismissible !== false) {
    const x = el('button', 'icon-btn modal-close', '✕');
    x.setAttribute('aria-label', 'Close');
    x.addEventListener('click', () => closeModal());
    modal.appendChild(x);
  }

  if (cfg.title) {
    const h = el('h2', 'modal-title');
    h.innerHTML = (cfg.titleIcon && hasIcon(cfg.titleIcon) ? icon(cfg.titleIcon, 'title-ico') : '') + cfg.title;
    modal.appendChild(h);
  }
  if (cfg.sub) {
    const s = el('p', 'modal-sub');
    s.innerHTML = cfg.sub;
    modal.appendChild(s);
  }
  if (cfg.bodyHTML) {
    const body = el('div', 'modal-body');
    body.innerHTML = cfg.bodyHTML;
    modal.appendChild(body);
  }

  const actions = el('div', 'modal-actions');
  (cfg.actions || []).forEach((a, i) => {
    const btn = el('button', `btn ${a.variant || 'btn-ghost'} btn-block`);
    const icoHtml = !a.icon ? '' : hasIcon(a.icon) ? icon(a.icon) : a.icon;
    btn.innerHTML = `
      ${icoHtml ? `<span class="btn-ico">${icoHtml}</span>` : ''}
      <span class="btn-body"><span class="btn-title">${a.label}</span>${
        a.sub ? `<span class="btn-sub">${a.sub}</span>` : ''
      }</span>`;
    btn.addEventListener('click', () => {
      if (a.onClick) a.onClick();
      if (a.keepOpen !== true) closeModal();
    });
    actions.appendChild(btn);
    if (i === 0) {
      setTimeout(() => {
        if (document.activeElement && document.activeElement.tagName === 'BODY') btn.focus({ preventScroll: true });
      }, 60);
    }
  });
  if ((cfg.actions || []).length) modal.appendChild(actions);

  root.appendChild(modal);
  root.hidden = false;
  requestAnimationFrame(() => root.classList.add('is-open'));
  current = { modal, cfg };

  const onKey = (ev) => {
    if (ev.key === 'Escape') {
      ev.stopPropagation();
      if (cfg.dismissible !== false) closeModal();
    }
    if (ev.key === 'Tab') {
      const f = modal.querySelectorAll('button, [href], input, select, textarea');
      if (!f.length) return;
      const first = f[0];
      const last = f[f.length - 1];
      if (ev.shiftKey && document.activeElement === first) {
        ev.preventDefault();
        last.focus();
      } else if (!ev.shiftKey && document.activeElement === last) {
        ev.preventDefault();
        first.focus();
      }
    }
  };
  modal._onKey = onKey;
  window.addEventListener('keydown', onKey, true);

  if (cfg.mount) cfg.mount(modal, closeModal);
  return closeModal;
}

export function closeModal(instant = false) {
  const root = modalRoot();
  if (!current) {
    root.hidden = true;
    root.classList.remove('is-open');
    return;
  }
  const { modal, cfg } = current;
  current = null;
  window.removeEventListener('keydown', modal._onKey, true);
  root.classList.remove('is-open');
  modal.style.pointerEvents = 'none';
  const done = () => {
    modal.remove();
    if (!root.children.length) {
      root.hidden = true;
    }
  };
  if (instant) done();
  else setTimeout(done, 220);
  if (cfg && cfg.onClose) cfg.onClose();
}

export function toast(message, opts = {}) {
  const root = toastRoot();
  const node = el('div', 'toast');
  const icoHtml = !opts.icon ? '' : hasIcon(opts.icon) ? icon(opts.icon) : opts.icon;
  node.innerHTML = `${icoHtml ? `<span class="toast-ico">${icoHtml}</span>` : ''}<span>${message}</span>`;
  if (opts.className) node.classList.add(opts.className);
  root.appendChild(node);
  // never stack more than three
  while (root.children.length > 3) root.firstElementChild.remove();
  const life = opts.ms ?? 2100;
  setTimeout(() => {
    node.classList.add('is-out');
    setTimeout(() => node.remove(), 280);
  }, life);
  return node;
}

export function refreshIcons() {}

export function clearToasts() {
  toastRoot().replaceChildren();
}
