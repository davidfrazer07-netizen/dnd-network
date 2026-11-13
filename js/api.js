import { CONFIG } from './config.js?v=12';

const EMAIL_DOMAIN = 'dndnetwork.app'; // must match scripts/seed-users.mjs
const SB_CDN = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';

const wantsDemo = () => { try { return sessionStorage.getItem('dnd_demo') === '1'; } catch { return false; } };
export const isDemo = !CONFIG.SUPABASE_URL || CONFIG.SUPABASE_URL.startsWith('YOUR_') || wantsDemo();
export const setDemo = (on) => { try { on ? sessionStorage.setItem('dnd_demo', '1') : sessionStorage.removeItem('dnd_demo'); } catch { /* ignore */ } location.reload(); };

let sb;
const fail = (error) => { if (error) throw new Error(error.message || String(error)); };

/* ------------------------------ Supabase ------------------------------ */
const live = {
  async init() {
    const { createClient } = await import(SB_CDN);
    sb = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
    const { data } = await sb.auth.getSession();
    return data.session ? this.profile(data.session.user.id) : null;
  },
  async profile(id) {
    const { data, error } = await sb.from('profiles').select('*').eq('id', id).single();
    fail(error);
    return data;
  },
  async login(username, password) {
    const email = `${username.trim().toLowerCase()}@${EMAIL_DOMAIN}`;
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) {
      console.warn('login failed:', error.message);
      throw new Error(/invalid login credentials/i.test(error.message) ? 'Wrong username or password' : `Could not log in: ${error.message}`);
    }
    return this.profile(data.user.id);
  },
  async logout() { await sb.auth.signOut(); },
  async changePassword(username, current, next) { // proves the old password first, then sets the new one
    const email = `${username.trim().toLowerCase()}@${EMAIL_DOMAIN}`;
    const { error } = await sb.auth.signInWithPassword({ email, password: current });
    if (error) throw new Error('Wrong username or current password');
    const { error: e2 } = await sb.auth.updateUser({ password: next });
    await sb.auth.signOut();
    fail(e2);
  },
  async cities() {
    const { data, error } = await sb.from('cities').select('*').order('sort');
    fail(error);
    return data;
  },
  async people() {
    const { data, error } = await sb.from('profiles').select('*').order('city_code').order('slot');
    fail(error);
    return data;
  },
  async workers() {
    const { data, error } = await sb.from('workers').select('*').order('worker_code');
    fail(error);
    return data;
  },
  async addWorker(w) {
    const { data, error } = await sb.from('workers').insert(w).select().single();
    fail(error);
    return data;
  },
  async updateWorker(id, patch) {
    const { data, error } = await sb.from('workers').update(patch).eq('id', id).select().single();
    fail(error);
    return data;
  },
  async removeWorker(id, files = []) {
    const { error } = await sb.from('workers').delete().eq('id', id);
    fail(error);
    await this.removeFiles(files);
  },
  async addState(code, name, sort) { // also brings a hidden state back
    const { error } = await sb.from('cities').upsert({ code, name, sort, active: true });
    fail(error);
  },
  async removeState(code) { // hides it (and its people); nothing is deleted
    const { data, error } = await sb.from('cities').update({ active: false }).eq('code', code).select();
    fail(error);
    if (!data.length) throw new Error('Not allowed. Run supabase/migration_004.sql first.');
  },
  async callContractorFn(body) { // runs in the manage-contractor Edge Function (needs the service key)
    const { data, error } = await sb.functions.invoke('manage-contractor', { body });
    if (error) {
      let msg = error.message;
      try { const j = await error.context.json(); msg = j.error || j.message || msg; } catch { /* keep default */ }
      if (/not found/i.test(msg) && !/contractor not found/i.test(msg)) msg = 'The contractor service is not set up yet. Deploy the manage-contractor function in Supabase.';
      throw new Error(msg);
    }
    if (data?.error) throw new Error(data.error);
  },
  addContractor(d) { return this.callContractorFn(d); },
  async removeContractor(id, moveTo) { // their workers move first, then the login goes
    if (moveTo) {
      const { error } = await sb.from('workers').update({ contractor_id: moveTo }).eq('contractor_id', id);
      fail(error);
    }
    await this.callContractorFn({ action: 'remove', id });
  },
  async history(workerId) {
    const { data, error } = await sb.from('worker_history').select('*').eq('worker_id', workerId).order('started_at');
    fail(error);
    return data;
  },
  async renameContractor(id, name) {
    const { data, error } = await sb.from('profiles').update({ full_name: name }).eq('id', id).select();
    fail(error);
    if (!data.length) throw new Error('Not allowed. Run supabase/migration_003.sql first.');
  },
  async projects() {
    const { data, error } = await sb.from('projects').select('*').order('city_code').order('name');
    fail(error);
    return data;
  },
  async addProject(city_code, name) {
    const { data, error } = await sb.from('projects').insert({ city_code, name }).select().single();
    fail(error);
    return data;
  },
  async renameProject(id, name) {
    const { error } = await sb.from('projects').update({ name }).eq('id', id);
    fail(error);
  },
  async removeProject(id) {
    const { error } = await sb.from('projects').delete().eq('id', id);
    fail(error);
  },
  async uploadAadhaar(city, workerId, side, blob) {
    const path = `${city}/${workerId}/${side}-${Date.now()}.jpg`;
    const { error } = await sb.storage.from('aadhaar').upload(path, blob, { contentType: 'image/jpeg' });
    fail(error);
    return path;
  },
  async fileUrl(path) {
    const { data, error } = await sb.storage.from('aadhaar').createSignedUrl(path, 600);
    fail(error);
    return data.signedUrl;
  },
  async removeFiles(paths) {
    const list = paths.filter(Boolean);
    if (list.length) await sb.storage.from('aadhaar').remove(list); // best effort
  },
};

/* ------------------------- Demo (no backend) -------------------------- */
const KEY = 'dnd_demo_v3';
const CITY_LIST = [['OD', 'Odisha'], ['TN', 'Tamil Nadu'], ['KA', 'Karnataka']];
const PROJECT_NAMES = {
  OD: ['Bhubaneswar Smart Road', 'Paradip Warehouse'],
  TN: ['Chennai Metro Phase 2', 'Coimbatore IT Park'],
  KA: ['Bengaluru Tech Tower', 'Mysuru Flyover'],
};
const FIRST = ['Ravi', 'Suresh', 'Anil', 'Mohan', 'Prakash', 'Ramesh', 'Vijay', 'Sanjay', 'Kiran', 'Deepak',
  'Arjun', 'Manoj', 'Biswajit', 'Murugan', 'Karthik', 'Santosh', 'Rajesh', 'Lakshmi', 'Sunita', 'Geeta',
  'Ganesh', 'Harish', 'Naveen', 'Subhash', 'Pradeep', 'Bhaskar'];
const LAST = ['Kumar', 'Das', 'Nayak', 'Reddy', 'Naidu', 'Patil', 'Singh', 'Pillai', 'Mohanty', 'Rao',
  'Behera', 'Swain', 'Gowda', 'Nair', 'Yadav', 'Sahoo', 'Iyer', 'Shetty'];
const SKILLS = ['Mason', 'Carpenter', 'Electrician', 'Plumber', 'Painter', 'Welder', 'Tile Layer',
  'Steel Fixer', 'Crane Operator', 'Helper'];
const TASKS = ['Foundation work', 'Brick laying', 'Wiring - Block B', 'Plastering', 'Roof shuttering',
  'Painting - 2nd floor', 'Pipe fitting', 'Tile work', 'Site clearing', 'Steel binding', 'Waiting for next site'];

function rng(seed) { // tiny deterministic PRNG so the demo always looks the same
  let s = seed;
  return () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);
}

function seedDemo() {
  const r = rng(42);
  const pick = (a) => a[Math.floor(r() * a.length)];
  const cities = CITY_LIST.map(([code, name], i) => ({ code, name, sort: i + 1 }));
  const people = [
    { id: 'a-dhanush', username: 'dhanush', full_name: 'Dhanush', role: 'admin' },
    { id: 'a-derain', username: 'derain', full_name: 'Derain', role: 'admin' },
  ];
  const workers = [];
  const history = [];
  const counters = {};
  const DAY = 86400000;
  const projects = cities.flatMap((c) => PROJECT_NAMES[c.code].map((name, i) => ({
    id: `p-${c.code}-${i + 1}`, city_code: c.code, name, created_at: new Date().toISOString() })));
  for (const c of cities) {
    for (const slot of [1, 2]) {
      const con = { id: `c-${c.code}-${slot}`, username: `${c.code.toLowerCase()}${slot}`,
        full_name: `${c.code} Contractor ${slot}`, role: 'contractor', city_code: c.code, slot };
      people.push(con);
      const n = 7 + Math.floor(r() * 4);
      for (let i = 0; i < n; i++) {
        counters[c.code] = (counters[c.code] || 0) + 1;
        const away = r() < 0.15;
        const roll = r();
        const where = away ? pick(cities.filter((x) => x.code !== c.code)).code : c.code;
        workers.push({
          id: crypto.randomUUID(),
          worker_code: `DND_${c.code}_${String(counters[c.code]).padStart(3, '0')}`,
          city_code: c.code, contractor_id: con.id,
          first_name: pick(FIRST), last_name: pick(LAST),
          dob: `${1972 + Math.floor(r() * 30)}-${String(1 + Math.floor(r() * 12)).padStart(2, '0')}-${String(1 + Math.floor(r() * 28)).padStart(2, '0')}`,
          sex: r() < 0.88 ? 'Male' : 'Female',
          address: `${1 + Math.floor(r() * 90)}, Main Road, ${c.name}`,
          phone: `9${String(Math.floor(r() * 1e9)).padStart(9, '0')}`,
          aadhaar_number: String(Math.floor(1e11 + r() * 9e11)),
          aadhaar_front: '', aadhaar_back: '',
          skill: pick(SKILLS),
          current_city: where,
          project_id: roll < 0.2 ? null : pick(projects.filter((p) => p.city_code === where)).id,
          current_task: roll < 0.12 ? 'Waiting for next site' : pick(TASKS),
          status: roll < 0.12 ? 'Available' : roll < 0.2 ? 'On leave' : 'Working',
          created_at: new Date().toISOString(),
        });
        // history: 0-2 earlier stretches, then the current one
        const w = workers[workers.length - 1];
        let start = Date.now() - (10 + Math.floor(r() * 290)) * DAY;
        history.push({ id: crypto.randomUUID(), worker_id: w.id, state_code: w.current_city, project_id: w.project_id,
          project_name: projects.find((p) => p.id === w.project_id)?.name || null, started_at: new Date(start).toISOString(), ended_at: null });
        for (let k = Math.floor(r() * 3); k > 0; k--) {
          const end = start, len = (20 + Math.floor(r() * 100)) * DAY;
          const pr = pick(projects.filter((p) => p.city_code === c.code));
          start = end - len;
          history.push({ id: crypto.randomUUID(), worker_id: w.id, state_code: c.code, project_id: pr.id, project_name: pr.name,
            started_at: new Date(start).toISOString(), ended_at: new Date(end).toISOString() });
        }
        w.created_at = new Date(start).toISOString();
      }
    }
  }
  return { cities, people, workers, projects, history, counters, session: null };
}

let db;
const save = () => localStorage.setItem(KEY, JSON.stringify(db));
const wait = (v) => new Promise((res) => setTimeout(() => res(structuredClone(v)), 120));
const me = () => db.people.find((p) => p.id === db.session);
const canSee = (w) => me().role === 'admin' || w.city_code === me().city_code;
const openStretch = (w) => { // close the running stretch and start a new one, like the database trigger
  const now = new Date().toISOString();
  db.history.forEach((x) => { if (x.worker_id === w.id && !x.ended_at) x.ended_at = now; });
  db.history.push({ id: crypto.randomUUID(), worker_id: w.id, state_code: w.current_city, project_id: w.project_id || null,
    project_name: db.projects.find((p) => p.id === w.project_id)?.name || null, started_at: now, ended_at: null });
};
const adminOnly = () => { if (me().role !== 'admin') throw new Error('Only the admins can change projects'); };
const checkProject = (id) => { // contractors may only pick a project from their own state
  if (!id || me().role === 'admin') return;
  if (db.projects.find((p) => p.id === id)?.city_code !== me().city_code) throw new Error('You can only pick projects from your own state');
};

const demo = {
  async init() {
    try { db = JSON.parse(localStorage.getItem(KEY)); } catch { db = null; }
    if (!db) { db = seedDemo(); save(); }
    return me() || null;
  },
  async login(username, password) {
    const p = db.people.find((x) => x.username === username.trim().toLowerCase());
    if (!p || password !== 'demo') throw new Error('Wrong username or password (demo password is: demo)');
    db.session = p.id; save();
    return wait(p);
  },
  async logout() { db.session = null; save(); },
  async changePassword() { throw new Error('The demo password is always "demo"'); },
  cities: async () => wait(db.cities),
  people: async () => wait(db.people.filter((p) => me().role === 'admin' || p.city_code === me().city_code || p.id === me().id)),
  workers: async () => wait(db.workers.filter(canSee)),
  async addState(code, name, sort) {
    adminOnly();
    const old = db.cities.find((c) => c.code === code);
    if (old) Object.assign(old, { name, active: true });
    else db.cities.push({ code, name, sort, active: true });
    save();
  },
  async removeState(code) {
    adminOnly();
    db.cities.find((c) => c.code === code).active = false; save();
  },
  async removeContractor(id, moveTo) {
    adminOnly();
    if (moveTo) db.workers.forEach((w) => { if (w.contractor_id === id) w.contractor_id = moveTo; });
    else if (db.workers.some((w) => w.contractor_id === id)) throw new Error('They still have workers. Move them first.');
    db.people = db.people.filter((p) => p.id !== id); save();
  },
  async addContractor({ username, full_name, city_code }) {
    adminOnly();
    if (db.people.some((p) => p.username === username)) throw new Error('That username is taken');
    const slot = Math.max(0, ...db.people.filter((p) => p.city_code === city_code && p.role === 'contractor').map((p) => p.slot || 0)) + 1;
    db.people.push({ id: crypto.randomUUID(), username, full_name, role: 'contractor', city_code, slot });
    save();
  },
  async history(workerId) {
    return wait(db.history.filter((x) => x.worker_id === workerId).sort((a, b) => a.started_at.localeCompare(b.started_at)));
  },
  async renameContractor(id, name) {
    adminOnly();
    db.people.find((p) => p.id === id).full_name = name; save();
  },
  async projects() {
    return wait(db.projects.filter((p) => me().role === 'admin' || p.city_code === me().city_code));
  },
  async addProject(city_code, name) {
    adminOnly();
    if (db.projects.some((p) => p.city_code === city_code && p.name.toLowerCase() === name.toLowerCase())) throw new Error('That project already exists in this state');
    const row = { id: crypto.randomUUID(), city_code, name, created_at: new Date().toISOString() };
    db.projects.push(row); save();
    return wait(row);
  },
  async renameProject(id, name) {
    adminOnly();
    const p = db.projects.find((x) => x.id === id); p.name = name;
    db.history.forEach((x) => { if (x.project_id === id) x.project_name = name; });
    save();
  },
  async removeProject(id) {
    adminOnly();
    db.projects = db.projects.filter((p) => p.id !== id);
    db.workers.forEach((w) => { if (w.project_id === id) w.project_id = null; });
    save();
  },
  // demo keeps photos inline as data URLs, so the "path" is the image itself
  uploadAadhaar: (city, workerId, side, blob) => new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result); r.onerror = () => rej(new Error('Could not read that photo'));
    r.readAsDataURL(blob);
  }),
  fileUrl: async (path) => path,
  removeFiles: async () => {},
  async addWorker(w) {
    if (!canSee(w)) throw new Error('Not allowed');
    checkProject(w.project_id);
    db.counters[w.city_code] = (db.counters[w.city_code] || 0) + 1;
    const row = { ...w, id: crypto.randomUUID(), created_at: new Date().toISOString(),
      worker_code: `DND_${w.city_code}_${String(db.counters[w.city_code]).padStart(3, '0')}` };
    db.workers.push(row);
    openStretch(row); save();
    return wait(row);
  },
  async updateWorker(id, patch) {
    const w = db.workers.find((x) => x.id === id);
    if (!w || !canSee(w)) throw new Error('Not allowed');
    const { worker_code, city_code, ...safe } = patch;
    if (safe.project_id !== undefined && safe.project_id !== w.project_id) checkProject(safe.project_id);
    const moved = (safe.current_city !== undefined && safe.current_city !== w.current_city) || (safe.project_id !== undefined && safe.project_id !== w.project_id);
    Object.assign(w, safe);
    if (moved) openStretch(w);
    save();
    return wait(w);
  },
  async removeWorker(id) {
    const w = db.workers.find((x) => x.id === id);
    if (!w || !canSee(w)) throw new Error('Not allowed');
    db.workers = db.workers.filter((x) => x.id !== id);
    db.history = db.history.filter((x) => x.worker_id !== id); save();
  },
  reset() { localStorage.removeItem(KEY); },
};

export const api = isDemo ? demo : live;
export const resetDemo = () => demo.reset();
