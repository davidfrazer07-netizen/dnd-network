import { CONFIG } from './config.js?v=4';

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
    if (error) throw new Error('Wrong username or password');
    return this.profile(data.user.id);
  },
  async logout() { await sb.auth.signOut(); },
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
  async removeWorker(id) {
    const { error } = await sb.from('workers').delete().eq('id', id);
    fail(error);
  },
};

/* ------------------------- Demo (no backend) -------------------------- */
const KEY = 'dnd_demo_v1';
const CITY_LIST = [['OD', 'Odisha'], ['TN', 'Tamil Nadu'], ['KA', 'Karnataka'],
  ['KL', 'Kerala'], ['MH', 'Maharashtra'], ['TS', 'Telangana']];
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
  const counters = {};
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
        workers.push({
          id: crypto.randomUUID(),
          worker_code: `DND_${c.code}_${String(counters[c.code]).padStart(3, '0')}`,
          city_code: c.code, contractor_id: con.id,
          first_name: pick(FIRST), last_name: pick(LAST),
          dob: `${1972 + Math.floor(r() * 30)}-${String(1 + Math.floor(r() * 12)).padStart(2, '0')}-${String(1 + Math.floor(r() * 28)).padStart(2, '0')}`,
          sex: r() < 0.88 ? 'Male' : 'Female',
          address: `${1 + Math.floor(r() * 90)}, Main Road, ${c.name}`,
          phone: `9${String(Math.floor(r() * 1e9)).padStart(9, '0')}`,
          other_number: r() < 0.5 ? `8${String(Math.floor(r() * 1e9)).padStart(9, '0')}` : '',
          skill: pick(SKILLS),
          current_city: away ? pick(cities.filter((x) => x.code !== c.code)).code : c.code,
          current_task: roll < 0.12 ? 'Waiting for next site' : pick(TASKS),
          status: roll < 0.12 ? 'Available' : roll < 0.2 ? 'On leave' : 'Working',
          created_at: new Date().toISOString(),
        });
      }
    }
  }
  return { cities, people, workers, counters, session: null };
}

let db;
const save = () => localStorage.setItem(KEY, JSON.stringify(db));
const wait = (v) => new Promise((res) => setTimeout(() => res(structuredClone(v)), 120));
const me = () => db.people.find((p) => p.id === db.session);
const canSee = (w) => me().role === 'admin' || w.city_code === me().city_code;

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
  cities: async () => wait(db.cities),
  people: async () => wait(db.people.filter((p) => me().role === 'admin' || p.city_code === me().city_code || p.id === me().id)),
  workers: async () => wait(db.workers.filter(canSee)),
  async addWorker(w) {
    if (!canSee(w)) throw new Error('Not allowed');
    db.counters[w.city_code] = (db.counters[w.city_code] || 0) + 1;
    const row = { ...w, id: crypto.randomUUID(), created_at: new Date().toISOString(),
      worker_code: `DND_${w.city_code}_${String(db.counters[w.city_code]).padStart(3, '0')}` };
    db.workers.push(row); save();
    return wait(row);
  },
  async updateWorker(id, patch) {
    const w = db.workers.find((x) => x.id === id);
    if (!w || !canSee(w)) throw new Error('Not allowed');
    const { worker_code, city_code, ...safe } = patch;
    Object.assign(w, safe); save();
    return wait(w);
  },
  async removeWorker(id) {
    const w = db.workers.find((x) => x.id === id);
    if (!w || !canSee(w)) throw new Error('Not allowed');
    db.workers = db.workers.filter((x) => x.id !== id); save();
  },
  reset() { localStorage.removeItem(KEY); },
};

export const api = isDemo ? demo : live;
export const resetDemo = () => demo.reset();
