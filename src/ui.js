/* SuiFoot UI: renders everything from the game state, no framework. */
(function () {
  const SF = globalThis.SF;
  const { Game, Actions: A, Bank: B, Econ: E, CFG, util, R } = SF;
  const t = (k, p) => SF.I18N.t(k, p);
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = (n) => util.money(n);
  const SAVE = 'suifoot.save.v1', LANGK = 'suifoot.lang';

  const UI = (SF.UI = { G: null, tab: 'home', ci: 0, tr: 'market', eu: 'groups', lg: 'table', lgDiv: null, md: null, live: null, f: { pos: '', minOvr: 50, maxAge: '', maxPrice: '', div: '', sort: 'ovr' }, setup: null, mok: null });

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
  const hueOf = (club) => { const m = club && /hsl\((\d+)/.exec(club.c1); return m ? +m[1] : 215; };
  const starTag = (p) => (E.isStar(p) ? `<span class="star" title="${t('star_label')}">★</span> ` : '');
  const loanTag = (p) => (p.loan ? ` <span class="chip loan">${t('on_loan')}</span>` : '');
  const THEMEK = 'suifoot.theme';
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
    document.documentElement.setAttribute('data-theme', localStorage.getItem(THEMEK) || 'light');
    document.documentElement.style.setProperty('--h', UI.G && UI.G.coaches.length && myClub() ? hueOf(myClub()) : 215);
    document.documentElement.lang = SF.I18N.get() === 'pt' ? 'pt-BR' : SF.I18N.get();
    $('#app').innerHTML = UI.G ? (UI.G.over ? overView() : gameView()) : setupView();
    if (UI.live && UI.G) liveTickRender();
    popups();
    drainToasts();
  }
  function popups() { if (UI.G && UI.G.over) return; maybeCelebrate(); maybeJobPopup(); maybeVacReport(); }

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
        ${bonusOpt()}
        <div class="row end"><button class="btn pri" data-act="setup-start">${t('start')}</button></div>
        <p class="mut sm">${t('fictional_note')}</p></div>
        <div class="card"><h2>${t('about_title')}</h2><p>${t('about_text')}</p><p class="mut sm">${t('roadmap')}</p>
        ${has ? `<button class="btn" data-act="continue">${t('continue')}</button>` : ''}
        <label class="btn" style="display:inline-block">${t('import')}<input type="file" accept=".json,application/json" data-chg="import" hidden></label></div>${legendsCard()}</div></div>`;
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
    let bonus;
    if ($('#usebonus') && $('#usebonus').checked) { const L = legends(), l = L.slice().reverse().find((x) => !x.used); if (l) { bonus = X.bonusFor(l.legacy); l.used = 1; saveLegends(L); } }
    UI.G = Game.newGame({ seed: S.seed, coaches, bonus });
    UI.setup = null; UI.ci = 0; UI.tab = 'home'; UI.live = null;
    save(); render();
  }

  // ---------- main frame ----------
  function gameView() {
    const G = UI.G, c = co(), club = myClub();
    const tabs = ['home', 'squad', 'league', 'cup', 'europe', 'transfers', 'finance', 'coach', 'settings'];
    const bal = club ? B.bal(G, club.id) : 0;
    return `<header class="top"><div class="in"><div class="logo">Sui<b>Foot</b></div>
      <span class="pill">${t('season')} ${G.season}${G.phase === 'seasonEnd' ? '' : ' · ' + t('week') + ' ' + G.week + '/' + G.sched.length}</span>
      ${club ? `<span class="pill">${badge(club, 16)} ${esc(club.name)}</span><span class="pill ${bal < 0 ? 'neg' : ''}">${t('balance')} <b>${money(bal)}</b> SFOOT</span>${c.vac > 0 ? `<span class="pill vac">🏖 ${t('vac_pill', { n: c.vac })}</span>` : ''}` : ''}
      <div class="sp"></div><button class="sndbtn" data-act="snd" title="${t('sound_label')}">${SF.Fx.soundOn() ? '🔊' : '🔇'}</button>
      ${G.coaches.length > 1 ? `<div class="coachsw">${G.coaches.map((x, i) => `<button class="${i === UI.ci ? 'on' : ''}" data-act="coach:${i}">${esc(x.name)}</button>`).join('')}</div>` : ''}
    </div><nav class="tabs">${tabs.map((k) => `<button class="${UI.tab === k ? 'on' : ''}" data-act="tab:${k}">${t('tab_' + k)}</button>`).join('')}</nav></header>
    <div class="wrap" style="padding-top:14px">${UI.live ? liveShell() : view()}</div>`;
  }
  function view() {
    switch (UI.tab) {
      case 'squad': return squadView();
      case 'league': return leagueView();
      case 'cup': return cupView();
      case 'europe': return europeView();
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
    if (sw.t === 'E') {
      const m = Game.euFixtures(G, sw.s).find((x) => x[0] === id || x[1] === id);
      return m ? { k: 'E', h: m[0], a: m[1], s: sw.s } : { k: 'E', none: 'eu', s: sw.s };
    }
    if (sw.t === 'L') { const p = sw.fx[club.div].find((x) => x[0] === id || x[1] === id); return { k: 'L', h: p[0], a: p[1], md: sw.md }; }
    const m = G.cup.matches.find((x) => x.h === id || x.a === id);
    if (m) return { k: 'C', h: m.h, a: m.a, r: G.cup.round };
    return { k: 'C', none: G.cup.byes.includes(id) ? 'bye' : 'out', r: G.cup.round };
  }
  function fixtureCard(c) {
    const f = nextFixture(c), G = UI.G;
    if (!f) return `<div class="card hl"><h2>${t('next_match')}</h2><p>${t('unemployed')}</p><button class="btn" data-act="sim-week">${t('advance')}</button></div>`;
    let body, canPlay = true;
    if (f.none) { body = `<p>${f.none === 'bye' ? t('bye_cup') : f.none === 'eu' ? t('eu_out') : t('cup_out')}</p>`; canPlay = false; }
    else body = `<div class="vs col"><span>${ctag(f.h, 28)}</span><span class="mut sm">vs</span><span>${ctag(f.a, 28)}</span></div><p class="mut" style="text-align:center">${f.k === 'L' ? t('matchday') + ' ' + f.md : f.k === 'E' ? '⭐ ' + euLabel(f.s) : t(Game.CUP_KEYS[f.r])} · ${f.h === c.club ? t('home') : t('away')}</p>${f.k === 'L' && X.isDerby(G, f.h, f.a) ? '<p style="text-align:center;margin:2px"><span class="chip derby">🔥 ' + t('derby') + '</span> <span class="mut sm">' + t('derby_info') + '</span></p>' : ''}${tacticHint(f, c)}`;
    return `<div class="card hl"><h2>${t('next_match')}</h2>${body}<div class="row" style="justify-content:center;margin-top:8px">
      ${canPlay && !(c.vac > 0) ? `<button class="btn pri" data-act="play-live">${t('play_live')}</button>` : ''}
      ${c.vac > 0 ? `<button class="btn pri" data-act="vac-run">🏖 ${t('vac_run')}</button>` : ''}
      <button class="btn" data-act="sim-week">${f.none || true ? t('sim_week') : ''}</button>
      <button class="btn" data-act="sim-season">${t('sim_season')}</button></div></div>`;
  }
  const euLabel = (s) => (s < 6 ? t('eu_md_n', { n: s + 1 }) : t(['eu_qf', 'eu_sf', 'eu_final'][s - 6]));
  function boardCard(c, club) {
    const b = Math.round(c.board);
    const cls = b < 30 ? 'red' : b < 50 ? 'yel' : '';
    const pos = Game.standings(UI.G, club.div).indexOf(club.id) + 1;
    return `<div class="card"><div class="row" style="justify-content:space-between"><h2 style="margin:0">${t('board')}</h2>${SF.Fx.shirt(club, 38)}</div><div class="bar ${cls}"><i style="width:${b}%"></i></div><div class="row" style="margin-top:6px"><b>${b}%</b><span class="mut">${t('objective')}: ${t('obj_text', { n: club.target })}</span></div>
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
    const ms = G.wk.matches.filter((m) => m.res && (m.k === 'C' || m.k === 'E' || m.div === club.div));
    if (!ms.length) return '';
    return `<div class="card"><h2>${t('last_results')}</h2>${tbl(['', '>', '', ''], ms.map((m) => `<tr class="${m.h === club.id || m.a === club.id ? 'me' : ''}"><td>${ctag(m.h, 16)}</td><td class="r"><b>${m.res.hg}-${m.res.ag}</b>${m.res.p ? ` <span class="mut sm">(${m.res.p[0]}-${m.res.p[1]} ${t('pens_short')})</span>` : ''}</td><td>${ctag(m.a, 16)}</td></tr>`))}</div>`;
  }
  function newsCard() {
    const G = UI.G, id = co().id;
    const items = G.news.filter((n) => n.c === id || n.c === 0).slice(-25).reverse();
    return `<div class="card wide"><h2>${t('news')}</h2><ul class="news">${items.length ? items.map((n) => `<li><span class="mut sm">${t('season')} ${n.s} · ${t('week')} ${n.w}</span> ${esc(t(n.k, newsParams(n.p)))}</li>`).join('') : `<li class="mut">${t('no_news')}</li>`}</ul></div>`;
  }
  function homeView() {
    const c = co(), club = myClub();
    if (!club) return `<div class="grid"><div class="card wide"><p class="bad"><b>${t('sacked_banner')}</b></p>${offersBlock(c)}<div class="row"><button class="btn" data-act="sim-week">${t('advance')}</button></div></div>${newsCard()}</div>`;
    return `<div class="grid">${fixtureCard(c)}${boardCard(c, club)}${alertsCard(club)}${formChart(club)}${lastResultsCard(club)}${newsCard()}</div>`;
  }

  // ---------- season end ----------
  function seasonEndView() {
    const G = UI.G, S = G.summary, c = co(), club = myClub();
    const aw = S.awards || [];
    const awLabel = (a) => t('pr_' + a.k) + (a.d != null ? ' · ' + divName(a.d) : '');
    const awWho = (a) => (a.k === 'scorer' ? esc(a.name) + ' (' + t('goals_n', { g: a.g }) + ') · ' : '') + ctag(a.club, 16) + (a.k === 'eu' ? ' <span class="mut sm">' + t('eu_reach_' + a.reach) + '</span>' : '');
    const order = { euwin: 0, eu: 1, league: 2, scorer: 3, promo: 4, cup: 5, cupfinal: 6 };
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
      ${S.euro && S.euro.winner ? `<p>⭐ ${t('eu_winner')}: <b>${ctag(S.euro.winner, 20)}</b></p>` : ''}
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
    const sxi = sq.filter((p) => role(p) === 'xi' && E.isStar(p)).length;
    const away = A.loanedOut(G, club);
    const rows = sq.map((p) => `<tr>
      <td><select data-chg="role:${p.id}" ${L.auto || c.vac > 0 ? 'disabled' : ''}>${['xi', 'bench', 'out'].map((r) => `<option value="${r}" ${role(p) === r ? 'selected' : ''}>${t('role_' + r)}</option>`).join('')}</select></td>
      <td>${p.id === club.capt ? '<span class="capt" title="' + t('captain') + '">C</span> ' : ''}${starTag(p)}${plink(p)}${tagSmall(p)}${p.listed ? ` <span class="chip">${t('listed')}</span>` : ''}${p.loan ? ` <span class="chip loan">${t('loan_from', { club: cname(p.loan.owner) })}</span>` : ''}</td><td>${posTag(p.pos)}</td><td>${p.age}</td><td>${ovTag(p.ovr)}</td><td class="mut">${potCell(p)}</td>
      <td class="r">${money(p.wage)}</td><td>${t('yr_n', { n: p.ct })}</td><td class="r">${mc(E.value(p))}</td><td>${p.g}/${p.ap}</td><td>${moodChip(p)}</td><td>${statusOf(p)}</td>
      <td class="act">${p.loan ? '' : `<select class="actsel" data-chg="act:${p.id}"><option value="">${t('actions')}</option><option value="${p.listed ? 'unlist' : 'list'}">${p.listed ? t('unlist') : t('list_sale')}</option><option value="renew">${t('renew')}</option><option value="reneg">${t('renegotiate')}</option><option value="loanout">${t('loan_out_btn')}</option><option value="capt">${t('make_captain')}</option><option value="sellnow">${t('sell_now')}</option><option value="release">${t('release')}</option></select>`}</td></tr>`);
    return `<div class="card"><div class="row"><label>${t('formation')} <select data-chg="form">${Object.keys(Game.FORMS).map((f) => `<option ${L.form === f ? 'selected' : ''}>${f}</option>`).join('')}</select></label>
      <label>${t('tactic')} <select data-chg="tactic">${['def', 'bal', 'att'].map((k) => `<option value="${k}" ${L.tactic === k ? 'selected' : ''}>${t('tac_' + k)}</option>`).join('')}</select></label>
      <label><input type="checkbox" data-chg="auto" ${L.auto || c.vac > 0 ? 'checked' : ''} ${c.vac > 0 ? 'disabled' : ''}> ${t('auto_pick')}</label>
      <span class="${nxi === 11 ? 'good' : 'warn'}">${t('xi_count', { n: nxi })}</span>
      <span class="${sxi > CFG.starFree ? 'bad' : sxi ? 'star' : 'mut'}">★ ${t('stars_xi', { n: sxi, max: CFG.starFree })}</span></div>
      ${sxi > CFG.starFree ? `<p class="bad sm">${t('stars_over')}</p>` : ''}<p class="mut sm" style="margin:6px 0 0">${t('stars_info', { r: CFG.starOvr, max: CFG.starFree })}</p></div>
      <div class="card" style="margin-top:14px">${tbl([t('sq_status').slice(0, 0) + '', t('sq_name'), t('sq_pos'), t('sq_age'), t('sq_ovr'), t('sq_pot'), '>' + t('sq_wage'), t('sq_ct'), '>' + t('sq_val'), t('sq_goals') + '/' + t('sq_apps'), t('mood_label'), t('sq_status'), ''], rows, 'squad')}</div>
      <div class="grid" style="margin-top:14px">${dressingCard(club)}${academyCard(club)}</div>
      ${away.length ? `<div class="card" style="margin-top:14px"><h2>${t('loans_out_title')}</h2>${away.map((p) => `<div class="sm">${posTag(p.pos)} ${starTag(p)}${plink(p)} ${ovTag(p.ovr)} · ${t('loan_to', { club: cname(p.club) })} · <span class="mut">${t('loan_left', { n: p.loan.left })}</span></div>`).join('')}</div>` : ''}`;
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
      body = tbl(['#', t('sq_name'), t('club'), '>' + t('sq_goals')], Game.topScorers(G, div, 15).map((p, i) => `<tr><td>${i + 1}</td><td>${esc(p.n)}</td><td>${ctag(p.club, 16)}</td><td class="r"><b>${p.gl}</b></td></tr>`));
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
  // ---------- european cup ----------
  const natTag = (id) => { const c = UI.G.clubs[id]; return c && c.foreign ? ` <span class="tag">${CFG.euNat[c.nat]}</span>` : ''; };
  function europeView() {
    const G = UI.G, eu = G.eu, club = myClub();
    const ms = (arr, withP) => tbl(['', '>', ''], arr.map((m) => `<tr class="${club && (m.h === club.id || m.a === club.id) ? 'me' : ''}"><td>${ctag(m.h, 16)}</td><td class="r"><b>${m.hg !== undefined ? m.hg + '-' + m.ag : 'vs'}</b>${m.p ? ` <span class="mut sm">(${m.p[0]}-${m.p[1]} ${t('pens_short')})</span>` : ''}</td><td>${ctag(m.a, 16)}</td></tr>`));
    let h = `<div class="card hl"><h2>${t('eu_title')}</h2><p>${t('eu_intro')}</p>
      <p class="sm mut">${t('eu_prizes', { pp: CFG.euPartic, pw: CFG.euWin, pd: CFG.euDraw, pq: CFG.euQF, ps: CFG.euSF, pf: CFG.euFinal, px: CFG.euWinner })} SFOOT</p>
      ${eu.winner ? `<p>🏆 ${t('eu_winner')}: <b>${ctag(eu.winner, 22)}</b></p>` : ''}
      ${eu.idle ? `<p class="warn">${t('eu_not_in')}</p>` : club && eu.tab[club.id] === undefined ? `<p class="warn">${t('eu_not_in')}</p>` : club ? `<p class="good">${t('eu_you')}: ${t('eu_reach_' + eu.reach[club.id])}</p>` : ''}</div>`;
    const sub = `<div class="sub" style="margin-top:14px">${['groups', 'ko'].map((k) => `<button class="${UI.eu === k ? 'on' : ''}" data-act="eu:${k}">${t(k === 'groups' ? 'eu_groups' : 'eu_ko')}</button>`).join('')}</div>`;
    if (UI.eu === 'ko') {
      const names = ['eu_qf', 'eu_sf', 'eu_final'];
      h += sub + '<div class="grid">';
      for (let i = 0; i < 3; i++) {
        const played = eu.hist.find((x) => x.s === 6 + i);
        const draw = eu.ko.ms[i];
        h += `<div class="card"><h2>${t(names[i])}</h2>` + (played ? ms(played.ms) : draw ? ms(draw.map(([a, b]) => ({ h: a, a: b }))) : `<span class="mut">-</span>`) + '</div>';
      }
      return h + '</div>';
    }
    h += sub + '<div class="groups">';
    for (let g = 0; g < 4; g++) {
      const st = Game.euStandings(G, g);
      h += `<div class="card"><h2>${t('eu_group_n', { n: 'ABCD'[g] })}</h2>` + tbl(['#', t('club'), '>' + t('col_p'), '>' + t('col_gd'), '>' + t('col_pts')], st.map((id, i) => {
        const x = eu.tab[id];
        return `<tr class="${club && id === club.id ? 'me' : ''} ${i < 2 ? 'up' : ''}"><td>${i + 1}</td><td>${ctag(id, 16)}${natTag(id)}</td><td class="r">${x.p}</td><td class="r">${x.gf - x.ga}</td><td class="r"><b>${x.pts}</b></td></tr>`;
      })) + '</div>';
    }
    h += '</div>';
    const last = eu.hist.filter((x) => x.s < 6).slice(-1)[0];
    if (last) h += `<div class="card" style="margin-top:14px"><h2>${t('eu_md_n', { n: last.s + 1 })}</h2>${ms(last.ms)}</div>`;
    return h;
  }

  function transfersView() {
    const G = UI.G, c = co(), club = myClub();
    if (!club) return `<div class="card">${t('unemployed')}</div>`;
    const sub = ['market', 'free', 'loans', 'scout', 'watch', 'offers'];
    const subBar = `<div class="sub">${sub.map((k) => `<button class="${UI.tr === k ? 'on' : ''}" data-act="tr:${k}">${t('tr_' + k)}</button>`).join('')}</div>`;
    const vacNote = c.vac > 0 ? `<div class="card warn" style="margin-bottom:14px">🏖 ${t('vac_blocked')}</div>` : '';
    if (UI.tr === 'offers') {
      const mine = G.offers.filter((o) => o.coach === c.id);
      return subBar + `<div class="card">${mine.length ? tbl([t('sq_name'), t('sq_pos'), t('age'), t('sq_ovr'), t('sq_pot'), t('market_value'), t('club'), '>' + t('offer_label'), '', ''], mine.map((o) => {
        const p = G.players[o.pid], val = E.value(p), pct = Math.round((o.fee / val - 1) * 100);
        return `<tr><td>${starTag(p)}${plink(p)}</td><td>${posTag(p.pos)}</td><td>${p.age}</td><td>${ovTag(p.ovr)}</td><td class="mut">${potCell(p)}</td><td class="r">${money(val)}</td><td>${ctag(o.club, 16)}</td><td class="r"><b>${money(o.fee)}</b></td><td class="${pct >= 0 ? 'good' : 'bad'}">${pct >= 0 ? '+' : ''}${pct}% ${t('vs_value')} <span class="mut sm">⏳${o.ttl}</span></td><td><button class="btn sm grn" data-act="oacc:${o.id}">${t('accept')}</button> <button class="btn sm" data-act="odec:${o.id}">${t('decline')}</button></td></tr>`;
      })) : `<span class="mut">${t('no_offers')}</span>`}</div>`;
    }
    if (UI.tr === 'scout') return subBar + vacNote + scoutView(c, club);
    if (UI.tr === 'watch') return subBar + watchView(c);
    const F = UI.f, free = UI.tr === 'free', loans = UI.tr === 'loans';
    const list = A.search(G, c, { free, pos: F.pos, minOvr: +F.minOvr || 0, maxAge: +F.maxAge || 0, maxPrice: loans ? 0 : +F.maxPrice || 0, div: F.div, sort: F.sort, stars: F.stars, loanable: loans, limit: 60 });
    const filters = `<div class="card" style="margin-bottom:14px"><div class="row">
      <label>${t('filter_pos')} <select data-chg="f:pos"><option value="">${t('any')}</option>${['GK', 'DF', 'MF', 'FW'].map((p) => `<option value="${p}" ${F.pos === p ? 'selected' : ''}>${t('pos_' + p)}</option>`).join('')}</select></label>
      <label>${t('min_ovr')} <input type="number" style="width:70px" value="${F.minOvr}" data-chg="f:minOvr"></label>
      <label>${t('max_age')} <input type="number" style="width:70px" value="${F.maxAge}" data-chg="f:maxAge"></label>
      ${free || loans ? '' : `<label>${t('max_price')} <input type="number" style="width:110px" value="${F.maxPrice}" data-chg="f:maxPrice"></label>`}
      ${free ? '' : `<label>${t('div_n', { n: '' })} <select data-chg="f:div"><option value="">${t('any')}</option>${[0, 1, 2, 3].map((d) => `<option value="${d}" ${String(F.div) === String(d) ? 'selected' : ''}>${d + 1}</option>`).join('')}</select></label>`}
      ${free || loans ? '' : `<button class="btn sm" data-act="afford">${t('afford')}</button>`}
      ${free ? '' : `<label><input type="checkbox" data-chg="f:stars" ${F.stars ? 'checked' : ''}> ★ ${t('only_stars')}</label>`}
      <label>${t('sort_by')} <select data-chg="f:sort"><option value="ovr">${t('sort_ovr')}</option><option value="pot" ${F.sort === 'pot' ? 'selected' : ''}>${t('sort_pot')}</option></select></label></div></div>`;
    let head, rows, extra = '';
    if (loans) {
      head = [t('sq_name'), t('sq_pos'), t('sq_age'), t('sq_ovr'), t('sq_pot'), t('club'), '>' + t('sq_wage'), ''];
      rows = list.map((p) => `<tr><td>${starTag(p)}${plink(p)}</td><td>${posTag(p.pos)}</td><td>${p.age}</td><td>${ovTag(p.ovr)}</td><td class="mut">${potCell(p)}</td><td>${ctag(p.club, 16)}</td><td class="r">${money(p.wage)}</td>
        <td class="act">${[1, 2].map((n) => `<button class="btn sm pri" data-act="loanin:${p.id}-${n}">${t('loan_in_btn', { n, fee: A.loanInFee(G, c, p, n) })}</button>`).join(' ')}</td></tr>`);
      const bor = A.loanedIn(G, club);
      extra = `<div class="card" style="margin-bottom:14px"><p class="sm mut">${t('loan_rules', { max: CFG.loanMaxIn })}</p>
        <h2>${t('loans_in_title')}</h2>${bor.length ? bor.map((p) => `<div class="sm">${posTag(p.pos)} ${starTag(p)}${plink(p)} ${ovTag(p.ovr)} · ${t('loan_from', { club: cname(p.loan.owner) })} · <span class="mut">${t('loan_left', { n: p.loan.left })}</span></div>`).join('') : '<span class="mut">-</span>'}</div>`;
    } else {
      head = [t('sq_name'), t('sq_pos'), t('sq_age'), t('sq_ovr'), t('sq_pot'), free ? '>' + t('sq_wage') : t('club'), '>' + (free ? t('cost') : t('asking_price')), ''];
      rows = list.map((p) => `<tr><td>${starTag(p)}${plink(p)}${hotTag(p)}</td><td>${posTag(p.pos)}</td><td>${p.age}</td><td>${ovTag(p.ovr)}</td><td class="mut">${potCell(p)}</td>
      <td>${free ? money(E.wage(p)) : ctag(p.club, 16) + loanTag(p)}</td><td class="r">${free ? money(E.wage(p) * 3) : money(A.askPrice(G, c, p))}</td>
      <td class="act">${free ? '' : watchBtn(p) + scoutBtn(p)}<button class="btn sm pri" data-act="${free ? 'sign' : 'buy'}:${p.id}">${free ? t('sign') : t('buy')}</button></td></tr>`);
    }
    return subBar + vacNote + extra + filters + `<div class="card">${list.length ? tbl(head, rows, 'mkt') : `<span class="mut">${t('nothing_found')}</span>`}</div>`;
  }

  // ---------- finance ----------
  function advisorCard(c, club) {
    const G = UI.G, r = A.financeReport(G, c);
    if (!r) return '';
    const mx = Math.max(1, r.totIn, r.totOut);
    const line = (k, v, cls) => `<div class="line"><span>${t('mm_' + k)}</span><div class="bar ${cls}"><i style="width:${Math.min(100, (v / mx) * 100)}%"></i></div><span class="r" style="text-align:right">${mc(v)}</span></div>`;
    const inc = Object.entries(r.inc).map(([k, v]) => line(k, v, '')).join('');
    const out = Object.entries(r.out).map(([k, v]) => line(k, v, v === r.out.wages && r.ratio > 0.62 ? 'red' : 'yel')).join('');
    const ic = ['✅', '💡', '⚠️', '🚨'];
    const tips = r.tips.map((tp) => {
      let acts = '';
      if (tp.act === 'price') acts = `<button class="btn sm pri" data-act="setprice:${tp.price}">${t('tip_set_price', { best: tp.price })}</button>`;
      else if (tp.act === 'stadium') acts = `<button class="btn sm pri" data-act="expand:1" ${club.build ? 'disabled' : ''}>${t('tip_expand')} · ${mc(A.stadiumCost(G, club, 1))}</button>`;
      else if (tp.act === 'facility') acts = `<button class="btn sm" data-act="fac:youth">${t('fac_youth')} · ${mc(A.facilityCost(club, 'youth'))}</button> <button class="btn sm" data-act="fac:train">${t('fac_train')} · ${mc(A.facilityCost(club, 'train'))}</button>`;
      else if (tp.act === 'market') acts = `<button class="btn sm" data-act="tab:transfers">${t('tip_market')}</button>`;
      else if (tp.act === 'loan' && tp.k === 'overdraft') acts = `<button class="btn sm pri" data-act="loan">${t('take_loan')}</button> <button class="btn sm" data-act="tab:squad">${t('tab_squad')}</button>`;
      else if (tp.act === 'loan') acts = B_loans(club).map((l) => `<button class="btn sm" data-act="repay:${l.id}">${t('repay_early')} #${l.id} · ${mc(B.earlyRepayCost(l))}</button>`).join(' ');
      else if (tp.act === 'players') {
        acts = tp.pids.map((id) => { const p = G.players[id]; if (!p) return ''; return `<div class="sm" style="width:100%">${posTag(p.pos)} ${starTag(p)}<b>${esc(p.n)}</b> ${ovTag(p.ovr)} · ${money(p.wage)}/w · ${p.g}/${p.ap}
          <button class="btn sm" data-act="reneg:${p.id}">${t('renegotiate')}</button> <button class="btn sm" data-act="loanout:${p.id}">${t('loan_out_btn')}</button> <button class="btn sm" data-act="list:${p.id}">${t('list_sale')}</button></div>`; }).join('');
      }
      return `<div class="tip s${tp.sev}"><div class="ic">${ic[tp.sev]}</div><div class="body">${t('tip_' + tp.k, tp.x)}<div class="acts">${acts}</div></div></div>`;
    }).join('');
    return `<div class="card wide hl"><h2>${t('fin_advisor')}</h2>${tips}</div>
      <div class="card wide"><h2>${t('fin_map')} <span class="mut" style="text-transform:none;letter-spacing:0">· ${t('fin_map_note')}</span></h2>
      <div class="grid"><div class="mm"><h3 class="sm good">${t('mm_in')}: ${money(r.totIn)}</h3>${inc}</div><div class="mm"><h3 class="sm bad">${t('mm_out')}: ${money(r.totOut)}</h3>${out}</div></div>
      <p class="sm mut" style="margin-top:8px">${t('wage_ratio', { pct: Math.round(r.ratio * 100) })}</p>
      <div class="bar ${r.ratio > 0.8 ? 'red' : r.ratio > 0.62 ? 'yel' : ''}"><i style="width:${Math.min(100, r.ratio * 100)}%"></i></div></div>`;
  }
  const B_loans = (club) => UI.G.bank.loans.filter((l) => l.club === club.id);

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
    return `<div class="grid">${advisorCard(c, club)}${balanceChart(club)}
      <div class="card"><h2>${t('fin_summary')}</h2><div class="big ${B.bal(G, club.id) < 0 ? 'bad' : 'good'}">${money(B.bal(G, club.id))} SFOOT</div>
        <h3 class="sm mut">${t('fin_income')}: ${money(ti)}</h3>${inc.map(([k, v]) => `<div class="row sm"><span style="flex:1">${kl(k)}</span><span class="good">+${money(v)}</span></div>`).join('')}
        <h3 class="sm mut" style="margin-top:10px">${t('fin_expenses')}: ${money(te)}</h3>${exp.map(([k, v]) => `<div class="row sm"><span style="flex:1">${kl(k)}</span><span class="bad">-${money(v)}</span></div>`).join('')}</div>
      <div class="card"><h2>${t('stadium')}</h2>${SF.Fx.stadium(att / club.cap, club)}<p>${t('capacity')}: <b>${money(club.cap)}</b> · ${t('exp_attendance')}: <b>${money(att)}</b></p>
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
  function repCard(c) {
    const tier = Game.repTier(c.rep);
    const log = (c.replog || []).slice().reverse().slice(0, 14);
    return `<div class="card"><h2>${t('reputation')}</h2>
      <div class="row"><span class="big">${Math.round(c.rep)}</span><span class="chip">${t('rep_tier_' + tier)}</span></div>
      <div class="bar acc" style="margin:6px 0"><i style="width:${c.rep}%"></i></div>
      <div class="perk">💶 ${t('rep_perk_sponsor', { pct: Math.round(Game.repSponsor(c.rep) * 100) + '%' })}</div>
      <div class="perk">💼 ${t('rep_perk_jobs', { s: Math.round(Game.repStrength(c.rep) + 3) })}</div>
      <p class="mut sm">${t('rep_how')}</p>
      <h3 class="sm mut">${t('rep_log')}</h3>${log.length ? tbl(['', '', '>'], log.map((r) => `<tr><td class="mut sm">${t('season')} ${r.s}</td><td>${t('rep_k_' + r.k)}</td><td class="r ${r.d >= 0 ? 'good' : 'bad'}">${r.d >= 0 ? '+' : ''}${r.d}</td></tr>`)) : `<span class="mut">-</span>`}</div>`;
  }
  function vacCard(c, club) {
    if (!club) return '';
    const G = UI.G;
    if (c.vac > 0) return `<div class="card"><h2>🏖 ${t('vac_title')}</h2><p>${t('vac_active', { n: c.vac })}</p><div class="row"><button class="btn pri" data-act="vac-run">${t('vac_run')}</button><button class="btn" data-act="vac-stop">${t('vac_back')}</button></div></div>`;
    return `<div class="card"><h2>🏖 ${t('vac_title')}</h2><p class="mut sm">${t('vac_desc')}</p><div class="row"><button class="btn" data-act="vac-start:4">${t('vac_weeks', { n: 4 })}</button><button class="btn" data-act="vac-start:8">${t('vac_weeks', { n: 8 })}</button><button class="btn" data-act="vac-start:99">${t('vac_season')}</button></div></div>`;
  }
  function coachView() {
    const G = UI.G, c = co(), club = myClub();
    const lvl = Game.level(c.xp), pts = Game.freePoints(c);
    const cur = 60 * (lvl - 1) * (lvl - 1), nxt = 60 * lvl * lvl;
    const pct = Math.round(((c.xp - cur) / (nxt - cur)) * 100);
    const sk = ['train', 'tact', 'neg', 'youth'].map((k) => `<div class="row"><span style="min-width:140px"><b>${t('sk_' + k)}</b><div class="mut sm">${t('sk_' + k + '_d')}</div></span><span>${'●'.repeat(c.sk[k])}${'○'.repeat(5 - c.sk[k])}</span><button class="btn sm" data-act="skill:${k}" ${pts < 1 || c.sk[k] >= 5 ? 'disabled' : ''}>+</button></div>`).join('');
    const trophies = c.trophies.map((x) => `🏆 ${esc(cname(x.club))} · ${t('season')} ${x.s} · ${x.k === 'league' ? t('champion') + ' ' + divName(x.d) : x.k === 'euro' ? t('trophy_euro') : t('cup_winner')}`);
    const hall = G.hall.slice().reverse().slice(0, 15).map((h) => `<tr><td>${h.s}</td><td>${h.champ.map((id) => ctag(id, 14)).join('<br>')}</td><td>${h.cup ? ctag(h.cup, 14) : '-'}</td><td>${h.euro ? ctag(h.euro, 14) : '-'}</td></tr>`);
    return `<div class="grid"><div class="card hl"><h2>${esc(c.name)}</h2><p>${club ? ctag(club.id, 22) : '<span class="bad">—</span>'}</p>
        <p>${t('coach_level')}: <b>${lvl}</b></p><div class="bar"><i style="width:${Math.max(0, Math.min(100, pct))}%"></i></div><p class="mut sm">${t('xp')} ${c.xp} · ${t('skill_points', { n: pts })}</p>${sk}
        <p class="mut sm">${t('sacked_count', { n: c.sacked })}</p>${club ? `<button class="btn dng" data-act="resign">${t('resign')}</button>` : ''} <button class="btn dng" data-act="retire">${t('retire')}</button></div>
      ${goalsCard(c)}${repCard(c)}${vacCard(c, club)}
      <div class="card">${offersBlock(c)}</div>
      <div class="card"><h2>${t('trophies')}</h2>${trophies.length ? trophies.map((x) => `<div>${x}</div>`).join('') : `<span class="mut">${t('no_trophies')}</span>`}
        <h2 style="margin-top:14px">${t('career')}</h2>${c.hist.length ? tbl([t('season'), t('club'), '>#'], c.hist.slice().reverse().map((h) => `<tr><td>${h.s}</td><td>${ctag(h.club, 14)} <span class="mut sm">${divName(h.d)}</span></td><td class="r">${h.pos}</td></tr>`)) : `<span class="mut">-</span>`}</div>
      <div class="card"><h2>${t('hall')}</h2>${hall.length ? tbl([t('season'), t('champion'), t('cup'), '⭐'], hall) : `<span class="mut">-</span>`}</div>${achCard(c)}${legendsCard()}</div>`;
  }

  // ---------- settings ----------
  function settingsView() {
    const th = localStorage.getItem(THEMEK) || 'light';
    return `<div class="grid"><div class="card"><h2>${t('language')}</h2><select data-chg="lang">${SF.I18N.LANGS.map(([k, n]) => `<option value="${k}" ${SF.I18N.get() === k ? 'selected' : ''}>${n}</option>`).join('')}</select>
      <h2 style="margin-top:14px">${t('theme')}</h2><select data-chg="theme"><option value="light" ${th === 'light' ? 'selected' : ''}>${t('theme_light')}</option><option value="dark" ${th === 'dark' ? 'selected' : ''}>${t('theme_dark')}</option></select>
      <h2 style="margin-top:14px">${t('sound_label')}</h2><select data-chg="sound"><option value="0">${t('sound_off')}</option><option value="1" ${SF.Fx.soundOn() ? 'selected' : ''}>${t('sound_on')}</option></select>
      <label class="row" style="margin-top:10px"><input type="checkbox" data-chg="recap" ${recapOn() ? 'checked' : ''}> ${t('recap_toggle')}</label>
      <div class="row" style="margin-top:14px"><button class="btn pri" data-act="save">${t('save')}</button><button class="btn" data-act="export">${t('export')}</button>
      <label class="btn">${t('import')}<input type="file" accept=".json,application/json" data-chg="import" hidden></label>
      <button class="btn dng" data-act="newgame">${t('new_game')}</button></div></div>
      <div class="card"><h2>${t('about_title')}</h2><p>${t('about_text')}</p><p class="mut sm">${t('roadmap')}</p><p class="mut sm">${t('fictional_note')}</p></div></div>`;
  }

  // ---------- season end celebration ----------
  function celebration(c, club) {
    const G = UI.G, S = G.summary;
    const mine = (S.awards || []).filter((a) => a.club === club.id);
    const has = (k) => mine.find((a) => a.k === k);
    const items = [];
    const dv = (d) => divName(d);
    const euwin = has('euwin'), lg = has('league'), cup = has('cup'), promo = has('promo'), sc = has('scorer'), eu = has('eu'), cf = has('cupfinal');
    if (euwin) items.push(['🏆', t('cel_euro', { club: club.name }), euwin.amt]);
    if (lg) items.push(['🥇', t('cel_champion', { club: club.name, div: dv(lg.d) }), lg.amt]);
    if (cup) items.push(['🏆', t('cel_cup', { club: club.name }), cup.amt]);
    if (promo) items.push(['⬆️', t('cel_promo', { club: club.name }), promo.amt]);
    if (sc) items.push(['⚽', t('cel_scorer', { name: sc.name, div: dv(sc.d), g: sc.g }), sc.amt]);
    if (cf) items.push(['🥈', t('pr_cupfinal'), cf.amt]);
    if (eu) items.push(['⭐', t('eu_reach_' + eu.reach), eu.amt]);
    if (!eu && !euwin && S.euQ && S.euQ.includes(club.id) && !G.eu.idle) items.push(['⭐', t('cel_qual', { club: club.name }), 0]);
    else if (S.euQ && S.euQ.includes(club.id)) items.push(['⭐', t('eu_qualified'), 0]);
    const sad = club.nextDiv > club.div;
    const win = !!(euwin || lg || cup || promo || sc);
    const top = euwin ? items[0] : null;
    const headline = items.length && win ? items[0][1] : sad ? t('cel_sad', { club: club.name }) : t('cel_plain', { club: club.name, pos: club.pos, div: dv(club.div) });
    const total = S.prizes[club.id] || 0;
    const rep = (c.replog || []).filter((r) => r.s === G.season).reduce((a, r) => a + r.d, 0);
    const colors = ['#f6c94c', club.c1, club.c2 === '#ffffff' ? '#fff' : club.c2, '#6fd3a3', '#7fb8f5', '#f59aa6'];
    const conf = win ? `<div class="confetti">${Array.from({ length: 60 }, () => `<i style="left:${(Math.random() * 100).toFixed(1)}%;background:${colors[Math.floor(Math.random() * colors.length)]};animation-duration:${(2.6 + Math.random() * 2.8).toFixed(1)}s;animation-delay:${(Math.random() * 1.4).toFixed(1)}s;transform:rotate(${Math.floor(Math.random() * 180)}deg)"></i>`).join('')}</div>` : '';
    $('#modal').innerHTML = `${conf}<div class="ovl"><div class="dlg celeb ${sad && !win ? 'sad' : ''}"><span class="bigbdg">${badge(club, 104)}</span>
      <div class="mut sm">${t('cel_season', { s: G.season })}</div>
      ${win ? `<h3>${t('cel_congrats', { name: esc(c.name) })}</h3>` : ''}<p style="font-size:1.05rem"><b>${esc(headline)}</b></p>
      ${items.length ? `<ul>${items.slice(win ? 1 : 0).map((i) => `<li><span>${i[0]}</span><span class="t">${esc(i[1])}</span>${i[2] ? `<span class="a">+${money(i[2])}</span>` : ''}</li>`).join('')}</ul>` : ''}
      <div class="mut sm">${t('cel_total')}</div><div class="prize">+${money(total)} SFOOT</div>
      <div class="mut sm">${t('cel_rep', { v: (rep >= 0 ? '+' : '') + Math.round(rep * 10) / 10 })}</div>
      <div class="row end" style="justify-content:center"><button class="btn pri" data-act="m-cancel">${t('cel_continue')}</button></div></div></div>`;
  }
  function maybeCelebrate() {
    const G = UI.G;
    if (!G || UI.live || G.phase !== 'seasonEnd' || $('#modal').innerHTML) return;
    const c = co(), club = myClub();
    if (!club || c.celeb === G.season) return;
    c.celeb = G.season; save();
    celebration(c, club);
  }
  function maybeVacReport() {
    const G = UI.G;
    if (!G || UI.live || $('#modal').innerHTML) return;
    const c = co(), r = c.vacReport;
    if (!r || r.seen) return;
    r.seen = 1; save();
    $('#modal').innerHTML = `<div class="ovl"><div class="dlg"><h3>🏖 ${t('vac_report_title')}</h3><p>${t('vac_report', { n: r.renewed, cost: r.cost, m: r.released })}</p><div class="row end"><button class="btn pri" data-act="m-cancel">${t('cel_continue')}</button></div></div></div>`;
  }

  // ---------- week flow ----------
  function playWeek(live) {
    const G = UI.G, c = co();
    if (G.phase !== 'play') return;
    const before = snapshotBefore();
    const wk = Game.beginWeek(G);
    const mine = live && c.club && !(c.vac > 0) ? wk.matches.find((m) => m.h === c.club || m.a === c.club) : null;
    for (const m of wk.matches) if (m !== mine) Game.simMatch(G, m);
    if (mine) {
      const mt = Game.buildMatch(G, mine);
      const mySide = mine.h === c.club ? mt.h : mt.a;
      mySide.auto = false;
      UI.live = { m: mine, mt, side: mine.h === c.club ? 'h' : 'a', log: [], paused: true, speed: 1, timer: null, over: false, before, ht: false, htDone: false, flash: null };
      render();
      return;
    }
    finishWeek(before);
  }
  function finishWeek(before) {
    Game.endWeek(UI.G);
    const rc = before && recapOn() ? buildRecap(before) : null;
    save();
    UI.tab = 'home';
    render();
    if (rc && !$('#modal').innerHTML) showRecap(rc);
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
      case 'shot': return `<div class="sh">${e.r === 'post' ? '🥅' : '🎯'} ${e.min}' ${esc(t('ev_shot_' + e.r, { name: name(e.pid), gk: name(e.pid2) }))}</div>`;
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
    el.innerHTML = `<div class="card livecard${L.flash ? ' flash' : ''}"><div class="vs"><span>${badge(hc, 34)} ${esc(hc.name)}</span><span class="score">${mt.h.goals} - ${mt.a.goals}</span><span>${badge(ac, 34)} ${esc(ac.name)}</span></div>
      <p style="text-align:center" class="mut">${lab}${mt.pens ? ` · ${mt.pens.h}-${mt.pens.a} ${t('pens_short')}` : ''}</p>
      <div class="dual"><b>${sum.hp}%</b><div class="duo"><i class="l" style="width:${sum.hp}%"></i></div><b>${100 - sum.hp}%</b></div><div class="dlab">${t('possession')}</div>
      <div class="dual"><b>${sum.hs}</b><div class="duo"><i class="l" style="width:${Math.round((sum.hs / Math.max(1, sum.hs + sum.as)) * 100)}%"></i></div><b>${sum.as}</b></div><div class="dlab">${t('shots')}</div>
      ${L.flash ? `<div class="goalbanner ${L.flash.side}">⚽ ${t('goal_banner')}<small>${esc(L.flash.txt)}</small></div>` : ''}
      ${L.ht && L.paused && !L.over ? `<div class="htbox"><b>⏸ ${t('ht')}</b> · ${t('ht_info')}</div>` : ''}
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
    for (const e of evs) {
      const l = evLine(e); if (l) L.log.push(l);
      if (e.t === 'goal') {
        L.flash = { side: e.side, txt: e.min + "' " + name(e.pid) }; SF.Fx.play('goal');
        setTimeout(() => { if (UI.live === L && L.flash) { L.flash = null; liveTickRender(); } }, 1900);
      } else if (e.t === 'shot' && e.r === 'post') SF.Fx.play('crowd');
    }
    if (!L.mt.et && L.mt.min >= 45 && !L.htDone && !L.mt.done) {
      L.htDone = true; L.paused = true; L.ht = true; clearInterval(L.timer);
      L.log.push(`<div class="s">⏸ ${t('ht')}</div>`); SF.Fx.play('whistle');
    }
    if (L.mt.done) { L.over = true; L.paused = true; clearInterval(L.timer); SF.Fx.play('whistle'); }
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
    L.over = true; L.paused = true; L.ht = false; L.flash = null; liveTickRender();
  }
  function liveContinue() {
    const L = UI.live;
    clearInterval(L.timer);
    Game.simMatch(UI.G, L.m, L.mt);
    UI.live = null;
    finishWeek(L.before);
  }

  // ---------- v0.3: helpers ----------
  const X = SF.Extras, FX = SF.Fx;
  const RECAPK = 'suifoot.recap', LEGK = 'suifoot.legends';
  const plink = (p) => `<a href="#" class="pl" data-act="pl:${p.id}">${esc(p.n)}</a>`;
  const BEATS = { att: 'bal', bal: 'def', def: 'att' };
  function potCell(p) {
    const i = X.potInfo(UI.G, co(), p);
    if (i.exact) return p.age < 28 ? String(p.pot) : '-';
    return `<span title="${esc(t('sheet_pot_range', { lo: i.lo, hi: i.hi }))}">${i.lo}–${i.hi}</span>`;
  }
  const moodCls = (m) => (m >= 80 ? 'mg' : m >= 60 ? 'mo' : m >= 40 ? 'mm2' : m >= 25 ? 'mb' : 'ma');
  const moodChip = (p) => { const m = X.mood(p); return `<span class="mood ${moodCls(m)}" title="${t('mood_label')} ${Math.round(m)}"><i style="width:${Math.round(m)}%"></i></span>`; };
  const tagSmall = (p) => { const k = E.tagOf(p); return ['idol', 'prospect', 'scorer', 'veteran'].includes(k) ? ` <span class="chip tg-${k}">${t('tg_' + k)}</span>` : ''; };
  const hotTag = (p) => (p.hot ? ` <span class="chip hot" title="${esc(t('hot_info', { n: p.hot.left }))}">🔥 ${t('hot_tag')}</span>` : '');
  const watchBtn = (p) => `<button class="btn sm ghost" data-act="wt:${p.id}" title="${t('watch_on')}">${(co().watch || []).includes(p.id) ? '★' : '☆'}</button>`;
  function scoutBtn(p) {
    const club = myClub();
    if (!club || X.potInfo(UI.G, co(), p).exact) return '';
    return `<button class="btn sm" data-act="scout:${p.id}" title="${t('scout_btn', { cost: CFG.scoutOne[club.div] })}">🔎</button>`;
  }
  function legends() { try { return JSON.parse(localStorage.getItem(LEGK) || '[]'); } catch (e) { return []; } }
  function saveLegends(a) { try { localStorage.setItem(LEGK, JSON.stringify(a.slice(-30))); } catch (e) { /* ignore */ } }
  const recapOn = () => localStorage.getItem(RECAPK) !== '0';
  function newsParams(p) {
    if (!p) return p;
    const q = Object.assign({}, p);
    if (q.tk) q.name = t(q.tk);
    return q;
  }

  // toast queue written by the engine (achievements, goals, rival interest)
  function drainToasts() {
    const G = UI.G;
    if (!G || !G.tq || !G.tq.length || !G.coaches.length) return;
    const id = co().id, keep = [];
    let any = false;
    for (const q of G.tq) {
      if (q.c !== id) { keep.push(q); continue; }
      const p = Object.assign({}, q.p);
      if (q.k === 'toast_ach') p.name = t(p.k);
      if (q.k === 'toast_goal') p.name = t('goal_' + p.k);
      toast((q.k === 'toast_ach' ? '🏅 ' : q.k === 'toast_goal' ? '🎯 ' : '🔥 ') + t(q.k, p));
      any = true;
    }
    G.tq = keep;
    if (any) { FX.play('ding'); save(); }
  }

  // ---------- player sheet ----------
  function sheet(pid) {
    const G = UI.G, p = G.players[pid], c = co(), club = myClub();
    if (!p) return;
    const own = club && p.club === club.id, pc = p.club && G.clubs[p.club];
    const pi = X.potInfo(G, c, p), tg = E.tagOf(p);
    const val = E.value(p);
    const vh = (p.vh || []).map((x) => x[1]).concat([val]);
    const sh = p.sh || [];
    const stat = (l, v) => `<div class="st"><span class="mut sm">${l}</span><b>${v}</b></div>`;
    const acts = [];
    if (own && !p.loan) acts.push(`<button class="btn sm" data-act="capt:${p.id}">© ${club.capt === p.id ? t('captain') : t('make_captain')}</button>`);
    if (club && p.acad === club.id) acts.push(`<button class="btn sm pri" data-act="promote:${p.id}">${t('promote')}</button>`);
    if (!own && p.club && !p.acad) acts.push(`<button class="btn sm" data-act="wt:${p.id}">${(c.watch || []).includes(p.id) ? '★ ' + t('watch_off') : '☆ ' + t('watch_on')}</button>`);
    if (club && !pi.exact) acts.push(`<button class="btn sm" data-act="scout:${p.id}">🔎 ${t('scout_btn', { cost: CFG.scoutOne[club.div] })}</button>`);
    const m = X.mood(p);
    $('#modal').innerHTML = `<div class="ovl"><div class="dlg sheet"><div class="row" style="align-items:flex-start">${pc ? FX.shirt(pc, 54) : ''}<div style="flex:1;min-width:0"><h3 style="margin:0">${starTag(p)}${plink(p)}${club && club.capt === p.id ? ' <span class="capt">C</span>' : ''}</h3>
        <div class="mut sm">${posTag(p.pos)} ${p.age} · ${pc ? ctag(pc.id, 14) : t('free_agent')}${p.loan ? ' · ' + t('loan_from', { club: cname(p.loan.owner) }) : ''}</div>
        <div style="margin-top:4px"><span class="chip tg-${tg}">${t('tg_' + tg)}</span>${hotTag(p)}${p.listed ? ` <span class="chip">${t('listed')}</span>` : ''}</div></div>
        <div class="ovbig">${ovTag(p.ovr)}</div></div>
      <div class="stats">${stat(pi.exact ? t('sq_pot') : '≈ ' + t('sq_pot'), pi.exact ? (p.age < 28 ? p.pot : p.ovr) : `${pi.lo}–${pi.hi}`)}${stat(t('sq_val'), mc(val))}${stat(t('sq_wage'), money(p.wage))}${stat(t('sq_ct'), t('yr_n', { n: p.ct }))}${stat(t('clause'), mc(E.clause(p)))}${stat(t('sq_goals') + '/' + t('sq_apps'), p.g + '/' + p.ap)}</div>
      ${own ? `<div class="row" style="margin:8px 0"><span class="mut sm" style="min-width:90px">${t('mood_label')}: ${t(X.moodLabel(m))}</span><span class="mood big ${moodCls(m)}"><i style="width:${Math.round(m)}%"></i></span></div>` : ''}
      <p class="sm mut">${t('sheet_career', { a: p.apt, g: p.gt })}</p>
      ${vh.length > 1 ? `<h2>${t('sheet_value')}</h2>${FX.line([{ v: vh }], { w: 360, h: 110, labels: (p.vh || []).map((x) => x[0]).concat(['·']) })}` : ''}
      <h2>${t('sheet_hist')}</h2>${sh.length ? tbl([t('sh_season'), t('club'), '>' + t('sh_apps'), '>' + t('sh_goals'), '>' + t('sq_ovr')], sh.slice().reverse().map((h) => `<tr><td>${h.s}</td><td>${ctag(h.c, 14)}</td><td class="r">${h.a}</td><td class="r">${h.g}</td><td class="r">${h.o}</td></tr>`)) : `<p class="mut sm">${t('sheet_no_hist')}</p>`}
      ${acts.length ? `<div class="row" style="margin-top:10px">${acts.join(' ')}</div>` : ''}
      <div class="row end"><button class="btn pri" data-act="m-cancel">${t('close')}</button></div></div></div>`;
    UI.mok = null;
  }

  // ---------- charts and cards ----------
  function formChart(club) {
    const G = UI.G;
    const rows = G.res.filter((r) => r[1] === club.div && (r[2] === club.id || r[3] === club.id)).sort((a, b) => a[0] - b[0]);
    if (!rows.length) return '';
    let acc = 0;
    const cum = rows.map((r) => { const home = r[2] === club.id, gf = home ? r[4] : r[5], ga = home ? r[5] : r[4]; acc += gf > ga ? 3 : gf === ga ? 1 : 0; return acc; });
    const pace = rows.map((_, i) => Math.round((i + 1) * 1.5));
    return `<div class="card"><h2>${t('chart_form')}</h2>${FX.line([{ v: pace, dash: true, c: 'var(--mut)' }, { v: cum }], { w: 360, h: 120, min: 0, labels: rows.map((r) => r[0]) })}</div>`;
  }
  function balanceChart(club) {
    const G = UI.G, led = (G.bank.led[club.id] || []).slice(-40);
    if (led.length < 3) return '';
    let bal = B.bal(G, club.id);
    const v = [];
    for (let i = led.length - 1; i >= 0; i--) { v.unshift(bal); bal -= led[i][3]; }
    return `<div class="card"><h2>${t('chart_balance')}</h2>${FX.line([{ v }], { w: 360, h: 120 })}</div>`;
  }
  function goalsCard(c) {
    const gs = c.goals || [];
    return `<div class="card"><h2>🎯 ${t('goals_title')}</h2>${gs.length ? gs.map((g) => { const d = X.GOALS[g.k]; return `<div class="goalrow"><div class="row"><b style="flex:1">${t('goal_' + g.k)}</b><span class="mut sm">${t('goal_reward', { xp: d.xp })}</span></div><div class="bar acc"><i style="width:${Math.round((g.p / d.n) * 100)}%"></i></div><div class="mut sm">${t('goal_progress', { p: g.p, n: d.n })}</div></div>`; }).join('') : '<span class="mut">-</span>'}<p class="mut sm">${t('goals_info')}</p></div>`;
  }
  function achCard(c) {
    const have = c.ach || {};
    return `<div class="card wide"><h2>🏅 ${t('ach_title')} · ${Object.keys(have).length}/${X.ACH.length}</h2><div class="medals">${X.ACH.map((k) => `<div class="medal ${have[k] ? 'on' : ''}" title="${esc(t(k + '_d'))}"><span class="mi">${have[k] ? '🏅' : '🔒'}</span><b>${t(k)}</b><span class="mut sm">${t(k + '_d')}</span></div>`).join('')}</div></div>`;
  }
  function legendsCard() {
    const L = legends();
    return `<div class="card"><h2>🏛 ${t('legends_title')}</h2>${L.length ? L.slice().reverse().map((l) => `<div class="legrow"><b>${esc(l.name)}</b> <span class="mut sm">${esc(l.club)} · ${l.year}</span><div class="sm">${t('career_line', { seasons: l.seasons, titles: l.titles, cups: l.cups, euros: l.euros, ach: l.ach })} · ${t('legacy')} <b>${l.legacy}</b></div></div>`).join('') : `<span class="mut">${t('legends_none')}</span>`}</div>`;
  }
  function dressingCard(club) {
    const sq = Game.players(UI.G, club), tm = X.teamMood(UI.G, club), un = sq.filter((p) => X.mood(p) < 35).length;
    return `<div class="card"><h2>${t('dressing_room')}</h2><div class="row"><span class="mood big ${moodCls(tm)}" style="flex:1"><i style="width:${Math.round(tm)}%"></i></span><b>${t(X.moodLabel(tm))}</b></div>${un ? `<p class="bad sm">${t('recap_mood', { n: un })}</p>` : ''}<p class="mut sm">${t('dr_info')}</p></div>`;
  }
  function academyCard(club) {
    const G = UI.G, ac = (club.acad || []).map((id) => G.players[id]).filter(Boolean).sort((a, b) => b.pot - a.pot);
    return `<div class="card"><h2>${t('academy')}</h2>${ac.length ? tbl(['', t('sq_name'), t('sq_age'), t('sq_ovr'), t('sq_pot'), ''], ac.map((p) => `<tr><td>${posTag(p.pos)}</td><td>${starTag(p)}${plink(p)}</td><td>${p.age}</td><td>${ovTag(p.ovr)}</td><td><b>${p.pot}</b></td><td><button class="btn sm pri" data-act="promote:${p.id}">${t('promote')}</button></td></tr>`)) : `<span class="mut">${t('acad_empty')}</span>`}<p class="mut sm">${t('academy_info')}</p></div>`;
  }
  function tacticHint(f, c, club) {
    const opp = G_opp(f, c.club);
    if (!opp) return '';
    const st = opp.style || 'bal', mine = c.lineup.tactic;
    const edge = BEATS[mine] === st ? 1 : BEATS[st] === mine ? -1 : 0;
    return `<p class="sm" style="text-align:center;margin:4px 0"><span class="chip">${t('opp_style', { style: t('style_' + st) })}</span> ${edge ? `<span class="${edge > 0 ? 'good' : 'bad'}">${t(edge > 0 ? 'edge_good' : 'edge_bad')}</span>` : ''}<br><span class="mut">${t('style_tip_' + st)}</span></p>`;
  }
  function G_opp(f, id) { const o = f.h === id ? f.a : f.h; return UI.G.clubs[o]; }

  // ---------- round recap ----------
  function snapshotBefore() {
    const G = UI.G, snap = {};
    for (const co2 of G.coaches) if (co2.club) { const cl = G.clubs[co2.club]; snap[co2.id] = { pos: Game.standings(G, cl.div).indexOf(cl.id) + 1, div: cl.div }; }
    return snap;
  }
  function buildRecap(before) {
    const G = UI.G, c = co(), club = myClub();
    if (!club || !G.wk || !before || !before[c.id]) return null;
    const wk = G.wk, m = wk.matches.find((x) => x.res && (x.h === club.id || x.a === club.id));
    if (!m) return { none: true };
    const home = m.h === club.id, r = m.res;
    const gf = home ? r.hg : r.ag, ga = home ? r.ag : r.hg;
    const pts = gf > ga ? 3 : gf === ga ? 1 : 0;
    const side = home ? 'h' : 'a';
    const evs = r.ev || [];
    const st = Game.standings(G, club.div), pos = st.indexOf(club.id) + 1;
    const lg = wk.matches.filter((x) => x.res && x.div === club.div && x.k === 'L');
    const best = lg.slice().sort((a, b) => Math.abs(b.res.hg - b.res.ag) - Math.abs(a.res.hg - a.res.ag))[0];
    const un = Game.players(G, club).filter((p) => X.mood(p) < 25).length;
    return { m, home, gf, ga, pts, goals: evs.filter((e) => e[1] === 'g'), inj: evs.filter((e) => e[1] === 'i' && e[2] === side), red: evs.filter((e) => e[1] === 'r' && e[2] === side), before: before[c.id].pos, pos, league: m.k === 'L', best: best && best !== m ? best : null, un, derby: !!m.derby, st: st.length };
  }
  function showRecap(R2) {
    if (!R2) return;
    const G = UI.G, club = myClub();
    if (R2.none) { $('#modal').innerHTML = `<div class="ovl"><div class="dlg recap"><h3>${t('recap_title')}</h3><p class="mut">${t('recap_none')}</p><div class="row end"><button class="btn pri" data-act="m-cancel">${t('close')}</button></div></div></div>`; return; }
    const hc = G.clubs[R2.m.h], ac = G.clubs[R2.m.a];
    const cls = R2.pts === 3 ? 'win' : R2.pts === 1 ? 'draw' : 'loss';
    const diff = R2.before - R2.pos;
    const zone = R2.league ? (R2.pos <= 2 && club.div > 0 ? `<span class="good">▲ ${t('recap_zone_up')}</span>` : R2.pos > R2.st - 2 && club.div < CFG.DIVS - 1 ? `<span class="bad">▼ ${t('recap_zone_down')}</span>` : '') : '';
    $('#modal').innerHTML = `<div class="ovl"><div class="dlg recap ${cls}"><div class="resbanner ${cls}">${t('res_' + (cls === 'win' ? 'win' : cls === 'draw' ? 'draw' : 'loss'))}${R2.derby ? ` · ${t('derby')}` : ''}</div>
      <div class="vs"><span>${badge(hc, 30)} ${esc(hc.name)}</span><span class="score">${R2.m.res.hg} - ${R2.m.res.ag}</span><span>${badge(ac, 30)} ${esc(ac.name)}</span></div>
      ${R2.goals.length ? `<h2>⚽ ${t('recap_scorers')}</h2><div class="sm">${R2.goals.map((e) => `${e[0]}' ${esc(e[3])}`).join(' · ')}</div>` : ''}
      ${R2.inj.length ? `<p class="sm warn">🩹 ${t('recap_injured')}: ${R2.inj.map((e) => esc(e[3])).join(', ')}</p>` : ''}
      ${R2.red.length ? `<p class="sm bad">🟥 ${t('recap_red')}: ${R2.red.map((e) => esc(e[3])).join(', ')}</p>` : ''}
      ${R2.league ? `<h2>${t('recap_table')}</h2><div class="row"><b style="font-size:1.4rem">${R2.pos}º</b><span class="${diff > 0 ? 'good' : diff < 0 ? 'bad' : 'mut'}">${diff > 0 ? '▲' + diff : diff < 0 ? '▼' + -diff : '='}</span> ${zone}${R2.pos === 1 ? ` <span class="good">🏆 ${t('recap_leader')}</span>` : ''}</div>` : ''}
      ${R2.best ? `<p class="sm mut">${t('recap_best')}: ${ctag(R2.best.h, 14)} ${R2.best.res.hg}-${R2.best.res.ag} ${ctag(R2.best.a, 14)}</p>` : ''}
      ${R2.un ? `<p class="sm bad">${t('recap_mood', { n: R2.un })}</p>` : ''}
      <div class="row end"><button class="btn pri" data-act="m-cancel">${t('close')}</button></div></div></div>`;
    UI.mok = null;
    FX.play(R2.pts === 3 ? 'goal' : 'whistle');
  }

  function mrow(p, c) {
    const G = UI.G;
    return `<tr><td>${starTag(p)}${plink(p)}${hotTag(p)}</td><td>${posTag(p.pos)}</td><td>${p.age}</td><td>${ovTag(p.ovr)}</td><td class="mut">${potCell(p)}</td><td>${p.club ? ctag(p.club, 16) : t('free_agent')}</td><td class="r">${p.club ? money(A.askPrice(G, c, p)) : '-'}</td>
      <td class="act">${watchBtn(p)}${scoutBtn(p)}<button class="btn sm pri" data-act="${p.club ? 'buy' : 'sign'}:${p.id}">${p.club ? t('buy') : t('sign')}</button></td></tr>`;
  }
  const mhead = () => [t('sq_name'), t('sq_pos'), t('sq_age'), t('sq_ovr'), t('sq_pot'), t('club'), '>' + t('asking_price'), ''];
  function scoutView(c, club) {
    const G = UI.G, gems = (c.gems || []).map((id) => G.players[id]).filter((p) => p && p.club && !G.clubs[p.club].human);
    return `<div class="card" style="margin-bottom:14px"><p>${t('scout_info')}</p><button class="btn pri" data-act="scoutrep">🔎 ${t('scout_order', { cost: CFG.scoutCost[club.div] })}</button></div>
      <div class="card"><h2>${t('gems_title')}</h2>${gems.length ? tbl(mhead(), gems.map((p) => mrow(p, c)), 'mkt') : `<span class="mut">${t('gems_none')}</span>`}</div>`;
  }
  function watchView(c) {
    const G = UI.G, ps = (c.watch || []).map((id) => G.players[id]).filter((p) => p && p.club && !G.clubs[p.club].human);
    return `<div class="card">${ps.length ? tbl(mhead(), ps.map((p) => mrow(p, c)), 'mkt') : `<span class="mut">${t('watch_empty')}</span>`}</div>`;
  }
  function overView() {
    const S = UI.G.over, b = X.bonusFor(S.legacy);
    return `<div class="wrap"><div class="hero"><h1>🏛 ${t('career_end')}</h1></div><div class="grid"><div class="card hl"><h2>${esc(S.name)}</h2><p>${t('career_line', { seasons: S.seasons, titles: S.titles, cups: S.cups, euros: S.euros, ach: S.ach })}</p><p class="big">${t('legacy')}: ${S.legacy}</p><p class="good">${t('bonus_info', { rep: b.rep, xp: b.xp })}</p><button class="btn pri" data-act="newcareer">${t('new_career')}</button></div>${legendsCard()}</div></div>`;
  }
  function bonusOpt() {
    const l = legends().slice().reverse().find((x) => !x.used);
    if (!l) return '';
    const b = X.bonusFor(l.legacy);
    return `<label class="row" style="margin:8px 0"><input type="checkbox" id="usebonus" checked> ${t('use_bonus', { rep: b.rep, xp: b.xp })}</label>`;
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
    if (k.startsWith('f:')) { UI.f[k.slice(2)] = el.type === 'checkbox' ? el.checked : el.value; return render(); }
    if (k.startsWith('act:')) {
      const v = el.value; el.value = '';
      if (v) onClick({ target: { closest: () => ({ dataset: { act: v + ':' + k.slice(4) } }) } });
      return;
    }
    if (k === 'sound') { SF.Fx.setSound(el.value === '1'); SF.Fx.play('ding'); return render(); }
    if (k === 'recap') { localStorage.setItem(RECAPK, el.checked ? '1' : '0'); return; }
    if (k === 'theme') { localStorage.setItem(THEMEK, el.value); return render(); }
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
    if (e.preventDefault && el.tagName === 'A') e.preventDefault();
    const [act, arg] = el.dataset.act.split(':');
    const G = UI.G;
    if (act === 'm-cancel') { closeModal(); return popups(); }
    if (act === 'm-ok') { const r = UI.mok ? UI.mok(readModal()) : true; if (r !== false) closeModal(); return; }
    if (act === 'setup-start') return setupStart();
    if (act === 'continue') { try { UI.G = Game.deserialize(localStorage.getItem(SAVE)); render(); } catch (err) { toast(t('import_bad'), true); } return; }
    if (!G) return;
    const c = co();
    switch (act) {
      case 'tab': UI.tab = arg; return render();
      case 'coach': UI.ci = +arg; UI.tab = 'home'; return render();
      case 'tr': UI.tr = arg; return render();
      case 'eu': UI.eu = arg; return render();
      case 'setprice': return res(A.setPrice(G, c, parseFloat(arg)), t('ok_done'));
      case 'reneg': { const r = A.renegotiate(G, c, +arg); return res(r, r.ok ? t('ok_renegotiated', { saved: r.saved }) : ''); }
      case 'loanin': {
        const [pid, n] = arg.split('-').map(Number), p = G.players[pid];
        return modal(`<h3>${starTag(p)}${plink(p)} ${posTag(p.pos)} ${ovTag(p.ovr)}</h3><p class="mut">${ctag(p.club, 16)} · ${t('loan_seasons_n', { n })} · ${t('cost')}: <b>${money(A.loanInFee(G, c, p, n))}</b> + ${t('sq_wage')} ${money(p.wage)}</p>`, () => { const r = A.loanIn(G, c, pid, n); return res(r, r.ok ? t('ok_loan_in', { name: p.n }) : ''); });
      }
      case 'loanout': {
        const p = G.players[+arg];
        return modal(`<h3>${starTag(p)}${plink(p)} ${ovTag(p.ovr)}</h3><p>${t('loan_out_q', { name: esc(p.n) })}</p><label>${t('loan_seasons')}</label><select name="n"><option value="1">${t('loan_seasons_n', { n: 1 })} · ${money(A.loanOutFee(G, c, p, 1))}</option><option value="2">${t('loan_seasons_n', { n: 2 })} · ${money(A.loanOutFee(G, c, p, 2))}</option></select>`, (f) => { const r = A.loanOut(G, c, p.id, +f.n); return res(r, r.ok ? t('ok_loan_out', { fee: r.fee }) : ''); });
      }
      case 'vac-start': return res(A.setVacation(G, c, +arg), t('ok_done'));
      case 'vac-stop': return res(A.setVacation(G, c, 0));
      case 'vac-run': {
        if (!G.coaches.every((x) => !x.club || x.vac > 0)) { toast(t('vac_blocked'), true); return; }
        let g = 0;
        while (G.phase === 'play' && G.coaches.every((x) => !x.club || x.vac > 0) && g++ < 45) Game.playWeekAuto(G);
        save(); UI.tab = 'home'; return render();
      }
      case 'lg': UI.lg = arg; return render();
      case 'md': UI.md = +arg; return render();
      case 'afford': UI.f.maxPrice = String(Math.max(0, Math.floor(B.bal(G, myClub().id)))); return render();
      case 'play-live': return playWeek(true);
      case 'sim-week': return playWeek(false);
      case 'sim-season': return simSeason();
      case 'next-season': Game.newSeason(G); save(); UI.tab = 'home'; return render();
      case 'live-toggle': { const L = UI.live; if (L.paused && L.mt.min === 0) SF.Fx.play('whistle'); L.ht = false; L.paused = !L.paused; if (!L.paused) liveStartTimer(); else clearInterval(L.timer); return liveTickRender(); }
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
        return modal(`<h3>${esc(p.n)}</h3><label>${t('renew_years')}</label><select name="y"><option>1</option><option selected>2</option><option>3</option><option>4</option></select><p class="mut sm">${t('sq_wage')}: ${money(Math.round(E.wage(p) / 10) * 10)}</p>`, (f) => res(A.renew(G, c, p.id, +f.y), t('ok_done')));
      }
      case 'buy': {
        const p = G.players[+arg], ask = A.askPrice(G, c, p);
        return modal(`<h3>${esc(p.n)} ${posTag(p.pos)} ${ovTag(p.ovr)}</h3><p class="mut">${ctag(p.club, 16)} · ${t('asking_price')}: ${money(ask)}</p>${p.hot ? '<p class="sm warn">🔥 ' + t('hot_info', { n: p.hot.left }) + '</p>' : ''}<p class="sm mut">${t('clause_info', { fee: E.clause(p) })}</p><label>${t('offer_fee')}</label><input name="fee" type="number" value="${ask}">`, (f) => {
          const r = A.buy(G, c, p.id, +f.fee);
          if (r.ok) { toast(t('ok_bought', { name: p.n, fee: r.fee })); save(); render(); return true; }
          toast(errMsg(r), true); return false;
        }, t('send_offer'));
      }
      case 'pl': return sheet(+arg);
      case 'wt': { const r = A.watch(G, c, +arg); if (!r.ok) { toast(errMsg(r), true); return; } save(); render(); if ($('#modal .sheet')) sheet(+arg); return; }
      case 'scout': { const r = A.scoutPlayer(G, c, +arg); if (!r.ok) { toast(errMsg(r), true); return; } toast(t('ok_done')); save(); render(); if ($('#modal .sheet')) sheet(+arg); return; }
      case 'scoutrep': { UI.tr = 'scout'; return res(A.scoutReport(G, c), t('ok_done')); }
      case 'capt': { const r = A.setCaptain(G, c, +arg); if (!r.ok) { toast(errMsg(r), true); return; } save(); render(); if ($('#modal .sheet')) sheet(+arg); return; }
      case 'promote': { closeModal(); return res(A.promote(G, c, +arg), t('ok_done')); }
      case 'retire': return modal(`<p>${t('retire_confirm')}</p>`, () => { const r = A.retire(G, c); const L = legends(); L.push(r.summary); saveLegends(L); UI.ci = 0; UI.tab = 'home'; save(); render(); });
      case 'newcareer': localStorage.removeItem(SAVE); UI.G = null; UI.setup = null; return render();
      case 'snd': SF.Fx.setSound(!SF.Fx.soundOn()); SF.Fx.play('ding'); return render();
      case 'sign': { const p = G.players[+arg]; const r = A.signFree(G, c, p.id); return res(r, r.ok ? t('ok_bought', { name: p.n, fee: r.cost }) : ''); }
    }
  }

  window.addEventListener('DOMContentLoaded', init);
})();
