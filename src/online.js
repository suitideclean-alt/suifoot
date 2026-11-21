/* SuiFoot online view (SF.Online): a league that lives in a contract, drawn in the browser.
 *
 * This is the first place the two halves of the project meet. Everything on this screen was read
 * from the Sui testnet a moment before it was drawn: the clubs, the men in them, the table. None of
 * it is in this browser's memory and none of it can be changed from here - open a console and edit
 * a rating and you have edited a copy that the next refresh throws away.
 *
 * Reading needs nothing. Playing - sealing a lineup, taking a club - needs a signature, and that is
 * the next piece of work.
 */
(function () {
  const SF = globalThis.SF;
  const O = (SF.Online = { state: 'idle', world: null, error: null, club: null, gas: null });

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const money = (n) => '$' + Number(n).toLocaleString('en-US');
  const short = (id) => (id ? id.slice(0, 6) + '…' + id.slice(-4) : '');

  /** ask the chain, then draw whatever came back */
  O.load = async function (redraw) {
    O.state = 'loading'; O.error = null; redraw();
    try {
      O.world = await SF.Chain.world();
      /* And what the connected wallet has to pay with. Asked here rather than at signing time, so
       * the screen can say "you have nothing to spend" before anybody is shown a dialog. A failure
       * to weigh the address is not a failure to read the league, so it only clears the figure. */
      const addr = SF.Wallet && SF.Wallet.addr;
      if (addr) { try { O.gas = await SF.Chain.gas(addr); } catch (_) { O.gas = null; } } else O.gas = null;
      O.state = 'ready';
    } catch (e) {
      O.error = e && e.message ? e.message : String(e);
      O.state = 'failed';
    }
    redraw();
  };

  const when = (ms) => new Date(ms).toISOString().replace('T', ' ').slice(0, 16) + ' UTC';

  /* Wallets report their failures in their own words, and those words are rarely anybody's. Slush
   * answers a network it cannot reach with "TRPCClientError", which names its own plumbing and not
   * the problem. Where we recognise the cause we say the cause instead, and where we do not we pass
   * the original through rather than guess. */
  const WHY = [
    [/trpc|fetch failed|network error|timed? ?out/i, 'on_why_trpc'],
    [/insufficient|no valid gas|gas coins|balance/i, 'on_why_gas'],
    [/reject|denied|cancel|user refused/i, 'on_why_no'],
    [/not this (week|match)|already|version|conflict|equivocat/i, 'on_why_stale'],
  ];

  O.explain = function (why, t) {
    for (const [pat, key] of WHY) if (pat.test(why)) return t(key);
    return why;
  };

  /** run one of the chain calls and say plainly what happened */
  O.run = async function (what, fn, redraw) {
    O.busy = what; O.said = null; redraw();
    try {
      const out = await fn();
      O.said = { ok: true, what, digest: out && out.digest ? out.digest : null };
      await O.load(redraw);
    } catch (e) {
      O.said = { ok: false, what, why: (e && e.message ? e.message : String(e)) };
    }
    O.busy = null; redraw();
  };

  O.view = function (t) {
    const net = SF.Chain.net;
    const head = `<div class="card"><h3>${esc(t('on_title'))}</h3>
      <p class="muted">${esc(t('on_lead'))}</p>
      <p class="muted small">${esc(t("on_package"))}: <a href="${net.explorer}${net.pkg}" target="_blank" rel="noopener">${short(net.pkg)}</a>
      · ${esc(t('on_league'))}: <a href="${net.explorer}${net.league}" target="_blank" rel="noopener">${short(net.league)}</a></p>
      <button data-act="on:load">${esc(O.state === 'ready' ? t('on_again') : t('on_read'))}</button></div>`;

    const addr = SF.Wallet && SF.Wallet.addr;
    const stop = SF.Tx ? SF.Tx.why() : 'no_sdk';
    let act = `<div class="card"><h4>${esc(t('on_play'))}</h4>`;
    if (!addr) {
      act += `<p class="muted">${esc(t('on_need_wallet'))}</p><button data-act="wl-menu">${esc(t('wl_connect'))}</button>`;
    } else if (stop) {
      act += `<p class="muted">${esc(t('on_cannot_' + stop) || stop)}</p>`;
    } else {
      const sui = O.gas == null ? null : O.gas / 1e9;
      const broke = sui != null && sui < 0.02;
      act += `<p class="muted small">${esc(t('on_signing_as'))} ${esc(SF.Wallet.short(addr))}${
        sui == null ? '' : ` · ${sui.toFixed(3)} SUI ${esc(t('on_gas'))}`}</p>`;
      if (broke) {
        act += `<p class="bad">${esc(t('on_gas_none'))}</p>
          <p><a href="${net.faucet}" target="_blank" rel="noopener">${esc(t('on_faucet'))}</a></p>`;
      }
      act += `<div class="row" style="gap:8px;flex-wrap:wrap">
          <button data-act="on:join"${O.busy || broke ? ' disabled' : ''}>${esc(t('on_take_club'))}</button>
          <button data-act="on:grow"${O.busy || broke ? ' disabled' : ''}>${esc(t('on_open_series'))}</button>
        </div>
        <p class="muted small">${esc(t('on_sign_d'))}</p>`;
    }
    if (O.busy) act += `<p>${esc(t('on_waiting'))}</p>`;
    if (O.said) {
      act += O.said.ok
        ? `<p class="good">${esc(t('on_done'))}${O.said.digest ? ` <span class="muted small">${esc(O.said.digest)}</span>` : ''}</p>`
        : `<p class="bad">${esc(t('on_refused'))}: ${esc(O.explain(O.said.why, t))}</p>`;
    }
    act += '</div>';

    if (O.state === 'idle') return head + act;
    if (O.state === 'loading') return head + act + `<div class="card"><p>${esc(t('on_asking'))}</p></div>`;
    if (O.state === 'failed') {
      return head + act + `<div class="card"><h4>${esc(t('on_failed'))}</h4><p class="muted">${esc(O.error)}</p>
        <p class="muted small">${esc(t('on_failed_d'))}</p></div>`;
    }

    const { league: lg, clubs } = O.world;
    const now = Date.now();
    const k = SF.Chain.kickoff(lg, lg.week);
    const phase = SF.Chain.phase(lg, lg.week, now);

    const state = `<div class="card"><h4>${esc(t('on_state'))}</h4>
      <div class="stats">
        <div><b>${lg.season}</b><span>${esc(t('on_season'))}</span></div>
        <div><b>${lg.week}/${lg.weeks}</b><span>${esc(t('on_week'))}</span></div>
        <div><b>${esc(t('on_phase_' + phase))}</b><span>${esc(t('on_phase'))}</span></div>
        <div><b>${clubs.length}</b><span>${esc(t('on_clubs'))}</span></div>
      </div>
      <p class="muted small">${esc(t('on_kickoff'))}: ${when(k)} · ${esc(t('on_lock'))}: ${when(k - lg.lockBefore * 60000)}</p></div>`;

    const fx = SF.Chain.fixtures(O.world, 0);
    const weeks = SF.Chain.weeksFor((lg.rosters[0] || []).length);
    const over = weeks > 0 && lg.week > weeks;
    let round = `<div class="card"><h4>${esc(t('on_round'))} ${lg.week}${weeks ? '/' + weeks : ''}</h4>`;
    if (over) {
      round += `<p class="muted">${esc(t('on_season_over'))}</p>`;
    } else if (!fx.length) {
      round += `<p class="muted">${esc(t('on_no_fixtures'))}</p>`;
    } else {
      round += `<table class="tbl"><tbody>${fx.map((m) => `<tr>
        <td style="text-align:right">${esc(m.home.name)}</td>
        <td>${SF.Chain.badge(m.home.num, 18)}</td>
        <td class="muted">—</td>
        <td>${SF.Chain.badge(m.away.num, 18)}</td>
        <td>${esc(m.away.name)}</td></tr>`).join('')}</tbody></table>`;
      if (addr && !stop) {
        round += `<button data-act="on:round"${O.busy ? ' disabled' : ''}>${esc(t('on_play_round'))}</button>
          <p class="muted small">${esc(t('on_play_round_d'))}</p>`;
      }
    }
    round += '</div>';

    const table = SF.Chain.table(clubs);
    const rows = table.map((c, i) => `<tr${O.club === c.id ? ' class="on"' : ''}>
      <td>${i + 1}</td>
      <td><span class="row" style="gap:6px;align-items:center">${SF.Chain.badge(c.num, 20)}<a href="#" data-act="on:club:${c.id}">${esc(c.name)}</a></span></td>
      <td>${c.played}</td><td>${c.won}</td><td>${c.drawn}</td><td>${c.lost}</td>
      <td>${c.gf}:${c.ga}</td><td><b>${c.points}</b></td>
      <td class="muted">${money(c.balance)}</td>
      <td class="muted">${c.owner ? esc(short(c.owner)) : esc(t('on_nobody'))}</td></tr>`).join('');

    const standings = `<div class="card"><h4>${esc(t('on_table'))}</h4>
      <table class="tbl"><thead><tr><th>#</th><th>${esc(t('on_club'))}</th><th>J</th><th>V</th><th>E</th><th>D</th>
      <th>${esc(t('on_goals'))}</th><th>${esc(t('on_points'))}</th><th>${esc(t('on_money'))}</th><th>${esc(t('on_owner'))}</th></tr></thead>
      <tbody>${rows}</tbody></table></div>`;

    let squad = '';
    const chosen = clubs.find((c) => c.id === O.club);
    if (chosen) {
      const men = chosen.squad.slice().sort((a, b) => b.ovr - a.ovr);
      squad = `<div class="card"><h4><span class="row" style="gap:8px;align-items:center">${SF.Chain.badge(chosen.num, 28)}${esc(chosen.name)} — ${esc(t('on_squad'))} (${men.length})</span></h4>
        <p class="muted small">${esc(t('on_ground'))}: ${chosen.capacity.toLocaleString('en-US')} · ${esc(t('on_fans'))}: ${chosen.fans.toLocaleString('en-US')} · ${esc(t('on_ticket'))}: $${chosen.ticket.toFixed(2)}</p>
        <table class="tbl"><thead><tr><th>${esc(t('on_name'))}</th><th>${esc(t('on_pos'))}</th><th>${esc(t('on_age'))}</th>
        <th>${esc(t('on_ovr'))}</th><th>${esc(t('on_pot'))}</th><th>${esc(t('on_cond'))}</th><th>${esc(t('on_apps'))}</th><th>${esc(t('on_scored'))}</th></tr></thead>
        <tbody>${men.map((p) => `<tr><td><span class="row" style="gap:6px;align-items:center">${SF.Chain.face(p, 24)}${esc(p.name)}</span></td><td>${esc(p.pos)}</td><td>${p.age}</td>
          <td><b>${p.ovr}</b></td><td class="muted">${p.pot}</td><td>${p.cond}%</td><td>${p.apps}</td><td>${p.goals}</td></tr>`).join('')}</tbody></table>
        <p class="muted small">${esc(t('on_names_d'))}</p></div>`;
    } else {
      squad = `<div class="card"><p class="muted">${esc(t('on_pick'))}</p></div>`;
    }

    return head + act + state + round + standings + squad;
  };

  /** the clicks this screen answers */
  O.act = function (action, redraw) {
    if (action === 'on:load') { O.load(redraw); return true; }
    if (action.startsWith('on:club:')) { O.club = action.slice(8); redraw(); return true; }
    if (action === 'on:join') { O.run('join', () => SF.Tx.requestJoin(), redraw); return true; }
    if (action === 'on:grow') { O.run('grow', () => SF.Tx.openSeries(), redraw); return true; }
    if (action === 'on:round') {
      const fx = SF.Chain.fixtures(O.world, 0);
      O.run('round', () => SF.Tx.playMatchday(fx), redraw);
      return true;
    }
    return false;
  };
})();
