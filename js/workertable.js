import { h, icon, fullName } from './ui.js?v=6';
import { STATUS, pill, deployed, openWorkerForm, openWorkerModal } from './forms.js?v=6';

// Filterable workers table. `F` is the filter state (q, status, con, where, proj) and survives re-renders.
// `scope` pins the table to one home state (the state page); `rerender` redraws the page.
export function workerBrowser(ctx, F, { scope = null, rerender }) {
  const cons = ctx.contractors.filter((k) => !scope || k.city_code === scope);
  const projs = ctx.projects.filter((p) => !F.where || p.city_code === F.where);
  const dd = (opts, value, on) => h('select', { onchange: (e) => { on(e.target.value); rerender(); } },
    opts.map(([v, label]) => h('option', { value: v, selected: v === (value || '') }, label)));

  const match = (w) => {
    if (scope && w.city_code !== scope) return false;
    if (F.con && w.contractor_id !== F.con) return false;
    if (F.where && w.current_city !== F.where) return false;
    if (F.proj && w.project_id !== F.proj) return false;
    if (F.status && w.status !== F.status) return false;
    if (F.q) {
      const hay = `${fullName(w)} ${w.worker_code} ${w.skill} ${w.current_task || ''} ${w.phone}`.toLowerCase();
      if (!hay.includes(F.q.toLowerCase())) return false;
    }
    return true;
  };

  const head = ['ID', 'Name', 'Skill', ...(scope ? [] : ['Home']), 'Contractor', 'Deployed', 'Task', 'Status'];
  const tbody = h('tbody');
  const count = h('span', { class: 'muted' });
  const base = ctx.workers.filter((w) => !scope || w.city_code === scope);
  const fill = () => {
    const ws = base.filter(match);
    tbody.replaceChildren(...(ws.length ? ws.map((w) => {
      const d = deployed(ctx, w);
      return h('tr', { onclick: () => openWorkerModal(ctx, w) },
        h('td', {}, h('code', {}, w.worker_code)), h('td', {}, h('strong', {}, fullName(w))), h('td', {}, w.skill),
        !scope && h('td', {}, w.city_code),
        h('td', {}, ctx.contractors.find((k) => k.id === w.contractor_id)?.full_name || ''),
        h('td', { class: 'dep' }, d.state ? [h('span', {}, d.state), d.project && h('small', {}, d.project)] : '—'),
        h('td', { class: 'task' }, w.current_task || '—'), h('td', {}, pill(w.status)));
    }) : [h('tr', {}, h('td', { colspan: head.length, class: 'muted center' }, 'No workers match.'))]));
    count.textContent = `${ws.length} of ${base.length}`;
  };
  fill();

  const toolbar = h('div', { class: 'toolbar' },
    h('input', { class: 'search', placeholder: 'Search', value: F.q || '', oninput: (e) => { F.q = e.target.value; fill(); } }),
    dd([['', 'All contractors'], ...cons.map((k) => [k.id, scope ? k.full_name : `${k.city_code} · ${k.full_name}`])], F.con, (v) => { F.con = v; }),
    dd([['', 'Working in: any state'], ...ctx.cities.map((c) => [c.code, c.name])], F.where, (v) => {
      F.where = v;
      if (F.proj && !ctx.projects.some((p) => p.id === F.proj && (!v || p.city_code === v))) F.proj = '';
    }),
    dd([['', 'All projects'], ...projs.map((p) => [p.id, F.where ? p.name : `${p.city_code} · ${p.name}`])], F.proj, (v) => { F.proj = v; }),
    dd([['', 'Any status'], ...Object.keys(STATUS).map((s) => [s, s])], F.status, (v) => { F.status = v; }),
    count,
    h('button', { class: 'btn primary', onclick: () => openWorkerForm(scope ? { ...ctx, contractors: cons } : ctx) }, icon('plus'), 'Add worker'));

  return [toolbar, h('div', { class: 'table-wrap' }, h('table', {},
    h('thead', {}, h('tr', {}, head.map((t) => h('th', {}, t)))), tbody))];
}
