/* SuiFoot art: club badges and player faces drawn as SVG from a small seed. No image files.
 * Only the seed (club id / player id) would ever need to be stored on-chain. Never touches the game RNG. */
(function () {
  const SF = globalThis.SF;
  const Art = (SF.Art = {});

  const hash = (x) => { let h = 2166136261 >>> 0; const s = String(x); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; };
  function rng(seed) { let a = hash(seed) || 1; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const pick = (r, a) => a[Math.floor(r() * a.length)];
  const wpick = (r, a, w) => { let t = w.reduce((s, x) => s + x, 0), x = r() * t; for (let i = 0; i < a.length; i++) { x -= w[i]; if (x <= 0) return a[i]; } return a[a.length - 1]; };

  // ---------- club badges ----------
  // 18 animals x 4 shield shapes = 72 clubs, each different; colours come from the club itself.
  // Each animal is drawn in a 40x40 box, f = main colour, d = detail colour (the badge background).
  const ANIMALS = {
    lion: (f, d) => `<circle cx="20" cy="21" r="15" fill="${f}"/><circle cx="20" cy="22" r="9.5" fill="${d}" opacity=".35"/><circle cx="20" cy="22" r="8" fill="${f}"/><circle cx="16.5" cy="20" r="1.4" fill="${d}"/><circle cx="23.5" cy="20" r="1.4" fill="${d}"/><path d="M18 25h4l-2 2.5z" fill="${d}"/><circle cx="9" cy="10" r="3.4" fill="${f}"/><circle cx="31" cy="10" r="3.4" fill="${f}"/>`,
    wolf: (f, d) => `<path d="M6 4l8 7h12l8-7 1 17-8 14h-14l-8-14z" fill="${f}"/><path d="M14 22l6 4 6-4-2 7h-8z" fill="${d}" opacity=".5"/><path d="M12 17l5 2-1 2.5zM28 17l-5 2 1 2.5z" fill="${d}"/><path d="M18 32h4l-2 3z" fill="${d}"/>`,
    eagle: (f, d) => `<path d="M6 8c6-4 15-3 19 3 3 4 3 8 1 11l-5 9-3-6c-4 1-9-1-11-5-2-3-2-8-1-12z" fill="${f}"/><path d="M25 11c6 1 10 5 9 9-3-1-6-1-8 1z" fill="${f}"/><path d="M26 13l9 3-6 3z" fill="${d}" opacity=".7"/><circle cx="21" cy="14" r="1.8" fill="${d}"/><path d="M8 22l11 12 3-5z" fill="${f}" opacity=".7"/>`,
    bear: (f, d) => `<circle cx="9" cy="9" r="5" fill="${f}"/><circle cx="31" cy="9" r="5" fill="${f}"/><circle cx="20" cy="21" r="14" fill="${f}"/><ellipse cx="20" cy="26" rx="6.5" ry="5" fill="${d}" opacity=".45"/><circle cx="15" cy="18" r="1.6" fill="${d}"/><circle cx="25" cy="18" r="1.6" fill="${d}"/><ellipse cx="20" cy="24" rx="2.6" ry="1.8" fill="${d}"/>`,
    bull: (f, d) => `<path d="M2 6c2 8 7 11 12 11M38 6c-2 8-7 11-12 11" fill="none" stroke="${f}" stroke-width="3.2" stroke-linecap="round"/><path d="M11 14h18l3 10-5 11h-14l-5-11z" fill="${f}"/><ellipse cx="20" cy="30" rx="7" ry="5" fill="${d}" opacity=".45"/><circle cx="15" cy="21" r="1.5" fill="${d}"/><circle cx="25" cy="21" r="1.5" fill="${d}"/><circle cx="17.5" cy="30" r="1.1" fill="${d}"/><circle cx="22.5" cy="30" r="1.1" fill="${d}"/>`,
    stag: (f, d) => `<path d="M12 18C8 14 8 8 5 4M9 11l-5 1M10 14L5 17M28 18c4-4 4-10 7-14M31 11l5 1M30 14l5 3" fill="none" stroke="${f}" stroke-width="2.4" stroke-linecap="round"/><path d="M12 16h16l-2 12-6 8-6-8z" fill="${f}"/><circle cx="16" cy="22" r="1.4" fill="${d}"/><circle cx="24" cy="22" r="1.4" fill="${d}"/><circle cx="20" cy="33" r="2" fill="${d}"/>`,
    fox: (f, d) => `<path d="M4 3l10 8h12l10-8-2 20-14 14-14-14z" fill="${f}"/><path d="M13 24l7 4 7-4-7 11z" fill="${d}" opacity=".85"/><path d="M13 19l5 1.5M27 19l-5 1.5" stroke="${d}" stroke-width="2" stroke-linecap="round"/><circle cx="20" cy="35" r="1.6" fill="${f}" stroke="${d}"/>`,
    shark: (f, d) => `<path d="M3 31c5 0 7-3 9-6 4-8 9-17 12-21 1 9 3 15 9 21 2 2 3 3 4 6z" fill="${f}"/><path d="M3 34c4 0 5 2 8 2s5-2 8-2 5 2 8 2 5-2 8-2" fill="none" stroke="${f}" stroke-width="2" stroke-linecap="round"/><circle cx="25" cy="23" r="1.3" fill="${d}"/>`,
    owl: (f, d) => `<path d="M7 5l6 5h14l6-5v20c0 6-6 10-13 10s-13-4-13-10z" fill="${f}"/><circle cx="14.5" cy="18" r="5.6" fill="${d}"/><circle cx="25.5" cy="18" r="5.6" fill="${d}"/><circle cx="14.5" cy="18" r="2.4" fill="${f}"/><circle cx="25.5" cy="18" r="2.4" fill="${f}"/><path d="M18 23h4l-2 5z" fill="${d}"/>`,
    boar: (f, d) => `<path d="M6 8l8 3h12l8-3-1 11 3 8-8 8H12l-8-8 3-8z" fill="${f}"/><ellipse cx="20" cy="28" rx="7.5" ry="5.5" fill="${d}" opacity=".5"/><circle cx="17.5" cy="28" r="1.2" fill="${f}"/><circle cx="22.5" cy="28" r="1.2" fill="${f}"/><circle cx="14" cy="18" r="1.5" fill="${d}"/><circle cx="26" cy="18" r="1.5" fill="${d}"/><path d="M12 31l-4-5M28 31l4-5" stroke="${d}" stroke-width="2.4" stroke-linecap="round"/>`,
    panther: (f, d) => `<path d="M6 4l9 6h10l9-6 1 14c0 10-7 18-15 18S5 28 5 18z" fill="${f}"/><path d="M12 19l5 1.5-5 1.5zM28 19l-5 1.5 5 1.5z" fill="${d}"/><path d="M18 27h4l-2 3z" fill="${d}"/><path d="M11 29l7 1.5M29 29l-7 1.5" stroke="${d}" stroke-width="1.2"/>`,
    ram: (f, d) => `<path d="M12 12C2 11 1 24 9 25c5 1 6-5 3-6M28 12c10-1 11 12 3 13-5 1-6-5-3-6" fill="none" stroke="${f}" stroke-width="3.4" stroke-linecap="round"/><path d="M13 11h14l1 12-8 13-8-13z" fill="${f}"/><circle cx="17" cy="20" r="1.4" fill="${d}"/><circle cx="23" cy="20" r="1.4" fill="${d}"/><path d="M18 31h4l-2 3z" fill="${d}"/>`,
    raven: (f, d) => `<path d="M3 20c6-9 17-14 26-9 3 1 6 4 8 8-4 0-6 0-8 2 0 9-8 16-18 15 6-3 9-6 10-9-6 1-12-1-18-7z" fill="${f}"/><circle cx="26" cy="14" r="1.8" fill="${d}"/><path d="M31 12l7 4-8 1z" fill="${f}" opacity=".8"/>`,
    horse: (f, d) => `<path d="M11 36l2-14C9 18 9 9 17 4l2 5 5-3 2 6c4 4 6 11 6 17l-7-1-2 6z" fill="${f}"/><path d="M14 8c-5 6-5 14-3 20" fill="none" stroke="${d}" stroke-width="2.2" opacity=".6"/><circle cx="23" cy="14" r="1.5" fill="${d}"/><circle cx="31" cy="27" r="1.1" fill="${d}"/>`,
    serpent: (f, d) => `<path d="M30 6c-8-3-18 1-17 8 1 6 12 6 13 12 1 6-8 8-15 4" fill="none" stroke="${f}" stroke-width="6" stroke-linecap="round"/><circle cx="31" cy="7" r="4.4" fill="${f}"/><circle cx="32" cy="6" r="1.1" fill="${d}"/><path d="M34 9l4 3M34 9l4 0" stroke="${f}" stroke-width="1.4"/>`,
    falcon: (f, d) => `<path d="M20 8l4 8 14-9-6 14-8 3 2 10-6-5-6 5 2-10-8-3-6-14 14 9z" fill="${f}"/><circle cx="20" cy="14" r="1.4" fill="${d}"/><path d="M19 17h2l-1 3z" fill="${d}"/>`,
    tiger: (f, d) => `<path d="M5 5l9 6h12l9-6 1 14c0 9-7 16-16 16S4 28 4 19z" fill="${f}"/><path d="M10 14l4 3M30 14l-4 3M20 11v6M8 24l5 1M32 24l-5 1" stroke="${d}" stroke-width="2.2" stroke-linecap="round"/><circle cx="15" cy="21" r="1.4" fill="${d}"/><circle cx="25" cy="21" r="1.4" fill="${d}"/><path d="M18 27h4l-2 3z" fill="${d}"/>`,
    dolphin: (f, d) => `<path d="M3 26C6 12 18 6 27 9c3 1 6 3 7 6l5-3-1 9c-2 8-9 12-17 11-6 0-10-2-9-6 4 1 8 1 11-1-7-1-14-3-20 1z" fill="${f}"/><circle cx="27" cy="14" r="1.4" fill="${d}"/><path d="M12 16l4-6 2 7z" fill="${f}"/>`,
  };
  const ANIMAL_KEYS = Object.keys(ANIMALS);

  /** the club's index in the world decides animal + shield, so the 72 clubs never share a badge */
  function clubIndex(c) {
    const n = parseInt(String(c.id).replace(/\D/g, ''), 10);
    return Number.isFinite(n) ? n : hash(c.id) % 72;
  }
  Art.animalOf = (c) => ANIMAL_KEYS[clubIndex(c) % ANIMAL_KEYS.length];
  Art.logo = function (c, s) {
    s = s || 22;
    const i = clubIndex(c), r = rng('logo' + c.id);
    const shape = Math.floor(i / ANIMAL_KEYS.length) % 4, an = ANIMAL_KEYS[i % ANIMAL_KEYS.length];
    const pat = pick(r, ['none', 'half', 'stripes', 'band', 'chevron']);
    const clip = `lc${hash(c.id)}`;
    const sh = {
      0: 'M3 2h34v18c0 9-7 15-17 19C10 35 3 29 3 20z', 1: 'M20 1l17 5v14c0 9-7 15-17 19C10 35 3 29 3 20V6z',
      2: 'M20 1a19 19 0 1 1 0 38a19 19 0 0 1 0-38z', 3: 'M6 2h28l5 8-3 16-16 13L4 26 1 10z',
    }[shape];
    let p = '';
    if (pat === 'half') p = `<rect x="20" y="0" width="22" height="42" fill="${c.c2}" opacity=".28"/>`;
    else if (pat === 'stripes') p = [8, 16, 24, 32].map((x) => `<rect x="${x - 2}" y="0" width="4" height="42" fill="${c.c2}" opacity=".2"/>`).join('');
    else if (pat === 'band') p = `<rect x="0" y="14" width="42" height="7" fill="${c.c2}" opacity=".25"/>`;
    else if (pat === 'chevron') p = `<path d="M0 12l20 12 20-12v8L20 32 0 20z" fill="${c.c2}" opacity=".22"/>`;
    return `<svg class="bdg" width="${s}" height="${s}" viewBox="0 0 40 40"><defs><clipPath id="${clip}"><path d="${sh}"/></clipPath></defs>
      <path d="${sh}" fill="${c.c1}"/><g clip-path="url(#${clip})">${p}</g><path d="${sh}" fill="none" stroke="${c.c2}" stroke-width="2.4" stroke-linejoin="round"/>
      <g transform="translate(5.5 5.5) scale(.72)">${ANIMALS[an](c.c2, c.c1)}</g></svg>`;
  };

  // ---------- player faces ----------
  const SKIN = ['#f6d5bd', '#efc19c', '#dfa77a', '#c88a5c', '#a96a42', '#8a5130', '#6b3d25', '#4a2a1a'];
  const HAIRC = ['#0e0c0b', '#2a1a12', '#4a2e1c', '#7a5230', '#b88a4a', '#d9b56a', '#a8431f', '#8d8d8d', '#d8d8d8'];
  const IRIS = ['#2b1a10', '#4a2e1c', '#2f5d8a', '#3f7a4a', '#6b6b6b'];
  const SHIRT = ['#2d6cdf', '#d34b4b', '#2f9b5a', '#e0a020', '#7a4fc0', '#222'];

  Art.face = function (p, s, club) {
    s = s || 44;
    const r = rng('face' + p.id);
    const skinI = wpick(r, [0, 1, 2, 3, 4, 5, 6, 7], [14, 14, 14, 14, 13, 12, 10, 9]);
    const skin = SKIN[skinI], shade = 'rgba(0,0,0,.12)';
    const old = p.age >= 31, vold = p.age >= 34;
    let hc = wpick(r, HAIRC.slice(0, 7), skinI >= 5 ? [70, 24, 2, 0, 0, 0, 0] : [24, 26, 24, 12, 7, 5, 3]);
    if (old && r() < (vold ? 0.6 : 0.3)) hc = HAIRC[7 + (vold && r() < 0.4 ? 1 : 0)];
    const style = wpick(r, ['bald', 'buzz', 'short', 'side', 'curly', 'afro', 'long', 'mohawk', 'bun', 'quiff'], [skinI >= 6 ? 8 : 4, 10, 18, 14, 9, skinI >= 5 ? 14 : 2, 8, 4, 6, 10]);
    const beard = wpick(r, ['none', 'stubble', 'short', 'full', 'goatee', 'mous', 'chin'], [26, 18, 16, 12, 10, 10, 8]);
    const fw = pick(r, [13, 14.5, 16]), jaw = pick(r, [0, 1, 2]); // face half-width, jaw type
    const iris = pick(r, skinI >= 5 ? IRIS.slice(0, 2) : IRIS), brow = 1 + Math.floor(r() * 3);
    const nose = Math.floor(r() * 3), mouth = Math.floor(r() * 3);
    const shirt = club && club.c1 ? club.c1 : pick(r, SHIRT), trim = club && club.c2 ? club.c2 : '#fff';
    const hcol = hc;
    const cx = 32;
    // head: a rounded shape, jaw width varies
    const jw = [fw - 1, fw - 3, fw - 0.5][jaw];
    const headPath = `M${cx - fw} 27C${cx - fw} 14 ${cx - fw + 3} 10 ${cx} 10S${cx + fw} 14 ${cx + fw} 27C${cx + fw} 38 ${cx + jw - 1} 47 ${cx} 47S${cx - jw + 1} 38 ${cx - fw} 27z`;
    // explicit, simple hair shapes (numeric, no template junk)
    const L = cx - fw, Rr = cx + fw;
    const H = {
      bald: '',
      buzz: `<path d="M${L + 0.5} 24C${L} 14 ${L + 3} 10 ${cx} 10S${Rr} 14 ${Rr - 0.5} 24C${Rr - 3} 16 ${L + 3} 16 ${L + 0.5} 24z" fill="${hcol}" opacity=".8"/>`,
      short: `<path d="M${L - 1} 25C${L - 2} 8 ${cx - 6} 6 ${cx} 6S${Rr + 2} 8 ${Rr + 1} 25C${Rr - 1} 16 ${L + 4} 14 ${L - 1} 25z" fill="${hcol}"/>`,
      side: `<path d="M${L - 1} 26C${L - 3} 8 ${cx - 4} 5 ${cx + 2} 6S${Rr + 3} 10 ${Rr + 1} 26C${Rr - 2} 17 ${cx - 2} 15 ${L + 6} 17z" fill="${hcol}"/>`,
      curly: `<g fill="${hcol}"><circle cx="${L + 1}" cy="17" r="5"/><circle cx="${L + 6}" cy="10" r="5.5"/><circle cx="${cx}" cy="8" r="6"/><circle cx="${Rr - 6}" cy="10" r="5.5"/><circle cx="${Rr - 1}" cy="17" r="5"/></g>`,
      afro: `<ellipse cx="${cx}" cy="17" rx="${fw + 5}" ry="14" fill="${hcol}"/>`,
      long: `<path d="M${L - 3} 46C${L - 6} 20 ${L - 2} 6 ${cx} 6S${Rr + 6} 20 ${Rr + 3} 46L${Rr} 44V26H${L}V44z" fill="${hcol}"/>`,
      mohawk: `<path d="M${cx - 4} 14C${cx - 4} 2 ${cx + 4} 2 ${cx + 4} 14z" fill="${hcol}"/><path d="M${L + 0.5} 22C${L} 16 ${L + 3} 12 ${cx - 4} 12L${cx - 4} 15C${L + 4} 16 ${L + 1} 19 ${L + 0.5} 22z M${Rr - 0.5} 22C${Rr} 16 ${Rr - 3} 12 ${cx + 4} 12L${cx + 4} 15C${Rr - 4} 16 ${Rr - 1} 19 ${Rr - 0.5} 22z" fill="${hcol}" opacity=".6"/>`,
      bun: `<circle cx="${cx}" cy="4" r="4.6" fill="${hcol}"/><path d="M${L - 1} 24C${L - 2} 9 ${cx - 6} 7 ${cx} 7S${Rr + 2} 9 ${Rr + 1} 24C${Rr - 1} 15 ${L + 3} 15 ${L - 1} 24z" fill="${hcol}"/>`,
      quiff: `<path d="M${L - 1} 25C${L - 3} 9 ${cx - 5} 2 ${cx + 6} 3C${Rr + 3} 5 ${Rr + 2} 12 ${Rr + 1} 25C${Rr - 2} 16 ${L + 4} 14 ${L - 1} 25z" fill="${hcol}"/>`,
    };
    // beards
    const bc = hcol;
    const jawP = (y, dep, inner) => `M${L + 0.5} 29C${L + 1} ${y - 4} ${cx - 6} ${y + dep} ${cx} ${y + dep}S${Rr - 1} ${y - 4} ${Rr - 0.5} 29C${Rr - 3} ${inner} ${cx + 6} ${inner - 2} ${cx} ${inner - 2}S${L + 3} ${inner} ${L + 0.5} 29z`;
    const B = {
      none: '',
      stubble: `<path d="${jawP(44, 3, 36)}" fill="${bc}" opacity=".3"/>`,
      short: `<path d="${jawP(44, 3.5, 36)}" fill="${bc}" opacity=".92"/>`,
      full: `<path d="${jawP(46, 7, 34)}" fill="${bc}"/>`,
      goatee: `<path d="M${cx - 6} 38C${cx - 6} 47 ${cx - 2} 50 ${cx} 50S${cx + 6} 47 ${cx + 6} 38C${cx + 3} 40 ${cx - 3} 40 ${cx - 6} 38z" fill="${bc}"/>`,
      mous: '',
      chin: `<path d="M${cx - 5} 44C${cx - 4} 50 ${cx + 4} 50 ${cx + 5} 44z" fill="${bc}"/>`,
    };
    const mous = beard === 'mous' || beard === 'full' || beard === 'goatee' ? `<path d="M${cx - 7} 38c3-3 5-1 7-1s4-2 7 1c-3 1.5-5 .5-7 .5s-4 1-7-.5z" fill="${bc}"/>` : '';
    // eyes, brows, nose, mouth
    const ey = 26;
    const eyes = [-1, 1].map((d) => `<ellipse cx="${cx + d * 6}" cy="${ey}" rx="2.6" ry="1.9" fill="#fff"/><circle cx="${cx + d * 6}" cy="${ey}" r="1.35" fill="${iris}"/>`).join('');
    const brows = [-1, 1].map((d) => `<path d="M${cx + d * 6 - 3} ${ey - 4 + (d < 0 ? (brow - 2) * 0.8 : 0)}L${cx + d * 6 + 3} ${ey - 4 + (d > 0 ? (brow - 2) * 0.8 : 0)}" stroke="${hcol}" stroke-width="${brow === 3 ? 2 : 1.4}" stroke-linecap="round" fill="none"/>`).join('');
    const noseP = ['M32 28v7h-2.2', 'M32 28l-1 7h4', 'M32 28v6.5c-2 1-3 1.5-4 .5'][nose];
    const mouthP = [`<path d="M${cx - 4} 40.5q4 2.6 8 0" stroke="#7a2e2e" stroke-width="1.5" fill="none" stroke-linecap="round"/>`,
      `<path d="M${cx - 3.5} 40.5h7" stroke="#7a2e2e" stroke-width="1.6" stroke-linecap="round"/>`,
      `<path d="M${cx - 4} 40q4 4 8 0z" fill="#7a2e2e"/><path d="M${cx - 3} 40h6" stroke="#fff" stroke-width="1"/>`][mouth];
    const wr = old ? `<path d="M${cx - 9} 20q3-1.5 6 0M${cx + 3} 20q3-1.5 6 0" stroke="${shade}" stroke-width="1" fill="none"/>` : '';
    const cl = `fc${p.id}`;
    return `<svg class="face" width="${s}" height="${s}" viewBox="0 0 64 64"><defs><clipPath id="${cl}"><circle cx="32" cy="32" r="31"/></clipPath></defs>
      <circle cx="32" cy="32" r="31" fill="${pick(rng('bg' + p.id), ['#d9e4f0', '#e6e0d4', '#dbe8dc', '#eadbe4', '#dcdcec'])}"/>
      <g clip-path="url(#${cl})">
        ${style === 'long' || style === 'afro' ? H[style] : ''}
        <path d="M24 44h16v10H24z" fill="${skin}"/><path d="M24 44h16v3c-3 2-13 2-16 0z" fill="${shade}"/>
        <path d="M8 64c2-9 10-14 24-14s22 5 24 14z" fill="${shirt}"/><path d="M25 51l7 7 7-7" fill="none" stroke="${trim}" stroke-width="2.2" stroke-linejoin="round"/>
        <ellipse cx="${L - 0.5}" cy="29" rx="2.6" ry="4" fill="${skin}"/><ellipse cx="${Rr + 0.5}" cy="29" rx="2.6" ry="4" fill="${skin}"/>
        <path d="${headPath}" fill="${skin}"/>
        ${B[beard]}${wr}${eyes}${brows}
        <path d="${noseP}" stroke="${shade.replace('.12', '.45')}" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
        ${mous}${mouthP}
        ${style === 'long' || style === 'afro' ? (style === 'afro' ? `<path d="M${L - 2} 22C${L} 12 ${cx - 6} 10 ${cx} 10S${Rr} 12 ${Rr + 2} 22C${Rr - 3} 15 ${L + 3} 15 ${L - 2} 22z" fill="${hcol}"/>` : `<path d="M${L - 1} 26C${L - 2} 10 ${cx - 5} 7 ${cx} 7S${Rr + 2} 10 ${Rr + 1} 26C${Rr - 2} 16 ${L + 3} 16 ${L - 1} 26z" fill="${hcol}"/>`) : H[style]}
      </g></svg>`;
  };
})();
