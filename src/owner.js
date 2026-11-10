/* SuiFoot owner layer (v0.4): the owner sets limits, the coach acts inside them, contracts end with real-world style pay-offs.
 * Roles: 'coach' (default, the computer owns the club), 'both' (you own and coach), 'owner' (you own, a computer coach works for you).
 * All state is plain JSON inside G. Money moves through the Bank ledger (coach wallet = account 'w:<id>'). */
(function () {
  const SF = globalThis.SF;
  const { CFG, util } = SF;
  const B = SF.Bank, E = SF.Econ;
  const O = (SF.Owner = {});

  const OC = (CFG.owner = {
    W: CFG.TOTAL_WEEKS,   // economy weeks per season
    late: 8,              // weeks of unpaid wages that give just cause
    exitPct: 0.5,         // coach exit clause default, share of the salary still owed
    capWeeks: CFG.TOTAL_WEEKS, // underperformance cap: 12 months = one season of salary
    mutualLo: 0.4, mutualHi: 0.6,
    share: 0.1,           // coach share of the profit on sales of players he developed
    ban: 8,               // weeks a coach who quits without just cause cannot sign elsewhere
    years: 3,
    bonus: { title: 12, promo: 10, euro: 8 }, // in weeks of salary
    approvalWeeks: 1,     // an open request expires after this many game weeks
    tokenWeeks: 3,        // an approval can be used for this many weeks
  });

  const FREE = new Set(['lineup', 'captain', 'promote', 'scout', 'watch', 'search', 'vacation']);
  const OWNER_ONLY = new Set(['expand', 'fac', 'loan']);
  const ROLE = (co) => co.role || 'coach';
  O.role = ROLE;
  O.wallet = (id) => 'w:' + id;
  O.openWallet = function (G, id) { if (G.bank.acc[O.wallet(id)] == null) B.open(G, O.wallet(id), 0, true); };
  O.walletBal = (G, id) => B.bal(G, O.wallet(id));
  O.wageBill = (G, club) => util.sum(club.squad.map((id) => G.players[id].wage));

  // ---------- policy (limits set by the owner) ----------
  O.defaultPolicy = function (G, club) {
    const bal = Math.max(0, B.bal(G, club.id)), wb = O.wageBill(G, club);
    const budget = Math.max(60000, Math.round((bal * 0.5) / 1000) * 1000);
    const top = Math.max(0, ...club.squad.map((id) => G.players[id].wage));
    return {
      budget, maxFee: Math.round((budget * 0.6) / 1000) * 1000,
      maxWage: Math.max(300, Math.round((top * 1.3) / 10) * 10), wageCap: Math.round(wb * 1.3),
      minSalePct: 0.8, untouchable: [], maxLoans: 2, reserve: Math.round(wb * 6), spent: 0,
    };
  };
  O.policy = function (G, club) {
    if (!club.policy) club.policy = O.defaultPolicy(G, club);
    return club.policy;
  };
  const NUM = ['budget', 'maxFee', 'maxWage', 'wageCap', 'minSalePct', 'maxLoans', 'reserve'];
  O.setPolicy = function (G, co, patch) {
    const club = G.clubs[co.club];
    if (!club || (ROLE(co) === 'coach') || club.owner !== co.id) return { ok: false, err: 'owner_only' };
    const pol = O.policy(G, club);
    for (const k of NUM) if (patch[k] != null && isFinite(+patch[k]) && +patch[k] >= 0) pol[k] = k === 'minSalePct' ? util.clamp(+patch[k], 0, 1.5) : Math.round(+patch[k]);
    if (Array.isArray(patch.untouchable)) pol.untouchable = patch.untouchable.filter((id) => G.players[id] && G.players[id].club === club.id);
    return { ok: true };
  };
  O.toggleUntouchable = function (G, co, pid) {
    const club = G.clubs[co.club];
    if (!club || ROLE(co) === 'coach' || club.owner !== co.id || !G.players[pid] || G.players[pid].club !== club.id) return { ok: false, err: 'owner_only' };
    const u = O.policy(G, club).untouchable, i = u.indexOf(pid);
    if (i >= 0) u.splice(i, 1); else u.push(pid);
    return { ok: true };
  };
  O.spent = function (G, club, amt) { O.policy(G, club).spent += Math.max(0, Math.round(amt)); };

  // ---------- gate: every coach action asks here first ----------
  function violation(G, club, pol, kind, p) {
    const bal = B.bal(G, club.id), wb = O.wageBill(G, club), c = p.cost || 0, pl = p.pid ? G.players[p.pid] : null;
    switch (kind) {
      case 'buy': case 'sign': case 'loanin':
        if (c > pol.maxFee) return 'fee';
        if (pol.spent + c > pol.budget) return 'budget';
        if (bal - c < pol.reserve) return 'reserve';
        if (p.wage && p.wage > pol.maxWage) return 'wage';
        if (p.wage && wb + p.wage > pol.wageCap) return 'wagebill';
        return null;
      case 'renew':
        if (p.wage > pol.maxWage) return 'wage';
        if (wb + (p.wage - (pl ? pl.wage : 0)) > pol.wageCap) return 'wagebill';
        if (bal - c < pol.reserve) return 'reserve';
        return null;
      case 'sell': case 'list': case 'loanout':
        if (pol.untouchable.includes(p.pid)) return 'untouchable';
        if (kind !== 'loanout' && pl && p.price > 0 && p.price < E.value(pl) * pol.minSalePct) return 'minprice';
        return null;
      case 'release':
        if (pol.untouchable.includes(p.pid)) return 'untouchable';
        if (pl && E.isStar(pl)) return 'star';
        return null;
    }
    return null;
  }

  O.gate = function (G, co, kind, p) {
    p = p || {};
    const club = G.clubs[co.club];
    if (!club) return null;
    const role = ROLE(co);
    if (role === 'both') return null;
    if (role === 'owner') return OWNER_ONLY.has(kind) ? null : (FREE.has(kind) ? null : { ok: false, err: 'owner_cant' });
    if (FREE.has(kind)) return null;
    const pol = O.policy(G, club);
    const why = OWNER_ONLY.has(kind) ? 'owner_only' : violation(G, club, pol, kind, p);
    if (!why) return null;
    const key = String(p.key != null ? p.key : p.pid != null ? p.pid : 'x');
    const tk = (G.approvals || []).find((a) => a.club === club.id && a.coach === co.id && a.kind === kind && a.key === key && a.status === 'ok' && a.cost >= (p.cost || 0));
    if (tk) { tk.status = 'used'; return null; }
    const ap = O.request(G, club, co, kind, key, p, why);
    return { ok: false, err: 'needs_approval', why, id: ap.id };
  };

  O.request = function (G, club, co, kind, key, p, why) {
    G.approvals = G.approvals || [];
    let ap = G.approvals.find((a) => a.club === club.id && a.coach === co.id && a.kind === kind && a.key === key && a.status === 'open');
    if (ap) { ap.cost = Math.max(ap.cost, p.cost || 0); return ap; }
    ap = { id: (G.nextAp = (G.nextAp || 0) + 1), club: club.id, coach: co.id, kind, key, cost: p.cost || 0, why, name: p.name || '', ttl: OC.approvalWeeks, status: 'open', s: G.season, w: G.week };
    G.approvals.push(ap);
    if (club.owner) SF.Game.news(G, 'n_approval_req', { kind, name: ap.name }, club.owner);
    return ap;
  };

  O.decide = function (G, ownerCo, id, yes) {
    const ap = (G.approvals || []).find((a) => a.id === id && a.status === 'open');
    if (!ap) return { ok: false, err: 'gone' };
    const club = G.clubs[ap.club];
    if (club.owner !== ownerCo.id) return { ok: false, err: 'owner_only' };
    ap.status = yes ? 'ok' : 'no'; ap.ttl = OC.tokenWeeks;
    SF.Game.news(G, yes ? 'n_approval_ok' : 'n_approval_no', { kind: ap.kind, name: ap.name }, ap.coach);
    return { ok: true };
  };

  /** the computer owner: approves when the club can afford it and the coach has the board's confidence */
  function aiDecide(G, ap) {
    const club = G.clubs[ap.club], co = G.coaches.find((c) => c.id === ap.coach);
    if (!co) return false;
    const pol = O.policy(G, club), after = B.bal(G, club.id) - ap.cost;
    if (ap.why === 'untouchable' || ap.why === 'star' || ap.why === 'minprice') return co.board >= 70 && ap.kind !== 'release';
    if (ap.kind === 'loan') return B.debtOf(G, club.id) < club.rev * 0.5 && co.board >= 45;
    if (ap.kind === 'wage' || ap.why === 'wage' || ap.why === 'wagebill') return co.board >= 55 && after >= pol.reserve;
    return after >= pol.reserve * 0.5 && co.board >= 35;
  }

  O.openFor = (G, clubId) => (G.approvals || []).filter((a) => a.club === clubId && a.status === 'open');
  O.mine = (G, coId) => (G.approvals || []).filter((a) => a.coach === coId).slice(-8).reverse();

  // ---------- coach contract ----------
  O.salaryFor = (club, rep) => Math.max(200, Math.round((CFG.tvWeekly[club.div] * 0.06 * (0.8 + (rep / 100) * 0.8)) / 10) * 10);
  O.newContract = function (club, rep, years) {
    const w = O.salaryFor(club, rep), y = years || OC.years;
    return { club: club.id, years: y, left: y * OC.W, wage: w, bonus: { title: w * OC.bonus.title, promo: w * OC.bonus.promo, euro: w * OC.bonus.euro }, share: OC.share, exit: null, brk: null, cap: false, mitigate: true, late: 0 };
  };
  O.remaining = (co) => (co.contract ? co.contract.wage * Math.max(0, co.contract.left) : 0);
  O.exitFee = (co) => (co.contract ? Math.round(co.contract.exit != null ? co.contract.exit : O.remaining(co) * OC.exitPct) : 0);
  O.justCauseCoach = (co) => !!(co.contract && co.contract.late >= OC.late);

  /** what the club owes a coach it fires without just cause */
  O.sackAmount = function (G, co) {
    const c = co.contract, club = G.clubs[co.club];
    if (!c || !club) return 0;
    let amt = c.brk != null ? c.brk : O.remaining(co);
    if (c.cap && club.pos > club.target) amt = Math.min(amt, c.wage * OC.capWeeks);
    return Math.round(amt);
  };

  function owe(G, clubId, co, amount, weeks, mitig, wage) {
    if (amount <= 0) return;
    O.openWallet(G, co.id);
    G.owed = G.owed || [];
    G.owed.push({ id: (G.nextOwed = (G.nextOwed || 0) + 1), club: clubId, to: co.id, total: amount, left: amount, weekly: Math.max(1, Math.ceil(amount / Math.max(1, weeks))), mitig: !!mitig, wage: wage || 0 });
  }
  function payOwed(G, o, amt) {
    if (amt <= 0) return 0;
    B.transfer(G, o.club, O.wallet(o.to), amt, 'coach_pay');
    o.left -= amt;
    return amt;
  }

  /** the club ends the contract. just=true means just cause (no pay-off). Returns what is owed. */
  O.terminateByClub = function (G, co, opts) {
    opts = opts || {};
    const c = co.contract;
    if (!c) return { owed: 0 };
    const owed = opts.just ? 0 : O.sackAmount(G, co);
    owe(G, c.club, co, owed, Math.min(Math.max(c.left, 4), 56), c.mitigate && c.brk == null, c.wage);
    co.contract = null;
    return { owed };
  };

  /** the coach quits. Returns { fee, just }; with just cause the club owes the rest, otherwise he pays the exit clause */
  O.quit = function (G, co) {
    const c = co.contract;
    if (!c) return { fee: 0, just: false };
    if (O.justCauseCoach(co)) {
      owe(G, c.club, co, Math.round(O.remaining(co)), Math.min(Math.max(c.left, 4), 56), false, 0);
      co.contract = null;
      return { fee: 0, just: true };
    }
    const fee = O.exitFee(co), have = Math.max(0, O.walletBal(G, co.id)), pay = Math.min(fee, have);
    if (pay > 0) B.transfer(G, O.wallet(co.id), c.club, pay, 'coach_exit');
    co.ban = OC.ban;
    co.contract = null;
    return { fee: pay, owed: fee, just: false };
  };

  O.mutualOffer = (G, co) => (co.contract ? Math.round(O.remaining(co) * (OC.mutualLo + (OC.mutualHi - OC.mutualLo) * util.clamp(co.board, 0, 100) / 100)) : 0);
  O.mutual = function (G, co) {
    const c = co.contract;
    if (!c) return { ok: false, err: 'no_contract' };
    const offer = O.mutualOffer(G, co);
    owe(G, c.club, co, offer, 4, false, 0);
    co.contract = null;
    return { ok: true, offer };
  };

  /** another club hires a coach who is under contract: it pays the current club */
  O.poachFee = (co) => (co.contract ? Math.round(co.contract.brk != null ? co.contract.brk : co.contract.wage * OC.W) : 0);

  // ---------- the owner's own money ----------
  O.withdraw = function (G, co, amt) {
    const club = G.clubs[co.club];
    amt = Math.round(+amt);
    if (!club || ROLE(co) === 'coach' || club.owner !== co.id || !(amt > 0)) return { ok: false, err: 'owner_only' };
    const max = Math.max(0, Math.round(B.bal(G, club.id) - O.policy(G, club).reserve));
    if (amt > max) return { ok: false, err: 'owner_reserve', max };
    B.transfer(G, club.id, O.wallet(co.id), amt, 'dividend');
    return { ok: true };
  };
  O.invest = function (G, co, amt) {
    const club = G.clubs[co.club];
    amt = Math.round(+amt);
    if (!club || ROLE(co) === 'coach' || club.owner !== co.id || !(amt > 0)) return { ok: false, err: 'owner_only' };
    const have = Math.max(0, O.walletBal(G, co.id));
    if (amt > have) return { ok: false, err: 'owner_wallet', max: have };
    B.transfer(G, O.wallet(co.id), club.id, amt, 'invest');
    return { ok: true };
  };

  // ---------- profit share on sales ----------
  O.onJoin = function (G, p) { p.j = { s: G.season, v: E.value(p) }; };
  O.saleShare = function (G, club, p, fee) {
    const co = SF.Game.humanOf(G, club.id), c = co && co.contract;
    if (!c || !c.share || ROLE(co) !== 'coach') return 0;
    const base = p.j && G.season - p.j.s >= 1 ? p.j.v : p.hg ? 0 : null;
    if (base == null) return 0;
    const amt = Math.round(Math.max(0, fee - base) * c.share);
    if (amt <= 0 || B.bal(G, club.id) < amt) return 0;
    O.openWallet(G, co.id);
    B.transfer(G, club.id, O.wallet(co.id), amt, 'coach_share');
    return amt;
  };

  // ---------- weekly tick ----------
  O.weekly = function (G) {
    for (const co of G.coaches) {
      O.openWallet(G, co.id);
      if (co.ban > 0) co.ban--;
      if (co.contract === undefined && co.club && ROLE(co) === 'coach') co.contract = O.newContract(G.clubs[co.club], co.rep);
      const c = co.contract;
      if (!c || !co.club || ROLE(co) !== 'coach') continue;
      const club = G.clubs[c.club];
      if (B.bal(G, club.id) >= c.wage) { B.transfer(G, club.id, O.wallet(co.id), c.wage, 'coach_pay'); c.late = 0; }
      else c.late++;
      c.left--;
    }
    // pay-offs in instalments (mitigation: what he earns elsewhere reduces the instalment)
    for (const o of G.owed || []) {
      const co = G.coaches.find((x) => x.id === o.to);
      let pay = Math.min(o.weekly, o.left);
      if (o.mitig && co && co.contract) pay = Math.max(0, pay - co.contract.wage);
      payOwed(G, o, pay);
    }
    G.owed = (G.owed || []).filter((o) => o.left > 0);
    // requests: the computer owner answers, a human owner has one game week
    for (const ap of G.approvals || []) {
      if (ap.status === 'open') {
        const club = G.clubs[ap.club];
        if (!club.owner) { ap.status = aiDecide(G, ap) ? 'ok' : 'no'; ap.ttl = OC.tokenWeeks; SF.Game.news(G, ap.status === 'ok' ? 'n_approval_ok' : 'n_approval_no', { kind: ap.kind, name: ap.name }, ap.coach); }
        else if (--ap.ttl <= 0) { ap.status = 'exp'; SF.Game.news(G, 'n_approval_exp', { kind: ap.kind, name: ap.name }, ap.coach); }
      } else if (ap.status === 'ok' && --ap.ttl <= 0) ap.status = 'exp';
    }
    if (G.approvals && G.approvals.length > 60) G.approvals = G.approvals.filter((a) => a.status === 'open' || a.status === 'ok').concat(G.approvals.filter((a) => a.status !== 'open' && a.status !== 'ok').slice(-20));
  };

  O.seasonStart = function (G) {
    for (const id of G.clubIds) {
      const club = G.clubs[id];
      if (!club.human) continue;
      if (club.owner) { if (club.policy) club.policy.spent = 0; else O.policy(G, club); }
      else club.policy = O.defaultPolicy(G, club);
    }
  };

  /** bonuses, then the contract either runs on, is renewed by the computer owner, or ends */
  O.seasonEnd = function (G, co, club) {
    const c = co.contract;
    if (!c || ROLE(co) !== 'coach') return;
    O.openWallet(G, co.id);
    const pay = (amt, k) => { amt = Math.min(Math.round(amt), Math.max(0, B.bal(G, club.id))); if (amt > 0) B.transfer(G, club.id, O.wallet(co.id), amt, k); return amt; };
    if (club.pos === 1) pay(c.bonus.title, 'coach_bonus');
    if (club.nextDiv < club.div) pay(c.bonus.promo, 'coach_bonus');
    if (G.eu.winner === club.id || (G.eu.q.includes(club.id) && G.eu.reach[club.id] >= 2)) pay(c.bonus.euro, 'coach_bonus');
    if (c.left <= 0) {
      if (!club.owner && co.board >= 45) { co.contract = O.newContract(club, co.rep); SF.Game.news(G, 'n_contract_renewed', { club: club.name }, co.id); }
      else { SF.Game.news(G, 'n_contract_ended', { club: club.name }, co.id); co.contract = null; SF.Actions.sack(G, co, 'expired'); }
    }
  };
})();
