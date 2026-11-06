// Small force-directed graph on <canvas>, styled after Obsidian's graph view.
// nodes: { id, label, r, color, ring?, parent?, kind }   links: [sourceId, targetId, length]

const LABEL = '#b3b3b3';
const LINK = 'rgba(255,255,255,0.13)';
const ACCENT = '#a78bfa';

export class Graph {
  constructor(canvas, { onSelect } = {}) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d');
    this.onSelect = onSelect || (() => {});
    this.nodes = [];
    this.links = [];
    this.map = new Map();
    this.k = 1; this.tx = 0; this.ty = 0;
    this.alpha = 0;
    this.hover = null;
    this.selected = null;
    this.filter = null;
    this.pointers = new Map();
    this.dirty = true;
    this.bind();
    new ResizeObserver(() => this.resize()).observe(canvas.parentElement);
    this.resize();
    const loop = () => { this.tick(); requestAnimationFrame(loop); };
    loop();
  }

  setData(nodes, links) {
    const old = this.map;
    const first = old.size === 0;
    const sib = new Map();
    for (const n of nodes) {
      const prev = old.get(n.id);
      if (prev) { n.x = prev.x; n.y = prev.y; n.vx = 0; n.vy = 0; continue; }
      const p = n.parent && (old.get(n.parent) || nodes.find((m) => m.id === n.parent));
      const idx = sib.get(n.parent) || 0; sib.set(n.parent, idx + 1);
      const ang = idx * 2.399 + (p ? p.x || 0 : 0) * 0.01; // golden angle spreads siblings
      const d = n.kind === 'city' ? 220 : n.kind === 'contractor' ? 110 : 60;
      n.x = (p ? p.x || 0 : 0) + Math.cos(ang) * d;
      n.y = (p ? p.y || 0 : 0) + Math.sin(ang) * d;
      n.vx = 0; n.vy = 0;
    }
    this.nodes = nodes;
    this.map = new Map(nodes.map((n) => [n.id, n]));
    this.links = links.map(([a, b, len]) => ({ a: this.map.get(a), b: this.map.get(b), len })).filter((l) => l.a && l.b);
    this.adj = new Map(nodes.map((n) => [n.id, new Set()]));
    for (const l of this.links) { this.adj.get(l.a.id).add(l.b.id); this.adj.get(l.b.id).add(l.a.id); }
    if (this.selected && !this.map.has(this.selected)) this.selected = null;
    this.alpha = first ? 1 : 0.4;
    if (first) { for (let i = 0; i < 220; i++) this.step(); this.fit(); }
    this.dirty = true;
  }

  setFilter(fn) { this.filter = fn; this.dirty = true; }
  select(id) { this.selected = id; this.dirty = true; }

  resize() {
    const r = this.cv.parentElement.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.w = r.width; this.h = r.height;
    this.cv.width = r.width * dpr; this.cv.height = r.height * dpr;
    this.cv.style.width = r.width + 'px'; this.cv.style.height = r.height + 'px';
    this.dpr = dpr;
    if (!this.fitted) this.fit();
    this.dirty = true;
  }

  fit() {
    if (!this.nodes.length || !this.w) return;
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const n of this.nodes) { x0 = Math.min(x0, n.x - n.r); x1 = Math.max(x1, n.x + n.r); y0 = Math.min(y0, n.y - n.r); y1 = Math.max(y1, n.y + n.r); }
    const pad = 60;
    this.k = Math.min((this.w - pad * 2) / (x1 - x0 || 1), (this.h - pad * 2) / (y1 - y0 || 1), 2);
    this.tx = this.w / 2 - ((x0 + x1) / 2) * this.k;
    this.ty = this.h / 2 - ((y0 + y1) / 2) * this.k;
    this.fitted = true; this.dirty = true;
  }

  zoomBy(f, cx = this.w / 2, cy = this.h / 2) {
    const k = Math.max(0.15, Math.min(4, this.k * f));
    this.tx = cx - ((cx - this.tx) / this.k) * k;
    this.ty = cy - ((cy - this.ty) / this.k) * k;
    this.k = k; this.dirty = true;
  }

  /* ----------------------------- physics ----------------------------- */
  step() {
    const ns = this.nodes, a = this.alpha;
    for (let i = 0; i < ns.length; i++) {
      const p = ns[i];
      for (let j = i + 1; j < ns.length; j++) {
        const q = ns[j];
        let dx = p.x - q.x, dy = p.y - q.y;
        let d2 = dx * dx + dy * dy;
        if (d2 > 90000) continue;
        if (d2 < 25) { dx = Math.random() - 0.5; dy = Math.random() - 0.5; d2 = 25; }
        const f = ((p.r + q.r) * 38 * a) / d2;
        p.vx += dx * f; p.vy += dy * f; q.vx -= dx * f; q.vy -= dy * f;
      }
    }
    for (const l of this.links) {
      const dx = l.b.x - l.a.x, dy = l.b.y - l.a.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      const f = ((d - l.len) / d) * 0.09 * a;
      l.a.vx += dx * f; l.a.vy += dy * f; l.b.vx -= dx * f; l.b.vy -= dy * f;
    }
    for (const n of ns) {
      n.vx -= n.x * 0.003 * a; n.vy -= n.y * 0.003 * a;
      if (n.fx != null) { n.x = n.fx; n.y = n.fy; n.vx = n.vy = 0; continue; }
      n.vx *= 0.8; n.vy *= 0.8;
      n.x += n.vx; n.y += n.vy;
    }
    this.alpha = Math.max(0, a * 0.985 - 0.0004);
  }

  tick() {
    if (this.alpha > 0.002) { this.step(); this.dirty = true; }
    if (this.dirty) { this.draw(); this.dirty = false; }
  }

  /* ----------------------------- drawing ----------------------------- */
  focusSet() {
    const id = this.hover || this.selected;
    if (!id) return null;
    const s = new Set(this.adj.get(id) || []);
    s.add(id);
    return s;
  }

  draw() {
    const { ctx, k, tx, ty, dpr } = this;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, this.w, this.h);
    ctx.setTransform(dpr * k, 0, 0, dpr * k, dpr * tx, dpr * ty);
    const focus = this.focusSet();
    const fid = this.hover || this.selected;
    const dimmed = (n) => (focus && !focus.has(n.id)) || (this.filter && !this.filter(n));

    ctx.lineWidth = 1 / k;
    for (const l of this.links) {
      const hot = fid && (l.a.id === fid || l.b.id === fid);
      ctx.strokeStyle = hot ? ACCENT : LINK;
      ctx.globalAlpha = hot ? 0.9 : (dimmed(l.a) || dimmed(l.b)) ? 0.25 : 1;
      ctx.beginPath(); ctx.moveTo(l.a.x, l.a.y); ctx.lineTo(l.b.x, l.b.y); ctx.stroke();
    }

    for (const n of this.nodes) {
      const dim = dimmed(n);
      ctx.globalAlpha = dim ? 0.18 : 1;
      if (n.id === fid || (n.id === this.selected)) { ctx.shadowColor = n.color; ctx.shadowBlur = 18 * this.dpr; }
      ctx.fillStyle = n.color;
      ctx.beginPath(); ctx.arc(n.x, n.y, n.r, 0, 6.2832); ctx.fill();
      ctx.shadowBlur = 0;
      if (n.ring) {
        ctx.strokeStyle = n.ring; ctx.lineWidth = 2 / k;
        ctx.beginPath(); ctx.arc(n.x, n.y, n.r + 3, 0, 6.2832); ctx.stroke();
      }
      if (n.id === this.selected) {
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5 / k;
        ctx.beginPath(); ctx.arc(n.x, n.y, n.r + 6, 0, 6.2832); ctx.stroke();
      }
    }

    ctx.textAlign = 'center';
    for (const n of this.nodes) {
      const show = n.kind !== 'worker' || k > 1.1 || (focus && focus.has(n.id)) || n.id === this.selected;
      if (!show) continue;
      const dim = dimmed(n);
      ctx.globalAlpha = dim ? 0.2 : 1;
      const big = n.kind === 'hub' || n.kind === 'city';
      ctx.font = `${(big ? 13 : 11) / Math.max(k, 0.7)}px Inter, system-ui, sans-serif`;
      ctx.fillStyle = big ? '#e6e6e6' : LABEL;
      ctx.fillText(n.label, n.x, n.y + n.r + (big ? 16 : 13) / Math.max(k, 0.7));
    }
    ctx.globalAlpha = 1;
  }

  /* --------------------------- interaction --------------------------- */
  toWorld(e) {
    const r = this.cv.getBoundingClientRect();
    const sx = e.clientX - r.left, sy = e.clientY - r.top;
    return { sx, sy, x: (sx - this.tx) / this.k, y: (sy - this.ty) / this.k };
  }

  hit(x, y) {
    for (let i = this.nodes.length - 1; i >= 0; i--) {
      const n = this.nodes[i];
      const rr = n.r + 4 / this.k;
      if ((n.x - x) ** 2 + (n.y - y) ** 2 <= rr * rr) return n;
    }
    return null;
  }

  bind() {
    const cv = this.cv;
    cv.style.touchAction = 'none';
    cv.addEventListener('pointerdown', (e) => {
      cv.setPointerCapture(e.pointerId);
      const w = this.toWorld(e);
      this.pointers.set(e.pointerId, { sx: w.sx, sy: w.sy });
      this.moved = 0;
      if (this.pointers.size === 2) { this.drag = null; this.pinch = this.pinchDist(); return; }
      const n = this.hit(w.x, w.y);
      this.drag = n ? { node: n } : { pan: true };
      if (n) { n.fx = n.x; n.fy = n.y; }
    });
    cv.addEventListener('pointermove', (e) => {
      const w = this.toWorld(e);
      const prev = this.pointers.get(e.pointerId);
      if (prev) {
        const dx = w.sx - prev.sx, dy = w.sy - prev.sy;
        this.pointers.set(e.pointerId, { sx: w.sx, sy: w.sy });
        this.moved += Math.abs(dx) + Math.abs(dy);
        if (this.pointers.size === 2) {
          const d = this.pinchDist();
          if (this.pinch) this.zoomBy(d / this.pinch, ...this.pinchCenter());
          this.pinch = d;
        } else if (this.drag?.node) {
          this.drag.node.fx = w.x; this.drag.node.fy = w.y;
          this.alpha = Math.max(this.alpha, 0.3);
        } else if (this.drag?.pan) {
          this.tx += dx; this.ty += dy; this.dirty = true;
        }
        return;
      }
      const n = this.hit(w.x, w.y);
      const id = n ? n.id : null;
      if (id !== this.hover) { this.hover = id; cv.style.cursor = n ? 'pointer' : 'grab'; this.dirty = true; }
    });
    const up = (e) => {
      if (!this.pointers.has(e.pointerId)) return;
      this.pointers.delete(e.pointerId);
      this.pinch = null;
      const d = this.drag; this.drag = null;
      if (d?.node) { d.node.fx = null; d.node.fy = null; }
      if (this.moved < 6 && d) {
        const n = d.node || null;
        this.selected = n ? n.id : null;
        this.onSelect(n);
        this.dirty = true;
      }
    };
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', up);
    cv.addEventListener('pointerleave', () => { if (this.hover) { this.hover = null; this.dirty = true; } });
    cv.addEventListener('wheel', (e) => {
      e.preventDefault();
      const w = this.toWorld(e);
      this.zoomBy(Math.exp(-e.deltaY * 0.0015), w.sx, w.sy);
    }, { passive: false });
  }

  pinchDist() { const [a, b] = [...this.pointers.values()]; return Math.hypot(a.sx - b.sx, a.sy - b.sy) || 1; }
  pinchCenter() { const [a, b] = [...this.pointers.values()]; return [(a.sx + b.sx) / 2, (a.sy + b.sy) / 2]; }
}
