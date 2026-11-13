import { api } from './api.js?v=12';
import { h, icon, select, toast, openModal } from './ui.js?v=12';
import { addStateModal, removeStateModal } from './states.js?v=12';

// Admin-only page: add states, add contractors, rename contractors.
export function contractorsView(ctx, colorOf) {
  const field = (label, el) => h('label', { class: 'field' }, h('span', {}, label), el);
  const done = async (m, msg) => { m.close(); toast(msg); await ctx.reload(); };

  const rename = (k) => {
    const name = h('input', { value: k.full_name, maxlength: 60, required: true });
    const m = openModal('Rename contractor', h('form', { onsubmit: async (e) => {
      e.preventDefault();
      const v = name.value.trim();
      if (!v) return;
      try { await api.renameContractor(k.id, v); await done(m, 'Contractor renamed'); }
      catch (ex) { toast(ex.message, 'err'); }
    } }, field(`Name (login stays @${k.username})`, name),
    h('div', { class: 'actions' }, h('button', { class: 'btn primary big', type: 'submit' }, 'Save'))));
    name.select();
  };

  const removeContractor = (k) => {
    const mine = ctx.workers.filter((w) => w.contractor_id === k.id);
    const others = ctx.contractors.filter((x) => x.city_code === k.city_code && x.id !== k.id);
    if (mine.length && !others.length) return toast('Add another contractor in this state first, so their workers have somewhere to go.', 'err');
    const to = mine.length ? select('move_to', others.map((x) => [x.id, x.full_name])) : null;
    const err = h('p', { class: 'form-error' });
    const go = h('button', { class: 'btn danger', type: 'submit' }, 'Yes, remove');
    const m = openModal(`Remove ${k.full_name}?`, h('form', { onsubmit: async (e) => {
      e.preventDefault(); go.disabled = true; go.textContent = 'Removing…'; err.textContent = '';
      try { await api.removeContractor(k.id, to?.value); m.close(); toast(`${k.full_name} removed`); await ctx.reload(); }
      catch (ex) { err.textContent = ex.message; go.disabled = false; go.textContent = 'Yes, remove'; }
    } },
    h('p', { class: 'confirm-text' }, `Their login (@${k.username}) will stop working and be deleted. This cannot be undone.`),
    to && field(`Move their ${mine.length} worker${mine.length === 1 ? '' : 's'} to`, to),
    err, h('div', { class: 'actions' }, h('button', { class: 'btn ghost', type: 'button', onclick: () => m.close() }, 'Cancel'), go)));
  };

  const addContractor = (code) => {
    const f = {
      full_name: h('input', { maxlength: 60, required: true, placeholder: 'e.g. Ramesh Kumar', autocomplete: 'off' }),
      username: h('input', { maxlength: 30, required: true, placeholder: 'e.g. ramesh.k', autocapitalize: 'none', autocomplete: 'off' }),
      password: h('input', { type: 'password', required: true, placeholder: '8+ characters', autocomplete: 'new-password' }),
      city_code: select('city_code', ctx.cities.map((c) => [c.code, c.name]), code || ctx.cities[0]?.code),
    };
    const err = h('p', { class: 'form-error' });
    const go = h('button', { class: 'btn primary big', type: 'submit' }, 'Add contractor');
    const m = openModal('Add contractor', h('form', { onsubmit: async (e) => {
      e.preventDefault();
      const d = Object.fromEntries(Object.entries(f).map(([k, el]) => [k, k === 'password' ? el.value : el.value.trim()]));
      d.username = d.username.toLowerCase();
      if (!d.full_name) return (err.textContent = 'Please enter a name.');
      if (!/^[a-z0-9._-]{3,30}$/.test(d.username)) return (err.textContent = 'Username: 3-30 letters, numbers, . _ -');
      if (d.password.length < 8) return (err.textContent = 'Password must be at least 8 characters.');
      err.textContent = ''; go.disabled = true; go.textContent = 'Adding…';
      try { await api.addContractor(d); await done(m, `${d.full_name} added. Username: ${d.username}`); }
      catch (ex) { err.textContent = ex.message; go.disabled = false; go.textContent = 'Add contractor'; }
    } }, field('Name', f.full_name), field('State', f.city_code), field('Username', f.username), field('Password', f.password),
    h('p', { class: 'muted hint' }, 'Share the username and password with them. They can change it from the login page.'), err, go));
    f.full_name.focus();
  };

  const card = (c) => h('section', { class: 'proj-card' },
    h('div', { class: 'proj-head' }, h('i', { class: 'dot', style: `background:${colorOf(c.code)}` }), h('h3', {}, c.name),
      h('button', { class: 'btn ghost sm', onclick: () => addContractor(c.code) }, icon('plus', 14), 'Contractor'),
      h('button', { class: 'icon-btn', title: `Remove ${c.name}`, 'aria-label': `Remove ${c.name}`, onclick: () => removeStateModal(ctx, c) }, icon('x'))),
    ctx.contractors.filter((k) => k.city_code === c.code).map((k) => {
      const n = ctx.workers.filter((w) => w.contractor_id === k.id).length;
      return h('div', { class: 'proj-row' }, h('span', {}, k.full_name), h('small', {}, `@${k.username} · ${n} workers`),
        h('button', { class: 'btn ghost sm', onclick: () => rename(k) }, 'Rename'),
        h('button', { class: 'icon-btn', title: `Remove ${k.full_name}`, 'aria-label': `Remove ${k.full_name}`, onclick: () => removeContractor(k) }, icon('x')));
    }));

  return h('div', { class: 'team-page' },
    h('section', { class: 'hero' },
      h('div', {}, h('small', {}, 'Admins only'), h('h1', {}, 'Contractors'),
        h('p', { class: 'muted' }, 'Add states and contractors, or change a contractor’s display name.')),
      h('div', { class: 'actions' },
        h('button', { class: 'btn ghost', onclick: () => addStateModal(ctx) }, icon('plus'), 'Add state'),
        h('button', { class: 'btn primary', onclick: () => addContractor() }, icon('plus'), 'Add contractor'))),
    h('div', { class: 'proj-grid' }, ctx.cities.map(card)));
}
