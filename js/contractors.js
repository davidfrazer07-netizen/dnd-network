import { api } from './api.js?v=10';
import { h, icon, select, toast, openModal } from './ui.js?v=10';

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

  const addState = () => {
    const name = h('input', { maxlength: 40, required: true, placeholder: 'e.g. Kerala', autocomplete: 'off' });
    const code = h('input', { maxlength: 2, required: true, placeholder: 'KL', autocapitalize: 'characters', autocomplete: 'off' });
    let touched = false;
    code.addEventListener('input', () => { touched = true; code.value = code.value.toUpperCase().replace(/[^A-Z]/g, ''); });
    name.addEventListener('input', () => { if (!touched) code.value = name.value.replace(/[^A-Za-z]/g, '').slice(0, 2).toUpperCase(); });
    const err = h('p', { class: 'form-error' });
    const go = h('button', { class: 'btn primary big', type: 'submit' }, 'Add state');
    const m = openModal('Add state', h('form', { onsubmit: async (e) => {
      e.preventDefault();
      const n = name.value.trim(), c = code.value.trim().toUpperCase();
      if (!n) return (err.textContent = 'Please enter the state name.');
      if (!/^[A-Z]{2}$/.test(c)) return (err.textContent = 'The code must be exactly two letters.');
      const live = ctx.cities.find((x) => x.code === c);
      if (live) return (err.textContent = `${c} is already used by ${live.name}.`);
      err.textContent = ''; go.disabled = true; go.textContent = 'Adding…';
      try { await api.addState(c, n, Math.max(0, ...ctx.allCities.map((x) => x.sort || 0)) + 1); await done(m, `${n} added`); }
      catch (ex) { err.textContent = ex.message; go.disabled = false; go.textContent = 'Add state'; }
    } }, field('State name', name), field('Two-letter code', code),
    h('p', { class: 'muted hint' }, 'The code is used in worker IDs, for example DND_KL_001. It cannot be changed later.'), err, go));
    name.focus();
  };

  const card = (c) => h('section', { class: 'proj-card' },
    h('div', { class: 'proj-head' }, h('i', { class: 'dot', style: `background:${colorOf(c.code)}` }), h('h3', {}, c.name),
      h('button', { class: 'btn ghost sm', onclick: () => addContractor(c.code) }, icon('plus', 14), 'Contractor')),
    ctx.contractors.filter((k) => k.city_code === c.code).map((k) => {
      const n = ctx.workers.filter((w) => w.contractor_id === k.id).length;
      return h('div', { class: 'proj-row' }, h('span', {}, k.full_name), h('small', {}, `@${k.username} · ${n} workers`),
        h('button', { class: 'btn ghost sm', onclick: () => rename(k) }, 'Rename'));
    }));

  return h('div', { class: 'team-page' },
    h('section', { class: 'hero' },
      h('div', {}, h('small', {}, 'Admins only'), h('h1', {}, 'Contractors'),
        h('p', { class: 'muted' }, 'Add states and contractors, or change a contractor’s display name.')),
      h('div', { class: 'actions' },
        h('button', { class: 'btn ghost', onclick: addState }, icon('plus'), 'Add state'),
        h('button', { class: 'btn primary', onclick: () => addContractor() }, icon('plus'), 'Add contractor'))),
    h('div', { class: 'proj-grid' }, ctx.cities.map(card)));
}
