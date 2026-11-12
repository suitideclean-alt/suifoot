/* SuiFoot actions: everything a human coach can do (market, finances, stadium, career). */
(function () {
  const SF = globalThis.SF;
  const { R, CFG, util } = SF;
  const B = SF.Bank, E = SF.Econ, Game = SF.Game;

  const A = (SF.Actions = {});
  const ok = (o) => Object.assign({ ok: true }, o || {});
  const no = (err, o) => Object.assign({ ok: false, err }, o || {});

  const myClub = (G, c) => (c.club ? G.clubs[c.club] : null);

  // ---------- market ----------
  A.askPrice = function (G, coach, p) {
    return Math.round((E.value(p) * p.ask * (1 - 0.015 * coach.sk.neg) * (p.hot ? CFG.hotPremium : 1)) / 100) * 100;
  };

  A.buy = function (G, coach, pid, fee) {
    const club = myClub(G, coach), p = G.players[pid];
    if (!club) return no('no_club');
    if (!p || !p.club || p.club === club.id) return no('bad');
    const seller = G.clubs[p.club];
    if (coach.vac > 0) return no('vacation');
    if (seller.human || seller.foreign) return no('human_club');
    if (p.loan) return no('on_loan');
    if (club.squad.length >= CFG.SQUAD_MAX) return no('squad_full');
    if (seller.squad.length <= CFG.SQUAD_MIN + 1) return no('seller_min');
    fee = Math.round(fee);
    const ask = A.askPrice(G, coach, p);
    if (fee < E.clause(p)) { // paying the release clause skips the haggling
      if (fee < ask * 0.88) return no('rejected', { ask });
      if (fee < ask) return no('counter', { ask });
    }
    if (B.bal(G, club.id) < fee) return no('no_funds', { ask });
    const gt = SF.Owner.gate(G, coach, 'buy', { pid, cost: fee, wage: Math.max(E.wage(p), 40), name: p.n });
    if (gt) return gt;
    Game.moveClub(G, p, seller, club, fee);
    p.ct = 3;
    SF.Owner.spent(G, club, fee);
    Game.news(G, 'n_bought', { name: p.n, club: seller.name, fee }, coach.id);
    if (E.isStar(p)) SF.Extras.unlock(G, coach, 'a_star');
    return ok({ fee });
  };

  A.signFree = function (G, coach, pid) {
    const club = myClub(G, coach), p = G.players[pid];
    if (!club || !p || p.club) return no('bad');
    if (coach.vac > 0) return no('vacation');
    if (club.squad.length >= CFG.SQUAD_MAX) return no('squad_full');
    const wage = E.wage(p);
    const bonus = wage * 3;
    if (B.bal(G, club.id) < bonus) return no('no_funds', { cost: bonus });
    const gt = SF.Owner.gate(G, coach, 'sign', { pid, cost: bonus, wage, name: p.n });
    if (gt) return gt;
    G.free.splice(G.free.indexOf(pid), 1);
    p.club = club.id; p.wage = wage; p.ct = 2;
    SF.Owner.onJoin(G, p);
    SF.Owner.spent(G, club, bonus);
    club.squad.push(pid);
    B.debit(G, club.id, bonus, 'signing');
    Game.news(G, 'n_signed', { name: p.n }, coach.id);
    return ok({ cost: bonus });
  };

  A.listPlayer = function (G, coach, pid, price) {
    const p = G.players[pid];
    if (!p || p.club !== coach.club || p.loan) return no('bad');
    if (price > 0) { const gt = SF.Owner.gate(G, coach, 'list', { pid, price: Math.round(price), name: p.n }); if (gt) return gt; }
    p.listed = Math.max(0, Math.round(price));
    return ok();
  };

  A.sellNow = function (G, coach, pid) {
    const club = myClub(G, coach), p = G.players[pid];
    if (!club || !p || p.club !== club.id) return no('bad');
    if (club.squad.length <= CFG.SQUAD_MIN) return no('squad_min');
    if (p.loan) return no('on_loan');
    const price = Math.round((E.value(p) * 0.65 * (1 + 0.015 * coach.sk.neg)) / 100) * 100;
    const gt = SF.Owner.gate(G, coach, 'sell', { pid, price, name: p.n });
    if (gt) return gt;
    SF.Extras.onLeave(G, club, p, true);
    B.credit(G, club.id, price, 'sale_fee');
    SF.Owner.saleShare(G, club, p, price);
    Game.releasePlayer(G, club, p, true);
    Game.news(G, 'n_sold_now', { name: p.n, fee: price }, coach.id);
    return ok({ price });
  };

  A.acceptOffer = function (G, coach, oid) {
    const i = G.offers.findIndex((o) => o.id === oid && o.coach === coach.id);
    if (i < 0) return no('gone');
    const o = G.offers[i];
    const club = myClub(G, coach), p = G.players[o.pid], buyer = G.clubs[o.club];
    if (!club || !p || p.club !== club.id || p.loan) { G.offers.splice(i, 1); return no('gone'); }
    if (club.squad.length <= CFG.SQUAD_MIN) return no('squad_min');
    if (buyer.squad.length >= CFG.SQUAD_MAX || B.bal(G, buyer.id) < o.fee) { G.offers.splice(i, 1); return no('buyer_cant'); }
    const gt = SF.Owner.gate(G, coach, 'sell', { pid: o.pid, price: o.fee, name: p.n });
    if (gt) return gt;
    SF.Owner.saleShare(G, club, p, o.fee);
    Game.moveClub(G, p, club, buyer, o.fee);
    G.offers = G.offers.filter((x) => x.pid !== o.pid);
    Game.news(G, 'n_sold', { name: p.n, club: buyer.name, fee: o.fee }, coach.id);
    return ok({ fee: o.fee });
  };
  A.declineOffer = function (G, coach, oid) { G.offers = G.offers.filter((o) => !(o.id === oid && o.coach === coach.id)); return ok(); };

  A.renew = function (G, coach, pid, years) {
    const club = myClub(G, coach), p = G.players[pid];
    if (!club || !p || p.club !== club.id) return no('bad');
    years = util.clamp(years | 0, 1, 4);
    if (SF.Extras.mood(p) < 25) return no('unhappy');
    if (p.ct >= 6) return no('max_contract');
    const wage = Math.round((E.wage(p) * (1 + 0.02 * years)) / 10) * 10;
    const bonus = wage * 2;
    if (B.bal(G, club.id) < bonus) return no('no_funds', { cost: bonus });
    const gt = SF.Owner.gate(G, coach, 'renew', { pid, cost: bonus, wage, name: p.n });
    if (gt) return gt;
    B.debit(G, club.id, bonus, 'signing');
    p.wage = wage; p.ct = Math.min(6, p.ct + years); p.mood = Math.min(100, SF.Extras.mood(p) + 6); delete p.wo;
    return ok({ wage, cost: bonus });
  };

  A.releaseCost = (p) => Math.round(p.wage * 28 * Math.max(0, p.ct - 1) * 0.4);
  A.release = function (G, coach, pid) {
    const club = myClub(G, coach), p = G.players[pid];
    if (!club || !p || p.club !== club.id) return no('bad');
    if (p.loan) return no('on_loan');
    if (club.squad.length <= CFG.SQUAD_MIN) return no('squad_min');
    const cost = A.releaseCost(p);
    if (B.bal(G, club.id) < cost) return no('no_funds', { cost });
    const gt = SF.Owner.gate(G, coach, 'release', { pid, cost, name: p.n });
    if (gt) return gt;
    if (cost) B.debit(G, club.id, cost, 'compensation');
    Game.releasePlayer(G, club, p, true);
    return ok({ cost });
  };

  A.search = function (G, coach, f) {
    f = f || {};
    const out = [];
    const source = f.free ? G.free.map((id) => G.players[id]) : Object.values(G.players).filter((p) => p.club && p.club !== coach.club && !G.clubs[p.club].foreign && !(f.loanable && p.loan));
    for (const p of source) {
      if (!p) continue;
      if (f.pos && p.pos !== f.pos) continue;
      if (f.minOvr && p.ovr < f.minOvr) continue;
      if (f.maxAge && p.age > f.maxAge) continue;
      if (f.maxPrice && A.askPrice(G, coach, p) > f.maxPrice) continue;
      if (f.stars && !E.isStar(p)) continue;
      if (f.div != null && f.div !== '' && p.club && G.clubs[p.club].div !== +f.div) continue;
      out.push(p);
    }
    out.sort((a, b) => (f.sort === 'pot' ? b.pot - a.pot : b.ovr - a.ovr));
    return out.slice(0, f.limit || 60);
  };

  // ---------- loans (1 or 2 seasons) ----------
  A.loanInFee = (G, coach, p, seasons) => Math.round((E.value(p) * CFG.loanFee * seasons * (1 - 0.015 * coach.sk.neg)) / 100) * 100;
  A.loanOutFee = (G, coach, p, seasons) => Math.round((E.value(p) * CFG.loanOutFee * seasons * (1 + 0.015 * coach.sk.neg)) / 100) * 100;
  A.loanedIn = (G, club) => Game.players(G, club).filter((p) => p.loan && p.loan.owner !== club.id);
  A.loanedOut = (G, club) => Object.values(G.players).filter((p) => p.loan && p.loan.owner === club.id);

  A.loanIn = function (G, coach, pid, seasons) {
    const club = myClub(G, coach), p = G.players[pid];
    seasons = util.clamp(seasons | 0, 1, 2);
    if (!club) return no('no_club');
    if (coach.vac > 0) return no('vacation');
    if (!p || !p.club || p.club === club.id) return no('bad');
    const owner = G.clubs[p.club];
    if (owner.human || owner.foreign || p.loan) return no('human_club');
    if (club.squad.length >= CFG.SQUAD_MAX) return no('squad_full');
    if (owner.squad.length <= CFG.SQUAD_MIN + 1) return no('seller_min');
    if (A.loanedIn(G, club).length >= CFG.loanMaxIn) return no('loan_max');
    const fee = A.loanInFee(G, coach, p, seasons);
    if (B.bal(G, club.id) < fee) return no('no_funds', { cost: fee });
    const gt = SF.Owner.gate(G, coach, 'loanin', { pid, cost: fee, wage: p.wage, name: p.n });
    if (gt) return gt;
    B.transfer(G, club.id, owner.id, fee, 'loan_fee');
    SF.Owner.spent(G, club, fee);
    owner.squad.splice(owner.squad.indexOf(p.id), 1);
    club.squad.push(p.id);
    p.club = club.id; p.listed = 0; p.ct = Math.max(p.ct, seasons + 1);
    p.loan = { owner: owner.id, left: seasons };
    Game.news(G, 'n_loan_in', { name: p.n, club: owner.name, n: seasons }, coach.id);
    return ok({ fee });
  };

  A.loanOut = function (G, coach, pid, seasons) {
    const club = myClub(G, coach), p = G.players[pid];
    seasons = util.clamp(seasons | 0, 1, 2);
    if (!club || !p || p.club !== club.id || p.loan) return no('bad');
    if (club.squad.length <= CFG.SQUAD_MIN) return no('squad_min');
    const fee = A.loanOutFee(G, coach, p, seasons);
    const gt = SF.Owner.gate(G, coach, 'loanout', { pid, name: p.n });
    if (gt) return gt;
    const cands = G.clubIds.filter((id) => { const c = G.clubs[id]; return !c.human && c.squad.length < CFG.SQUAD_MAX - 1 && B.bal(G, id) > fee + p.wage * 10 && c.div >= Math.max(0, club.div - 1); });
    if (!cands.length) return no('buyer_cant');
    const to = G.clubs[R.pick(cands)];
    B.transfer(G, to.id, club.id, fee, 'loan_fee');
    club.squad.splice(club.squad.indexOf(p.id), 1);
    to.squad.push(p.id);
    p.club = to.id; p.listed = 0; p.ct = Math.max(p.ct, seasons + 1);
    p.loan = { owner: club.id, left: seasons };
    G.offers = G.offers.filter((o) => o.pid !== p.id);
    Game.news(G, 'n_loan_out', { name: p.n, club: to.name, fee, n: seasons }, coach.id);
    return ok({ fee, club: to.id });
  };

  // ---------- holiday: the game runs by itself, staff renews contracts, no signings or sales ----------
  A.setVacation = function (G, coach, weeks) {
    if (!coach.club) return no('no_club');
    weeks = weeks | 0;
    if (weeks <= 0) { coach.vac = 0; return ok(); }
    const left = G.sched.length - G.week + 1;
    coach.vac = weeks >= 99 ? left + 1 : Math.min(weeks, left);
    G.offers = G.offers.filter((o) => o.coach !== coach.id);
    return ok({ weeks: coach.vac });
  };

  // ---------- v0.3: scouting, shortlist, captain, academy, career end ----------
  A.scoutPlayer = (G, c, pid) => SF.Extras.scoutPlayer(G, c, pid);
  A.scoutReport = (G, c) => SF.Extras.scoutReport(G, c);
  A.promote = (G, c, pid) => SF.Extras.promote(G, c, pid);
  A.watch = function (G, coach, pid) {
    coach.watch = coach.watch || [];
    const i = coach.watch.indexOf(pid);
    if (i >= 0) { coach.watch.splice(i, 1); return ok({ on: false }); }
    if (coach.watch.length >= CFG.watchMax) return no('watch_full');
    coach.watch.push(pid);
    return ok({ on: true });
  };
  A.setCaptain = function (G, coach, pid) {
    const club = myClub(G, coach), p = G.players[pid];
    if (!club || !p || p.club !== club.id || p.loan) return no('bad');
    club.capt = pid;
    return ok();
  };
  A.retire = function (G, coach) {
    const summary = SF.Extras.summary(G, coach);
    if (coach.club) { G.clubs[coach.club].human = 0; G.offers = G.offers.filter((o) => o.coach !== coach.id); }
    G.coaches.splice(G.coaches.indexOf(coach), 1);
    if (!G.coaches.length) G.over = summary;
    return ok({ summary, over: !G.coaches.length });
  };

  // ---------- squad / lineup ----------
  A.setLineup = function (G, coach, l) {
    const L = coach.lineup;
    if (l.form && Game.FORMS[l.form]) L.form = l.form;
    if (l.tactic) L.tactic = l.tactic;
    if (l.auto != null) L.auto = !!l.auto;
    if (coach.vac > 0) L.auto = true;
    if (l.xi) { L.xi = l.xi.slice(0, 11); L.bench = (l.bench || []).slice(0, 7); }
    return ok();
  };

  // ---------- finance ----------
  A.setPrice = function (G, coach, price) {
    const club = myClub(G, coach);
    if (!club) return no('no_club');
    const ref = CFG.refPrice[club.div];
    club.price = util.clamp(Math.round(price * 10) / 10, ref * 0.4, ref * 3);
    return ok({ price: club.price });
  };

  A.expandStep = (club) => Math.max(500, Math.round((club.cap * 0.1) / 500) * 500);
  A.stadiumCost = (G, club, steps) => steps * A.expandStep(club) * CFG.seatCost;
  A.facilityCost = (club, key) => Math.round((CFG.facStep(club.facility[key]) * CFG.facDiv[club.div]) / 1000) * 1000;
  /** what a facility level is worth: full effect up to level 5, then a slowly rising curve that tops out near 8 */
  A.facEff = (l) => (l <= 5 ? l : 5 + 3 * (1 - SF.Q.exp(-(l - 5) / 25)));
  A.expandStadium = function (G, coach, steps) {
    const club = myClub(G, coach);
    if (!club) return no('no_club');
    steps = util.clamp(steps | 0, 1, 5);
    if (club.build) return no('building');
    if (club.cap + steps * A.expandStep(club) > 90000) return no('max_cap');
    const cost = A.stadiumCost(G, club, steps);
    if (B.bal(G, club.id) < cost) return no('no_funds', { cost });
    const gt = SF.Owner.gate(G, coach, 'expand', { key: steps, cost });
    if (gt) return gt;
    B.debit(G, club.id, cost, 'stadium');
    club.build = { seats: steps * A.expandStep(club), left: CFG.expandWeeks };
    return ok({ cost });
  };

  A.upgradeFacility = function (G, coach, key) {
    const club = myClub(G, coach);
    if (!club || !club.facility[key]) return no('bad');
    const lvl = club.facility[key];
    if (lvl >= CFG.facMax) return no('max_level');
    const cost = A.facilityCost(club, key);
    if (B.bal(G, club.id) < cost) return no('no_funds', { cost });
    const gt = SF.Owner.gate(G, coach, 'fac', { key, cost });
    if (gt) return gt;
    B.debit(G, club.id, cost, 'facility');
    club.facility[key]++;
    return ok({ cost });
  };

  // ask a player to take a pay cut: the better the coach negotiates, the better the odds (one try per player per season)
  A.renegotiate = function (G, coach, pid) {
    const club = myClub(G, coach), p = G.players[pid];
    if (!club || !p || p.club !== club.id) return no('bad');
    if (p.loan) return no('on_loan');
    if (p.rn === G.season) return no('already_tried');
    p.rn = G.season;
    const chance = util.clamp(0.4 + 0.08 * coach.sk.neg + (p.wage > E.wage(p) * 1.15 ? 0.2 : -0.1) + (p.ct <= 1 ? 0.1 : 0), 0.15, 0.9);
    if (!R.chance(chance)) return no('refused');
    const cut = Math.max(40, Math.round((p.wage * 0.85) / 10) * 10);
    const saved = p.wage - cut;
    p.wage = cut;
    return ok({ wage: cut, saved });
  };

  /** what price fills the most money into the till (current mood and fans)? */
  A.bestPrice = function (G, club) {
    const ref = CFG.refPrice[club.div];
    let best = club.price, bv = -1;
    for (let pr = ref * 0.4; pr <= ref * 3 + 1e-9; pr += 0.1) {
      const v = Game.attendance(Object.assign({}, club, { price: pr })) * pr;
      if (v > bv) { bv = v; best = Math.round(pr * 10) / 10; }
    }
    return best;
  };

  /** finance picture of the human club: where the money comes from and goes, plus concrete advice */
  A.financeReport = function (G, coach) {
    const club = myClub(G, coach);
    if (!club) return null;
    const sf = G.bank.sf[club.id] || {};
    const g = (k) => sf[k] || 0;
    const inc = { gate: g('gate') + g('gate_in'), tv: g('tv'), sponsor: g('sponsor'), prize: g('prize'), sales: g('transfer_in') + g('sale_fee') + g('loan_fee_in') };
    const out = { wages: -g('wages'), upkeep: -g('upkeep'), buys: -g('transfer_out') - g('signing') - g('loan_fee_out') - g('compensation'), invest: -g('stadium') - g('facility'), debt: -g('repay') - g('fine') };
    const totIn = util.sum(Object.values(inc)), totOut = util.sum(Object.values(out));
    const weeksDone = Math.max(1, G.sched.slice(0, G.week - 1).filter((x) => x.t !== 'E').length);
    const wk = (x) => x / weeksDone;
    const wageW = util.sum(club.squad.map((id) => G.players[id].wage));
    const baseRev = CFG.tvWeekly[club.div] + CFG.sponsorWeekly[club.div] * SF.Q.sqrt(club.fans / CFG.fans[club.div]) * Game.repSponsor(coach.rep);
    const att = Game.attendance(club);
    const home = att * club.price;
    const weeklyIncome = baseRev + home * 0.5; // about half the league matches are at home
    const tips = [];
    const bal = B.bal(G, club.id), debt = B.debtOf(G, club.id);
    const ratio = wageW / Math.max(1, weeklyIncome);
    if (ratio > 0.62) {
      const cands = Game.players(G, club).filter((p) => !p.loan).sort((a, b) => b.wage / Math.max(1, b.ovr - 30) - a.wage / Math.max(1, a.ovr - 30)).slice(0, 3).map((p) => p.id);
      tips.push({ k: 'wages_high', sev: ratio > 0.8 ? 3 : 2, x: { pct: Math.round(ratio * 100) }, act: 'players', pids: cands });
    }
    if (att < club.cap * 0.72 && club.price > CFG.refPrice[club.div] * 0.6) {
      const bp = A.bestPrice(G, club);
      if (Math.abs(bp - club.price) >= 0.1) tips.push({ k: 'gate_low', sev: 2, x: { pct: Math.round((att / club.cap) * 100), price: club.price, best: bp }, act: 'price', price: bp });
    }
    if (att >= club.cap * 0.97) {
      const bp = A.bestPrice(G, club);
      tips.push(bp > club.price + 0.09
        ? { k: 'gate_full_price', sev: 1, x: { price: club.price, best: bp }, act: 'price', price: bp }
        : { k: 'gate_full', sev: 1, x: { cap: club.cap }, act: 'stadium' });
    }
    const idle = Game.players(G, club).filter((p) => !p.loan && p.ap <= 2 && G.week > 8 && p.wage > 150 && p.age > 22).sort((a, b) => b.wage - a.wage).slice(0, 3);
    if (idle.length) tips.push({ k: 'idle_wages', sev: 1, x: { n: idle.length, w: util.sum(idle.map((p) => p.wage)) }, act: 'players', pids: idle.map((p) => p.id) });
    if (bal < 0) tips.push({ k: 'overdraft', sev: 3, x: { bal: Math.round(bal) }, act: 'loan' });
    else if (debt > 0 && bal > debt * 1.4) tips.push({ k: 'repay_debt', sev: 1, x: { debt: Math.round(debt) }, act: 'loan' });
    if (bal > (wageW * 28) * 0.9 && club.facility.youth < 5) tips.push({ k: 'invest_cash', sev: 0, x: { bal: Math.round(bal) }, act: 'facility' });
    if (g('transfer_out') + g('signing') > totIn * 0.6 && bal < wageW * 8) tips.push({ k: 'overspent', sev: 2, x: {}, act: 'market' });
    if (!tips.length) tips.push({ k: 'finance_ok', sev: 0, x: {}, act: null });
    if (SF.Owner.role(coach) !== 'owner') {
      const rw = SF.Owner.runway(G, club);
      if (rw.weeks < CFG.owner.runwayWarn) tips.push({ k: 'runway', sev: rw.weeks < CFG.owner.runwayMin ? 3 : 2, x: { n: Math.round(rw.weeks * 10) / 10, net: Math.abs(rw.net) } });
    }
    if (SF.Boss && SF.Boss.neglect(club) >= 0.2) tips.push({ k: 'neglect', sev: SF.Boss.neglect(club) >= 0.6 ? 3 : 2, x: { n: Math.round(SF.Boss.neglect(club) * 100) } });
    tips.sort((a, b) => b.sev - a.sev);
    return { inc, out, totIn, totOut, wageW, ratio, att, weeklyIncome, tips, bal, debt };
  };

  A.takeLoan = function (G, coach, amount, seasons) {
    if (!coach.club) return no('no_club');
    const gt = SF.Owner.gate(G, coach, 'loan', { key: 'x', cost: Math.round(amount) });
    if (gt) return gt;
    return B.takeLoan(G, coach.club, amount, seasons);
  };
  A.repayLoan = function (G, coach, id) { return coach.club ? B.repayLoan(G, coach.club, id) : no('no_club'); };

  A.spendSkill = function (G, coach, key) {
    if (!(key in coach.sk) || coach.sk[key] >= 5) return no('bad');
    if (Game.freePoints(coach) < 1) return no('no_points');
    coach.sk[key]++;
    return ok();
  };

  // ---------- weekly market simulation ----------
  A.weeklyMarket = function (G) {
    G.offers = G.offers.filter((o) => { o.ttl--; return o.ttl > 0 && G.players[o.pid] && G.players[o.pid].club === G.coaches.find((c) => c.id === o.coach)?.club; });
    const ai = G.clubIds.filter((id) => !G.clubs[id].human);
    for (const co of G.coaches) {
      if (!co.club) continue;
      const club = G.clubs[co.club];
      const squad = Game.players(G, club);
      const best11 = squad.slice().sort((a, b) => b.ovr - a.ovr).slice(0, 11);
      if (co.vac > 0) continue; // on holiday: nobody bothers the coach with offers
      for (const p of squad) {
        if (p.loan || G.offers.some((o) => o.pid === p.id)) continue;
        let chance = 0, mult = 1;
        if (p.listed > 0) { chance = 0.35; mult = R.range(0.8, 1.3); }
        else if (best11.includes(p) || p.pot > p.ovr + 8) { chance = 0.012; mult = R.range(1.1, 1.6); }
        if (!R.chance(chance)) continue;
        const buyer = G.clubs[R.pick(ai)];
        if (buyer.squad.length >= CFG.SQUAD_MAX) continue;
        const fee = Math.round((E.value(p) * mult * (1 + 0.015 * co.sk.neg)) / 100) * 100;
        if (B.bal(G, buyer.id) < fee * 1.2) continue;
        if (p.listed > 0 && fee < p.listed) continue;
        G.offers.push({ id: G.nextOffer++, coach: co.id, club: buyer.id, pid: p.id, fee, ttl: 3 });
        Game.news(G, 'n_offer', { name: p.n, club: buyer.name, fee }, co.id);
      }
    }
  };

  // ---------- career ----------
  A.genOffers = function (G, coach, n) {
    const cur = coach.club ? Game.strength(G, G.clubs[coach.club]) : -1;
    const cap = Game.repStrength(coach.rep) + 3;
    let cands = G.clubIds.filter((id) => {
      const c = G.clubs[id];
      if (c.human || id === coach.club) return false;
      if (coach.offers.some((o) => o.club === id)) return false;
      const s = Game.strength(G, c);
      return s <= cap && s > cur + 1;
    });
    if (!cands.length && !coach.club) {
      const all = G.clubIds.filter((id) => !G.clubs[id].human && !coach.offers.some((o) => o.club === id));
      all.sort((a, b) => Game.strength(G, G.clubs[a]) - Game.strength(G, G.clubs[b]));
      cands = all.slice(0, 3);
    }
    for (let i = 0; i < n && cands.length; i++) {
      const id = R.weighted(cands, (x) => SF.Q.exp(-(cap - Game.strength(G, G.clubs[x])) / 6));
      cands.splice(cands.indexOf(id), 1);
      coach.offers.push({ id: coach.nextOffer++, club: id, ttl: 6, seen: 0 });
      Game.news(G, 'n_job_offer', { club: G.clubs[id].name }, coach.id);
    }
  };

  A.sack = function (G, coach, resign) {
    const club = G.clubs[coach.club];
    const mode = resign === 'expired' ? 'expired' : resign ? 'resign' : 'fired';
    let owed = 0, fee = 0;
    if (mode === 'fired') owed = SF.Owner.terminateByClub(G, coach, {}).owed;
    else if (mode === 'resign') fee = SF.Owner.quit(G, coach).fee;
    club.human = 0;
    coach.club = null;
    coach.unemp = 0;
    coach.board = 60;
    coach.offers = [];
    if (mode === 'expired') coach.rep = Math.max(0, coach.rep - 0);
    else if (resign) coach.rep = Math.max(0, coach.rep - 2);
    else { coach.sacked++; coach.rep = Math.max(0, coach.rep - 8); }
    if (mode !== 'expired') Game.news(G, resign ? 'n_resigned' : 'n_sacked', { club: club.name }, coach.id);
    if (owed > 0) Game.news(G, 'n_payoff', { club: club.name, amt: owed }, coach.id);
    if (fee > 0) Game.news(G, 'n_exitfee', { club: club.name, amt: fee }, coach.id);
    G.offers = G.offers.filter((o) => o.coach !== coach.id);
  };
  A.resign = function (G, coach) {
    if (!coach.club) return no('no_club');
    if (SF.Owner.role(coach) !== 'coach') return no('owner_cant');
    A.sack(G, coach, true);
    return ok();
  };

  A.acceptJob = function (G, coach, oid) {
    const o = coach.offers.find((x) => x.id === oid);
    if (!o) return no('gone');
    const club = G.clubs[o.club];
    if (club.human) { coach.offers = coach.offers.filter((x) => x !== o); return no('taken'); }
    if (coach.ban > 0) return no('banned', { max: coach.ban });
    if (SF.Owner.role(coach) !== 'coach') return no('owner_cant');
    const comp = coach.club ? SF.Owner.poachFee(coach) : 0;
    if (comp && B.bal(G, club.id) < comp) return no('no_funds', { cost: comp });
    if (coach.club) { if (comp) B.transfer(G, club.id, coach.club, comp, 'coach_comp'); G.clubs[coach.club].human = 0; coach.rep = Math.max(0, coach.rep - 2); }
    if (club.ac) { SF.Owner.toMarket(G, club.ac, 0); club.ac = null; }
    coach.contract = SF.Owner.newContract(club, coach.rep);
    club.human = coach.id;
    coach.club = club.id;
    coach.board = 60; coach.jobWeeks = 0; coach.offers = [];
    coach.lineup = { auto: true, form: '4-4-2', tactic: 'bal', xi: [], bench: [] };
    G.bank.tracked[club.id] = 1;
    G.offers = G.offers.filter((x) => x.coach !== coach.id);
    Game.news(G, 'n_hired', { club: club.name }, coach.id);
    return ok();
  };

  A.declineJob = function (G, coach, oid) { coach.offers = coach.offers.filter((o) => o.id !== oid); return ok(); };

  A.weeklyCareer = function (G) {
    for (const co of G.coaches) {
      if (SF.Owner.role(co) !== 'coach') continue;
      co.offers = co.offers.filter((o) => { if (!(co.ban > 0)) o.ttl--; return o.ttl > 0 && !G.clubs[o.club].human; }); // offers wait while the coach is banned
      if (co.club) {
        co.jobWeeks++;
        if (co.board <= 15 && co.jobWeeks >= 8) { A.sack(G, co, false); continue; }
        if (co.board < 30 && co.jobWeeks % 6 === 0) Game.news(G, 'n_board_warn', {}, co.id);
        if (co.jobWeeks >= 10 && co.board > 85 && R.chance(0.05)) A.genOffers(G, co, 1);
      } else {
        co.unemp++;
        if (co.offers.length < 3 && (R.chance(0.45) || co.unemp >= 2)) A.genOffers(G, co, 1);
      }
    }
  };

  A.seasonEndCareer = function (G) {
    for (const co of G.coaches) {
      if (!co.club || SF.Owner.role(co) !== 'coach') continue;
      if (co.board <= 15) { A.sack(G, co, false); A.genOffers(G, co, 2); continue; }
      const club = G.clubs[co.club];
      const diff = club.target - club.pos;
      const p = util.clamp(0.1 + diff * 0.07 + (club.pos === 1 ? 0.3 : 0), 0.05, 0.9);
      let n = 0;
      if (R.chance(p)) n++;
      if (R.chance(p * 0.5)) n++;
      if (n) A.genOffers(G, co, n);
      for (const o of co.offers) o.ttl = Math.max(o.ttl, 8);
    }
  };
  A.newSeasonCareer = function (G) {
    for (const co of G.coaches) if (!co.club && co.offers.length === 0 && SF.Owner.role(co) === 'coach') A.genOffers(G, co, 2);
  };
})();
