/* SuiFoot visual and audio helpers (v0.3): charts, shirts, stadium, sound. Pure functions returning SVG strings. */
(function () {
  const SF = globalThis.SF;
  const Fx = (SF.Fx = {});
  const fmt = (n) => (Math.abs(n) >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : Math.abs(n) >= 1e3 ? Math.round(n / 1e3) + 'k' : String(Math.round(n)));
  Fx.fmt = fmt;

  /** small line chart; series = [{v:[...], c:'css colour', dash:bool}], labels optional */
  Fx.line = function (series, o) {
    o = o || {};
    const W = o.w || 360, H = o.h || 120, P = 24, Q = 8;
    const all = series.flatMap((s) => s.v).filter((x) => x != null);
    if (!all.length) return '';
    let lo = o.min != null ? o.min : Math.min(...all), hi = o.max != null ? o.max : Math.max(...all);
    if (hi === lo) { hi += 1; lo -= 1; }
    const n = Math.max(...series.map((s) => s.v.length));
    const x = (i) => P + (n <= 1 ? (W - P - Q) / 2 : (i * (W - P - Q)) / (n - 1));
    const y = (v) => H - 16 - ((v - lo) / (hi - lo)) * (H - 28);
    const grid = [lo, (lo + hi) / 2, hi].map((g) => `<line x1="${P}" x2="${W - Q}" y1="${y(g)}" y2="${y(g)}" class="gl"/><text x="${P - 3}" y="${y(g) + 3}" class="gt" text-anchor="end">${fmt(g)}</text>`).join('');
    const paths = series.map((s) => {
      const pts = s.v.map((v, i) => (v == null ? null : [x(i), y(v)])).filter(Boolean);
      if (!pts.length) return '';
      const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join('');
      const last = pts[pts.length - 1];
      return `<path d="${d}" fill="none" stroke="${s.c || 'var(--acc)'}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"${s.dash ? ' stroke-dasharray="4 4" opacity=".6"' : ''}/>${s.dash ? '' : `<circle cx="${last[0]}" cy="${last[1]}" r="3.4" fill="${s.c || 'var(--acc)'}"/>`}`;
    }).join('');
    const xl = (o.labels || []).map((l, i) => (i === 0 || i === n - 1 ? `<text x="${x(i)}" y="${H - 2}" class="gt" text-anchor="${i ? 'end' : 'start'}">${l}</text>` : '')).join('');
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${o.label || 'chart'}">${grid}${paths}${xl}</svg>`;
  };

  /** shirt in club colours; style picked from the club id: plain, stripes, hoops, sash */
  Fx.shirt = function (club, size) {
    const s = size || 44, c1 = club.c1, c2 = club.c2;
    const st = club.id % 4;
    const body = 'M14 6 L24 3 Q32 9 40 3 L50 6 L60 18 L52 24 L50 20 L50 58 L14 58 L14 20 L12 24 L4 18 Z';
    const id = 'sh' + club.id + '_' + s;
    let deco = '';
    if (st === 1) deco = [0, 1, 2, 3].map((i) => `<rect x="${17 + i * 9}" y="0" width="4.5" height="64" fill="${c2}"/>`).join('');
    else if (st === 2) deco = [0, 1, 2].map((i) => `<rect x="0" y="${14 + i * 14}" width="64" height="6" fill="${c2}"/>`).join('');
    else if (st === 3) deco = `<path d="M10 14 L64 50 L64 58 L10 22 Z" fill="${c2}"/>`;
    return `<svg class="shirt" width="${s}" height="${s}" viewBox="0 0 64 64" aria-hidden="true"><defs><clipPath id="${id}"><path d="${body}"/></clipPath></defs><path d="${body}" fill="${c1}"/><g clip-path="url(#${id})">${deco}</g><path d="${body}" fill="none" stroke="rgba(0,0,0,.28)" stroke-width="1.5"/><path d="M24 3 Q32 11 40 3" fill="none" stroke="${c2}" stroke-width="2.4"/></svg>`;
  };

  /** stadium seen from above, crowd fills with attendance (0..1) */
  Fx.stadium = function (fill, club) {
    const f = Math.max(0, Math.min(1, fill)), W = 320, H = 150;
    const dots = [];
    const rings = [[130, 62], [145, 72], [160, 82]];
    let k = 0;
    for (const [rx, ry] of rings) {
      const n = Math.round(rx / 3.2);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const on = ((i * 7 + rx) % 100) / 100 < f;
        dots.push(`<circle cx="${(W / 2 + Math.cos(a) * rx).toFixed(1)}" cy="${(H / 2 + Math.sin(a) * ry * 0.72).toFixed(1)}" r="2.3" class="${on ? 'fan' : 'seat'}"/>`);
        k++;
      }
    }
    return `<svg class="stadium" viewBox="0 0 ${W} ${H}" role="img"><ellipse cx="160" cy="75" rx="150" ry="70" class="bowl"/><rect x="82" y="40" width="156" height="70" rx="6" class="pitch"/><line x1="160" y1="40" x2="160" y2="110" class="pl"/><circle cx="160" cy="75" r="11" class="pl nf"/><rect x="82" y="58" width="16" height="34" class="pl nf"/><rect x="222" y="58" width="16" height="34" class="pl nf"/>${dots.join('')}</svg>`;
  };

  // ---------- sound (WebAudio synth, off by default) ----------
  let ctx = null;
  Fx.soundOn = () => { try { return localStorage.getItem('suifoot.sound') === '1'; } catch (e) { return false; } };
  Fx.setSound = (on) => { try { localStorage.setItem('suifoot.sound', on ? '1' : '0'); } catch (e) { /* ignore */ } };
  function ac() {
    if (!ctx) { const C = globalThis.AudioContext || globalThis.webkitAudioContext; if (!C) return null; ctx = new C(); }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  function tone(f, t0, d, type, vol, f2) {
    const a = ac(); if (!a) return;
    const o = a.createOscillator(), g = a.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(f, a.currentTime + t0);
    if (f2) o.frequency.linearRampToValueAtTime(f2, a.currentTime + t0 + d);
    g.gain.setValueAtTime(0.0001, a.currentTime + t0);
    g.gain.exponentialRampToValueAtTime(vol || 0.15, a.currentTime + t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + t0 + d);
    o.connect(g); g.connect(a.destination); o.start(a.currentTime + t0); o.stop(a.currentTime + t0 + d + 0.05);
  }
  function noise(t0, d, vol) {
    const a = ac(); if (!a) return;
    const buf = a.createBuffer(1, Math.floor(a.sampleRate * d), a.sampleRate), data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const s = a.createBufferSource(), g = a.createGain(), fl = a.createBiquadFilter();
    fl.type = 'bandpass'; fl.frequency.value = 900;
    g.gain.value = vol || 0.12; s.buffer = buf; s.connect(fl); fl.connect(g); g.connect(a.destination); s.start(a.currentTime + t0);
  }
  Fx.play = function (kind) {
    if (!Fx.soundOn()) return;
    try {
      if (kind === 'whistle') { tone(2700, 0, 0.18, 'sine', 0.12); tone(2700, 0.22, 0.35, 'sine', 0.12, 2500); }
      else if (kind === 'goal') { noise(0, 1.4, 0.18); tone(523, 0, 0.18, 'triangle', 0.1); tone(659, 0.16, 0.18, 'triangle', 0.1); tone(784, 0.32, 0.4, 'triangle', 0.1); }
      else if (kind === 'ding') { tone(880, 0, 0.25, 'sine', 0.12); tone(1320, 0.12, 0.35, 'sine', 0.1); }
      else if (kind === 'crowd') noise(0, 0.9, 0.07);
      else if (kind === 'miss') { noise(0, 0.5, 0.06); tone(300, 0, 0.3, 'sine', 0.05, 200); }
    } catch (e) { /* audio blocked */ }
  };
})();
