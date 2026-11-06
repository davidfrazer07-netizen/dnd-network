import { api } from './api.js';
import { h, select, toast, openModal, confirmBox, ageOf, fullName, fmtDate } from './ui.js';

export const STATUS = {
  Working: { color: '#5bbf8a', icon: '🔨', hint: 'On a job' },
  Available: { color: '#e5a24b', icon: '🕐', hint: 'Free to assign' },
  'On leave': { color: '#8b8b8b', icon: '🏠', hint: 'Not working' },
};
const SKILLS = ['Mason', 'Carpenter', 'Electrician', 'Plumber', 'Painter', 'Welder', 'Tile Layer',
  'Steel Fixer', 'Crane Operator', 'Shuttering', 'Supervisor', 'Helper'];
const TASKS = ['Foundation work', 'Brick laying', 'Plastering', 'Roof shuttering', 'Painting', 'Wiring',
  'Pipe fitting', 'Tile work', 'Steel binding', 'Site clearing', 'Waiting for next site'];

export const pill = (status) => h('span', { class: 'pill', style: `--c:${STATUS[status]?.color || '#888'}` }, status);

const field = (label, input, cls = '') => h('label', { class: `field ${cls}` }, h('span', {}, label), input);
const input = (name, attrs = {}) => h('input', { name, ...attrs });

/* ---------------------------- add / edit worker ---------------------------- */
export function openWorkerForm(ctx, worker) {
  const edit = !!worker;
  const w = worker || {};
  const admin = ctx.user.role === 'admin';
  const cityOpts = ctx.cities.map((c) => [c.code, `${c.name} (${c.code})`]);

  const conSelect = !edit && admin
    ? select('contractor_id', ctx.contractors.map((c) => [c.id, `${c.city_code} · ${c.full_name}`]))
    : null;

  const f = {
    first_name: input('first_name', { required: true, value: w.first_name || '', autocomplete: 'off' }),
    last_name: input('last_name', { required: true, value: w.last_name || '', autocomplete: 'off' }),
    dob: input('dob', { type: 'date', required: true, value: w.dob || '', max: new Date().toISOString().slice(0, 10) }),
    sex: select('sex', [['Male', 'Male'], ['Female', 'Female'], ['Other', 'Other']], w.sex || 'Male'),
    phone: input('phone', { type: 'tel', required: true, value: w.phone || '', placeholder: '10-digit number' }),
    other_number: input('other_number', { type: 'tel', value: w.other_number || '', placeholder: 'Optional' }),
    address: h('textarea', { name: 'address', rows: 2, placeholder: 'House, street, village / town' }, w.address || ''),
    skill: input('skill', { required: true, list: 'skills', value: w.skill || '', placeholder: 'e.g. Mason' }),
    current_city: select('current_city', cityOpts, w.current_city || ctx.user.city_code || cityOpts[0][0]),
    current_task: input('current_task', { list: 'tasks', value: w.current_task || '', placeholder: 'What are they doing now?' }),
    status: select('status', Object.keys(STATUS).map((s) => [s, s]), w.status || 'Working'),
  };

  if (conSelect) {
    const sync = () => { f.current_city.value = ctx.contractors.find((c) => c.id === conSelect.value).city_code; };
    conSelect.addEventListener('change', sync); sync();
  }
  const err = h('p', { class: 'form-error' });
  const save = h('button', { class: 'btn primary big', type: 'submit' }, edit ? 'Save changes' : '＋ Add worker');
  const form = h('form', { class: 'form-grid', novalidate: true },
    h('datalist', { id: 'skills' }, SKILLS.map((s) => h('option', { value: s }))),
    h('datalist', { id: 'tasks' }, TASKS.map((s) => h('option', { value: s }))),
    conSelect && field('Contractor', conSelect, 'span2'),
    field('First name', f.first_name), field('Last name', f.last_name),
    field('Date of birth', f.dob), field('Sex', f.sex),
    field('Phone number', f.phone), field('Other number', f.other_number),
    field('Address', f.address, 'span2'),
    field('Skill / trade', f.skill, 'span2'),
    h('div', { class: 'span2 divider' }, 'Current work'),
    field('Working in', f.current_city), field('Status', f.status),
    field('Task', f.current_task, 'span2'),
    err,
    h('div', { class: 'actions span2' }, save));

  const m = openModal(edit ? `Edit ${w.worker_code}` : 'Add a new worker', form, { wide: true });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const d = Object.fromEntries(Object.entries(f).map(([k, el]) => [k, el.value.trim()]));
    if (!d.first_name || !d.last_name || !d.dob || !d.skill) return (err.textContent = 'Please fill name, date of birth and skill.');
    if (!/^[+\d][\d\s-]{6,}$/.test(d.phone)) return (err.textContent = 'Please enter a valid phone number.');
    err.textContent = ''; save.disabled = true; save.textContent = 'Saving…';
    try {
      if (edit) {
        await api.updateWorker(w.id, d);
        toast('Changes saved');
      } else {
        const con = ctx.contractors.find((c) => c.id === (conSelect ? conSelect.value : ctx.user.id));
        const row = await api.addWorker({ ...d, city_code: con.city_code, contractor_id: con.id });
        toast(`${row.worker_code} added`);
      }
      m.close(); await ctx.reload();
    } catch (ex) {
      err.textContent = ex.message; save.disabled = false; save.textContent = edit ? 'Save changes' : '＋ Add worker';
    }
  });
}

/* ------------------------------ quick status ------------------------------ */
export function openStatusForm(ctx, worker) {
  let status = worker.status;
  const city = select('current_city', ctx.cities.map((c) => [c.code, `${c.name} (${c.code})`]), worker.current_city || worker.city_code);
  const task = input('current_task', { list: 'tasks2', value: worker.current_task || '', placeholder: 'e.g. Brick laying' });
  const btns = Object.entries(STATUS).map(([s, v]) => h('button', {
    type: 'button', class: `status-btn ${s === status ? 'on' : ''}`, style: `--c:${v.color}`,
    onclick: () => { status = s; btns.forEach((b) => b.classList.toggle('on', b.dataset.s === s)); },
    'data-s': s,
  }, h('span', { class: 'big-icon' }, v.icon), h('strong', {}, s), h('small', {}, v.hint)));
  const err = h('p', { class: 'form-error' });
  const save = h('button', { class: 'btn primary big', onclick: async () => {
    save.disabled = true; save.textContent = 'Saving…';
    try {
      await api.updateWorker(worker.id, { status, current_city: city.value, current_task: task.value.trim() });
      toast('Status updated'); m.close(); await ctx.reload();
    } catch (ex) { err.textContent = ex.message; save.disabled = false; save.textContent = 'Save status'; }
  } }, 'Save status');
  const m = openModal(`${fullName(worker)} · ${worker.worker_code}`, h('div', { class: 'status-form' },
    h('datalist', { id: 'tasks2' }, TASKS.map((s) => h('option', { value: s }))),
    h('div', { class: 'status-row' }, btns),
    field('Working in which city?', city),
    field('What task are they doing?', task),
    err, h('div', { class: 'actions' }, save)));
}

/* ------------------------------ worker detail ------------------------------ */
export function workerDetail(ctx, w, close = () => {}) {
  const home = ctx.cities.find((c) => c.code === w.city_code);
  const now = ctx.cities.find((c) => c.code === w.current_city);
  const con = ctx.contractors.find((c) => c.id === w.contractor_id);
  const row = (k, v) => h('div', { class: 'kv' }, h('span', {}, k), h('strong', {}, v || '—'));
  return h('div', { class: 'detail' },
    h('div', { class: 'detail-top' },
      h('div', { class: 'avatar', style: `--c:${STATUS[w.status]?.color}` }, (w.first_name[0] || '') + (w.last_name[0] || '')),
      h('div', {}, h('h3', {}, fullName(w)), h('code', {}, w.worker_code), ' ', pill(w.status))),
    h('div', { class: 'kv-grid' },
      row('Skill', w.skill),
      row('Working in', now ? `${now.name} (${now.code})` : '—'),
      row('Current task', w.current_task),
      row('Contractor', con ? `${con.full_name} · ${w.city_code}` : '—'),
      row('Home city', home ? home.name : w.city_code),
      row('Date of birth', `${fmtDate(w.dob)} (age ${ageOf(w.dob)})`),
      row('Sex', w.sex),
      row('Phone', w.phone),
      row('Other number', w.other_number),
      row('Address', w.address)),
    h('div', { class: 'actions' },
      h('button', { class: 'btn primary', onclick: () => { close(); openStatusForm(ctx, w); } }, 'Update status'),
      h('button', { class: 'btn ghost', onclick: () => { close(); openWorkerForm(ctx, w); } }, 'Edit details'),
      h('button', { class: 'btn danger-ghost', onclick: () => removeWorker(ctx, w, close) }, 'Remove')));
}

export async function removeWorker(ctx, w, close = () => {}) {
  if (!(await confirmBox(`Remove ${fullName(w)}?`, `${w.worker_code} will be deleted from the network. This cannot be undone.`))) return;
  try { await api.removeWorker(w.id); toast(`${w.worker_code} removed`); close(); await ctx.reload(); }
  catch (ex) { toast(ex.message, 'err'); }
}

export function openWorkerModal(ctx, w) {
  const holder = { close: () => {} };
  holder.m = openModal('Worker', workerDetail(ctx, w, () => holder.m.close()));
}
