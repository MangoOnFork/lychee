// Lychee live effects: a small canvas particle engine.
// LycheeEffects.start(canvas, { type, amount }) -> controller { set({type, amount}), stop() }
// types: none, snow, leaves, petals, fireflies, stars, bats, embers. amount: 0..3 (1 = normal)
(function (root) {
  'use strict';
  if (root.LycheeEffects) return;
  const TAU = Math.PI * 2;
  const R = (a, b) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a));
  const pick = (arr) => arr[(Math.random() * arr.length) | 0];

  // particles per 1,000,000 px² at amount 1
  const SPECS = {
    snow: {
      density: 70,
      make(w, h, fresh) {
        const z = R(0.4, 1); // depth: far flakes are small and slow
        return { x: R(w), y: fresh ? R(h) : R(-40, -5), z, r: 0.8 + z * 2.4, vy: 14 + z * 38, vx: R(-6, 6), ph: R(TAU), a: 0.35 + z * 0.6 };
      },
      step(p, dt, t) { p.y += p.vy * dt; p.x += (p.vx + Math.sin(t * 0.9 + p.ph) * 14 * p.z) * dt; },
      draw(c, p) {
        c.globalAlpha = p.a;
        c.fillStyle = '#ffffff';
        c.beginPath(); c.arc(p.x, p.y, p.r, 0, TAU); c.fill();
      },
    },
    leaves: {
      density: 16,
      colors: ['#e8742a', '#d2452a', '#f0a030', '#b5651d', '#c9382d', '#e0902a'],
      make(w, h, fresh) {
        return {
          x: R(w), y: fresh ? R(h) : R(-60, -15), s: R(7, 14), vy: R(28, 55), vx: R(-12, 12),
          rot: R(TAU), vr: R(-1.6, 1.6), ph: R(TAU), flip: R(TAU), col: pick(this.colors), a: R(0.7, 0.95),
        };
      },
      step(p, dt, t) {
        p.y += p.vy * dt;
        p.x += (p.vx + Math.sin(t * 1.3 + p.ph) * 26) * dt;
        p.rot += p.vr * dt;
        p.flip += dt * 2.2;
      },
      draw(c, p) {
        c.globalAlpha = p.a;
        c.save();
        c.translate(p.x, p.y);
        c.rotate(p.rot);
        c.scale(Math.cos(p.flip) * 0.8 + 0.2, 1); // tumbling
        c.fillStyle = p.col;
        c.beginPath();
        c.moveTo(0, -p.s);
        c.quadraticCurveTo(p.s * 0.9, -p.s * 0.2, 0, p.s);
        c.quadraticCurveTo(-p.s * 0.9, -p.s * 0.2, 0, -p.s);
        c.fill();
        c.strokeStyle = 'rgba(70,30,10,.55)';
        c.lineWidth = 1;
        c.beginPath(); c.moveTo(0, -p.s * 0.8); c.lineTo(0, p.s * 1.25); c.stroke();
        c.restore();
      },
    },
    petals: {
      density: 26,
      colors: ['#ffc2d6', '#ff9fc0', '#ffd6e4', '#ffb3cc'],
      make(w, h, fresh) {
        return {
          x: R(-50, w), y: fresh ? R(h) : R(-40, -10), s: R(4, 8), vy: R(22, 40), vx: R(10, 30),
          rot: R(TAU), vr: R(-2, 2), ph: R(TAU), flip: R(TAU), col: pick(this.colors), a: R(0.6, 0.95),
        };
      },
      step(p, dt, t) {
        p.y += p.vy * dt;
        p.x += (p.vx + Math.sin(t * 1.1 + p.ph) * 18) * dt;
        p.rot += p.vr * dt;
        p.flip += dt * 3;
      },
      draw(c, p) {
        c.globalAlpha = p.a;
        c.save();
        c.translate(p.x, p.y);
        c.rotate(p.rot);
        c.scale(1, Math.abs(Math.cos(p.flip)) * 0.7 + 0.3);
        c.fillStyle = p.col;
        c.beginPath();
        c.ellipse(0, 0, p.s, p.s * 0.6, 0, 0, TAU);
        c.fill();
        c.restore();
      },
    },
    fireflies: {
      density: 14,
      make(w, h) {
        return { x: R(w), y: R(h * 0.25, h), vx: R(-10, 10), vy: R(-10, 10), ph: R(TAU), sp: R(0.6, 1.4), r: R(1.4, 2.6), wander: R(TAU) };
      },
      step(p, dt, t, w, h) {
        p.wander += R(-1.5, 1.5) * dt;
        p.vx += Math.cos(p.wander) * 12 * dt;
        p.vy += Math.sin(p.wander) * 12 * dt;
        p.vx *= 0.985; p.vy *= 0.985;
        p.x += p.vx * dt; p.y += p.vy * dt;
        if (p.x < -10) p.x = w + 10; if (p.x > w + 10) p.x = -10;
        if (p.y < h * 0.1) p.vy += 8 * dt; if (p.y > h + 10) p.y = h * 0.3;
        p.glow = Math.max(0, Math.sin(t * p.sp + p.ph));
      },
      alive: () => true,
      draw(c, p) {
        const g = p.glow || 0;
        if (g < 0.02) return;
        c.globalAlpha = g;
        const grd = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 7);
        grd.addColorStop(0, 'rgba(230,255,150,.9)');
        grd.addColorStop(0.25, 'rgba(190,255,120,.35)');
        grd.addColorStop(1, 'rgba(160,255,120,0)');
        c.fillStyle = grd;
        c.beginPath(); c.arc(p.x, p.y, p.r * 7, 0, TAU); c.fill();
        c.fillStyle = '#f6ffd0';
        c.beginPath(); c.arc(p.x, p.y, p.r, 0, TAU); c.fill();
      },
    },
    embers: {
      density: 22,
      make(w, h, fresh) {
        return { x: R(w), y: fresh ? R(h) : h + R(5, 40), r: R(0.8, 2.2), vy: -R(20, 50), ph: R(TAU), a: R(0.4, 0.9), life: R(0.6, 1) };
      },
      step(p, dt, t) { p.y += p.vy * dt; p.x += Math.sin(t * 2 + p.ph) * 14 * dt; },
      offscreen: (p) => p.y < -20,
      draw(c, p) {
        c.globalAlpha = p.a * (0.6 + 0.4 * Math.sin(p.y * 0.05 + p.ph));
        c.fillStyle = '#ffb060';
        c.beginPath(); c.arc(p.x, p.y, p.r, 0, TAU); c.fill();
      },
    },
    stars: {
      density: 120,
      make(w, h) {
        return { x: R(w), y: R(h), r: R(0.3, 1.4), ph: R(TAU), sp: R(0.5, 2), base: R(0.25, 0.8) };
      },
      step() {},
      alive: () => true,
      draw(c, p, t) {
        c.globalAlpha = p.base * (0.55 + 0.45 * Math.sin(t * p.sp + p.ph));
        c.fillStyle = '#ffffff';
        c.beginPath(); c.arc(p.x, p.y, p.r, 0, TAU); c.fill();
      },
      // occasional shooting star
      extra(c, dt, t, w, h, st) {
        if (!st.shoot && Math.random() < dt * 0.12) st.shoot = { x: R(w * 0.2, w), y: R(0, h * 0.4), vx: -R(500, 800), vy: R(180, 320), life: 0 };
        const s = st.shoot;
        if (!s) return;
        s.life += dt; s.x += s.vx * dt; s.y += s.vy * dt;
        const a = Math.max(0, 1 - s.life / 0.9);
        const grd = c.createLinearGradient(s.x, s.y, s.x - s.vx * 0.12, s.y - s.vy * 0.12);
        grd.addColorStop(0, `rgba(255,255,255,${a})`);
        grd.addColorStop(1, 'rgba(255,255,255,0)');
        c.globalAlpha = 1;
        c.strokeStyle = grd; c.lineWidth = 1.6;
        c.beginPath(); c.moveTo(s.x, s.y); c.lineTo(s.x - s.vx * 0.12, s.y - s.vy * 0.12); c.stroke();
        if (a <= 0 || s.x < -50 || s.y > h + 50) st.shoot = null;
      },
    },
    bats: {
      density: 3,
      make(w, h, fresh) {
        const dir = Math.random() < 0.5 ? 1 : -1;
        return { dir, x: fresh ? R(w) : (dir > 0 ? -40 : w + 40), y: R(h * 0.05, h * 0.6), s: R(8, 15), v: R(70, 130), ph: R(TAU), fl: R(10, 16), bob: R(10, 30) };
      },
      step(p, dt, t) { p.x += p.dir * p.v * dt; p.y += Math.sin(t * 2 + p.ph) * p.bob * dt; },
      offscreen: (p, w) => (p.dir > 0 ? p.x > w + 60 : p.x < -60),
      draw(c, p, t) {
        const flap = Math.sin(t * p.fl + p.ph); // -1..1
        const s = p.s;
        c.globalAlpha = 0.85;
        c.fillStyle = '#0a0510';
        c.save();
        c.translate(p.x, p.y);
        c.scale(p.dir, 1);
        c.beginPath();
        c.ellipse(0, 0, s * 0.28, s * 0.38, 0, 0, TAU); // body
        c.fill();
        for (const side of [-1, 1]) {
          c.beginPath();
          c.moveTo(side * s * 0.2, -s * 0.1);
          c.quadraticCurveTo(side * s * 0.9, -s * (0.2 + flap * 0.7), side * s * 1.5, -s * flap * 0.5);
          c.quadraticCurveTo(side * s * 1.1, s * 0.1, side * s * 0.8, s * 0.05);
          c.quadraticCurveTo(side * s * 0.55, s * 0.3, side * s * 0.2, s * 0.15);
          c.fill();
        }
        c.restore();
      },
    },
  };

  function start(canvas, opts) {
    const ctx = canvas.getContext('2d');
    const reduce = root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let type = 'none', amount = 1, parts = [], raf = 0, last = 0, t = 0, w = 0, h = 0, dpr = 1, state = {};

    function resize() {
      dpr = Math.min(root.devicePixelRatio || 1, 2);
      w = canvas.clientWidth; h = canvas.clientHeight;
      canvas.width = Math.max(1, Math.round(w * dpr));
      canvas.height = Math.max(1, Math.round(h * dpr));
      populate(true);
    }
    function target() {
      const spec = SPECS[type];
      if (!spec) return 0;
      return Math.min(500, Math.round(spec.density * amount * (w * h) / 1e6));
    }
    function populate(fresh) {
      const spec = SPECS[type];
      if (!spec) { parts = []; return; }
      const n = target();
      if (fresh) parts = [];
      while (parts.length < n) parts.push(spec.make(w, h, true));
      if (parts.length > n) parts.length = n;
    }
    function frame(now) {
      raf = 0;
      const spec = SPECS[type];
      if (!spec || !w || !h) return;
      const dt = Math.min(0.05, (now - (last || now)) / 1000);
      last = now; t += dt;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      for (let i = 0; i < parts.length; i++) {
        const p = parts[i];
        spec.step(p, dt, t, w, h);
        const gone = spec.offscreen ? spec.offscreen(p, w, h) : (p.y > h + 30 || p.x < -80 || p.x > w + 80);
        if (gone && !(spec.alive && spec.alive(p))) parts[i] = spec.make(w, h, false);
        spec.draw(ctx, parts[i], t);
      }
      if (spec.extra) spec.extra(ctx, dt, t, w, h, state);
      ctx.globalAlpha = 1;
      if (!document.hidden) raf = requestAnimationFrame(frame);
    }
    function run() {
      if (raf || type === 'none' || reduce || document.hidden) return;
      last = 0;
      raf = requestAnimationFrame(frame);
    }
    function halt() {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    const onVis = () => (document.hidden ? (raf && cancelAnimationFrame(raf), raf = 0) : run());
    document.addEventListener('visibilitychange', onVis);

    const ctl = {
      set(o) {
        const nt = o.type || 'none', na = o.amount == null ? 1 : o.amount;
        const changed = nt !== type;
        type = SPECS[nt] ? nt : 'none'; amount = na; state = changed ? {} : state;
        if (type === 'none' || amount <= 0) { halt(); parts = []; return; }
        populate(changed);
        run();
      },
      stop() { halt(); ro.disconnect(); document.removeEventListener('visibilitychange', onVis); },
      get count() { return parts.length; },
      get running() { return !!raf; },
    };
    resize();
    ctl.set(opts || {});
    return ctl;
  }

  const AMOUNTS = { light: 0.5, normal: 1, heavy: 2.2 };
  root.LycheeEffects = { start, types: Object.keys(SPECS), AMOUNTS };
})(typeof window !== 'undefined' ? window : globalThis);
