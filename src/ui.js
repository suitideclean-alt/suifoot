/* SuiFoot UI: renders everything from the game state, no framework. */
(function () {
  const SF = globalThis.SF;
  const { Game, Actions: A, Bank: B, Econ: E, CFG, util, R } = SF;
  const t = (k, p) => SF.I18N.t(k, p);
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = (n) => util.money(n);
  const SAVE = 'suifoot.save.v1', LANGK = 'suifoot.lang';

  const UI = (SF.UI = { G: null, tab: 'home', ci: 0, tr: 'market', lg: 'table', lgDiv: null, md: null, live: null, f: { pos: '', minOvr: 50, maxAge: '', maxPrice: '', div: '', sort: 'ovr' }, setup: null, mok: null });

  // ---------- small helpers ----------
  function toast(msg, bad) {
    const d = document.createElement('div');
    d.textContent = msg; if (bad) d.className = 'bad';
    $('#toast').appendChild(d);
    setTimeout(() => d.remove(), 3200);
  }
  const co = () => UI.G.coaches[UI.ci];
  const myClub = () => (co().club ? UI.G.clubs[co().club] : null);
  const cname = (id) => (id && UI.G.clubs[id] ? UI.G.clubs[id].name : '-');
  function badge(c, s) {
    s = s || 22;
    const ini = c.name.split(' ')[0].slice(0, 2).toUpperCase();
    return `<svg class="bdg" width="${s}" height="${s}" viewBox="0 0 24 24"><path d="M3 2h18v10c0 5-4 8.5-9 10C7 20.5 3 17 3 12z" fill="${c.c1}" stroke="${c.c2}" stroke-width="1.6"/><text x="12" y="14.5" text-anchor="middle" font-size="8.5" font-weight="700" fill="${c.c2}">${ini}</text></svg>`;
  }
  const ctag = (id, s) => { const c = UI.G.clubs[id]; return c ? `${badge(c, s)} ${esc(c.name)}` : '-'; };
  const posTag = (p) => `<span class="pos pos-${p}">${t('pos_' + p)}</span>`;
  const ovCls = (o) => (o >= 75 ? 'hi' : o >= 60 ? 'mid' : o >= 48 ? 'lo' : 'vlo');
  const ovTag = (o) => `<span class="ov ${ovCls(o)}">${o}</span>`;
  const divName = (d) => t('div_n', { n: d + 1 });
  function save() { try { localStorage.setItem(SAVE, Game.serialize(UI.G)); } catch (e) { /* storage full or blocked */ } }
  function errMsg(r) {
    const k = 'err_' + r.err;
    return SF.I18N.D[k] ? t(k, { ask: r.ask, max: r.max != null ? r.max : CFG.SQUAD_MAX, min: CFG.SQUAD_MIN, cost: r.cost }) : t('err_generic');
  }
  function res(r, okMsg) {
    if (r.ok) { if (okMsg) toast(okMsg); save(); render(); return true; }
    toast(errMsg(r), true); return false;
  }
  function statusOf(p) {
    if (p.inj > 0) return `<span class="bad">${t('inj_n', { n: p.inj })}</span>`;
    if (p.sus > 0) return `<span class="warn">${t('sus_n', { n: p.sus })}</span>`;
    return `<span class="good">${t('fit')}</span>`;
  }
  function tbl(head, rows, cls) {
    return `<div class="scroll"><table class="tbl ${cls || ''}"><thead><tr>${head.map((h) => `<th${h && h[0] === '>' ? ' class="r"' : ''}>${h && h[0] === '>' ? h.slice(1) : h}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
  }
  function modal(html, onOk, okLabel) {
    $('#modal').innerHTML = `<div class="ovl"><div class="dlg">${html}<div class="row end"><button class="btn" data-act="m-cancel">${t('cancel')}</button><button class="btn pri" data-act="m-ok">${okLabel || t('confirm')}</button></div></div></div>`;
    UI.mok = onOk;
    const f = $('#modal input'); if (f) f.focus();
  }
  const closeModal = () => { $('#modal').innerHTML = ''; UI.mok = null; };
  function readModal() {
    const o = {};
    document.querySelectorAll('#modal [name]').forEach((e) => { o[e.name] = e.value; });
    return o;
  }

  // ---------- start ----------
  function detectLang() {
    const s = localStorage.getItem(LANGK);
    if (s) return s;
    const n = (navigator.language || 'en').toLowerCase();
    return n.startsWith('pt') ? 'pt' : n.startsWith('fr') ? 'fr' : n.startsWith('de') ? 'de' : 'en';
  }
  function init() {
    SF.I18N.set(detectLang());
    try { const s = localStorage.getItem(SAVE); if (s) { UI.G = Game.deserialize(s); } } catch (e) { UI.G = null; }
    document.addEventListener('click', onClick);
    document.addEventListener('change', onChange);
    render();
  }

  function render() {
    document.documentElement.lang = SF.I18N.get() === 'pt' ? 'pt-BR' : SF.I18N.get();
    $('#app').innerHTML = UI.G ? gameView() : setupView();
    if (UI.live && UI.G) liveTickRender();
    maybeJobPopup();
  }

  // ---------- setup ----------
  function previewClubs(seed) {
    const G = { rs: seed, season: 0, week: 0 };
    SF.setG(G);
    SF.World.generate(G);
    const out = G.clubIds.map((id) => ({ id, ...G.clubs[id], str: Math.round(E.strength(G, G.clubs[id]) * 10) / 10 }));
    SF.setG(UI.G);
    return out;
  }
  function setupView() {
    if (!UI.setup) UI.setup = { seed: (Math.random() * 4294967295) >>> 0, n: 1, names: ['', '', '', ''], clubs: ['', '', '', ''] };
    const S = UI.setup;
    if (!S.list) S.list = previewClubs(S.seed);
    const opts = (sel) => `<option value="">${t('random_club')}</option>` + [0, 1, 2, 3].map((d) => `<optgroup label="${divName(d)}">${S.list.filter((c) => c.div === d).map((c) => `<option value="${c.id}" ${sel === c.id ? 'selected' : ''}>${esc(c.name)} · ${t('strength')} ${c.str}</option>`).join('')}</optgroup>`).join('');
    const has = !!localStorage.getItem(SAVE);
    return `<div class="wrap"><div class="hero"><h1>Sui<b>Foot</b></h1><div class="mut">${t('app_tagline')}</div></div>
      <div class="grid"><div class="card form"><h2>${t('setup_title')}</h2>
        <div class="line"><label>${t('language')}</label><select data-chg="lang">${SF.I18N.LANGS.map(([k, n]) => `<option value="${k}" ${SF.I18N.get() === k ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
        <div class="line"><label>${t('coaches_n')}</label><select data-chg="setup-n">${[1, 2, 3, 4].map((n) => `<option ${S.n === n ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
        ${Array.from({ length: S.n }, (_, i) => `<div class="line"><input type="text" id="sn${i}" maxlength="18" placeholder="${t('coach_name')} ${i + 1}" value="${esc(S.names[i])}"><select id="sc${i}">${opts(S.clubs[i])}</select></div>`).join('')}
        ${S.n > 1 ? `<p class="mut sm">${t('hotseat_note')}</p>` : ''}
        <div class="row end"><button class="btn pri" data-act="setup-start">${t('start')}</button></div>
        <p class="mut sm">${t('fictional_note')}</p></div>
        <div class="card"><h2>${t('about_title')}</h2><p>${t('about_text')}</p><p class="mut sm">${t('roadmap')}</p>
        ${has ? `<button class="btn" data-act="continue">${t('continue')}</button>` : ''}
        <label class="btn" style="display:inline-block">${t('import')}<input type="file" accept=".json,application/json" data-chg="import" hidden></label></div></div></div>`;
  }
  function setupStart() {
    const S = UI.setup;
    const coaches = [];
    const used = new Set();
    for (let i = 0; i < S.n; i++) {
      const name = ($('#sn' + i).value || '').trim() || 'Coach ' + (i + 1);
      let cid = $('#sc' + i).value || null;
      if (cid && used.has(cid)) cid = null;
      if (cid) used.add(cid);
      coaches.push({ name, clubId: cid });
    }
    UI.G = Game.newGame({ seed: S.seed, coaches });
    UI.setup = null; UI.ci = 0; UI.tab = 'home'; UI.live = null;
    save(); render();
  }

  // ---------- main frame ----------
  function gameView() {
    const G = UI.G, c = co(), club = myClub();
    const tabs = ['home', 'squad', 'league', 'cup', 'transfers', 'finance', 'coach', 'settings'];
    const bal = club ? B.bal(G, club.id) : 0;
    return `<header class="top"><div class="in"><div class="logo">Sui<b>Foot</b></div>
      <span class="pill">${t('season')} ${G.season}${G.phase === 'seasonEnd' ? '' : ' · ' + t('week') + ' ' + G.week + '/' + CFG.TOTAL_WEEKS}</span>
      ${club ? `<span class="pill">${badge(club, 16)} ${esc(club.name)}</span><span class="pill ${bal < 0 ? 'neg' : ''}">${t('balance')} <b>${money(bal)}</b> SFOOT</span>` : ''}
      <div class="sp"></div>
      ${G.coaches.length > 1 ? `<div class="coachsw">${G.coaches.map((x, i) => `<button class="${i === UI.ci ? 'on' : ''}" data-act="coach:${i}">${esc(x.name)}</button>`).join('')}</div>` : ''}
    </div><nav class="tabs">${tabs.map((k) => `<button class="${UI.tab === k ? 'on' : ''}" data-act="tab:${k}">${t('tab_' + k)}</button>`).join('')}</nav></header>
    <div class="wrap" style="padding-top:14px">${UI.live ? liveShell() : view()}</div>`;
  }
  function view() {
    switch (UI.tab) {
      case 'squad': return squadView();
      case 'league': return leagueView();
      case 'cup': return cupView();
      case 'transfers': return transfersView();
      case 'finance': return financeView();
      case 'coach': return coachView();
      case 'settings': return settingsView();
      default: return UI.G.phase === 'seasonEnd' ? seasonEndView() : homeView();
    }
  }

  // ---------- home ----------
  function nextFixture(c) {
    const G = UI.G;
    if (!c.club) return null;
    const sw = G.sched[G.week - 1];
    const id = c.club, club = G.clubs[id];
    if (sw.t === 'L') { const p = sw.fx[club.div].find((x) => x[0] === id || x[1] === id); return { k: 'L', h: p[0], a: p[1], md: sw.md }; }
    const m = G.cup.matches.find((x) => x.h === id || x.a === id);
    if (m) return { k: 'C', h: m.h, a: m.a, r: G.cup.round };
    return { k: 'C', none: G.cup.byes.includes(id) ? 'bye' : 'out', r: G.cup.round };
  }
  function fixtureCard(c) {
    const f = nextFixture(c), G = UI.G;
    if (!f) return `<div class="card"><h2>${t('next_match')}</h2><p>${t('unemployed')}</p><button class="btn" data-act="sim-week">${t('advance')}</button></div>`;
    let body, canPlay = true;
    if (f.none) { body = `<p>${f.none === 'bye' ? t('bye_cup') : t('cup_out')}</p>`; canPlay = false; }
    else body = `<div class="vs col"><span>${ctag(f.h, 28)}</span><span class="mut sm">vs</span><span>${ctag(f.a, 28)}</span></div><p class="mut" style="text-align:center">${f.k === 'L' ? t('matchday') + ' ' + f.md : t(Game.CUP_KEYS[f.r])} · ${f.h === c.club ? t('home') : t('away')}</p>`;
    return `<div class="card"><h2>${t('next_match')}</h2>${body}<div class="row" style="justify-content:center;margin-top:8px">
      ${canPlay ? `<button class="btn pri" data-act="play-live">${t('play_live')}</button>` : ''}
      <button class="btn" data-act="sim-week">${f.none || true ? t('sim_week') : ''}</button>
      <button class="btn" data-act="sim-season">${t('sim_season')}</button></div></div>`;
  }
  function boardCard(c, club) {
    const b = Math.round(c.board);
    const cls = b < 30 ? 'red' : b < 50 ? 'yel' : '';
    const pos = Game.standings(UI.G, club.div).indexOf(club.id) + 1;
    return `<div class="card"><h2>${t('board')}</h2><div class="bar ${cls}"><i style="width:${b}%"></i></div><div class="row" style="margin-top:6px"><b>${b}%</b><span class="mut">${t('objective')}: ${t('obj_text', { n: club.target })}</span></div>
      <p>${t('standing')}: <b>${pos}</b> · ${divName(club.div)} · ${t('pts')} ${UI.G.table[club.id].pts}</p>
      <p class="sm mut">${t('form')}: ${club.form.map((x) => `<span class="${x === 3 ? 'good' : x === 1 ? 'warn' : 'bad'}">${x === 3 ? t('col_w') : x === 1 ? t('col_d') : t('col_l')}</span>`).join(' ') || '-'}</p></div>`;
  }
  function alertsCard(club) {
    const G = UI.G, sq = Game.players(G, club);
    const inj = sq.filter((p) => p.inj > 0).length, sus = sq.filter((p) => p.sus > 0).length, exp = sq.filter((p) => p.ct <= 1).length;
    const a = [];
    if (inj) a.push(`<span class="bad">${t('al_injured', { n: inj })}</span>`);
    if (sus) a.push(`<span class="warn">${t('al_susp', { n: sus })}</span>`);
    if (exp) a.push(`<span class="warn">${t('al_exp', { n: exp })}</span>`);
    const offers = G.offers.filter((o) => o.coach === co().id).length;
    if (offers) a.push(`<span class="good">${t('tr_offers')}: ${offers}</span>`);
    return `<div class="card"><h2>${t('alerts')}</h2>${a.length ? a.join('<br>') : `<span class="good">${t('al_none')}</span>`}</div>`;
  }
  function lastResultsCard(club) {
    const G = UI.G;
    if (!G.wk || G.wk.s !== G.season) return '';
    const ms = G.wk.matches.filter((m) => m.res && (m.k === 'C' || m.div === club.div));
    if (!ms.length) return '';
    return `<div class="card"><h2>${t('last_results')}</h2>${tbl(['', '>', '', ''], ms.map((m) => `<tr class="${m.h === club.id || m.a === club.id ? 'me' : ''}"><td>${ctag(m.h, 16)}</td><td class="r"><b>${m.res.hg}-${m.res.ag}</b>${m.res.p ? ` <span class="mut sm">(${m.res.p[0]}-${m.res.p[1]} ${t('pens_short')})</span>` : ''}</td><td>${ctag(m.a, 16)}</td></tr>`))}</div>`;
  }
  function newsCard() {
    const G = UI.G, id = co().id;
    const items = G.news.filter((n) => n.c === id || n.c === 0).slice(-25).reverse();
    return `<div class="card wide"><h2>${t('news')}</h2><ul class="news">${items.length ? items.map((n) => `<li><span class="mut sm">${t('season')} ${n.s} · ${t('week')} ${n.w}</span> ${esc(t(n.k, n.p))}</li>`).join('') : `<li class="mut">${t('no_news')}</li>`}</ul></div>`;
  }
  function homeView() {
    const c = co(), club = myClub();
    if (!club) return `<div class="grid"><div class="card wide"><p class="bad"><b>${t('sacked_banner')}</b></p>${offersBlock(c)}<div class="row"><button class="btn" data-act="sim-week">${t('advance')}</button></div></div>${newsCard()}</div>`;
    return `<div class="grid">${fixtureCard(c)}${boardCard(c, club)}${alertsCard(club)}${lastResultsCard(club)}${newsCard()}</div>`;
  }

  // ---------- season end ----------
  function seasonEndView() {
    const G = UI.G, S = G.summary, c = co(), club = myClub();
    const aw = S.awards || [];
    const awLabel = (a) => t('pr_' + a.k) + (a.d != null ? ' · ' + divName(a.d) : '');
    const awWho = (a) => (a.k === 'scorer' ? esc(a.name) + ' (' + t('goals_n', { g: a.g }) + ') · ' : '') + ctag(a.club, 16);
    const order = { league: 0, scorer: 1, promo: 2, cup: 3, cupfinal: 4 };
    const awRows = aw.slice().sort((x, y) => (x.d != null ? x.d : 9) - (y.d != null ? y.d : 9) || order[x.k] - order[y.k]).map((a) => `<tr class="${club && a.club === club.id ? 'me' : ''}"><td>${awLabel(a)}</td><td>${awWho(a)}</td><td class="r good">+${money(a.amt)}</td></tr>`);
    const champs = [];
    const prize = club ? S.prizes[club.id] || 0 : 0;
    let contracts = '';
    if (club) {
      const exp = Game.players(G, club).filter((p) => p.ct <= 1);
      contracts = `<div class="card wide"><h2>${t('se_contracts')}</h2><p class="mut sm">${t('se_warn')}</p>${exp.length ? tbl([t('sq_name'), t('sq_pos'), t('sq_age'), t('sq_ovr'), t('sq_wage'), ''], exp.map((p) => `<tr><td>${esc(p.n)}</td><td>${posTag(p.pos)}</td><td>${p.age}</td><td>${ovTag(p.ovr)}</td><td>${money(p.wage)}</td><td><button class="btn sm" data-act="renew:${p.id}">${t('renew')}</button></td></tr>`)) : `<span class="mut">${t('se_none')}</span>`}</div>`;
    }
    return `<div class="grid"><div class="card wide"><h2>${t('se_title', { s: G.season })}</h2>
      <p>🏆 ${t('cup_winner')}: <b>${ctag(S.cup, 20)}</b> ${S.finalist ? '· ' + ctag(S.finalist, 16) : ''}</p>
      <h3 class="sm mut" style="margin-top:12px">${t('prizes_title')}</h3>${tbl(['', '', '>SFOOT'], awRows)}
      ${club ? `<p>${t('se_prizes', { amt: prize })} SFOOT</p>` : ''}
      <p class="sm">${t('se_promoted')}: ${S.promoted.map((id) => ctag(id, 14)).join(' · ')}</p>
      <p class="sm">${t('se_relegated')}: ${S.relegated.map((id) => ctag(id, 14)).join(' · ')}</p></div>
      ${!club ? `<div class="card wide">${offersBlock(c)}</div>` : ''}${contracts}
      <div class="card wide"><div class="row end"><button class="btn pri" data-act="next-season">${t('next_season')}</button></div></div>${newsCard()}</div>`;
  }

  // ---------- squad ----------
  function lineupNow(c, club) {
    const L = c.lineup;
    if (L.auto) return Game.pickXI(UI.G, club, L.form);
    return { xi: L.xi, bench: L.bench };
  }
  function squadView() {
    const G = UI.G, c = co(), club = myClub();
    if (!club) return `<div class="card">${t('unemployed')}</div>`;
    const L = c.lineup, cur = lineupNow(c, club);
    const sq = Game.players(G, club).sort((a, b) => ['GK', 'DF', 'MF', 'FW'].indexOf(a.pos) - ['GK', 'DF', 'MF', 'FW'].indexOf(b.pos) || b.ovr - a.ovr);
    const role = (p) => (cur.xi.includes(p.id) ? 'xi' : cur.bench.includes(p.id) ? 'bench' : 'out');
    const nxi = sq.filter((p) => role(p) === 'xi').length;
    const rows = sq.map((p) => `<tr>
      <td><select data-chg="role:${p.id}" ${L.auto ? 'disabled' : ''}>${['xi', 'bench', 'out'].map((r) => `<option value="${r}" ${role(p) === r ? 'selected' : ''}>${t('role_' + r)}</option>`).join('')}</select></td>
      <td>${esc(p.n)}${p.listed ? ` <span class="chip">${t('listed')}</span>` : ''}</td><td>${posTag(p.pos)}</td><td>${p.age}</td><td>${ovTag(p.ovr)}</td><td class="mut">${p.age < 28 ? p.pot : '-'}</td>
      <td class="r">${money(p.wage)}</td><td>${t('yr_n', { n: p.ct })}</td><td class="r">${mc(E.value(p))}</td><td>${p.g}/${p.ap}</td><td>${statusOf(p)}</td>
      <td class="act"><button class="btn sm" data-act="${p.listed ? 'unlist' : 'list'}:${p.id}">${p.listed ? t('unlist') : t('list_sale')}</button> <button class="btn sm" data-act="renew:${p.id}">${t('renew')}</button> <button class="btn sm" data-act="sellnow:${p.id}">${t('sell_now')}</button> <button class="btn sm dng" data-act="release:${p.id}">${t('release')}</button></td></tr>`);
    return `<div class="card"><div class="row"><label>${t('formation')} <select data-chg="form">${Object.keys(Game.FORMS).map((f) => `<option ${L.form === f ? 'selected' : ''}>${f}</option>`).join('')}</select></label>
      <label>${t('tactic')} <select data-chg="tactic">${['def', 'bal', 'att'].map((k) => `<option value="${k}" ${L.tactic === k ? 'selected' : ''}>${t('tac_' + k)}</option>`).join('')}</select></label>
      <label><input type="checkbox" data-chg="auto" ${L.auto ? 'checked' : ''}> ${t('auto_pick')}</label>
      <span class="${nxi === 11 ? 'good' : 'warn'}">${t('xi_count', { n: nxi })}</span></div></div>
      <div class="card" style="margin-top:14px">${tbl([t('sq_status').slice(0, 0) + '', t('sq_name'), t('sq_pos'), t('sq_age'), t('sq_ovr'), t('sq_pot'), '>' + t('sq_wage'), t('sq_ct'), '>' + t('sq_val'), t('sq_goals') + '/' + t('sq_apps'), t('sq_status'), ''], rows)}</div>`;
  }
  const mc = (n) => util.money(n, true);

  // ---------- league ----------
  function leagueView() {
    const G = UI.G, club = myClub();
    const div = UI.lgDiv != null ? UI.lgDiv : club ? club.div : 0;
    const sub = ['table', 'results', 'scorers'];
    let body = '';
    if (UI.lg === 'table') {
      const st = Game.standings(G, div);
      body = tbl(['#', t('club'), '>' + t('col_p'), '>' + t('col_w'), '>' + t('col_d'), '>' + t('col_l'), '>' + t('col_gf'), '>' + t('col_ga'), '>' + t('col_gd'), '>' + t('col_pts')], st.map((id, i) => {
        const x = G.table[id];
        return `<tr class="${club && id === club.id ? 'me' : ''} ${div > 0 && i < 2 ? 'up' : ''} ${div < 3 && i >= 10 ? 'dn' : ''}"><td>${i + 1}</td><td>${ctag(id, 18)}</td><td class="r">${x.p}</td><td class="r">${x.w}</td><td class="r">${x.d}</td><td class="r">${x.l}</td><td class="r">${x.gf}</td><td class="r">${x.ga}</td><td class="r">${x.gf - x.ga}</td><td class="r"><b>${x.pts}</b></td></tr>`;
      }));
    } else if (UI.lg === 'results') {
      const last = G.res.length ? Math.max(...G.res.map((r) => r[0])) : 1;
      const md = UI.md || last;
      const rs = G.res.filter((r) => r[0] === md && r[1] === div);
      body = `<div class="row" style="margin-bottom:8px"><button class="btn sm" data-act="md:${Math.max(1, md - 1)}">◀</button><b>${t('matchday')} ${md}</b><button class="btn sm" data-act="md:${Math.min(CFG.LEAGUE_WEEKS, md + 1)}">▶</button></div>` +
        tbl(['', '>', ''], rs.map((r) => `<tr class="${club && (r[2] === club.id || r[3] === club.id) ? 'me' : ''}"><td>${ctag(r[2], 16)}</td><td class="r"><b>${r[4]}-${r[5]}</b></td><td>${ctag(r[3], 16)}</td></tr>`));
    } else {
      body = tbl(['#', t('sq_name'), t('club'), '>' + t('sq_goals')], Game.topScorers(G, div, 15).map((p, i) => `<tr><td>${i + 1}</td><td>${esc(p.n)}</td><td>${ctag(p.club, 16)}</td><td class="r"><b>${p.g}</b></td></tr>`));
    }
    return `<div class="row" style="margin-bottom:10px"><select data-chg="lgdiv">${[0, 1, 2, 3].map((d) => `<option value="${d}" ${d === div ? 'selected' : ''}>${divName(d)}</option>`).join('')}</select>
      <div class="sub" style="margin:0">${sub.map((k) => `<button class="${UI.lg === k ? 'on' : ''}" data-act="lg:${k}">${t('lg_' + (k === 'table' ? 'table' : k === 'results' ? 'results' : 'scorers'))}</button>`).join('')}</div></div><div class="card">${body}</div>`;
  }

  // ---------- cup ----------
  function cupView() {
    const G = UI.G, c = G.cup, club = myClub();
    let h = `<div class="card"><h2>${t('cup')}</h2><p class="mut">${t('cup_alive', { n: c.alive.length })}${c.winner ? ' · 🏆 ' + esc(cname(c.winner)) : ''}</p>`;
    for (const rd of c.hist) {
      h += `<h3 class="sm" style="margin-top:12px">${t(Game.CUP_KEYS[rd.r])}</h3>` + tbl(['', '>', ''], rd.ms.map((m) => `<tr class="${club && (m.h === club.id || m.a === club.id) ? 'me' : ''}"><td>${ctag(m.h, 16)}</td><td class="r"><b>${m.hg}-${m.ag}</b>${m.p ? ` <span class="mut sm">(${m.p[0]}-${m.p[1]} ${t('pens_short')})</span>` : m.et ? ` <span class="mut sm">${t('aet')}</span>` : ''}</td><td>${ctag(m.a, 16)}</td></tr>`));
    }
    if (c.round < 6) {
      h += `<h3 class="sm" style="margin-top:12px">${t('cup_next')}: ${t(Game.CUP_KEYS[c.round])}</h3>`;
      if (c.drawn === c.round) h += tbl(['', ''], c.matches.map((m) => `<tr class="${club && (m.h === club.id || m.a === club.id) ? 'me' : ''}"><td>${ctag(m.h, 16)}</td><td>${ctag(m.a, 16)}</td></tr>`));
    }
    return h + '</div>';
  }

  // ---------- transfers ----------
  function transfersView() {
    const G = UI.G, c = co(), club = myClub();
    if (!club) return `<div class="card">${t('unemployed')}</div>`;
    const sub = ['market', 'free', 'offers'];
    const subBar = `<div class="sub">${sub.map((k) => `<button class="${UI.tr === k ? 'on' : ''}" data-act="tr:${k}">${t(k === 'market' ? 'tr_market' : k === 'free' ? 'tr_free' : 'tr_offers')}</button>`).join('')}</div>`;
    if (UI.tr === 'offers') {
      const mine = G.offers.filter((o) => o.coach === c.id);
      return subBar + `<div class="card">${mine.length ? tbl([t('sq_name'), t('sq_pos'), t('age'), t('sq_ovr'), t('sq_pot'), t('market_value'), t('club'), '>' + t('offer_label'), '', ''], mine.map((o) => {
        const p = G.players[o.pid], val = E.value(p), pct = Math.round((o.fee / val - 1) * 100);
        return `<tr><td>${esc(p.n)}</td><td>${posTag(p.pos)}</td><td>${p.age}</td><td>${ovTag(p.ovr)}</td><td class="mut">${p.age < 28 ? p.pot : '-'}</td><td class="r">${money(val)}</td><td>${ctag(o.club, 16)}</td><td class="r"><b>${money(o.fee)}</b></td><td class="${pct >= 0 ? 'good' : 'bad'}">${pct >= 0 ? '+' : ''}${pct}% ${t('vs_value')}</td><td><button class="btn sm grn" data-act="oacc:${o.id}">${t('accept')}</button> <button class="btn sm" data-act="odec:${o.id}">${t('decline')}</button></td></tr>`;
      })) : `<span class="mut">${t('no_offers')}</span>`}</div>`;
    }
    const F = UI.f, free = UI.tr === 'free';
    const list = A.search(G, c, { free, pos: F.pos, minOvr: +F.minOvr || 0, maxAge: +F.maxAge || 0, maxPrice: +F.maxPrice || 0, div: F.div, sort: F.sort, limit: 60 });
    const filters = `<div class="card" style="margin-bottom:14px"><div class="row">
      <label>${t('filter_pos')} <select data-chg="f:pos"><option value="">${t('any')}</option>${['GK', 'DF', 'MF', 'FW'].map((p) => `<option value="${p}" ${F.pos === p ? 'selected' : ''}>${t('pos_' + p)}</option>`).join('')}</select></label>
      <label>${t('min_ovr')} <input type="number" style="width:70px" value="${F.minOvr}" data-chg="f:minOvr"></label>
      <label>${t('max_age')} <input type="number" style="width:70px" value="${F.maxAge}" data-chg="f:maxAge"></label>
      ${free ? '' : `<label>${t('max_price')} <input type="number" style="width:110px" value="${F.maxPrice}" data-chg="f:maxPrice"></label>
      <label>${t('div_n', { n: '' })} <select data-chg="f:div"><option value="">${t('any')}</option>${[0, 1, 2, 3].map((d) => `<option value="${d}" ${String(F.div) === String(d) ? 'selected' : ''}>${d + 1}</option>`).join('')}</select></label>`}
      ${free ? '' : `<button class="btn sm" data-act="afford">${t('afford')}</button>`}
      <label>${t('sort_by')} <select data-chg="f:sort"><option value="ovr">${t('sort_ovr')}</option><option value="pot" ${F.sort === 'pot' ? 'selected' : ''}>${t('sort_pot')}</option></select></label></div></div>`;
    const head = [t('sq_name'), t('sq_pos'), t('sq_age'), t('sq_ovr'), t('sq_pot'), free ? '>' + t('sq_wage') : t('club'), '>' + (free ? t('cost') : t('asking_price')), ''];
    const rows = list.map((p) => `<tr><td>${esc(p.n)}</td><td>${posTag(p.pos)}</td><td>${p.age}</td><td>${ovTag(p.ovr)}</td><td class="mut">${p.age < 28 ? p.pot : '-'}</td>
      <td>${free ? money(E.wageFor(p.ovr)) : ctag(p.club, 16)}</td><td class="r">${free ? money(E.wageFor(p.ovr) * 3) : money(A.askPrice(G, c, p))}</td>
      <td><button class="btn sm pri" data-act="${free ? 'sign' : 'buy'}:${p.id}">${free ? t('sign') : t('buy')}</button></td></tr>`);
    return subBar + filters + `<div class="card">${list.length ? tbl(head, rows) : `<span class="mut">${t('nothing_found')}</span>`}</div>`;
  }

  // ---------- finance ----------
  function financeView() {
    const G = UI.G, c = co(), club = myClub();
    if (!club) return `<div class="card">${t('unemployed')}</div>`;
    const sf = G.bank.sf[club.id] || {};
    const inc = [], exp = [];
    let ti = 0, te = 0;
    for (const k in sf) { if (sf[k] > 0) { inc.push([k, sf[k]]); ti += sf[k]; } else if (sf[k] < 0) { exp.push([k, -sf[k]]); te += -sf[k]; } }
    inc.sort((a, b) => b[1] - a[1]); exp.sort((a, b) => b[1] - a[1]);
    const kl = (k) => (SF.I18N.D['k_' + k] ? t('k_' + k) : k);
    const led = (G.bank.led[club.id] || []).slice(-12).reverse();
    const att = Game.attendance(club);
    const loans = G.bank.loans.filter((l) => l.club === club.id);
    const lim = B.creditLimit(G, club.id);
    const step = A.expandStep(club);
    const steps = [1, 2, 3].map((n) => `<button class="btn sm" data-act="expand:${n}" ${club.build ? 'disabled' : ''}>${t('expand_n', { n: n * step })} · ${mc(A.stadiumCost(G, club, n))}</button>`).join(' ');
    const fac = (k) => { const l = club.facility[k]; return `<div class="row"><span style="min-width:150px">${t('fac_' + k)}</span><span>${t('level')} ${l}/5</span>${l < 5 ? `<button class="btn sm" data-act="fac:${k}">${t('upgrade')} · ${mc(A.facilityCost(club, k))}</button>` : ''}</div>`; };
    return `<div class="grid">
      <div class="card"><h2>${t('fin_summary')}</h2><div class="big ${B.bal(G, club.id) < 0 ? 'bad' : 'good'}">${money(B.bal(G, club.id))} SFOOT</div>
        <h3 class="sm mut">${t('fin_income')}: ${money(ti)}</h3>${inc.map(([k, v]) => `<div class="row sm"><span style="flex:1">${kl(k)}</span><span class="good">+${money(v)}</span></div>`).join('')}
        <h3 class="sm mut" style="margin-top:10px">${t('fin_expenses')}: ${money(te)}</h3>${exp.map(([k, v]) => `<div class="row sm"><span style="flex:1">${kl(k)}</span><span class="bad">-${money(v)}</span></div>`).join('')}</div>
      <div class="card"><h2>${t('stadium')}</h2><p>${t('capacity')}: <b>${money(club.cap)}</b> · ${t('exp_attendance')}: <b>${money(att)}</b></p>
        <div class="row"><span>${t('ticket_price')}:</span><button class="btn sm" data-act="price:-0.1">−</button><b>${club.price.toFixed(1)}</b><button class="btn sm" data-act="price:0.1">+</button></div>
        <p>${club.build ? `<span class="warn">${t('building', { seats: club.build.seats, left: club.build.left })}</span>` : steps}</p>
        <h2 style="margin-top:14px">${t('facilities')}</h2>${fac('youth')}${fac('train')}</div>
      <div class="card"><h2>${t('loans')}</h2><p class="mut">${t('credit_limit')}: ${money(lim)}</p>
        ${loans.length ? tbl(['', '>' + t('loan_weekly'), '>' + t('loan_total'), ''], loans.map((l) => `<tr><td>#${l.id}</td><td class="r">${money(l.weekly)}</td><td class="r">${money(l.due)}</td><td><button class="btn sm" data-act="repay:${l.id}">${t('repay_early')} · ${mc(B.earlyRepayCost(l))}</button></td></tr>`)) : `<p class="mut">${t('no_loans')}</p>`}
        <button class="btn" data-act="loan" ${lim <= 0 ? 'disabled' : ''}>${t('take_loan')}</button></div>
      <div class="card"><h2>${t('ledger')}</h2>${tbl(['', '', '>'], led.map((e) => `<tr><td class="mut sm">${e[0]}·${e[1]}</td><td>${kl(e[2])}</td><td class="r ${e[3] >= 0 ? 'good' : 'bad'}">${e[3] >= 0 ? '+' : ''}${money(e[3])}</td></tr>`))}</div>
      <div class="card wide"><h2>${t('token_title')}</h2><p>${t('token_note')}</p><p class="mut sm">${t('supply')}: ${money(B.supply(G))} SFOOT</p></div></div>`;
  }

  // ---------- coach ----------
  function offersBlock(c) {
    return `<h2>${t('job_offers')}</h2>` + (c.offers.length ? tbl(['', t('strength'), ''], c.offers.map((o) => { const cl = UI.G.clubs[o.club]; return `<tr><td>${ctag(o.club, 20)}<div class="mut sm">${divName(cl.div)}</div></td><td>${Math.round(Game.strength(UI.G, cl) * 10) / 10}</td><td><button class="btn sm" data-act="jobview:${o.id}">${t('view_club')}</button> <button class="btn sm pri" data-act="job:${o.id}">${t('take_job')}</button> <button class="btn sm" data-act="jobdec:${o.id}">${t('decline')}</button></td></tr>`; })) : `<p class="mut">${t('no_job_offers')}</p>`);
  }
  function clubInfo(id) {
    const G = UI.G, cl = G.clubs[id];
    const st = Game.standings(G, cl.div), pos = st.indexOf(id) + 1, tb = G.table[id];
    const best = Game.players(G, cl).sort((a, b) => b.ovr - a.ovr).slice(0, 5);
    const last = cl.hist.length ? cl.hist[cl.hist.length - 1] : null;
    return `<div class="sm"><p>${divName(cl.div)} · ${t('standing')}: <b>${pos}</b>/12 · ${t('pts')} ${tb.pts} (${tb.w}-${tb.d}-${tb.l})</p>
      <p>${t('club_balance')}: <b>${money(B.bal(G, id))}</b> SFOOT · ${t('strength')}: ${Math.round(Game.strength(G, cl) * 10) / 10}</p>
      <p>${t('capacity')}: ${money(cl.cap)} · ${t('club_fans')}: ${money(cl.fans)} · ${t('club_titles')}: ${cl.title} / ${cl.cups}</p>
      ${last ? `<p>${t('club_last')}: ${divName(last.d)}, #${last.pos}</p>` : ''}
      <p>${t('objective')}: ${t('obj_text', { n: cl.target })}</p>
      <div class="mut">${t('club_best')}</div>${best.map((p) => `<div>${posTag(p.pos)} ${esc(p.n)} ${ovTag(p.ovr)} <span class="mut">${p.age}</span></div>`).join('')}</div>`;
  }
  function jobDialog(o, expanded) {
    const cl = UI.G.clubs[o.club];
    $('#modal').innerHTML = `<div class="ovl"><div class="dlg"><h3>${badge(cl, 30)} ${esc(t('job_invite', { club: cl.name }))}</h3>
      <p class="mut sm">${divName(cl.div)} · ${t('strength')} ${Math.round(Game.strength(UI.G, cl) * 10) / 10}</p>${expanded ? clubInfo(o.club) : ''}
      <div class="row end">${expanded ? '' : `<button class="btn" data-act="jobview:${o.id}">${t('view_club')}</button>`}<button class="btn" data-act="m-cancel">${t('later')}</button><button class="btn" data-act="jobdec:${o.id}">${t('decline')}</button><button class="btn pri" data-act="job:${o.id}">${t('take_job')}</button></div></div></div>`;
  }
  function maybeJobPopup() {
    if (!UI.G || UI.live || $('#modal').innerHTML) return;
    const o = co().offers.find((x) => !x.seen);
    if (!o) return;
    o.seen = 1; save();
    jobDialog(o, false);
  }
  function coachView() {
    const G = UI.G, c = co(), club = myClub();
    const lvl = Game.level(c.xp), pts = Game.freePoints(c);
    const cur = 60 * (lvl - 1) * (lvl - 1), nxt = 60 * lvl * lvl;
    const pct = Math.round(((c.xp - cur) / (nxt - cur)) * 100);
    const sk = ['train', 'tact', 'neg', 'youth'].map((k) => `<div class="row"><span style="min-width:140px"><b>${t('sk_' + k)}</b><div class="mut sm">${t('sk_' + k + '_d')}</div></span><span>${'●'.repeat(c.sk[k])}${'○'.repeat(5 - c.sk[k])}</span><button class="btn sm" data-act="skill:${k}" ${pts < 1 || c.sk[k] >= 5 ? 'disabled' : ''}>+</button></div>`).join('');
    const trophies = c.trophies.map((x) => `🏆 ${esc(cname(x.club))} · ${t('season')} ${x.s} · ${x.k === 'league' ? t('champion') + ' ' + divName(x.d) : t('cup_winner')}`);
    const hall = G.hall.slice().reverse().slice(0, 15).map((h) => `<tr><td>${h.s}</td><td>${h.champ.map((id) => ctag(id, 14)).join('<br>')}</td><td>${h.cup ? ctag(h.cup, 14) : '-'}</td></tr>`);
    return `<div class="grid"><div class="card"><h2>${esc(c.name)}</h2><p>${club ? ctag(club.id, 22) : '<span class="bad">—</span>'}</p>
        <p>${t('reputation')}: <b>${c.rep}</b>/100 · ${t('coach_level')}: <b>${lvl}</b></p><div class="bar"><i style="width:${Math.max(0, Math.min(100, pct))}%"></i></div><p class="mut sm">${t('xp')} ${c.xp} · ${t('skill_points', { n: pts })}</p>${sk}
        <p class="mut sm">${t('sacked_count', { n: c.sacked })}</p>${club ? `<button class="btn dng" data-act="resign">${t('resign')}</button>` : ''}</div>
      <div class="card">${offersBlock(c)}</div>
      <div class="card"><h2>${t('trophies')}</h2>${trophies.length ? trophies.map((x) => `<div>${x}</div>`).join('') : `<span class="mut">${t('no_trophies')}</span>`}
        <h2 style="margin-top:14px">${t('career')}</h2>${c.hist.length ? tbl([t('season'), t('club'), '>#'], c.hist.slice().reverse().map((h) => `<tr><td>${h.s}</td><td>${ctag(h.club, 14)} <span class="mut sm">${divName(h.d)}</span></td><td class="r">${h.pos}</td></tr>`)) : `<span class="mut">-</span>`}</div>
      <div class="card"><h2>${t('hall')}</h2>${hall.length ? tbl([t('season'), t('champion'), t('cup')], hall) : `<span class="mut">-</span>`}</div></div>`;
  }

  // ---------- settings ----------
  function settingsView() {
    return `<div class="grid"><div class="card"><h2>${t('language')}</h2><select data-chg="lang">${SF.I18N.LANGS.map(([k, n]) => `<option value="${k}" ${SF.I18N.get() === k ? 'selected' : ''}>${n}</option>`).join('')}</select>
      <div class="row" style="margin-top:14px"><button class="btn pri" data-act="save">${t('save')}</button><button class="btn" data-act="export">${t('export')}</button>
      <label class="btn">${t('import')}<input type="file" accept=".json,application/json" data-chg="import" hidden></label>
      <button class="btn dng" data-act="newgame">${t('new_game')}</button></div></div>
      <div class="card"><h2>${t('about_title')}</h2><p>${t('about_text')}</p><p class="mut sm">${t('roadmap')}</p><p class="mut sm">${t('fictional_note')}</p></div></div>`;
  }

  // ---------- week flow ----------
  function playWeek(live) {
    const G = UI.G, c = co();
    if (G.phase !== 'play') return;
    const wk = Game.beginWeek(G);
    const mine = live && c.club ? wk.matches.find((m) => m.h === c.club || m.a === c.club) : null;
    for (const m of wk.matches) if (m !== mine) Game.simMatch(G, m);
    if (mine) {
      const mt = Game.buildMatch(G, mine);
      const mySide = mine.h === c.club ? mt.h : mt.a;
      mySide.auto = false;
      UI.live = { m: mine, mt, side: mine.h === c.club ? 'h' : 'a', log: [], paused: true, speed: 1, timer: null, over: false };
      render();
      return;
    }
    finishWeek();
  }
  function finishWeek() {
    Game.endWeek(UI.G);
    save();
    UI.tab = 'home';
    render();
  }
  function simSeason() {
    const G = UI.G;
    let g = 0;
    while (G.phase === 'play' && g++ < 40) Game.playWeekAuto(G);
    save(); UI.tab = 'home'; render();
  }

  // ---------- live match ----------
  const SPEEDS = [260, 110, 35];
  function name(id) { const p = UI.G.players[id]; return p ? p.n : '?'; }
  function evLine(e) {
    const a = e.pid2 ? name(e.pid2) : '';
    switch (e.t) {
      case 'goal': return `<div class="g">⚽ ${e.min}' ${esc(t('ev_goal', { name: name(e.pid) }))}${a ? ' <span class="mut">(' + esc(t('ev_assist', { name: a })) + ')</span>' : ''}</div>`;
      case 'red': return `<div class="r">🟥 ${e.min}' ${esc(t('ev_red', { name: name(e.pid) }))}</div>`;
      case 'inj': return `<div class="i">🩹 ${e.min}' ${esc(t('ev_inj', { name: name(e.pid) }))}</div>`;
      case 'sub': return `<div class="s">🔁 ${e.min}' ${esc(t('ev_sub', { in: name(e.pid), out: name(e.pid2) }))}</div>`;
      case 'et': return `<div class="s">⏱ ${t('ev_et')}</div>`;
      case 'pens': return `<div class="s">🥅 ${t('ev_pens', { h: e.h, a: e.a })}</div>`;
      default: return '';
    }
  }
  function liveShell() { return '<div class="live" id="live"></div>'; }
  function liveTickRender() {
    const L = UI.live, el = $('#live');
    if (!el) return;
    const mt = L.mt, G = UI.G, mine = L.side === 'h' ? mt.h : mt.a;
    const hc = G.clubs[L.m.h], ac = G.clubs[L.m.a];
    const lab = mt.done ? (mt.pens ? t('pens') : mt.et ? t('et') : t('ft')) : mt.et ? t('et') + ' ' + mt.min + "'" : mt.min + "'";
    const xi = (s) => s.xi.map((p) => `<div class="sm">${posTag(p.pos)} ${esc(p.n)} ${ovTag(p.ovr)}</div>`).join('');
    const bench = mine.bench.map((p) => `<option value="${p.id}">${t('pos_' + p.pos)} ${esc(p.n)} (${p.ovr})</option>`).join('');
    const out = mine.xi.map((p) => `<option value="${p.id}">${t('pos_' + p.pos)} ${esc(p.n)} (${p.ovr})</option>`).join('');
    const sum = mt.summary();
    el.innerHTML = `<div class="card"><div class="vs"><span>${badge(hc, 34)} ${esc(hc.name)}</span><span class="score">${mt.h.goals} - ${mt.a.goals}</span><span>${badge(ac, 34)} ${esc(ac.name)}</span></div>
      <p style="text-align:center" class="mut">${lab}${mt.pens ? ` · ${mt.pens.h}-${mt.pens.a} ${t('pens_short')}` : ''} · ${t('shots')} ${sum.hs}-${sum.as} · ${t('possession')} ${sum.hp}%-${100 - sum.hp}%</p>
      <div class="row" style="justify-content:center">${L.over ? `<button class="btn pri" data-act="live-continue">${t('continue_btn')}</button>` : `<button class="btn pri" data-act="live-toggle">${L.paused ? t('resume') : t('pause')}</button>
        <button class="btn" data-act="live-speed">${t('speed')} ×${L.speed}</button><button class="btn" data-act="live-skip">${t('skip_end')}</button>`}</div></div>
      <div class="grid" style="margin-top:14px"><div class="card"><div class="log" id="log">${L.log.join('')}</div></div>
      <div class="card"><div class="row"><label>${t('tactic')} <select data-chg="live-tac" ${L.over ? 'disabled' : ''}>${['def', 'bal', 'att'].map((k) => `<option value="${k}" ${mine.tactic === k ? 'selected' : ''}>${t('tac_' + k)}</option>`).join('')}</select></label></div>
        ${L.paused && !L.over ? `<p class="sm mut">${t('subs_left', { n: 3 - mine.subs })}</p><div class="row"><select id="sub-out">${out}</select><span>→</span><select id="sub-in">${bench}</select><button class="btn sm" data-act="live-sub" ${mine.subs >= 3 ? 'disabled' : ''}>${t('make_sub')}</button></div>` : ''}
        <h3 class="sm mut" style="margin-top:10px">${esc(L.side === 'h' ? hc.name : ac.name)}</h3>${xi(mine)}</div></div>`;
    const lg = $('#log'); if (lg) lg.scrollTop = lg.scrollHeight;
  }
  function liveTick() {
    const L = UI.live;
    if (!L || L.paused || L.over) return;
    const evs = L.mt.step();
    for (const e of evs) { const l = evLine(e); if (l) L.log.push(l); }
    if (L.mt.done) { L.over = true; L.paused = true; clearInterval(L.timer); }
    liveTickRender();
  }
  function liveStartTimer() {
    const L = UI.live;
    clearInterval(L.timer);
    L.timer = setInterval(liveTick, SPEEDS[(L.speed === 1 ? 0 : L.speed === 2 ? 1 : 2)]);
  }
  function liveSkip() {
    const L = UI.live;
    clearInterval(L.timer);
    let g = 0;
    while (!L.mt.done && g++ < 400) { for (const e of L.mt.step()) { const l = evLine(e); if (l) L.log.push(l); } }
    L.over = true; L.paused = true; liveTickRender();
  }
  function liveContinue() {
    const L = UI.live;
    clearInterval(L.timer);
    Game.simMatch(UI.G, L.m, L.mt);
    UI.live = null;
    finishWeek();
  }

  // ---------- events ----------
  function onChange(e) {
    const el = e.target, k = el.dataset.chg;
    if (!k) return;
    const G = UI.G;
    if (k === 'lang') { SF.I18N.set(el.value); localStorage.setItem(LANGK, el.value); return render(); }
    if (k === 'setup-n') { const S = UI.setup; for (let i = 0; i < S.n; i++) { S.names[i] = $('#sn' + i).value; S.clubs[i] = $('#sc' + i).value; } S.n = +el.value; return render(); }
    if (k === 'import') {
      const f = el.files[0]; if (!f) return;
      const r = new FileReader();
      r.onload = () => { try { const g = Game.deserialize(r.result); if (!g.clubs || !g.coaches) throw new Error('bad'); UI.G = g; UI.ci = 0; UI.live = null; save(); render(); } catch (err) { toast(t('import_bad'), true); } };
      r.readAsText(f); return;
    }
    if (k === 'lgdiv') { UI.lgDiv = +el.value; return render(); }
    if (k.startsWith('f:')) { UI.f[k.slice(2)] = el.value; return render(); }
    if (k === 'live-tac') { const L = UI.live; L.mt.setTactic(L.side, el.value); return; }
    const c = co();
    if (k === 'form') { A.setLineup(G, c, { form: el.value }); save(); return render(); }
    if (k === 'tactic') { A.setLineup(G, c, { tactic: el.value }); save(); return render(); }
    if (k === 'auto') {
      const club = myClub();
      if (!el.checked) { const cur = lineupNow(c, club); A.setLineup(G, c, { auto: false, xi: cur.xi, bench: cur.bench }); } else A.setLineup(G, c, { auto: true });
      save(); return render();
    }
    if (k.startsWith('role:')) {
      const id = +k.slice(5), L = c.lineup;
      let xi = L.xi.filter((x) => x !== id), bench = L.bench.filter((x) => x !== id);
      if (el.value === 'xi') xi.push(id); else if (el.value === 'bench') bench.push(id);
      L.xi = xi; L.bench = bench.slice(0, 7);
      save(); return render();
    }
  }

  function onClick(e) {
    const el = e.target.closest('[data-act]');
    if (!el) return;
    const [act, arg] = el.dataset.act.split(':');
    const G = UI.G;
    if (act === 'm-cancel') return closeModal();
    if (act === 'm-ok') { const r = UI.mok ? UI.mok(readModal()) : true; if (r !== false) closeModal(); return; }
    if (act === 'setup-start') return setupStart();
    if (act === 'continue') { try { UI.G = Game.deserialize(localStorage.getItem(SAVE)); render(); } catch (err) { toast(t('import_bad'), true); } return; }
    if (!G) return;
    const c = co();
    switch (act) {
      case 'tab': UI.tab = arg; return render();
      case 'coach': UI.ci = +arg; UI.tab = 'home'; return render();
      case 'tr': UI.tr = arg; return render();
      case 'lg': UI.lg = arg; return render();
      case 'md': UI.md = +arg; return render();
      case 'afford': UI.f.maxPrice = String(Math.max(0, Math.floor(B.bal(G, myClub().id)))); return render();
      case 'play-live': return playWeek(true);
      case 'sim-week': return playWeek(false);
      case 'sim-season': return simSeason();
      case 'next-season': Game.newSeason(G); save(); UI.tab = 'home'; return render();
      case 'live-toggle': { const L = UI.live; L.paused = !L.paused; if (!L.paused) liveStartTimer(); else clearInterval(L.timer); return liveTickRender(); }
      case 'live-speed': { const L = UI.live; L.speed = L.speed === 1 ? 2 : L.speed === 2 ? 4 : 1; if (!L.paused) liveStartTimer(); return liveTickRender(); }
      case 'live-skip': return liveSkip();
      case 'live-continue': return liveContinue();
      case 'live-sub': { const L = UI.live; const o = +$('#sub-out').value, i = +$('#sub-in').value; if (!i || !o) return; L.mt.sub(L.side, o, i); for (const ev of L.mt.events.slice(-1)) { const l = evLine(ev); if (l) L.log.push(l); } return liveTickRender(); }
      case 'save': save(); return toast(t('saved'));
      case 'export': { const b = new Blob([Game.serialize(G)], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = `suifoot-s${G.season}-w${G.week}.json`; a.click(); return; }
      case 'newgame': return modal(`<p>${t('set_newgame')}</p>`, () => { localStorage.removeItem(SAVE); UI.G = null; UI.setup = null; render(); });
      case 'skill': return res(A.spendSkill(G, c, arg));
      case 'job': closeModal(); return res(A.acceptJob(G, c, +arg));
      case 'jobdec': closeModal(); return res(A.declineJob(G, c, +arg));
      case 'jobview': { const o = c.offers.find((x) => x.id === +arg); if (o) jobDialog(o, true); return; }
      case 'resign': return modal(`<p>${t('resign_confirm')}</p>`, () => { res(A.resign(G, c)); });
      case 'oacc': { const r = A.acceptOffer(G, c, +arg); return res(r, r.ok ? t('ok_sold', { fee: r.fee }) : ''); }
      case 'odec': return res(A.declineOffer(G, c, +arg));
      case 'price': return res(A.setPrice(G, c, myClub().price + parseFloat(arg)));
      case 'expand': return res(A.expandStadium(G, c, +arg), t('ok_done'));
      case 'fac': return res(A.upgradeFacility(G, c, arg), t('ok_done'));
      case 'repay': return res(A.repayLoan(G, c, +arg), t('ok_done'));
      case 'loan': {
        const lim = B.creditLimit(G, myClub().id);
        return modal(`<h3>${t('take_loan')}</h3><label>${t('loan_amount')} (≤ ${money(lim)})</label><input name="amt" type="number" value="${Math.round(lim / 2 / 1000) * 1000}"><label>${t('loan_seasons')}</label><select name="seasons"><option>1</option><option>2</option><option>3</option></select><p class="mut sm">+${Math.round(CFG.loanRate * 100)}% / ${t('season')}</p>`, (f) => res(A.takeLoan(G, c, +f.amt, +f.seasons), t('ok_done')));
      }
      case 'list': {
        const p = G.players[+arg];
        return modal(`<h3>${esc(p.n)}</h3><label>${t('list_price_q')}</label><input name="price" type="number" value="${Math.round(E.value(p) * 1.05 / 100) * 100}">`, (f) => res(A.listPlayer(G, c, p.id, +f.price), t('ok_done')));
      }
      case 'unlist': return res(A.listPlayer(G, c, +arg, 0));
      case 'sellnow': {
        const p = G.players[+arg];
        const price = Math.round((E.value(p) * 0.65 * (1 + 0.015 * c.sk.neg)) / 100) * 100;
        return modal(`<h3>${esc(p.n)}</h3><p>${t('sell_now')}: <b>${money(price)}</b> SFOOT</p>`, () => { res(A.sellNow(G, c, p.id), t('ok_sold', { fee: price })); });
      }
      case 'release': {
        const p = G.players[+arg];
        return modal(`<h3>${esc(p.n)}</h3><p>${t('release')}: ${t('cost')} <b>${money(A.releaseCost(p))}</b> SFOOT</p>`, () => { res(A.release(G, c, p.id)); });
      }
      case 'renew': {
        const p = G.players[+arg];
        return modal(`<h3>${esc(p.n)}</h3><label>${t('renew_years')}</label><select name="y"><option>1</option><option selected>2</option><option>3</option><option>4</option></select><p class="mut sm">${t('sq_wage')}: ${money(Math.round(E.wageFor(p.ovr) / 10) * 10)}</p>`, (f) => res(A.renew(G, c, p.id, +f.y), t('ok_done')));
      }
      case 'buy': {
        const p = G.players[+arg], ask = A.askPrice(G, c, p);
        return modal(`<h3>${esc(p.n)} ${posTag(p.pos)} ${ovTag(p.ovr)}</h3><p class="mut">${ctag(p.club, 16)} · ${t('asking_price')}: ${money(ask)}</p><label>${t('offer_fee')}</label><input name="fee" type="number" value="${ask}">`, (f) => {
          const r = A.buy(G, c, p.id, +f.fee);
          if (r.ok) { toast(t('ok_bought', { name: p.n, fee: r.fee })); save(); render(); return true; }
          toast(errMsg(r), true); return false;
        }, t('send_offer'));
      }
      case 'sign': { const p = G.players[+arg]; const r = A.signFree(G, c, p.id); return res(r, r.ok ? t('ok_bought', { name: p.n, fee: r.cost }) : ''); }
    }
  }

  window.addEventListener('DOMContentLoaded', init);
})();
