// Tiny DOM helpers. Everything user-supplied goes through textContent (never innerHTML).
export function h(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (v === true) e.setAttribute(k, '');
    else e.setAttribute(k, v);
  }
  for (const c of kids.flat(Infinity)) {
    if (c == null || c === false) continue;
    e.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return e;
}

const NS = 'http://www.w3.org/2000/svg';
const ICONS = {
  plus: ['M5 12h14', 'M12 5v14'],
  minus: ['M5 12h14'],
  x: ['M18 6 6 18', 'M6 6l12 12'],
  fit: ['M8 3H5a2 2 0 0 0-2 2v3', 'M21 8V5a2 2 0 0 0-2-2h-3', 'M3 16v3a2 2 0 0 0 2 2h3', 'M16 21h3a2 2 0 0 0 2-2v-3'],
  pin: ['M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z', 'M12 7a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z'],
  back: ['m15 18-6-6 6-6'],
  users: ['M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2', 'M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z', 'M22 21v-2a4 4 0 0 0-3-3.87', 'M16 3.13a4 4 0 0 1 0 7.75'],
};
const svg = (size, attrs, kids) => {
  const e = document.createElementNS(NS, 'svg');
  e.setAttribute('viewBox', '0 0 24 24'); e.setAttribute('width', size); e.setAttribute('height', size);
  e.setAttribute('aria-hidden', 'true'); e.classList.add('ico');
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  for (const [tag, a] of kids) {
    const c = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(a)) c.setAttribute(k, v);
    e.append(c);
  }
  return e;
};
// one line-icon set: 1.5 stroke, current text colour
export const icon = (name, size = 16) => svg(size,
  { fill: 'none', stroke: 'currentColor', 'stroke-width': 1.5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' },
  ICONS[name].map((d) => ['path', { d }]));
// flat product mark: a hub with three nodes
export const mark = (size = 20) => svg(size, { fill: 'currentColor', stroke: 'currentColor', 'stroke-width': 1.5, 'stroke-linecap': 'round' }, [
  ['path', { d: 'M12 12 5.5 6.5M12 12l7-4.5M12 12v8', fill: 'none' }],
  ['circle', { cx: 12, cy: 12, r: 3, stroke: 'none' }], ['circle', { cx: 5.5, cy: 6.5, r: 2, stroke: 'none' }],
  ['circle', { cx: 19, cy: 7.5, r: 2, stroke: 'none' }], ['circle', { cx: 12, cy: 20, r: 2, stroke: 'none' }]]);

export function select(name, options, value) {
  const s = h('select', { name }, options.map(([v, label]) => h('option', { value: v }, label)));
  if (value != null) s.value = value;
  return s;
}

export function toast(msg, kind = 'ok') {
  const t = h('div', { class: `toast ${kind}` }, msg);
  document.getElementById('toasts').append(t);
  setTimeout(() => t.remove(), 3500);
}

export function openModal(title, body, { wide = false } = {}) {
  const close = () => { overlay.remove(); document.removeEventListener('keydown', esc); };
  const esc = (e) => { if (e.key === 'Escape') close(); };
  const overlay = h('div', { class: 'overlay', onmousedown: (e) => { if (e.target === overlay) close(); } },
    h('div', { class: `modal ${wide ? 'wide' : ''}`, role: 'dialog', 'aria-label': title },
      h('div', { class: 'modal-head' }, h('h2', {}, title), h('button', { class: 'icon-btn', onclick: close, 'aria-label': 'Close' }, icon('x'))),
      h('div', { class: 'modal-body' }, body)));
  document.addEventListener('keydown', esc);
  document.body.append(overlay);
  return { close };
}

export function confirmBox(title, message, okLabel = 'Yes, remove') {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (!done) { done = true; m.close(); resolve(v); } };
    const m = openModal(title, h('div', {},
      h('p', { class: 'confirm-text' }, message),
      h('div', { class: 'actions' },
        h('button', { class: 'btn ghost', onclick: () => finish(false) }, 'Cancel'),
        h('button', { class: 'btn danger', onclick: () => finish(true) }, okLabel))));
  });
}

export const ageOf = (dob) => {
  if (!dob) return '';
  const d = new Date(dob), n = new Date();
  let a = n.getFullYear() - d.getFullYear();
  if (n < new Date(n.getFullYear(), d.getMonth(), d.getDate())) a--;
  return a;
};

// phone photos are huge: scale down and re-encode as JPEG before upload
export function shrinkImage(file, max = 1600, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const cv = document.createElement('canvas');
      cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
      cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
      URL.revokeObjectURL(url);
      cv.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not read that photo'))), 'image/jpeg', quality);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That file is not a photo')); };
    img.src = url;
  });
}

export const openImage = (title, src) => openModal(title, h('img', { class: 'lightbox', src, alt: title }), { wide: true });

export const fmtAadhaar = (s) => (s ? String(s).replace(/(\d{4})(?=\d)/g, '$1 ') : '');

export const fullName =(w) => `${w.first_name} ${w.last_name}`.trim();
export const fmtDate = (s) => (s ? new Date(s).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
