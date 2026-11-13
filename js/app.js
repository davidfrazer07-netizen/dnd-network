import { api, isDemo, resetDemo, setDemo } from './api.js?v=14';
import { Graph } from './graph.js?v=14';
import { h, toast, openModal, fullName, icon, mark } from './ui.js?v=14';
import { STATUS, openWorkerForm, openStatusForm, openWorkerModal, workerDetail, removeWorker, pill, deployed } from './forms.js?v=14';
import { workerBrowser } from './workertable.js?v=14';
import { projectsView } from './projects.js?v=14';
import { contractorsView } from './contractors.js?v=14';

const COLORS = ['#9d8cff', '#4fb3d9', '#e0607e', '#b4c94a', '#d08ad6', '#7d8fa9'];
const ACCENT = '#f07a35';
const root = document.getElementById('root');
const ctx = { user: null, cities: [], allCities: [], admins: [], contractors: [], workers: [], projects: [], reload };
const S = { tab: 'network', status: null, q: '', mine: true, sel: null, state: null, lf: {}, sf: {} };
let graph, graphWrap, drawerEl;

const isAdmin = () => ctx.user.role === 'admin';
const cityOf = (code) => ctx.cities.find((c) => c.code === code);
const cityColor = (code) => COLORS[Math.max(0, ctx.cities.findIndex((c) => c.code === code)) % COLORS.length];
const counts = (ws) => ({
  Working: ws.filter((w) => w.status === 'Working').length,
  Available: ws.filter((w) => w.status === 'Available').length,
  'On leave': ws.filter((w) => w.status === 'On leave').length,
  away: ws.filter((w) => w.current_city && w.current_city !== w.city_code).length,
});

/* --------------------------------- boot --------------------------------- */
async function boot() {
  try { ctx.user = await api.init(); } catch (e) { return showFatal(e); }
  if (ctx.user) await enter(); else renderLogin();
}

function showFatal(e) {
  root.replaceChildren(h('div', { class: 'login' }, h('div', { class: 'login-card' },
    h('h1', {}, 'Could not connect'), h('p', { class: 'muted' }, e.message),
    h('p', { class: 'muted' }, 'Check js/config.js and that schema.sql was run in Supabase.'))));
}

async function enter() {
  try { await loadAll(); } catch (e) { return showFatal(e); }
  S.tab = isAdmin() ? 'network' : 'team';
  S.status = null; S.q = ''; S.sel = null; S.state = null; S.lf = {}; S.sf = {};
  renderShell();
}

async function loadAll() {
  const [cities, people, workers, projects] = await Promise.all([api.cities(), api.people(), api.workers(), api.projects()]);
  ctx.allCities = cities; // includes hidden states, so a hidden one can be brought back
  ctx.cities = cities.filter((c) => c.active !== false); // states not in use yet stay hidden
  const live = new Set(ctx.cities.map((c) => c.code));
  ctx.admins = people.filter((p) => p.role === 'admin');
  ctx.contractors = people.filter((p) => p.role === 'contractor' && live.has(p.city_code));
  ctx.workers = workers.filter((w) => live.has(w.city_code));
  ctx.projects = projects.filter((p) => live.has(p.city_code));
}

async function reload() {
  await loadAll();
  render();
}

/* --------------------------------- login --------------------------------- */
function renderLogin() {
  const user = h('input', { id: 'u', autocomplete: 'username', autocapitalize: 'none', placeholder: 'Username', required: true });
  const pass = h('input', { id: 'p', type: 'password', autocomplete: 'current-password', placeholder: 'Password', required: true });
  const err = h('p', { class: 'form-error' });
  const btn = h('button', { class: 'btn primary big', type: 'submit' }, 'Log in');
  const form = h('form', { onsubmit: async (e) => {
    e.preventDefault(); btn.disabled = true; btn.textContent = 'Logging in…'; err.textContent = '';
    try { ctx.user = await api.login(user.value, pass.value); await enter(); }
    catch (ex) { err.textContent = ex.message; btn.disabled = false; btn.textContent = 'Log in'; }
  } }, h('label', { class: 'field' }, h('span', {}, 'Username'), user),
  h('label', { class: 'field' }, h('span', {}, 'Password'), pass), err, btn);

  const changePassword = () => {
    const f = (id, ph, ac) => h('input', { type: id === 'cu' ? 'text' : 'password', placeholder: ph, autocomplete: ac, required: true, autocapitalize: 'none' });
    const [un, cur, nw, again] = [f('cu', 'Username', 'username'), f('cp', 'Current password', 'current-password'),
      f('np', 'New password (8+ characters)', 'new-password'), f('np2', 'New password again', 'new-password')];
    const msg = h('p', { class: 'form-error' });
    const go = h('button', { class: 'btn primary big', type: 'submit' }, 'Change password');
    const m = openModal('Change password', h('form', { onsubmit: async (e) => {
      e.preventDefault();
      if (nw.value.length < 8) return (msg.textContent = 'New password must be at least 8 characters.');
      if (nw.value !== again.value) return (msg.textContent = 'The two new passwords do not match.');
      if (nw.value === cur.value) return (msg.textContent = 'Pick a password different from the current one.');
      go.disabled = true; go.textContent = 'Saving…'; msg.textContent = '';
      try { await api.changePassword(un.value, cur.value, nw.value); m.close(); toast('Password changed. Log in with the new one.'); user.value = un.value; pass.value = ''; }
      catch (ex) { msg.textContent = ex.message; go.disabled = false; go.textContent = 'Change password'; }
    } },
    [['Username', un], ['Current password', cur], ['New password', nw], ['New password again', again]].map(([l, i]) => h('label', { class: 'field' }, h('span', {}, l), i)),
    msg, go));
    un.value = user.value; un.focus();
  };

  const quick = (u, label) => h('button', { type: 'button', class: 'chip', onclick: () => { user.value = u; pass.value = 'demo'; form.requestSubmit(); } }, label);
  root.replaceChildren(h('div', { class: 'login' }, h('div', { class: 'login-card' },
    h('div', { class: 'logo' }, mark(28)), h('h1', {}, 'DND Network'), h('p', { class: 'muted' }, 'Workers, contractors and projects across our states'),
    form,
    !isDemo && h('button', { class: 'link', type: 'button', onclick: changePassword }, 'Change password'),
    isDemo && h('div', { class: 'demo-note' }, h('strong', {}, 'Demo mode'), ' — sample data, password is ', h('code', {}, 'demo'),
      h('div', { class: 'chips' }, quick('dhanush', 'Dhanush (admin)'), quick('od1', 'OD Contractor 1')),
      h('button', { class: 'link', onclick: () => { resetDemo(); location.reload(); } }, 'Reset demo data'),
      h('button', { class: 'link', onclick: () => setDemo(false) }, 'Exit demo')),
    !isDemo && h('button', { class: 'btn ghost big demo-btn', type: 'button', onclick: () => setDemo(true) }, 'Try the demo'))));
}

/* --------------------------------- shell --------------------------------- */
function renderShell() {
  root.replaceChildren(h('header', { class: 'top', id: 'top' }), h('main', { id: 'main' }));
  render();
}

function renderTop() {
  const tabs = isAdmin() ? [['network', 'Network'], ['list', 'All workers'], ['projects', 'Projects'], ['contractors', 'Contractors']] : [['team', 'My team'], ['network', 'Network']];
  const c = cityOf(ctx.user.city_code);
  document.getElementById('top').replaceChildren(
    h('div', { class: 'brand' }, h('span', { class: 'logo sm' }, mark(18)), h('strong', {}, 'DND Network'), isDemo && h('span', { class: 'demo-tag' }, 'DEMO')),
    h('nav', { class: 'tabs' }, tabs.map(([k, label]) => h('button', {
      class: `tab ${S.tab === k || (k === 'network' && S.tab === 'state') ? 'on' : ''}`, onclick: () => { S.tab = k; S.sel = null; render(); } }, label))),
    h('div', { class: 'who' },
      h('div', {}, h('strong', {}, ctx.user.full_name), h('small', {}, isAdmin() ? 'Super admin' : `Contractor · ${c ? c.name : ''}`)),
      h('button', { class: 'btn ghost sm', onclick: async () => { await api.logout(); location.reload(); } }, 'Log out')));
}

function render() {
  renderTop();
  const main = document.getElementById('main');
  if (S.tab === 'list') main.replaceChildren(renderList());
  else if (S.tab === 'state') main.replaceChildren(renderState());
  else if (S.tab === 'contractors') main.replaceChildren(contractorsView(ctx, cityColor));
  else if (S.tab === 'projects') main.replaceChildren(projectsView(ctx, cityColor));
  else if (S.tab === 'team') main.replaceChildren(renderTeam());
  else main.replaceChildren(renderNetwork());
  if (S.tab === 'network') { ensureGraph(); pushGraph(); }
}

/* ------------------------------ filters / stats ------------------------------ */
function wMatch(w) {
  if (S.status && w.status !== S.status) return false;
  if (S.q) {
    const hay = `${fullName(w)} ${w.worker_code} ${w.skill} ${w.current_task || ''} ${w.phone}`.toLowerCase();
    if (!hay.includes(S.q.toLowerCase())) return false;
  }
  return true;
}

const stat = (label, value, color) => h('div', { class: 'stat' },
  h('span', {}, color && h('i', { style: `background:${color}` }), label), h('strong', {}, value));
const statsBar = (ws) => {
  const c = counts(ws);
  return h('div', { class: 'stats' }, stat('Workers', ws.length), stat('Working', c.Working, STATUS.Working.color),
    stat('Available', c.Available, STATUS.Available.color), stat('Away from home state', c.away));
};

/* --------------------------------- network --------------------------------- */
function ensureGraph() {
  if (graph) return;
  const cv = h('canvas');
  const ctl = (t, fn, title) => h('button', { class: 'ctl', title, onclick: fn }, t);
  graphWrap = h('div', { class: 'graph-wrap' }, cv, h('div', { class: 'graph-ctl' },
    ctl(icon('plus'), () => graph.zoomBy(1.3), 'Zoom in'), ctl(icon('minus'), () => graph.zoomBy(0.77), 'Zoom out'), ctl(icon('fit'), () => graph.fit(), 'Fit to screen')));
  graph = new Graph(cv, { onSelect });
}

function buildGraph() {
  const nodes = [], links = [];
  const admin = isAdmin();
  if (admin) {
    nodes.push({ id: 'hub', kind: 'hub', label: 'DND Construction', r: 24, color: '#f2f2f2' });
    for (const a of ctx.admins) {
      nodes.push({ id: `admin:${a.id}`, kind: 'admin', label: a.full_name, r: 13, color: ACCENT, parent: 'hub' });
      links.push(['hub', `admin:${a.id}`, 80]);
    }
  }
  const cities = admin ? ctx.cities : ctx.cities.filter((c) => c.code === ctx.user.city_code);
  for (const c of cities) {
    nodes.push({ id: `city:${c.code}`, kind: 'city', label: c.name, r: 17, color: cityColor(c.code), city: c.code, parent: admin ? 'hub' : undefined });
    if (admin) links.push(['hub', `city:${c.code}`, 230]);
  }
  for (const k of ctx.contractors) {
    if (!cities.some((c) => c.code === k.city_code)) continue;
    nodes.push({ id: `con:${k.id}`, kind: 'contractor', label: k.full_name, r: 10, color: cityColor(k.city_code), city: k.city_code, parent: `city:${k.city_code}`, ref: k });
    links.push([`city:${k.city_code}`, `con:${k.id}`, 115]);
  }
  for (const w of ctx.workers) {
    const away = w.current_city && w.current_city !== w.city_code;
    nodes.push({ id: `w:${w.id}`, kind: 'worker', label: fullName(w), r: 5.5, color: STATUS[w.status]?.color || '#888',
      ring: away ? cityColor(w.current_city) : null, city: w.city_code, parent: `con:${w.contractor_id}`, ref: w });
    links.push([`con:${w.contractor_id}`, `w:${w.id}`, 55]);
  }
  return { nodes, links };
}

function pushGraph() {
  const { nodes, links } = buildGraph();
  graph.setData(nodes, links);
  applyFilter();
  if (S.sel && graph.map.has(S.sel)) graph.select(S.sel); else { S.sel = null; graph.select(null); }
  renderDrawer();
}

function applyFilter() {
  graph.setFilter((n) => {
    if (n.kind === 'hub' || n.kind === 'admin') return true;
    return n.kind !== 'worker' || wMatch(n.ref);
  });
}

function onSelect(n) {
  S.sel = n ? n.id : null;
  if (!isAdmin()) { if (n?.kind === 'worker') { graph.select(null); S.sel = null; openWorkerModal(ctx, n.ref); } return; }
  renderDrawer();
}

function renderNetwork() {
  ensureGraph();
  const admin = isAdmin();
  const search = h('input', { class: 'search', placeholder: 'Search', value: S.q, oninput: (e) => { S.q = e.target.value; applyFilter(); } });
  const legendDot = (c, t) => h('div', { class: 'leg' }, h('i', { style: `background:${c}` }), t);
  const cityBtn = (code, label, n, color) => h('button', { class: 'chip-row', onclick: () => openState(code) },
    h('i', { style: `background:${color}` }), h('span', {}, label), h('em', {}, n));
  const statusBtn = (s) => h('button', { class: `chip-row ${S.status === s ? 'on' : ''}`, onclick: () => { S.status = S.status === s ? null : s; render(); } },
    h('i', { style: `background:${STATUS[s].color}` }), h('span', {}, s), h('em', {}, ctx.workers.filter((w) => w.status === s).length));

  const side = h('aside', { class: 'side' }, search,
    admin && h('h4', {}, 'States'),
    admin && ctx.cities.map((c) => cityBtn(c.code, c.name, ctx.workers.filter((w) => w.city_code === c.code).length, cityColor(c.code))),
    h('h4', {}, 'Status'), Object.keys(STATUS).map(statusBtn),
    h('h4', {}, 'Legend'),
    legendDot(ACCENT, 'Admin'), legendDot('#9d8cff', 'State and contractor'),
    legendDot('#5bbf8a', 'Worker, coloured by status'),
    h('div', { class: 'leg' }, h('i', { class: 'ring' }), 'Deployed in another state'),
    h('p', { class: 'tip' }, 'Drag to move, scroll to zoom'));

  drawerEl = admin ? h('aside', { class: 'drawer' }) : null;
  return h('div', { class: 'net-page' },
    statsBar(ctx.workers),
    h('div', { class: `net ${admin ? '' : 'no-drawer'}` }, side, graphWrap, drawerEl));
}

/* ---------------------------------- drawer ---------------------------------- */
function renderDrawer() {
  if (!drawerEl) return;
  const [kind, ref] = (S.sel || '').split(':');
  drawerEl.classList.toggle('open', !!S.sel);
  const close = () => { S.sel = null; graph.select(null); renderDrawer(); };
  const head = (title, sub, color) => h('div', { class: 'drawer-head' },
    h('i', { class: 'dot', style: `background:${color}` }), h('div', {}, h('h3', {}, title), h('small', {}, sub)),
    h('button', { class: 'icon-btn', onclick: close, 'aria-label': 'Close' }, icon('x')));
  const workerList = (ws) => h('div', { class: 'wlist' }, ws.length ? ws.map((w) => h('button', {
    class: 'wrow', onclick: () => { S.sel = `w:${w.id}`; graph.select(S.sel); renderDrawer(); } },
    h('i', { style: `background:${STATUS[w.status].color}` }), h('span', {}, fullName(w)), h('small', {}, w.worker_code))) : h('p', { class: 'muted' }, 'No workers yet.'));
  const miniStats = (ws) => { const c = counts(ws); return h('div', { class: 'mini-stats' },
    Object.keys(STATUS).map((s) => h('span', { style: `--c:${STATUS[s].color}` }, h('b', {}, c[s]), ' ', s))); };

  let body;
  if (!S.sel) {
    body = h('div', { class: 'empty' }, h('div', { class: 'empty-icon' }, mark(32)),
      h('p', {}, 'Select a worker, contractor or state'));
  } else if (kind === 'w') {
    const w = ctx.workers.find((x) => x.id === ref);
    body = w ? [head('Worker', cityOf(w.city_code)?.name || '', STATUS[w.status].color), workerDetail(ctx, w, close)] : null;
  } else if (kind === 'con') {
    const k = ctx.contractors.find((x) => x.id === ref);
    const ws = ctx.workers.filter((w) => w.contractor_id === ref);
    body = [head(k.full_name, `${cityOf(k.city_code)?.name} · ${ws.length}/10 workers · @${k.username}`, cityColor(k.city_code)), miniStats(ws),
      h('button', { class: 'btn primary', onclick: () => openWorkerForm({ ...ctx, user: { ...ctx.user, role: 'admin' }, contractors: [k] }) }, icon('plus'), 'Add worker'),
      workerList(ws)];
  } else if (kind === 'city') {
    const c = cityOf(ref);
    const ws = ctx.workers.filter((w) => w.city_code === ref);
    body = [head(c.name, `${c.code} · ${ws.length} workers`, cityColor(ref)), miniStats(ws),
      h('button', { class: 'btn primary', onclick: () => openState(ref) }, `Open ${c.name} page`),
      h('h4', {}, 'Contractors'), ctx.contractors.filter((k) => k.city_code === ref).map((k) => h('button', { class: 'wrow',
        onclick: () => { S.sel = `con:${k.id}`; graph.select(S.sel); renderDrawer(); } },
      h('i', { style: `background:${cityColor(ref)}` }), h('span', {}, k.full_name), h('small', {}, `${ws.filter((w) => w.contractor_id === k.id).length}/10`))),
      h('h4', {}, 'From other states, working here'),
      (() => { const away = ctx.workers.filter((w) => w.current_city === ref && w.city_code !== ref);
        return away.length ? workerList(away) : h('p', { class: 'muted' }, 'No one from other states'); })()];
  } else {
    const all = ctx.workers;
    body = [head('DND Construction', `${ctx.admins.map((a) => a.full_name).join(' & ')}`, '#f2f2f2'), miniStats(all),
      h('p', { class: 'muted' }, `${ctx.cities.length} states · ${ctx.contractors.length} contractors · ${all.length} workers`)];
  }
  drawerEl.replaceChildren(...[body].flat().filter(Boolean));
}

/* ----------------------------- admin: all workers ----------------------------- */
function renderList() {
  const st = liveStats(ctx.workers);
  const [toolbar, table] = workerBrowser(ctx, S.lf, { rerender: render, onFiltered: st.update });
  return h('div', { class: 'list-page' }, st.el(), toolbar, table);
}

// stats strip that follows the table filters
function liveStats(base) {
  let el = statsBar(base);
  return { el: () => el, update: (ws) => { const next = statsBar(ws); el.replaceWith(next); el = next; } };
}

/* ------------------------------ admin: one state ------------------------------ */
function openState(code) { S.state = code; S.sf = {}; S.tab = 'state'; S.sel = null; render(); }

function renderState() {
  const c = cityOf(S.state);
  const ws = ctx.workers.filter((w) => w.city_code === c.code);
  const cons = ctx.contractors.filter((k) => k.city_code === c.code);
  const projs = ctx.projects.filter((p) => p.city_code === c.code);
  const st = liveStats(ws);
  const [toolbar, table] = workerBrowser(ctx, S.sf, { scope: c.code, rerender: render, onFiltered: st.update });
  const conCard = (k) => {
    const mine = ws.filter((w) => w.contractor_id === k.id);
    const n = counts(mine);
    return h('button', { class: `con-card ${S.sf.con === k.id ? 'on' : ''}`, onclick: () => { S.sf.con = S.sf.con === k.id ? '' : k.id; render(); } },
      h('strong', {}, k.full_name), h('small', {}, `@${k.username}`),
      h('span', {}, `${mine.length}/10 workers · ${n.Working} working`));
  };
  return h('div', { class: 'list-page' },
    h('section', { class: 'hero' },
      h('div', {}, h('button', { class: 'btn ghost sm back', onclick: () => { S.tab = 'network'; render(); } }, icon('back', 14), 'Network'),
        h('h1', {}, c.name),
        h('p', { class: 'muted' }, `${cons.length} contractors · ${projs.length} project${projs.length === 1 ? '' : 's'}${projs.length ? `: ${projs.map((p) => p.name).join(', ')}` : ''}`))),
    st.el(),
    h('h4', { class: 'section-h' }, 'Contractors'),
    h('div', { class: 'con-cards' }, cons.map(conCard)),
    h('h4', { class: 'section-h' }, 'Workers'),
    toolbar, table);
}

/* --------------------------- contractor: my team --------------------------- */
function renderTeam() {
  const city = cityOf(ctx.user.city_code);
  const mine = ctx.workers.filter((w) => w.contractor_id === ctx.user.id);
  const c = counts(mine);
  const grid = h('div', { class: 'cards' });
  const fill = () => {
    const q = S.q.toLowerCase();
    const ws = (S.mine ? mine : ctx.workers).filter((w) => !q || `${fullName(w)} ${w.worker_code} ${w.skill}`.toLowerCase().includes(q));
    grid.replaceChildren(...(ws.length ? ws.map(card) : [h('div', { class: 'empty-card' }, h('div', { class: 'empty-icon' }, icon('users', 32)),
      h('p', {}, S.q ? 'No one found' : 'No workers yet. Tap Add worker to start'))]));
  };
  const card = (w) => {
    const d = deployed(ctx, w);
    return h('article', { class: 'card', style: `--c:${STATUS[w.status].color}` },
      h('div', { class: 'card-top' }, h('div', { class: 'avatar' }, (w.first_name[0] || '') + (w.last_name[0] || '')),
        h('div', {}, h('h3', {}, fullName(w)), h('code', {}, w.worker_code)), pill(w.status)),
      h('p', { class: 'skill' }, w.skill),
      h('p', { class: 'where' }, icon('pin', 14), [d.state || '—', d.project, w.current_task].filter(Boolean).join(' · ')),
      h('div', { class: 'card-actions' },
        h('button', { class: 'btn primary', onclick: () => openStatusForm(ctx, w) }, 'Update status'),
        h('button', { class: 'btn ghost', onclick: () => openWorkerModal(ctx, w) }, 'Details'),
        h('button', { class: 'btn danger-ghost', onclick: () => removeWorker(ctx, w) }, 'Remove')));
  };
  fill();
  const seg = (label, val) => h('button', { class: `seg ${S.mine === val ? 'on' : ''}`, onclick: () => { S.mine = val; render(); } }, label);
  return h('div', { class: 'team-page' },
    h('section', { class: 'hero' },
      h('div', {}, h('small', {}, 'Your state'), h('h1', {}, city?.name || ctx.user.city_code), h('p', { class: 'muted' }, `${ctx.user.full_name} · ${mine.length} of 10 workers`)),
      h('button', { class: 'btn primary huge', onclick: () => openWorkerForm(ctx) }, icon('plus'), 'Add worker')),
    h('div', { class: 'stats' }, stat('My workers', `${mine.length}/10`), stat('Working', c.Working, STATUS.Working.color),
      stat('Available', c.Available, STATUS.Available.color)),
    h('div', { class: 'toolbar' }, h('div', { class: 'segs' }, seg('My workers', true), seg(`All in ${city?.name || 'state'}`, false)),
      h('input', { class: 'search', placeholder: 'Search workers', value: S.q, oninput: (e) => { S.q = e.target.value; fill(); } })),
    grid);
}

boot();
