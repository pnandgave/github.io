/* JARVIS core: 3D particle hologram inside a faded, tilted reactor disc (look v1, cyan). */
const THEMES = { cyan: { c: [95, 212, 244], hot: [234, 251, 255] } };
const theme = 'cyan';
// live values the Hub page sets: share of the day gone, tasks done / due
window.CORE = { dayFrac: 0, done: 0, total: 0, level: null };
class Holo {
  constructor(canvas, S, N) {
    this.S = S; this.dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = S * this.dpr; canvas.height = S * this.dpr;
    canvas.style.width = canvas.style.height = S + 'px';
    this.ctx = canvas.getContext('2d');
    this.R = S * 0.3;
    const g = Math.PI * (3 - Math.sqrt(5));
    this.pts = Array.from({ length: N }, (_, i) => {
      const y = 1 - (i / (N - 1)) * 2, r = Math.sqrt(1 - y * y), th = g * i;
      return { x: Math.cos(th) * r, y, z: Math.sin(th) * r, th: Math.atan2(y, Math.cos(th) * r), tw: Math.random() * 6.28 };
    });
    const ringN = Math.round(N / 7);
    this.rings = [[1.28, 1.15, 0.2, 0.5], [1.46, 0.45, 1.9, -0.32], [1.12, -0.85, 3.4, 0.8]].map(([rad, inc, node, spd]) => ({ rad, inc, node, spd, n: ringN }));
    this.fil = Array.from({ length: 18 }, () => Math.floor(Math.random() * N));
    this.bokeh = Array.from({ length: 16 }, () => ({ x: Math.random(), y: Math.random(), r: 2 + Math.random() * 8, a: .04 + Math.random() * .08, vx: (Math.random() - .5) * .01, vy: (Math.random() - .5) * .01 }));
    this.rot = 0; this.spd = 0.2; this.glow = 0.6;
  }
  drawDisc(t, dt, phase, R, env, cx, cy) {
    const ctx = this.ctx, S = this.S, [cr, cg, cb] = THEMES[theme].c, TAU = Math.PI * 2;
    const sp = phase === 'thinking' ? 4 : phase === 'talking' ? 1.4 : 1;
    this.sA = (this.sA || 0) + dt * 0.12 * sp;
    this.sB = (this.sB || 0) - dt * 0.2 * sp;
    this.sC = (this.sC || 0) + dt * 0.04 * sp;
    const e = 0.8 + 0.06 * Math.sin(t * 0.25), roll = 0.14 * Math.sin(t * 0.17);
    const ce = Math.cos(e), se = Math.sin(e), cz = Math.cos(roll), sz = Math.sin(roll), f = S * 3;
    const fade = 0.5 * this.glow;                     // the reactor rings stay secondary to the hologram
    const pulse = 1 + (phase === 'talking' ? 0.03 * env : 0);
    const P = (ang, r) => {                           // a point on the tilted disc plane
      const x = Math.cos(ang) * r, z = Math.sin(ang) * r;
      const y1 = -z * se, z1 = z * ce;
      const x2 = x * cz - y1 * sz, y2 = x * sz + y1 * cz, k = f / (f + z1);
      return [cx + x2 * k, cy + y2 * k, z1];
    };
    const alpha = (p, r) => {                         // nearer = brighter; far side dims behind the sphere
      const depth = 0.5 - p[2] / (2 * r);
      const behind = p[2] > 0 && Math.hypot(p[0] - cx, p[1] - cy) < R * 1.05 ? 0.2 : 1;
      return (0.3 + 0.7 * depth) * behind * fade;
    };
    const col = a => `rgba(${cr},${cg},${cb},${Math.max(0, Math.min(1, a)).toFixed(3)})`;
    const arc = (a0, a1, r, w, a, n) => {
      let prev = P(a0, r);
      ctx.lineWidth = w;
      for (let i = 1; i <= n; i++) {
        const cur = P(a0 + (a1 - a0) * i / n, r);
        ctx.strokeStyle = col(alpha(cur, r) * a);
        ctx.beginPath(); ctx.moveTo(prev[0], prev[1]); ctx.lineTo(cur[0], cur[1]); ctx.stroke();
        prev = cur;
      }
    };
    ctx.lineCap = 'round';
    // outer tick ring
    for (let k = 0; k < 120; k++) {
      const ang = k / 120 * TAU + this.sC, long = k % 10 === 0;
      const p1 = P(ang, (long ? 1.66 : 1.73) * R * pulse), p2 = P(ang, 1.8 * R * pulse);
      ctx.lineWidth = long ? 1.6 : 0.9; ctx.strokeStyle = col(alpha(p2, 1.8 * R) * (long ? 0.9 : 0.5));
      ctx.beginPath(); ctx.moveTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1]); ctx.stroke();
    }
    arc(0, TAU, 1.62 * R * pulse, 0.8, 0.45, 120);
    // segmented reactor ring
    [[0, .9], [1.0, 1.3], [1.45, 2.4], [2.55, 2.75], [2.9, 4.1], [4.3, 4.5], [4.7, 5.8], [5.95, 6.15]]
      .forEach(([a, b]) => arc(a + this.sA, b + this.sA, 1.54 * R * pulse, 2, 0.9, Math.ceil((b - a) * 16)));
    // scanner while working
    if (phase === 'thinking') { const s0 = t * 3.2; arc(s0, s0 + 0.6, 1.54 * R, 4, 1.6, 14); }
    // day progress
    const frac = Math.max(0.002, Math.min(1, window.CORE.dayFrac || 0));
    const dStart = Math.PI / 2 + Math.PI, dEnd = dStart + TAU * frac;
    arc(0, TAU, 1.45 * R, 3.5, 0.18, 120);
    arc(dStart, dEnd, 1.45 * R, 3.5, 1, Math.max(4, Math.ceil(frac * 200)));
    const lp = P(dEnd + 0.08, 1.45 * R);
    ctx.font = `500 ${Math.max(8, Math.round(S * 0.022))}px 'IBM Plex Mono', monospace`;
    ctx.fillStyle = col(alpha(lp, 1.45 * R) * 1.2); ctx.fillText(`DAY ${Math.round(frac * 100)}%`, lp[0] + 4, lp[1] + 3);
    // counter-rotating dashed ring
    for (let k = 0; k < 36; k++) { const a = k / 36 * TAU + this.sB; arc(a, a + TAU / 36 * 0.68, 1.35 * R, 5, 0.5, 5); }
    // tasks done / due (one segment per task, up to 12)
    const tot = Math.min(12, window.CORE.total || 0), dn = Math.min(tot, window.CORE.done || 0);
    if (tot === 0) arc(0, TAU, 1.24 * R, 2.5, 0.2, 90);
    for (let k = 0; k < tot; k++) { const a = dStart + k * TAU / tot + 0.05; arc(a, a + TAU / tot - 0.1, 1.24 * R, 2.5, k < dn ? 1 : 0.25, Math.ceil(90 / tot)); }
    // voice ring while speaking
    if (phase === 'talking') {
      let prev = null;
      ctx.lineWidth = 1.4;
      for (let i = 0; i <= 160; i++) {
        const a = i / 160 * TAU, r = 1.14 * R * (1 + 0.05 * env * Math.sin(a * 14 + t * 11));
        const cur = P(a, r);
        if (prev) { ctx.strokeStyle = col(alpha(cur, r) * 1.3); ctx.beginPath(); ctx.moveTo(prev[0], prev[1]); ctx.lineTo(cur[0], cur[1]); ctx.stroke(); }
        prev = cur;
      }
    }
  }
  draw(t, dt, phase) {
    const { ctx, S, dpr } = this, [cr, cg, cb] = THEMES[theme].c, [hr, hg, hb] = THEMES[theme].hot;
    // combined mode: the sphere stays large and dominant; faded 3D reactor rings orbit it in the same scene
    const both = true;
    const R = S * (both ? 0.25 : 0.3), boost = both ? 1.25 : 1;
    const env = phase !== 'talking' ? 0 : (window.CORE.level != null ? Math.min(1, window.CORE.level * 5) : (0.15 + 0.85 * Math.abs(Math.sin(t * 9.3) * Math.sin(t * 3.1 + 1))));  // real voice loudness when the Hub speaks
    const targetSpd = phase === 'thinking' ? 1.7 : phase === 'talking' ? 0.45 : 0.18;
    const targetGlow = phase === 'thinking' ? 0.95 : phase === 'talking' ? 0.7 + 0.3 * env : 0.6 + 0.08 * Math.sin(t * 1.5);
    this.spd += (targetSpd - this.spd) * Math.min(1, dt * 2);
    this.glow += (targetGlow - this.glow) * Math.min(1, dt * 6);
    this.rot += this.spd * dt;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, S, S);
    ctx.globalCompositeOperation = 'lighter';
    const cx = S / 2, cy = S / 2, tilt = 0.38 + 0.08 * Math.sin(t * 0.3), ct = Math.cos(tilt), st = Math.sin(tilt);
    const ca = Math.cos(this.rot), sa = Math.sin(this.rot), f = S * 1.6;
    const proj = (x, y, z) => { const x1 = x * ca - z * sa, z1 = x * sa + z * ca; const y2 = y * ct - z1 * st, z2 = y * st + z1 * ct; const k = f / (f + z2); return [cx + x1 * k, cy + y2 * k, z2, k]; };

    // bokeh
    for (const b of this.bokeh) {
      b.x = (b.x + b.vx * dt + 1) % 1; b.y = (b.y + b.vy * dt + 1) % 1;
      const g = ctx.createRadialGradient(b.x * S, b.y * S, 0, b.x * S, b.y * S, b.r);
      g.addColorStop(0, `rgba(${cr},${cg},${cb},${b.a * this.glow})`); g.addColorStop(1, `rgba(${cr},${cg},${cb},0)`);
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(b.x * S, b.y * S, b.r, 0, 6.29); ctx.fill();
    }
    // outer halo
    let g = ctx.createRadialGradient(cx, cy, R * 0.2, cx, cy, R * 1.6);
    g.addColorStop(0, `rgba(${cr},${cg},${cb},${0.12 * this.glow})`); g.addColorStop(1, `rgba(${cr},${cg},${cb},0)`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);

    // 3D reactor disc (combined mode) — drawn in the same projection space as the sphere
    if (both) this.drawDisc(t, dt, phase, R, env, cx, cy);

    // sphere particles
    const breath = phase === 'idle' ? 0.02 * Math.sin(t * 1.6) : 0;
    const sphere = [];
    for (const p of this.pts) {
      const d = 1 + breath + (phase === 'talking' ? 0.12 * env * Math.sin(p.th * 7 + t * 9) : 0) + (phase === 'thinking' ? 0.03 * Math.sin(p.tw + t * 12) : 0);
      const P = proj(p.x * R * d, p.y * R * d, p.z * R * d);
      sphere.push(P);
      const depth = (1 - P[2] / R) * 0.5, tw = phase === 'thinking' ? 0.6 + 0.4 * Math.sin(p.tw + t * 14) : 0.85 + 0.15 * Math.sin(p.tw + t * 2);
      const a = Math.min(1, (0.22 + 0.75 * depth) * this.glow * tw * boost);
      ctx.fillStyle = `rgba(${cr},${cg},${cb},${a.toFixed(3)})`;
      const s = (0.9 + 1.5 * depth) * P[3] * (both ? 1.12 : 1);
      ctx.fillRect(P[0] - s / 2, P[1] - s / 2, s, s);
    }
    // filaments
    ctx.lineWidth = 0.6;
    for (const i of this.fil) {
      const P = sphere[i], fl = 0.5 + 0.5 * Math.sin(t * (phase === 'thinking' ? 20 : 3) + i);
      ctx.strokeStyle = `rgba(${cr},${cg},${cb},${((phase === 'idle' ? .06 : .16) * fl * this.glow).toFixed(3)})`;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(P[0], P[1]); ctx.stroke();
    }
    // orbit rings
    for (const r of this.rings) {
      const ci = Math.cos(r.inc), si = Math.sin(r.inc), cn = Math.cos(r.node + t * 0.05), sn = Math.sin(r.node + t * 0.05);
      const off = t * r.spd * (phase === 'thinking' ? 4 : 1);
      for (let k = 0; k < r.n; k++) {
        const ph = k / r.n * 6.2832 + off;
        let x = Math.cos(ph) * R * r.rad, y = Math.sin(ph) * R * r.rad, z = 0;
        const y1 = y * ci, z1 = y * si; const x2 = x * cn + z1 * sn, z2 = -x * sn + z1 * cn;
        const P = proj(x2, y1, z2), depth = (1 - P[2] / (R * r.rad)) * 0.5;
        const dash = (k % 9) < 6 ? 1 : 0.25;
        ctx.fillStyle = `rgba(${cr},${cg},${cb},${((0.1 + 0.5 * depth) * dash * this.glow * (both ? 0.7 : 1)).toFixed(3)})`;
        const s = 1.3 * P[3]; ctx.fillRect(P[0] - s / 2, P[1] - s / 2, s, s);
      }
    }
    // inner core: glow, spinning ring, hot centre
    const pulse = 1 + (phase === 'talking' ? 0.35 * env : phase === 'thinking' ? 0.12 * Math.sin(t * 9) : 0.06 * Math.sin(t * 1.6));
    g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 0.55 * pulse);
    g.addColorStop(0, `rgba(${hr},${hg},${hb},${0.9 * this.glow})`); g.addColorStop(0.25, `rgba(${cr},${cg},${cb},${0.55 * this.glow})`); g.addColorStop(1, `rgba(${cr},${cg},${cb},0)`);
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, R * 0.55 * pulse, 0, 6.29); ctx.fill();
    const rr = R * 0.24 * pulse, n = 64, rs = t * (phase === 'thinking' ? 5 : 1.2);
    for (let k = 0; k < n; k++) {
      const a = k / n * 6.2832 + rs, on = (k % 8) < 5;
      ctx.fillStyle = `rgba(${hr},${hg},${hb},${(on ? 0.8 : 0.2) * this.glow})`;
      ctx.fillRect(cx + Math.cos(a) * rr - 1, cy + Math.sin(a) * rr * 0.92 - 1, 2, 2);
    }
    ctx.globalCompositeOperation = 'source-over';
  }
}


/* start every <canvas data-core> on the page; window.corePhase = 'idle' | 'thinking' | 'talking' */
window.corePhase = 'idle';
(() => {
  const holos = [...document.querySelectorAll('canvas[data-core]')].map(c => new Holo(c, +c.dataset.size, +c.dataset.n));
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let last = performance.now();
  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000) * (reduce ? 0.2 : 1); last = now;
    if (!document.hidden) holos.forEach(h => h.draw(now / 1000 * (reduce ? 0.2 : 1), dt, window.corePhase));
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
})();
