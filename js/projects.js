import { api } from './api.js?v=8';
import { h, icon, toast, openModal, confirmBox } from './ui.js?v=8';

// Admin-only page: the project list for each state. Contractors can only pick from these.
export function projectsView(ctx, colorOf) {
  const run = async (fn, ok) => {
    try { await fn(); if (ok) toast(ok); await ctx.reload(); } catch (ex) { toast(ex.message, 'err'); }
  };

  const rename = (p) => {
    const name = h('input', { value: p.name, maxlength: 80, required: true });
    const m = openModal('Rename project', h('form', { onsubmit: (e) => {
      e.preventDefault();
      if (name.value.trim()) run(() => api.renameProject(p.id, name.value.trim()), 'Project renamed').then(m.close);
    } }, h('label', { class: 'field' }, h('span', {}, 'Project name'), name),
    h('div', { class: 'actions' }, h('button', { class: 'btn primary big', type: 'submit' }, 'Save'))));
    name.select();
  };

  const remove = async (p, n) => {
    if (await confirmBox(`Remove ${p.name}?`, n ? `${n} worker${n > 1 ? 's' : ''} on this project will be left with no project. This cannot be undone.` : 'This cannot be undone.')) {
      run(() => api.removeProject(p.id), 'Project removed');
    }
  };

  const row = (p) => {
    const n = ctx.workers.filter((w) => w.project_id === p.id).length;
    return h('div', { class: 'proj-row' },
      h('span', {}, p.name), h('small', {}, `${n} worker${n === 1 ? '' : 's'}`),
      h('button', { class: 'btn ghost sm', onclick: () => rename(p) }, 'Rename'),
      h('button', { class: 'icon-btn', title: 'Remove', 'aria-label': `Remove ${p.name}`, onclick: () => remove(p, n) }, icon('x')));
  };

  const card = (c) => {
    const list = ctx.projects.filter((p) => p.city_code === c.code);
    const name = h('input', { placeholder: 'New project name', maxlength: 80, 'aria-label': `New project in ${c.name}` });
    return h('section', { class: 'proj-card' },
      h('div', { class: 'proj-head' }, h('i', { class: 'dot', style: `background:${colorOf(c.code)}` }), h('h3', {}, c.name),
        h('small', {}, `${list.length} project${list.length === 1 ? '' : 's'}`)),
      list.length ? list.map(row) : h('p', { class: 'muted proj-none' }, 'No projects yet'),
      h('form', { class: 'proj-add', onsubmit: (e) => {
        e.preventDefault();
        if (name.value.trim()) run(() => api.addProject(c.code, name.value.trim()), 'Project added');
      } }, name, h('button', { class: 'btn primary', type: 'submit' }, icon('plus'), 'Add')));
  };

  return h('div', { class: 'team-page' },
    h('section', { class: 'hero' }, h('div', {},
      h('small', {}, 'Admins only'), h('h1', {}, 'Projects'),
      h('p', { class: 'muted' }, 'Contractors can only pick from the projects listed for their own state.'))),
    h('div', { class: 'proj-grid' }, ctx.cities.map(card)));
}
