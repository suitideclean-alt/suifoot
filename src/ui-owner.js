/* SuiFoot owner pages (v0.8): Summary, Finance, Data, Commercial, Club, Team, Reputation, Hall of fame.
 * Loaded after ui.js, which exposes its helpers as UI.h. */
(function () {
  const SF = globalThis.SF;
  const UI = SF.UI, { Game, Bank: B, CFG, util } = SF;
  const Bo = () => SF.Boss, O = () => SF.Owner;
  const t = (k, p) => SF.I18N.t(k, p);
  const H = () => UI.h;
  const SUBS = ['summary', 'sfoot', 'data', 'commercial', 'club', 'team', 'rep', 'hall'];
  const AXES = ['hon', 'free', 'mot', 'pat', 'amb', 'sta'];
  const BADGES = ['champion', 'builder', 'trainer', 'balanced', 'loyal', 'savior', 'debtfree', 'honest'];
  const sgn = (n) => (n >= 0 ? '+' : '') + H().money(Math.round(n));
  const pct = (x) => Math.round(x * 100) + '%';

  // ---------- small building blocks ----------
  const kpi = (label, value, sub, cls) => `<div class="kpi"><span class="kl">${label}</span><b class="${cls || ''}">${value}</b><span class="ks">${sub || '&nbsp;'}</span></div>`;
  const kpis = (arr) => `<div class="kpis">${arr.join('')}</div>`;
  const page = (title, note, body) => `<div class="pagehead"><h2>${title}</h2><p class="mut sm">${note}</p></div>${body}`;
  const sec = (title, note) => `<div class="card wide secbar"><h3>${title}</h3>${note ? `<p class="mut sm">${note}</p>` : ''}</div>`;
  const seg = (act, opts, cur) => `<div class="seg">${opts.map((o) => `<button class="${String(o.v) === String(cur) ? 'on' : ''}" data-act="${act}:${o.v}"><b>${o.l}</b>${o.s ? `<span>${o.s}</span>` : ''}</button>`).join('')}</div>`;
  const bar = (v, cls) => `<div class="bar ${cls || ''}"><i style="width:${util.clamp(v, 0, 100)}%"></i></div>`;
  const row = (l, v, cls) => `<div class="row"><span>${l}</span><b class="${cls || ''}">${v}</b></div>`;
  const kl = (k) => (SF.I18N.D['k_' + k] ? t('k_' + k) : k);
  const lvlCls = (v) => (v < 40 ? 'red' : v < 60 ? 'yel' : '');

  function ctx() {
    const h = H(), G = UI.G, c = h.co(), club = h.myClub();
    return { h, G, c, club, b: club && club.boss };
  }

  // ---------- navigation ----------
  UI.owner = {
    view(c, club) {
      const sub = SUBS.includes(UI.ot) ? UI.ot : 'summary';
      const G = UI.G, open = O().openFor(G, club.id).length;
      const bar = `<div class="sub">${SUBS.map((k) => `<button class="${sub === k ? 'on' : ''}" data-act="ot:${k}">${t('os_' + k)}${k === 'summary' && open ? ` <span class="dot">${open}</span>` : ''}</button>`).join('')}</div>`;
      if (!club.boss) Bo().init(G, club);
      const fn = { summary, sfoot: (c2, cl) => H().sfootPage(c2, cl), data, commercial, club: clubPage, team, rep, hall }[sub];
      return bar + fn(c, club);
    },
    financePage: (c, club) => { if (!club.boss) Bo().init(UI.G, club); return finance(c, club); },
    act(act, arg, el) {
      const fn = ACTS[act];
      if (!fn) return false;
      const { h, G, c } = ctx();
      fn(arg || '', h, G, c);
      return true;
    },
  };

  // ---------- 1. summary ----------
  function summary(c, club) {
    const h = H(), G = UI.G, b = club.boss, B_ = Bo();
    const fc = B_.forecast(G, club), fl = B_.seasonFlows(G, club), val = B_.value(G, club), prev = b.val.length ? b.val[b.val.length - 1][1] : b.v0;
    const o = B_.ensureOwner(G, c), open = O().openFor(G, club.id);
    const net = fl.totIn - fl.totOut;
    const inbox = `<div class="card ${open.length ? 'hl' : ''}"><h2>${t('rq_open_title')}</h2>${open.length ? open.map((a) => `<div class="row"><span>${h.esc(t('ap_' + a.kind))} <b>${h.esc(a.name || '')}</b>${a.cost ? ' · ' + h.money(a.cost) : ''} <span class="mut sm">(${h.esc(t('why_' + a.why))})</span></span><span><button class="btn pri" data-act="apy:${a.id}">${t('rq_approve')}</button> <button class="btn" data-act="apn:${a.id}">${t('rq_decline')}</button></span></div>`).join('') : `<span class="good">✓ ${t('rq_none')}</span>`}
      <h3 class="sm mut" style="margin-top:12px">${t('rq_title')}</h3>${O().mine(G, c.id).filter((a) => a.status !== 'open').slice(0, 5).map((a) => `<div class="row sm"><span>${h.esc(t('ap_' + a.kind))} ${h.esc(a.name || '')}${a.cost ? ' · ' + h.money(a.cost) : ''}</span>${h.rqStatus(a)}</div>`).join('') || `<span class="mut sm">-</span>`}</div>`;
    const tips = tipList(c, club);
    const ac = club.ac, ct = ac && ac.contract;
    const coachCard = `<div class="card"><h2>${t('ac_title')}</h2>${ac ? `<div class="row"><b>${h.esc(ac.name)}</b><span class="mut">${t('ac_rep')} ${ac.rep} · ${t('ct_left')} ${(Math.max(0, ct.left) / CFG.owner.W).toFixed(1)}</span></div><div class="row sm"><span>${t('ow_conf')}</span><span>${Math.round(ac.board)}/100</span></div>${bar(ac.board, lvlCls(ac.board))}` : `<p class="warn">${t('ac_none')}</p>`}<button class="btn" style="margin-top:10px" data-act="tab:coach">${t('of_coach_open')}</button></div>`;
    return page(t('os_summary'), t('ow_summary_note'), `${kpis([
      kpi(t('balance') + ' (USD)', h.mc(fc.bal), t('ow_fc_end', { amt: h.mc(fc.end) }), fc.bal < 0 ? 'bad' : ''),
      kpi('SFOOT', h.mc(O().sfBal(G, c.id)), t('os_sfoot_sub'), ''),
      kpi(t('ow_season_net'), (net >= 0 ? '+' : '') + h.mc(net), t('ow_wk', { n: b.wk, m: CFG.TOTAL_WEEKS }), net >= 0 ? 'good' : 'bad'),
      kpi(t('ow_value'), h.mc(val), (val >= prev ? '▲ ' : '▼ ') + h.mc(Math.abs(val - prev)), val >= prev ? 'good' : 'bad'),
      kpi(t('os_rep'), o.orep + '/100', t('style_' + B_.style(o)), lvlCls(o.orep)),
      kpi(t('ow_fans'), Math.round(b.sup) + '/100', t('ow_fans_sub', { n: h.money(club.fans) }), lvlCls(b.sup))])}
      <div class="grid">${inbox}<div class="card"><h2>${t('sg_title')}</h2>${tips}</div>${coachCard}${h.balanceChart(club)}</div>`);
  }
  function tipList(c, club) {
    const h = H(), G = UI.G, B_ = Bo();
    const ic = ['✅', '💡', '⚠️', '🚨'];
    const go = { zero: 'finance', endneg: 'finance', ffp: 'finance', sponsor: 'commercial', sup: 'commercial', acad: 'club', event: 'commercial', idle: 'club', neglect: 'club', orep: 'rep' };
    const items = B_.tips(G, club).map((x) => `<div class="tip s${x.sev}"><div class="ic">${ic[x.sev]}</div><div class="body">${t('bt_' + x.k, x.x)}<div class="acts"><button class="btn sm" data-act="ot:${go[x.k]}">${t('os_' + go[x.k])} →</button></div></div></div>`);
    const base = h.ownerTips(c, club).filter((x) => x !== t('sg_ok')).map((x) => `<div class="tip s1"><div class="ic">💡</div><div class="body">${x}</div></div>`);
    const all = items.concat(base);
    return all.length ? all.join('') : `<div class="tip s0"><div class="ic">✅</div><div class="body">${t('sg_ok')}</div></div>`;
  }

  // ---------- 2. finance ----------
  function finance(c, club) {
    const h = H(), G = UI.G, b = club.boss, B_ = Bo();
    const fl = B_.seasonFlows(G, club), fc = B_.forecast(G, club), ef = B_.efficiency(G, club), ff = B_.ffp(G, club);
    const net = fl.totIn - fl.totOut;
    const mx = Math.max(1, ...Object.values(fl.inc), ...Object.values(fl.out));
    const list = (o, cls) => Object.entries(o).sort((a, z) => z[1] - a[1]).slice(0, 9).map(([k, v]) => `<div class="line"><span>${kl(k)}</span><div class="bar ${cls}"><i style="width:${Math.min(100, (v / mx) * 100)}%"></i></div><span class="r" style="text-align:right">${h.mc(v)}</span></div>`).join('');
    const flows = `<div class="card wide"><h2>${t('ow_flows')}</h2><div class="grid"><div class="mm"><h3 class="sm good">${t('mm_in')}: ${h.money(fl.totIn)}</h3>${list(fl.inc, '')}</div><div class="mm"><h3 class="sm bad">${t('mm_out')}: ${h.money(fl.totOut)}</h3>${list(fl.out, 'yel')}</div></div></div>`;
    const fcard = `<div class="card hl"><h2>${t('ow_forecast')}</h2>${row(t('ow_fc_avg'), (fc.avg >= 0 ? '+' : '') + h.money(fc.avg) + '/' + t('ow_wk_short'), fc.avg >= 0 ? 'good' : 'bad')}${row(t('ow_fc_left'), fc.left + ' ' + t('ow_wk_short'))}${row(t('ow_fc_end_l'), h.money(fc.end), fc.end >= 0 ? 'good' : 'bad')}
      ${fc.zero != null ? `<p class="bad">${t('ow_fc_zero', { n: fc.zero - b.wk })}</p>` : fc.avg < 0 ? `<p class="warn">${t('ow_fc_neg')}</p>` : `<p class="good">${t('ow_fc_ok')}</p>`}</div>`;
    const ffpOk = ff.over === 0, usedPct = ff.limit ? Math.min(100, Math.max(0, (-ff.net / ff.limit) * 100)) : 0;
    const ffp = `<div class="card"><h2>${t('ow_ffp')}</h2><p class="mut sm">${t('ow_ffp_note', { p: Math.round(CFG.owner ? 10 : 10) })}</p>${row(t('ow_ffp_net'), sgn(ff.net), ff.net >= 0 ? 'good' : 'bad')}${row(t('ow_ffp_limit'), h.money(ff.limit))}${bar(ff.net >= 0 ? 0 : usedPct, ffpOk ? (usedPct > 70 ? 'yel' : '') : 'red')}
      <p class="${ffpOk ? 'good' : 'bad'}">${ffpOk ? t('ow_ffp_ok') : t('ow_ffp_over', { amt: h.money(ff.over) })}</p>${ff.fines ? `<p class="mut sm">${t('ow_ffp_fines', { amt: h.money(ff.fines) })}</p>` : ''}</div>`;
    // financing
    const stakeSold = 1 - B_.stake(club);
    const stakeBtns = [0.05, 0.1, 0.2].map((p) => `<button class="btn sm" data-act="o_stake:${p}" ${stakeSold + p > 0.4 + 1e-9 ? 'disabled' : ''}>${Math.round(p * 100)}% · +${h.mc(B_.stakeOffer(G, club, p))}</button>`).join(' ');
    const inv = `<div class="card"><h2>${t('ow_investors')}</h2><p class="mut sm">${t('ow_investors_note')}</p>${row(t('ow_stake_yours'), pct(B_.stake(club)))}
      <div class="row wrapb" style="margin:8px 0">${stakeBtns}</div>${b.invest.length ? h.tbl([t('ow_stake'), '>' + t('ow_stake_paid'), ''], b.invest.map((i) => `<tr><td>${pct(i.pct)}</td><td class="r">${h.money(i.paid)}</td><td><button class="btn sm" data-act="o_buyback:${i.id}">${t('ow_buyback')} · ${h.mc(B_.buybackCost(G, club, i))}</button></td></tr>`)) : `<span class="mut sm">${t('ow_none')}</span>`}</div>`;
    const bonds = `<div class="card"><h2>${t('ow_bonds')}</h2><p class="mut sm">${t('ow_bonds_note', { max: h.money(B_.bondMax(G, club)) })}</p>
      <div class="line"><label>${t('ow_bond_amt')}</label><input type="number" id="bond-amt" min="0" step="10000" value="100000"></div>
      <div class="line"><label>${t('ow_bond_yrs')}</label><select id="bond-yrs"><option>1</option><option>2</option><option>3</option></select></div>
      <button class="btn pri" data-act="o_bond">${t('ow_bond_issue')}</button>
      ${b.bonds.length ? h.tbl([t('ow_bond_amt'), '>' + t('ow_bond_due'), '>' + t('ow_bond_wk'), ''], b.bonds.map((x) => `<tr><td>${h.money(x.amt)}</td><td class="r">${h.money(x.due)}</td><td class="r">${h.money(x.weekly)}</td><td><button class="btn sm" data-act="o_repay:${x.id}">${t('repay_early')}</button></td></tr>`)) : ''}</div>`;
    const hist = (club.pl || []).slice().reverse();
    const hcard = `<div class="card wide"><h2>${t('biz_pl')}</h2>${hist.length ? h.tbl([t('season'), '>' + t('fin_income'), '>' + t('fin_expenses'), '>' + t('biz_net'), '#'], hist.map((x) => `<tr><td>${x.s}</td><td class="r">${h.money(x.inc)}</td><td class="r">${h.money(x.exp)}</td><td class="r ${x.net >= 0 ? 'good' : 'bad'}">${sgn(x.net)}</td><td class="r">${x.pos}</td></tr>`)) : `<span class="mut">${t('biz_none')}</span>`}</div>`;
    return page(t('os_finance'), t('ow_finance_note'), `${kpis([
      kpi(t('fin_income'), h.mc(fl.totIn), t('ow_this_season')), kpi(t('fin_expenses'), h.mc(fl.totOut), t('ow_this_season')),
      kpi(t('biz_net'), (net >= 0 ? '+' : '') + h.mc(net), '', net >= 0 ? 'good' : 'bad'), kpi(t('biz_ratio'), pct(ef.wageRatio), t('ow_ratio_sub'), ef.wageRatio > 0.62 ? 'bad' : '')])}
      <div class="grid">${fcard}${ffp}${flows}${sec(t('ow_financing'), t('ow_financing_note'))}${inv}${bonds}${hcard}</div>`);
  }

  // ---------- 3. data ----------
  function data(c, club) {
    const h = H(), G = UI.G, b = club.boss, B_ = Bo();
    const ef = B_.efficiency(G, club), cmp = B_.compare(G, club), sr = B_.squadReturn(G, club);
    const vals = b.val.map((x) => x[1]).concat([B_.value(G, club)]);
    const vchart = `<div class="card"><h2>${t('ow_value_hist')}</h2>${vals.length > 1 ? h.fx.line([{ v: vals }], { w: 360, h: 120 }) : `<span class="mut sm">${t('biz_none')}</span>`}<p class="mut sm">${t('ow_value_note')}</p></div>`;
    const eff = `<div class="card"><h2>${t('ow_eff')}</h2>${row(t('ow_cost_pt'), ef.perPoint != null ? h.money(ef.perPoint) : '-')}${row(t('ow_cost_goal'), ef.perGoal != null ? h.money(ef.perGoal) : '-')}${row(t('biz_ratio'), pct(ef.wageRatio), ef.wageRatio > 0.62 ? 'bad' : '')}<p class="mut sm">${t('ow_eff_note')}</p></div>`;
    const lab = { wages: t('ow_c_wages'), value: t('ow_c_value'), balance: t('balance'), debt: t('ow_c_debt'), fans: t('club_fans'), cap: t('capacity'), price: t('ticket_price'), strength: t('strength') };
    const fmt = (k, v) => (k === 'price' ? v.toFixed(1) : k === 'strength' ? v.toFixed(1) : h.mc(v));
    const comp = `<div class="card"><h2>${t('ow_vs')}</h2>${h.tbl(['', '>' + t('ow_you'), '>' + t('ow_avg'), '>#'], Object.keys(lab).map((k) => `<tr><td>${lab[k]}</td><td class="r"><b>${fmt(k, cmp[k].mine)}</b></td><td class="r mut">${fmt(k, cmp[k].avg)}</td><td class="r">${cmp[k].rank}/${CFG.PER_DIV}</td></tr>`))}</div>`;
    const pr = (x) => `<div class="row sm"><span>${h.posTag(x.p.pos)} ${h.plink(x.p)} ${h.ovTag(x.p.ovr)}</span><span>${h.money(x.perApp)}/${t('ow_app')}</span></div>`;
    const sq = `<div class="card"><h2>${t('ow_sqret')}</h2><h3 class="sm good">${t('ow_best')}</h3>${sr.best.map(pr).join('') || '-'}<h3 class="sm bad" style="margin-top:8px">${t('ow_worst')}</h3>${sr.worst.map(pr).join('') || '-'}<p class="mut sm">${t('ow_sqret_note')}</p></div>`;
    const parts = B_.supParts(G, club);
    const therm = `<div class="card"><h2>${t('ow_thermo')}</h2>
      ${row(t('ow_fans'), Math.round(b.sup) + '/100', lvlCls(b.sup))}${bar(b.sup, lvlCls(b.sup))}
      <div class="sm" style="margin:6px 0 12px">${parts.length ? parts.map(([k, v]) => `<span class="chip ${v > 0 ? 'ok' : 'no'}">${t('sp_' + k)} ${v > 0 ? '+' : ''}${v}</span>`).join(' ') : `<span class="mut">${t('ow_none')}</span>`}</div>
      ${row(t('team_mood'), '', '')}${bar(avgMood(club), lvlCls(avgMood(club)))}
      ${club.ac ? row(t('ow_conf'), Math.round(club.ac.board) + '/100') + bar(club.ac.board, lvlCls(club.ac.board)) : ''}</div>`;
    return page(t('os_data'), t('ow_data_note'), `<div class="grid">${h.balanceChart(club)}${vchart}${comp}${eff}${sq}${therm}</div>`);
  }
  function avgMood(club) { const G = UI.G, m = Game.players(G, club).map((p) => SF.Extras.mood(p)); return Math.round(util.avg(m)); }

  // ---------- 4. commercial ----------
  function commercial(c, club) {
    const h = H(), G = UI.G, b = club.boss, B_ = Bo();
    const kindName = (k) => t('sp_k_' + k);
    const deal = (d) => `${h.esc(d.name)} · <b>${kindName(d.k)}</b>`;
    const detail = (d, y) => `${h.money(d.w)}/${t('ow_wk_short')}${d.win ? ' · ' + t('ow_spon_win', { amt: h.money(d.win) }) : ''}${d.title ? ' · ' + t('ow_spon_title', { amt: h.money(d.title) }) : ''} · ${t('ow_years', { n: y })}${d.k === 'naming' ? ' · <span class="bad">' + t('ow_naming_cost') + '</span>' : ''}`;
    let spon;
    if (b.spon) {
      const s = b.spon;
      spon = `<div class="card hl"><h2>${t('ow_sponsor')}</h2><div class="row"><span>${deal(s)}</span></div><p class="sm">${detail(s, (s.left / CFG.TOTAL_WEEKS).toFixed(1))}</p><button class="btn dng" data-act="o_sponbreak">${t('ow_spon_break')} · ${h.mc(B_.sponsorBreakCost(b))}</button></div>`;
    } else {
      const offers = B_.offers(G, club);
      spon = `<div class="card hl"><h2>${t('ow_sponsor')}</h2><p class="warn">${t('ow_spon_none')}</p>${offers.map((o) => `<div class="tip s1"><div class="body"><div class="row"><span>${deal(o)}</span><button class="btn sm pri" data-act="o_spon:${o.id}">${t('ow_sign')}</button></div><div class="sm">${detail(o, o.years)}</div><div class="mut sm">${t('sp_d_' + o.k)}</div></div></div>`).join('')}</div>`;
    }
    const kitDone = b.kitUsed === G.season;
    const merch = `<div class="card"><h2>${t('ow_merch')}</h2><p class="mut sm">${t('ow_merch_note')}</p>${seg('o_merch', ['low', 'normal', 'premium'].map((v) => ({ v, l: t('ow_p_' + v), s: t('ow_merch_' + v) })), b.merch)}
      <div class="row" style="margin-top:10px"><button class="btn" data-act="o_kit" ${kitDone ? 'disabled' : ''}>${t('ow_kit')} · ${h.ic(club, B_.kitCost(club))}</button><span class="mut sm">${b.kitLeft > 0 ? t('ow_kit_on', { n: b.kitLeft }) : kitDone ? t('ow_kit_used') : t('ow_kit_note')}</span></div></div>`;
    const mem = `<div class="card"><h2>${t('ow_members')}</h2><p class="mut sm">${t('ow_members_note')}</p>${seg('o_member', ['low', 'normal', 'high'].map((v) => ({ v, l: t('ow_p_' + v), s: t('ow_mem_' + v) })), b.member)}</div>`;
    const evs = ['concert', 'friendly', 'tour'].map((k) => `<div class="tip s1"><div class="body"><div class="row"><span><b>${t('ev_' + k)}</b> <span class="mut sm">· ${t('ow_cost')} ${h.ic(club, B_.eventCost(club, k))}</span></span><button class="btn sm pri" data-act="o_event:${k}" ${b.evN >= 2 ? 'disabled' : ''}>${t('ow_run')}</button></div><div class="mut sm">${t('ev_d_' + k)}</div></div></div>`).join('');
    const ev = `<div class="card wide"><h2>${t('ow_events')} <span class="mut" style="text-transform:none">· ${t('ow_events_left', { n: 2 - b.evN })}</span></h2>${evs}</div>`;
    const att = Game.attendance(club);
    const tick = `<div class="card"><h2>${t('ticket_price')}</h2>${club.mgr ? `<p class="mut sm">${t('ow_mgr_prices', { name: h.esc(club.mgr.name) })}</p>` : ''}
      <div class="row"><button class="btn sm" data-act="price:-0.1">−</button><b class="big">${club.price.toFixed(1)}</b><button class="btn sm" data-act="price:0.1">+</button><span class="mut sm">${t('ow_ref_price', { n: CFG.refPrice[club.div].toFixed(1) })}</span></div>
      ${row(t('exp_attendance'), h.money(att) + ' / ' + h.money(club.cap))}${bar((att / club.cap) * 100, '')}<p class="mut sm">${t('ow_ticket_note')}</p></div>`;
    return page(t('os_commercial'), t('ow_commercial_note'), `<div class="grid">${spon}${tick}${merch}${mem}${ev}</div>`);
  }

  // ---------- 5. club (investments) ----------
  function clubPage(c, club) {
    const h = H(), G = UI.G, b = club.boss, B_ = Bo(), A = SF.Actions;
    const lineRow = (k, icon) => `<div class="tip s1"><div class="body"><div class="row"><b>${icon} ${t('ln_' + k)}</b><span class="mut sm">${b.lines[k] ? t('ow_per_wk', { amt: h.ic(club, B_.lineCost(club, k, b.lines[k])) }) : t('ow_off')}</span></div>
      ${seg('o_line', [0, 1, 2, 3].map((n) => ({ v: k + '-' + n, l: n ? String(n) : '–', s: n ? h.mc(B_.lineCost(club, k, n)) : '' })), k + '-' + b.lines[k])}<div class="mut sm" style="margin-top:6px">${t('ln_d_' + k)}</div></div></div>`;
    const lines = `<div class="card wide"><h2>${t('ow_lines')}</h2><p class="mut sm">${t('ow_lines_note')}</p>${lineRow('acad', '🎓')}${lineRow('mkt', '📣')}${lineRow('comm', '🤝')}</div>`;
    const step = A.expandStep(club);
    const steps = [1, 2, 3].map((n) => `<button class="btn sm" data-act="expand:${n}" ${club.build || b.build ? 'disabled' : ''}>+${h.money(n * step)} · ${h.ic(club, A.stadiumCost(G, club, n))}</button>`).join(' ');
    const att = Game.attendance(club);
    const projRow = (k) => { const lv = b.proj[k]; return `<div class="row"><span style="flex:1;min-width:150px"><b>${t('pj_' + k)}</b> <span class="mut sm">${t('level')} ${lv}/${B_.MAXPROJ}</span><div class="mut sm">${t('pj_d_' + k)}</div></span>${lv < B_.MAXPROJ ? `<button class="btn sm" data-act="o_proj:${k}" ${b.build || club.build ? 'disabled' : ''}>${t('upgrade')} · ${h.ic(club, B_.projCost(club, k))}</button>` : `<span class="good sm">✓ ${t('ow_max')}</span>`}</div>`; };
    const works = b.build ? `<p class="warn">${t('ow_works', { k: t('pj_' + b.build.k), n: b.build.left })}</p>` : club.build ? `<p class="warn">${t('building', { seats: club.build.seats, left: club.build.left })}</p>` : '';
    const fac = (k) => { const l = club.facility[k]; return `<div class="row"><span style="min-width:150px">${t('fac_' + k)}</span><span>${t('level')} ${l}/${CFG.facMax}</span>${l < CFG.facMax ? `<button class="btn sm" data-act="fac:${k}">${t('upgrade')} · ${h.ic(club, A.facilityCost(club, k))}</button>` : ''}</div>`; };
    const stad = `<div class="card"><h2>${t('stadium')}</h2>${h.fx.stadium(att / club.cap, club)}<p>${t('capacity')}: <b>${h.money(club.cap)}</b> · ${t('exp_attendance')}: <b>${h.money(att)}</b></p>${works}<div class="row wrapb">${steps}</div>
      <h2 style="margin-top:14px">${t('ow_projects')}</h2>${PROJ.map(projRow).join('')}</div>`;
    const facs = `<div class="card"><h2>${t('facilities')}</h2><p class="mut sm">${t('ow_fac_note')}</p>${fac('youth')}${fac('train')}</div>`;
    const cands = B_.partnerCandidates(G, club);
    const part = club.boss.partner;
    const partner = `<div class="card"><h2>${t('ow_partner')}</h2><p class="mut sm">${t('ow_partner_note', { amt: h.mc(Math.round(B_.unit(club) * 0.04)) })}</p>
      ${part ? `<div class="row"><span>${h.ctag(part.club, 16)}</span><button class="btn sm" data-act="o_partner:none">${t('ow_end')}</button></div>` : cands.length ? `<div class="line"><select id="partner-sel">${cands.map((id) => `<option value="${id}">${h.esc(G.clubs[id].name)} · ${t('div_n', { n: G.clubs[id].div + 1 })}</option>`).join('')}</select> <button class="btn pri" data-act="o_partner:sel">${t('ow_partner_set')}</button></div>` : `<span class="mut sm">${t('ow_partner_none')}</span>`}</div>`;
    return page(t('os_club'), t('ow_club_note'), `<div class="grid">${lines}${stad}${facs}${partner}${h.ownerManager(c, club)}</div>`);
  }
  const PROJ = ['roof', 'lights', 'museum', 'med'];

  // ---------- 6. team ----------
  function team(c, club) { const h = H(); return page(t('os_team'), t('ow_team_note'), h.ownerTeam(c, club)); }

  // ---------- 7. reputation ----------
  function rep(c, club) {
    const h = H(), G = UI.G, B_ = Bo(), o = B_.ensureOwner(G, c), b = club.boss;
    const st = B_.style(o);
    const axes = AXES.map((k) => `<div class="axis"><div class="row"><b>${t('ax_' + k)}</b><span class="${lvlCls(o[k])}">${Math.round(o[k])}</span></div>${bar(o[k], lvlCls(o[k]))}<div class="mut sm">${t('ax_d_' + k)}</div></div>`).join('');
    const head = `<div class="card hl"><h2>${t('ow_rep_title')}</h2><div class="big">${o.orep}<span class="mut sm">/100</span></div><p><b>${t('style_' + st)}</b></p><p class="mut sm">${t('style_d_' + st)}</p>
      <p class="sm">${t('ow_rep_fx', { w: Math.round((b.wm - 1) * 100), s: Math.round((b.sm - 1) * 100) })}</p></div>`;
    const how = `<div class="card"><h2>${t('ow_rep_how')}</h2>${AXES.map((k) => `<p class="sm"><b>${t('ax_' + k)}</b> — ${t('ax_h_' + k)}</p>`).join('')}</div>`;
    const rv = o.reviews.slice().reverse();
    const reviews = `<div class="card"><h2>${t('ow_reviews')}</h2><p class="mut sm">${t('ow_reviews_note')}</p>${rv.length ? h.tbl([t('season'), t('sq_name'), '>★'], rv.map((x) => `<tr><td>${x.s}</td><td>${h.esc(x.who)}</td><td class="r">${'★'.repeat(x.stars)}${'☆'.repeat(5 - x.stars)}</td></tr>`)) : `<span class="mut sm">${t('ow_none')}</span>`}</div>`;
    const have = Object.fromEntries(o.badges.map((x) => [x.id, x.s]));
    const badges = `<div class="card wide"><h2>🏅 ${t('ow_badges')} · ${o.badges.length}/${BADGES.length}</h2><div class="medals">${BADGES.map((k) => `<div class="medal ${have[k] ? 'on' : ''}"><span class="mi">${have[k] ? '🏅' : '🔒'}</span><b>${t('bd_' + k)}</b><span class="mut sm">${t('bd_d_' + k)}</span></div>`).join('')}</div></div>`;
    return page(t('os_rep'), t('ow_rep_note'), `<div class="grid">${head}<div class="card"><h2>${t('ow_axes')}</h2>${axes}</div>${how}${reviews}${badges}</div>`);
  }

  // ---------- 8. hall of fame ----------
  function hall(c, club) {
    const h = H(), G = UI.G, B_ = Bo(), o = B_.ensureOwner(G, c), b = club.boss;
    const mode = ['worth', 'growth', 'rep'].includes(UI.hl) ? UI.hl : 'worth';
    const rows = B_.ranking(G), key = { worth: 'worth', growth: 'growth', rep: 'orep' }[mode];
    rows.sort((a, z) => z[key] - a[key]);
    const myPos = rows.findIndex((r) => r.me) + 1;
    const show = rows.slice(0, 10).concat(myPos > 10 ? [rows[myPos - 1]] : []);
    const val = (r) => (mode === 'worth' ? h.mc(r.worth) : mode === 'growth' ? (r.growth >= 0 ? '+' : '') + Math.round(r.growth * 100) + '%' : r.orep);
    const tb = h.tbl(['#', t('ow_owner'), t('club'), '>' + t('hl_' + mode), t('ow_style')], show.map((r) => `<tr class="${r.me ? 'me' : ''}"><td>${rows.indexOf(r) + 1}</td><td><b>${h.esc(r.name)}</b>${r.me ? ' <span class="chip ok">' + t('ow_you') + '</span>' : ''}</td><td>${h.ctag(r.club, 14)}</td><td class="r"><b>${val(r)}</b></td><td class="mut sm">${t('style_' + r.style)}</td></tr>`));
    const rank = `<div class="card wide hl"><h2>${t('os_hall')}</h2><p class="mut sm">${t('ow_hall_note')}</p>${seg('o_hl', ['worth', 'growth', 'rep'].map((v) => ({ v, l: t('hl_' + v) })), mode)}${tb}<p class="sm" style="margin-top:8px">${t('ow_your_pos', { n: myPos, m: rows.length })}</p></div>`;
    const vals = b.val.map((x) => x[1]).concat([B_.value(G, club)]);
    const career = `<div class="card"><h2>${t('ow_career')}</h2>${row(t('ow_seasons_owned'), o.seasonsOwned + 1)}${row(t('ow_titles'), o.titles)}${row(t('ow_net_worth'), h.money(B_.netWorth(G, c, club)))}${row(t('ow_growth'), (b.v0 ? Math.round((vals[vals.length - 1] / b.v0 - 1) * 100) : 0) + '%')}
      ${vals.length > 1 ? h.fx.line([{ v: vals }], { w: 360, h: 110 }) : ''}<h3 class="sm mut">${t('os_rep')}</h3>${o.hist.length > 1 ? h.fx.line([{ v: o.hist.map((x) => x[1]).concat([o.orep]) }], { w: 360, h: 90, min: 0, max: 100 }) : `<span class="mut sm">${t('biz_none')}</span>`}</div>`;
    const pr = B_.profile(G, c);
    const pub = `<div class="card"><h2>${t('ow_public')}</h2><p class="mut sm">${t('ow_public_note')}</p>${row(t('ow_owner'), h.esc(pr.name))}${row(t('os_rep'), pr.orep + '/100')}${row(t('ow_style'), t('style_' + pr.style))}${row(t('ow_badges'), pr.badges.length)}</div>`;
    return page(t('os_hall'), t('ow_hall_sub'), `<div class="grid">${rank}${career}${pub}</div>`);
  }

  // ---------- actions ----------
  const ACTS = {
    o_line: (a, h, G, c) => { const [k, n] = a.split('-'); h.res(Bo().setLine(G, c, k, +n)); },
    o_merch: (a, h, G, c) => h.res(Bo().setMerch(G, c, a)),
    o_member: (a, h, G, c) => h.res(Bo().setMember(G, c, a)),
    o_kit: (a, h, G, c) => h.res(Bo().specialKit(G, c), t('ok_done')),
    o_spon: (a, h, G, c) => h.res(Bo().signSponsor(G, c, +a), t('ok_done')),
    o_sponbreak: (a, h, G, c) => h.modal(`<p>${t('ow_spon_break_q', { amt: h.money(Bo().sponsorBreakCost(h.myClub().boss)) })}</p>`, () => h.res(Bo().breakSponsor(G, c), t('ok_done'))),
    o_proj: (a, h, G, c) => h.res(Bo().startProject(G, c, a), t('ok_done')),
    o_partner: (a, h, G, c) => h.res(Bo().setPartner(G, c, a === 'none' ? null : a === 'sel' ? document.querySelector('#partner-sel').value : a), t('ok_done')),
    o_event: (a, h, G, c) => h.res(Bo().runEvent ? Bo().runEvent(G, c, a) : Bo().event(G, c, a), t('ok_done')),
    o_stake: (a, h, G, c) => h.modal(`<p>${t('ow_stake_q', { p: Math.round(+a * 100), amt: h.money(Bo().stakeOffer(G, h.myClub(), +a)) })}</p>`, () => h.res(Bo().sellStake(G, c, +a), t('ok_done'))),
    o_buyback: (a, h, G, c) => h.res(Bo().buyBack(G, c, +a), t('ok_done')),
    o_bond: (a, h, G, c) => h.res(Bo().issueBond(G, c, document.querySelector('#bond-amt').value, document.querySelector('#bond-yrs').value), t('ok_done')),
    o_repay: (a, h, G, c) => h.res(Bo().repayBond(G, c, +a), t('ok_done')),
    o_hl: (a, h) => { UI.hl = a; h.render(); },
    o_go: (a, h) => { if (a === 'finance') UI.tab = 'finance'; else { UI.ot = a; UI.tab = 'owner'; } h.render(); },
  };
})();
