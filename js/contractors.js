import { api } from './api.js?v=8';
import { h, toast, openModal } from './ui.js?v=8';

// Admin-only page: rename the contractors of each state.
export function contractorsView(ctx, colorOf) {
  const rename = (k) => {
    const name = h('input', { value: k.full_name, maxlength: 60, required: true });
    const m = openModal('Rename contractor', h('form', { onsubmit: async (e) => {
      e.preventDefault();
      const v = name.value.trim();
      if (!v) return;
      try { await api.renameContractor(k.id, v); toast('Contractor renamed'); m.close(); await ctx.reload(); }
      catch (ex) { toast(ex.message, 'err'); }
    } }, h('label', { class: 'field' }, h('span', {}, `Name (login stays @${k.username})`), name),
    h('div', { class: 'actions' }, h('button', { class: 'btn primary big', type: 'submit' }, 'Save'))));
    name.select();
  };

  const card = (c) => h('section', { class: 'proj-card' },
    h('div', { class: 'proj-head' }, h('i', { class: 'dot', style: `background:${colorOf(c.code)}` }), h('h3', {}, c.name)),
    ctx.contractors.filter((k) => k.city_code === c.code).map((k) => {
      const n = ctx.workers.filter((w) => w.contractor_id === k.id).length;
      return h('div', { class: 'proj-row' }, h('span', {}, k.full_name), h('small', {}, `@${k.username} · ${n} workers`),
        h('button', { class: 'btn ghost sm', onclick: () => rename(k) }, 'Rename'));
    }));

  return h('div', { class: 'team-page' },
    h('section', { class: 'hero' }, h('div', {},
      h('small', {}, 'Admins only'), h('h1', {}, 'Contractors'),
      h('p', { class: 'muted' }, 'Change a contractor’s display name. Their username and password stay the same.'))),
    h('div', { class: 'proj-grid' }, ctx.cities.map(card)));
}
