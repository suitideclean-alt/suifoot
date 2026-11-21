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
  const O = (SF.Online = { state: 'idle', world: null, error: null, club: null, gas: null, tickets: [] });

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const money = (n) => '$' + Number(n).toLocaleString('en-US');
  const short = (id) => (id ? id.slice(0, 6) + '…' + id.slice(-4) : '');

  /** ask the chain, then draw whatever came back */
  O.load = async function (redraw) {
    O.state = 'loading'; O.error = null; redraw();
    try {
      const [genesis, decisions] = await Promise.all([SF.Chain.world(), SF.Chain.decisions()]);
      /* What the chain gave us is the first day of the season and the list of everything anybody
       * has decided since. The season itself is worked out from the two, here, for nothing. */
      O.genesis = genesis;
      O.decisions = decisions;
      O.pending = [];
      O.build();
      /* And what the connected wallet has to pay with. Asked here rather than at signing time, so
       * the screen can say "you have nothing to spend" before anybody is shown a dialog. A failure
       * to weigh the address is not a failure to read the league, so it only clears the figure. */
      const addr = SF.Wallet && SF.Wallet.addr;
      if (addr) {
        try { O.gas = await SF.Chain.gas(addr); } catch (_) { O.gas = null; }
        try { O.tickets = await SF.Chain.tickets(addr); } catch (_) { O.tickets = []; }
      } else { O.gas = null; O.tickets = []; }
      O.state = 'ready';
    } catch (e) {
      O.error = e && e.message ? e.message : String(e);
      O.state = 'failed';
    }
    redraw();
  };

  const when = (ms) => new Date(ms).toISOString().replace('T', ' ').slice(0, 16) + ' UTC';

  /* Work the league out from what the chain holds plus whatever has been decided in the last
   * second and not yet landed.
   *
   * There is one set of rules, and this is where they run. What a person sees a tenth of a second
   * after pressing a button is not a guess at what the chain will say - it is the same working-out
   * the chain's own log will produce, with their decision added to the end of it. When the
   * transaction lands, nothing changes on screen, because nothing needed to.
   */
  O.build = function () {
    const all = (O.decisions || []).concat(O.pending || []);
    O.game = SF.Bridge.toGame(O.genesis, SF.Wallet && SF.Wallet.addr, all);
    O.world = O.genesis;
    O.refused = O.game.refused;
    if (O.playing) { SF.UI.G = O.game; SF.UI.ci = O.game.viewer || 0; SF.setG(O.game); }
    return O.game;
  };

  /* Do something, now, and tell the chain about it.
   *
   * The screen answers immediately, as a game should. The decision goes to the chain underneath,
   * and because the working-out above already included it, the landing changes nothing a person
   * can see. If the chain refuses - a wallet closed, a window shut, a club no longer theirs - the
   * decision is taken back out and the screen returns to what is actually true, with the reason.
   * Nothing is ever left showing something the chain did not accept.
   */
  O.decide = async function (kind, a, b, data, redraw) {
    const club = O.myClub();
    if (!club) return false;
    const d = {
      num: club.num, club: club.id, kind, a: a || 0, b: b || 0,
      week: O.genesis.league.week, at: Date.now(), data: data || [], pending: true,
    };
    O.pending.push(d);
    const before = O.refused ? O.refused.length : 0;
    O.build();

    // if our own rules refuse it, there is no point troubling the chain or the person's wallet
    const mine = (O.refused || []).slice(before).find((x) => x.at === d.at);
    if (mine) {
      O.pending = O.pending.filter((x) => x !== d);
      O.build();
      O.said = { ok: false, what: 'decide', why: mine.why };
      redraw();
      return false;
    }

    redraw();
    try {
      await SF.Tx.decide(club.id, kind, d.a, d.b, d.data);
      d.pending = false;
    } catch (e) {
      O.pending = O.pending.filter((x) => x !== d);
      O.build();
      O.said = { ok: false, what: 'decide', why: (e && e.message) || String(e) };
      redraw();
      return false;
    }
    redraw();
    return true;
  };

  /** the club the person is running here, as the chain holds it */
  O.myClub = function () {
    const me = SF.Wallet && SF.Wallet.addr;
    if (!me || !O.world) return null;
    return O.world.clubs.find((c) => c.owner === me) || null;
  };

  /* Wallets report their failures in their own words, and those words are rarely anybody's. Slush
   * answers a network it cannot reach with "TRPCClientError", which names its own plumbing and not
   * the problem. Where we recognise the cause we say the cause instead, and where we do not we pass
   * the original through rather than guess. */
  const WHY = [
    [/^no_gas_here$/, 'on_gas_none'],
    [/^not_on_chain_yet$/, 'on_why_not_on_chain_yet'],
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
      /* Weigh the address first, whether or not the league has been read. An empty one cannot pay,
       * and finding that out here costs one question; finding it out in the wallet costs a dialog
       * that could never have been completed and an error naming the wallet's plumbing. */
      const addr = SF.Wallet && SF.Wallet.addr;
      if (addr) { try { O.gas = await SF.Chain.gas(addr); } catch (_) {} }
      if (O.gas != null && O.gas < 2e7) throw new Error('no_gas_here');
      if (!O.world) await O.load(redraw);
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
    /* A drawn club is not a held club. The draw hands back a ticket and takes the club off the
     * free list; until the ticket is turned in the club has no owner and the person owns nothing.
     * Anybody who stopped between the two steps was left with a screen that looked finished. */
    if (O.tickets && O.tickets.length) {
      for (const tk of O.tickets) {
        const c = O.world && O.world.clubs.find((x) => x.id === tk.club);
        const name = c ? c.name : short(tk.club);
        act += `<p class="good">${esc(t('on_drawn'))}: <b>${esc(name)}</b></p>
          <p class="muted small">${esc(t('on_drawn_d'))}</p>
          <button data-act="on:claim:${esc(tk.id)}:${esc(tk.club)}"${O.busy ? ' disabled' : ''}>${esc(t('on_claim'))}</button>`;
      }
    }
    if (O.busy) act += `<p>${esc(t('on_waiting'))}</p>`;
    if (O.said) {
      act += O.said.ok
        ? `<p class="good">${esc(t('on_done'))}${O.said.digest ? ` <span class="muted small">${esc(O.said.digest)}</span>` : ''}</p>`
        : `<p class="bad">${esc(t('on_refused'))}: ${esc(O.explain(O.said.why, t))}</p>` +
          (O.explain(O.said.why, t) === O.said.why ? '' : `<p class="muted small">${esc(O.said.why)}</p>`);
    }
    act += '</div>';

    if (O.state === 'ready' && O.game) {
      const mine = O.game.clubIds.filter((id) => O.game.clubs[id].mine).length;
      act += `<div class="row" style="gap:8px;flex-wrap:wrap;margin-top:12px">
        <button data-act="on:play">${esc(mine ? t('on_play_mine') : t('on_watch'))}</button>
      </div>
      <p class="muted small">${esc(mine ? t('on_play_mine_d') : t('on_watch_d'))}</p>`;
    }
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

  /* Hand the whole app over to the chain's league, and take it back again.
   *
   * What is kept aside is this browser's own game, untouched, because the two are not versions of
   * each other: one is a save on this machine and the other is a league a dozen people are in.
   * Coming back out is therefore not a cancel, it is a change of subject, and nothing is lost by
   * it either way - the chain's league is read again from the chain next time, not from here.
   */
  O.enter = function (redraw) {
    if (!O.game) return false;
    const UI = SF.UI;
    if (!O.saved) O.saved = UI.G;
    UI.G = O.game; UI.ci = O.game.viewer || 0; UI.tab = 'home'; UI.live = null;
    SF.setG(UI.G);
    O.playing = true;
    redraw();
    return true;
  };

  O.leave = function (redraw) {
    const UI = SF.UI;
    UI.G = O.saved || null; O.saved = null; UI.ci = 0; UI.tab = 'online'; UI.live = null;
    if (UI.G) SF.setG(UI.G);
    O.playing = false;
    redraw();
    return true;
  };

  /* Which decision a button is.
   *
   * The game's own buttons, unchanged, pointed at the log instead of at this browser's memory. A
   * person raising a ticket price or bidding for a player does not press anything different online
   * - the same button does the same thing, and the only difference is where it is written down.
   *
   * Anything not here is not yet a decision the chain knows about, and is left to the offline
   * game. That is a list that should end up empty.
   */
  O.routes = {
    setprice: (arg, G) => [K().TICKET, Math.round(parseFloat(arg) * 100), 0],
    price: (arg, G) => [K().TICKET, Math.round((SF.UI.G.clubs[SF.UI.G.me].price + parseFloat(arg)) * 100), 0],
    expand: (arg) => [K().INVEST, SF.Replay.GROUND, Math.max(1, Math.round(+arg))],
    fac: (arg) => [K().INVEST, arg === 'youth' ? SF.Replay.ACADEMY : SF.Replay.TRAINING, 0],
    hirescout: () => [K().INVEST, SF.Replay.SCOUT, 0],
    unlist: (arg) => [K().LIST, +arg, 0],
    capt: (arg) => [K().CAPTAIN, +arg, 0],
    repay: (arg) => [K().REPAY, Math.round(+arg), 0],
    wt: (arg) => [K().WATCH, +arg, 0],
    skill: (arg) => [K().SKILL, ['train', 'tact', 'neg', 'youth'].indexOf(arg), 0],
    reneg: (arg) => [K().RENEGOTIATE, +arg, 0],
    sign: (arg) => [K().SIGNFREE, +arg, 0],
    odec: (arg) => [K().ANSWER, +arg, 0],
    oacc: (arg) => [K().ANSWER, +arg, 1],
    'vac-start': (arg) => [K().VACATION, +arg, 0],
    'vac-stop': () => [K().VACATION, 0, 0],
  };

  /* And the ones that need a number typed before they mean anything, which the screen asks for
   * and hands over here. */
  O.asked = {
    list: (pid, price) => [K().LIST, pid, Math.round(price)],
    buy: (pid, fee) => [K().BID, pid, Math.round(fee)],
    renew: (pid, years) => [K().RENEW, pid, Math.round(years * 34)],
    train: (what) => [K().TRAIN, what, 0],
    sellnow: (pid) => [K().SELLNOW, pid, 0],
    release: (pid) => [K().RELEASE, pid, 0],
    loan: (amount) => [K().LOAN, Math.round(amount), 0],
    loanin: (pid, seasons) => [K().LOANIN, pid, seasons],
    loanout: (pid, seasons) => [K().LOANOUT, pid, seasons],
  };

  const K = () => SF.Replay.kinds;

  /* Buttons that change nothing anybody else could see: moving between pages, opening a man's
   * card, the sound, the live match controls, saving this browser's own file. These run exactly as
   * they do offline, because there is nothing about them for a chain to hold.
   */
  const LOCAL = new Set([
    'tab', 'coach', 'tr', 'eu', 'lg', 'md', 'afford', 'pl', 'chat', 'settings', 'squad', 'league',
    'cup', 'europe', 'transfers', 'finance', 'owner', 'online', 'save', 'export', 'snd', 'newgame',
    'newcareer', 'continue', 'setup-start', 'wl-menu', 'wl-go', 'm-ok', 'm-cancel', 'o_hl', 'o_go',
    'jobview', 'untouch', 'hall', 'auto', 'scoutrep',
    'live-toggle', 'live-speed', 'live-skip', 'live-continue', 'live-sub',
    'cs', 'ct', 'cvc', 'cvf', 'et', 'goal', 'shot', 'pen', 'pens', 'red', 'yellow', 'inj', 'sub',
    'play-live', 'sim-week', 'sim-season', 'next-season',
  ]);

  /* Try to deal with a click as a decision.
   *
   * Returns true when the click has been dealt with here, so the offline handler stands down.
   *
   * The last branch is the one that matters. A button this file does not yet know how to put on
   * the chain used to fall through to the offline handler, which would change this browser's
   * memory and nothing else: the screen moved, the league did not, and the next refresh quietly
   * undid it. A button that lies is worse than a button that is missing, so an unknown one is
   * refused out loud until it has been wired up.
   */
  O.route = function (act, arg, redraw) {
    if (!O.playing) return false;
    if (LOCAL.has(act)) return false;

    const make = O.routes[act];
    if (make) {
      let args;
      try { args = make(arg, SF.UI.G); } catch (_) { args = null; }
      if (args) { O.decide(args[0], args[1], args[2], [], redraw); return true; }
    }

    O.said = { ok: false, what: act, why: 'not_on_chain_yet' };
    redraw();
    return true;
  };

  /** what this browser can and cannot do to the chain's league yet, for anybody wanting to know */
  O.wired = () => Object.keys(O.routes).concat(Object.keys(O.asked));
  O.localOnly = () => Array.from(LOCAL);

  /** the clicks this screen answers */
  O.act = function (action, redraw) {
    if (action === 'on:load') { O.load(redraw); return true; }
    if (action === 'on:play') return O.enter(redraw);
    if (action === 'on:back') return O.leave(redraw);
    if (action.startsWith('on:club:')) { O.club = action.slice(8); redraw(); return true; }
    if (action === 'on:join') { O.run('join', () => SF.Tx.requestJoin(), redraw); return true; }
    if (action.startsWith('on:claim:')) {
      const [, , id, club] = action.split(':');
      O.run('claim', () => SF.Tx.claim(id, club), redraw);
      return true;
    }
    if (action === 'on:grow') { O.run('grow', () => SF.Tx.openSeries(), redraw); return true; }
    if (action === 'on:round') { O.run('round', () => SF.Tx.drawWeek(), redraw); return true; }
    return false;
  };
})();
