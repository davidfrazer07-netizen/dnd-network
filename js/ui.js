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
      h('div', { class: 'modal-head' }, h('h2', {}, title), h('button', { class: 'icon-btn', onclick: close, 'aria-label': 'Close' }, '✕')),
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

export const fullName = (w) => `${w.first_name} ${w.last_name}`.trim();
export const fmtDate = (s) => (s ? new Date(s).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
