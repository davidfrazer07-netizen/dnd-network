import { api } from './api.js?v=11';
import { h, toast, openModal, confirmBox } from './ui.js?v=11';

const field = (label, el) => h('label', { class: 'field' }, h('span', {}, label), el);

export function addStateModal(ctx) {
  const name = h('input', { maxlength: 40, required: true, placeholder: 'e.g. Kerala', autocomplete: 'off' });
  const code = h('input', { maxlength: 2, required: true, placeholder: 'KL', autocapitalize: 'characters', autocomplete: 'off' });
  let touched = false;
  code.addEventListener('input', () => { touched = true; code.value = code.value.toUpperCase().replace(/[^A-Z]/g, ''); });
  name.addEventListener('input', () => { if (!touched) code.value = name.value.replace(/[^A-Za-z]/g, '').slice(0, 2).toUpperCase(); });
  const err = h('p', { class: 'form-error' });
  const go = h('button', { class: 'btn primary big', type: 'submit' }, 'Add state');
  const m = openModal('Add state', h('form', { onsubmit: async (e) => {
    e.preventDefault();
    const n = name.value.trim(), c = code.value.trim().toUpperCase();
    if (!n) return (err.textContent = 'Please enter the state name.');
    if (!/^[A-Z]{2}$/.test(c)) return (err.textContent = 'The code must be exactly two letters.');
    const live = ctx.cities.find((x) => x.code === c);
    if (live) return (err.textContent = `${c} is already used by ${live.name}.`);
    err.textContent = ''; go.disabled = true; go.textContent = 'Adding…';
    try {
      await api.addState(c, n, Math.max(0, ...ctx.allCities.map((x) => x.sort || 0)) + 1);
      m.close(); toast(`${n} added`); await ctx.reload();
    } catch (ex) { err.textContent = ex.message; go.disabled = false; go.textContent = 'Add state'; }
  } }, field('State name', name), field('Two-letter code', code),
  h('p', { class: 'muted hint' }, 'The code is used in worker IDs, for example DND_KL_001. It cannot be changed later.'), err, go));
  name.focus();
}

// Removing hides the state and everyone in it; nothing is deleted, and adding the same code brings it all back.
export async function removeStateModal(ctx, c) {
  if (ctx.cities.length <= 1) return toast('You need at least one state', 'err');
  const cons = ctx.contractors.filter((k) => k.city_code === c.code).length;
  const ws = ctx.workers.filter((w) => w.city_code === c.code).length;
  const ok = await confirmBox(`Remove ${c.name}?`,
    `${c.name} will disappear from the dashboard, along with its ${cons} contractor${cons === 1 ? '' : 's'} and ${ws} worker${ws === 1 ? '' : 's'}. Nothing is deleted. To bring it back, use Add state with the code ${c.code}.`, 'Yes, remove');
  if (!ok) return;
  try { await api.removeState(c.code); toast(`${c.name} removed`); await ctx.reload(); }
  catch (ex) { toast(ex.message, 'err'); }
}
