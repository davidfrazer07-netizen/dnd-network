// Supabase Edge Function: lets an admin (Dhanush / Derain) create or remove a contractor login.
// Creating logins needs the service key, which must never reach the browser, so it runs here.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const EMAIL_DOMAIN = 'dndnetwork.app'; // must match js/api.js
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    // only a logged-in admin may call this
    const token = (req.headers.get('Authorization') || '').replace('Bearer ', '');
    const { data: u, error: ue } = await admin.auth.getUser(token);
    if (ue || !u.user) return json({ error: 'Please log in again' }, 401);
    const { data: me } = await admin.from('profiles').select('role').eq('id', u.user.id).single();
    if (me?.role !== 'admin') return json({ error: 'Only the admins can manage contractors' }, 403);

    const b = await req.json();

    if (b.action === 'remove') { // delete a contractor's login (their profile goes with it)
      const id = String(b.id || '');
      const { data: t } = await admin.from('profiles').select('role').eq('id', id).maybeSingle();
      if (!t || t.role !== 'contractor') return json({ error: 'Contractor not found' }, 404);
      const { count } = await admin.from('workers').select('id', { count: 'exact', head: true }).eq('contractor_id', id);
      if (count) return json({ error: `They still have ${count} worker${count === 1 ? '' : 's'}. Move them first.` }, 400);
      const { error: de } = await admin.auth.admin.deleteUser(id);
      if (de) return json({ error: de.message }, 400);
      return json({ ok: true });
    }
    const username = String(b.username || '').trim().toLowerCase();
    const full_name = String(b.full_name || '').trim();
    const password = String(b.password || '');
    const city_code = String(b.city_code || '');
    if (!/^[a-z0-9._-]{3,30}$/.test(username)) return json({ error: 'Username: 3-30 letters, numbers, . _ -' }, 400);
    if (!full_name) return json({ error: 'Please enter a name' }, 400);
    if (password.length < 8) return json({ error: 'Password must be at least 8 characters' }, 400);
    const { data: city } = await admin.from('cities').select('code').eq('code', city_code).maybeSingle();
    if (!city) return json({ error: 'Unknown state' }, 400);

    const { data: made, error: ce } = await admin.auth.admin.createUser({
      email: `${username}@${EMAIL_DOMAIN}`, password, email_confirm: true,
    });
    if (ce) return json({ error: /already|registered|exists/i.test(ce.message) ? 'That username is taken' : ce.message }, 400);

    const { data: peers } = await admin.from('profiles').select('slot').eq('city_code', city_code).eq('role', 'contractor');
    const slot = Math.max(0, ...(peers || []).map((p) => p.slot || 0)) + 1;
    const { error: pe } = await admin.from('profiles')
      .insert({ id: made.user.id, username, full_name, role: 'contractor', city_code, slot });
    if (pe) { // don't leave a login without a profile
      await admin.auth.admin.deleteUser(made.user.id);
      return json({ error: /duplicate|unique/i.test(pe.message) ? 'That username is taken' : pe.message }, 400);
    }
    return json({ ok: true, username });
  } catch (e) {
    return json({ error: String((e as Error).message || e) }, 500);
  }
});
