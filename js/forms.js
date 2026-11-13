import { api, isDemo } from './api.js?v=6';
import { h, select, toast, openModal, confirmBox, openImage, shrinkImage, ageOf, fullName, fmtDate, fmtAadhaar } from './ui.js?v=6';

export const STATUS = {
  Working: { color: '#5bbf8a', hint: 'On a job' },
  Available: { color: '#e5b84b', hint: 'Free to assign' },
  'On leave': { color: '#8a8a8a', hint: 'Not working' },
};
const SKILLS = ['Mason', 'Carpenter', 'Electrician', 'Plumber', 'Painter', 'Welder', 'Tile Layer',
  'Steel Fixer', 'Crane Operator', 'Shuttering', 'Supervisor', 'Helper'];
const TASKS = ['Foundation work', 'Brick laying', 'Plastering', 'Roof shuttering', 'Painting', 'Wiring',
  'Pipe fitting', 'Tile work', 'Steel binding', 'Site clearing', 'Waiting for next site'];

export const pill = (status) => h('span', { class: 'status-tag', style: `--c:${STATUS[status]?.color || '#888'}` }, h('i'), status);

// where a worker is deployed now: state name + project name
export const deployed = (ctx, w) => ({
  state: ctx.cities.find((c) => c.code === w.current_city)?.name || '',
  project: ctx.projects.find((p) => p.id === w.project_id)?.name || '',
});
export const deployedText = (ctx, w) => { const d = deployed(ctx, w); return [d.state, d.project].filter(Boolean).join(' · ') || '—'; };

const field = (label, input, cls = '') => h('label', { class: `field ${cls}` }, h('span', {}, label), input);
const input = (name, attrs = {}) => h('input', { name, ...attrs });

// Project dropdown. Admins see the projects of the state the worker is deployed in;
// contractors only ever see the projects of their own state.
function projectSelect(ctx, cityEl, value) {
  const admin = ctx.user.role === 'admin';
  const sel = h('select', { name: 'project_id' });
  const fill = (keep) => {
    const list = ctx.projects.filter((p) => p.city_code === (admin ? cityEl.value : ctx.user.city_code));
    sel.replaceChildren(h('option', { value: '' }, list.length ? 'No project' : 'No projects in this state yet'),
      ...list.map((p) => h('option', { value: p.id }, p.name)));
    sel.value = list.some((p) => p.id === keep) ? keep : '';
  };
  fill(value);
  if (admin) cityEl.addEventListener('change', () => fill(sel.value));
  return sel;
}

// photo picker: shows the saved photo (if any) and the newly chosen one
function docField(label, path) {
  let file = null;
  const img = h('img', { class: 'doc-img', alt: '' });
  const hint = h('span', { class: 'doc-hint' }, path ? 'Replace photo' : 'Add photo');
  const pick = h('input', { type: 'file', accept: 'image/*', class: 'doc-input', onchange: () => {
    file = pick.files[0] || null;
    if (file) { img.src = URL.createObjectURL(file); box.classList.add('has'); hint.textContent = 'Replace photo'; }
  } });
  const box = h('label', { class: `doc ${path ? 'has' : ''}` }, img, hint, pick);
  if (path) api.fileUrl(path).then((u) => { if (!file) img.src = u; }).catch(() => {});
  return { el: h('div', { class: 'field' }, h('span', {}, label), box), file: () => file };
}

/* ---------------------------- add / edit worker ---------------------------- */
export function openWorkerForm(ctx, worker) {
  const edit = !!worker;
  const w = worker || {};
  const admin = ctx.user.role === 'admin';
  const cityOpts = ctx.cities.map((c) => [c.code, `${c.name} (${c.code})`]);

  const conSelect = !edit && admin
    ? select('contractor_id', ctx.contractors.map((c) => [c.id, `${c.city_code} · ${c.full_name}`]))
    : null;

  const cityEl = select('current_city', cityOpts, w.current_city || ctx.user.city_code || cityOpts[0][0]);
  const f = {
    first_name: input('first_name', { required: true, value: w.first_name || '', autocomplete: 'off' }),
    last_name: input('last_name', { required: true, value: w.last_name || '', autocomplete: 'off' }),
    dob: input('dob', { type: 'date', required: true, value: w.dob || '', max: new Date().toISOString().slice(0, 10) }),
    sex: select('sex', [['Male', 'Male'], ['Female', 'Female'], ['Other', 'Other']], w.sex || 'Male'),
    phone: input('phone', { type: 'tel', required: true, value: w.phone || '', placeholder: '10-digit number' }),
    aadhaar_number: input('aadhaar_number', { inputmode: 'numeric', value: fmtAadhaar(w.aadhaar_number), placeholder: '12-digit number', autocomplete: 'off' }),
    address: h('textarea', { name: 'address', rows: 2, placeholder: 'House, street, village / town' }, w.address || ''),
    skill: input('skill', { required: true, list: 'skills', value: w.skill || '', placeholder: 'e.g. Mason' }),
    current_city: cityEl,
    project_id: projectSelect(ctx, cityEl, w.project_id),
    current_task: input('current_task', { list: 'tasks', value: w.current_task || '', placeholder: 'What are they doing now?' }),
    status: select('status', Object.keys(STATUS).map((s) => [s, s]), w.status || 'Working'),
  };
  const docs = { front: docField('Aadhaar front', w.aadhaar_front), back: docField('Aadhaar back', w.aadhaar_back) };

  if (conSelect) {
    const sync = () => {
      cityEl.value = ctx.contractors.find((c) => c.id === conSelect.value).city_code;
      cityEl.dispatchEvent(new Event('change'));
    };
    conSelect.addEventListener('change', sync); sync();
  }
  const err = h('p', { class: 'form-error' });
  const save = h('button', { class: 'btn primary big', type: 'submit' }, edit ? 'Save changes' : 'Add worker');
  const form = h('form', { class: 'form-grid', novalidate: true },
    h('datalist', { id: 'skills' }, SKILLS.map((s) => h('option', { value: s }))),
    h('datalist', { id: 'tasks' }, TASKS.map((s) => h('option', { value: s }))),
    conSelect && field('Contractor', conSelect, 'span2'),
    field('First name', f.first_name), field('Last name', f.last_name),
    field('Date of birth', f.dob), field('Sex', f.sex),
    field('Phone number', f.phone), field('Aadhaar Card Number', f.aadhaar_number),
    field('Address', f.address, 'span2'),
    field('Skill / trade', f.skill, 'span2'),
    h('div', { class: 'span2 divider' }, 'Aadhaar card photos'),
    docs.front.el, docs.back.el,
    h('div', { class: 'span2 divider' }, 'Current work'),
    field('Working in', f.current_city), field('Status', f.status),
    field('Project', f.project_id), field('Task', f.current_task),
    err,
    h('div', { class: 'actions span2' }, save));

  const m = openModal(edit ? `Edit ${w.worker_code}` : 'Add a new worker', form, { wide: true });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const d = Object.fromEntries(Object.entries(f).map(([k, el]) => [k, el.value.trim()]));
    d.aadhaar_number = d.aadhaar_number.replace(/[\s-]/g, '');
    d.project_id = d.project_id || null;
    if (!d.first_name || !d.last_name || !d.dob || !d.skill) return (err.textContent = 'Please fill name, date of birth and skill.');
    if (!/^[+\d][\d\s-]{6,}$/.test(d.phone)) return (err.textContent = 'Please enter a valid phone number.');
    if (d.aadhaar_number && !/^\d{12}$/.test(d.aadhaar_number)) return (err.textContent = 'Aadhaar number must be 12 digits.');
    err.textContent = ''; save.disabled = true; save.textContent = 'Saving…';
    const up = async (row, side) => {
      const file = docs[side].file();
      return file ? api.uploadAadhaar(row.city_code, row.id, side, await shrinkImage(file, isDemo ? 800 : 1600, isDemo ? 0.6 : 0.8)) : undefined;
    };
    try {
      if (edit) {
        const patch = { ...d };
        const front = await up(w, 'front'); if (front) patch.aadhaar_front = front;
        const back = await up(w, 'back'); if (back) patch.aadhaar_back = back;
        await api.updateWorker(w.id, patch);
        api.removeFiles([front && w.aadhaar_front, back && w.aadhaar_back]);
        toast('Changes saved');
      } else {
        const con = ctx.contractors.find((c) => c.id === (conSelect ? conSelect.value : ctx.user.id));
        const row = await api.addWorker({ ...d, city_code: con.city_code, contractor_id: con.id });
        try { // the worker exists now (the photo path needs its id), so a photo failure must not lose it
          const patch = {};
          const front = await up(row, 'front'); if (front) patch.aadhaar_front = front;
          const back = await up(row, 'back'); if (back) patch.aadhaar_back = back;
          if (front || back) await api.updateWorker(row.id, patch);
          toast(`${row.worker_code} added`);
        } catch (ex) {
          toast(`${row.worker_code} added, but the photos did not upload (${ex.message}). Open the worker and add them again.`, 'err');
        }
      }
      m.close(); await ctx.reload();
    } catch (ex) {
      err.textContent = ex.message; save.disabled = false; save.textContent = edit ? 'Save changes' : 'Add worker';
    }
  });
}

/* ------------------------------ quick status ------------------------------ */
export function openStatusForm(ctx, worker) {
  let status = worker.status;
  const city = select('current_city', ctx.cities.map((c) => [c.code, `${c.name} (${c.code})`]), worker.current_city || worker.city_code);
  const project = projectSelect(ctx, city, worker.project_id);
  const task = input('current_task', { list: 'tasks2', value: worker.current_task || '', placeholder: 'e.g. Brick laying' });
  const btns = Object.entries(STATUS).map(([s, v]) => h('button', {
    type: 'button', class: `status-btn ${s === status ? 'on' : ''}`, style: `--c:${v.color}`,
    onclick: () => { status = s; btns.forEach((b) => b.classList.toggle('on', b.dataset.s === s)); },
    'data-s': s,
  }, h('i', { class: 'sdot' }), h('strong', {}, s), h('small', {}, v.hint)));
  const err = h('p', { class: 'form-error' });
  const save = h('button', { class: 'btn primary big', onclick: async () => {
    save.disabled = true; save.textContent = 'Saving…';
    try {
      await api.updateWorker(worker.id, { status, current_city: city.value, project_id: project.value || null, current_task: task.value.trim() });
      toast('Status updated'); m.close(); await ctx.reload();
    } catch (ex) { err.textContent = ex.message; save.disabled = false; save.textContent = 'Save status'; }
  } }, 'Save status');
  const m = openModal(`${fullName(worker)} · ${worker.worker_code}`, h('div', { class: 'status-form' },
    h('datalist', { id: 'tasks2' }, TASKS.map((s) => h('option', { value: s }))),
    h('div', { class: 'status-row' }, btns),
    field('Working in which state?', city),
    field('Project', project),
    field('What task are they doing?', task),
    err, h('div', { class: 'actions' }, save)));
}

/* ------------------------------ worker detail ------------------------------ */
function docThumb(label, path) {
  if (!path) return h('div', { class: 'kv' }, h('span', {}, label), h('strong', {}, 'Not added'));
  const img = h('img', { alt: label });
  let url = '';
  const btn = h('button', { type: 'button', class: 'doc has', onclick: () => url && openImage(label, url) }, img);
  api.fileUrl(path).then((u) => { url = u; img.src = u; })
    .catch(() => btn.replaceChildren(h('span', { class: 'doc-hint' }, 'Could not load')));
  return h('div', { class: 'kv' }, h('span', {}, label), btn);
}

export function workerDetail(ctx, w, close = () => {}) {
  const home = ctx.cities.find((c) => c.code === w.city_code);
  const con = ctx.contractors.find((c) => c.id === w.contractor_id);
  const row = (k, v, cls = '') => h('div', { class: `kv ${cls}` }, h('span', {}, k), h('strong', {}, v || '—'));
  return h('div', { class: 'detail' },
    h('div', { class: 'detail-top' },
      h('div', { class: 'avatar' }, (w.first_name[0] || '') + (w.last_name[0] || '')),
      h('div', {}, h('h3', {}, fullName(w)), h('code', {}, w.worker_code), ' ', pill(w.status))),
    h('div', { class: 'kv-grid' },
      row('Skill', w.skill),
      row('Deployed', deployedText(ctx, w)),
      row('Current task', w.current_task),
      row('Contractor', con ? `${con.full_name} · ${w.city_code}` : '—'),
      row('Home state', home ? home.name : w.city_code),
      row('Date of birth', `${fmtDate(w.dob)} (age ${ageOf(w.dob)})`),
      row('Sex', w.sex),
      row('Phone', w.phone),
      row('Aadhaar Card Number', fmtAadhaar(w.aadhaar_number), 'full'),
      row('Address', w.address, 'full'),
      docThumb('Aadhaar front', w.aadhaar_front), docThumb('Aadhaar back', w.aadhaar_back)),
    h('div', { class: 'actions' },
      h('button', { class: 'btn primary', onclick: () => { close(); openStatusForm(ctx, w); } }, 'Update status'),
      h('button', { class: 'btn ghost', onclick: () => { close(); openWorkerForm(ctx, w); } }, 'Edit details'),
      h('button', { class: 'btn danger-ghost', onclick: () => removeWorker(ctx, w, close) }, 'Remove')));
}

export async function removeWorker(ctx, w, close = () => {}) {
  if (!(await confirmBox(`Remove ${fullName(w)}?`, `${w.worker_code} will be deleted from the network, along with their Aadhaar photos. This cannot be undone.`))) return;
  try { await api.removeWorker(w.id, [w.aadhaar_front, w.aadhaar_back]); toast(`${w.worker_code} removed`); close(); await ctx.reload(); }
  catch (ex) { toast(ex.message, 'err'); }
}

export function openWorkerModal(ctx, w) {
  const holder = { close: () => {} };
  holder.m = openModal('Worker', workerDetail(ctx, w, () => holder.m.close()));
}
