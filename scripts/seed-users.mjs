// Creates the 2 admins + 12 contractors in Supabase and writes credentials.txt (git-ignored).
//   SUPABASE_URL=https://xxxx.supabase.co SUPABASE_SERVICE_KEY=eyJ... node scripts/seed-users.mjs
// The service key is SECRET: use it only here, never put it in the website.
import { writeFileSync } from 'node:fs';
import { randomInt } from 'node:crypto';

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_KEY;
if (!URL_ || !KEY) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_KEY first.');
  process.exit(1);
}

const EMAIL_DOMAIN = 'dndnetwork.app'; // must match js/api.js
const CITIES = ['OD', 'TN', 'KA', 'KL', 'MH', 'TS']; // must match schema.sql

// Edit names here if you like (login usernames stay as listed).
const people = [
  { username: 'dhanush', full_name: 'Dhanush', role: 'admin' },
  { username: 'derain', full_name: 'Derain', role: 'admin' },
  ...CITIES.flatMap((c) => [1, 2].map((slot) => ({
    username: `${c.toLowerCase()}${slot}`,
    full_name: `${c} Contractor ${slot}`,
    role: 'contractor', city_code: c, slot,
  }))),
];

const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'; // no look-alike characters
const makePassword = () => Array.from({ length: 4 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('')
  + '-' + Array.from({ length: 4 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');

const headers = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };
const lines = ['USERNAME      PASSWORD    NAME'];

for (const p of people) {
  const password = makePassword();
  const res = await fetch(`${URL_}/auth/v1/admin/users`, {
    method: 'POST', headers,
    body: JSON.stringify({ email: `${p.username}@${EMAIL_DOMAIN}`, password, email_confirm: true }),
  });
  const user = await res.json();
  if (!res.ok) { console.error(`✗ ${p.username}: ${user.msg || user.message || res.status}`); continue; }

  const prof = await fetch(`${URL_}/rest/v1/profiles`, {
    method: 'POST', headers: { ...headers, Prefer: 'return=minimal' },
    body: JSON.stringify({ id: user.id, ...p }),
  });
  if (!prof.ok) { console.error(`✗ profile ${p.username}: ${await prof.text()}`); continue; }

  lines.push(`${p.username.padEnd(13)} ${password.padEnd(11)} ${p.full_name}`);
  console.log(`✓ ${p.username}`);
}

writeFileSync(new URL('../credentials.txt', import.meta.url), lines.join('\n') + '\n');
console.log('\nPasswords saved to credentials.txt — hand them out, then keep that file private.');
