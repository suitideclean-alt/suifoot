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
    return Math.round((E.value(p) * p.ask * (1 - 0.015 * coach.sk.neg)) / 100) * 100;
  };

  A.buy = function (G, coach, pid, fee) {
    const club = myClub(G, coach), p = G.players[pid];
    if (!club) return no('no_club');
    if (!p || !p.club || p.club === club.id) return no('bad');
    const seller = G.clubs[p.club];
    if (seller.human) return no('human_club');
    if (club.squad.length >= CFG.SQUAD_MAX) return no('squad_full');
    if (seller.squad.length <= CFG.SQUAD_MIN + 1) return no('seller_min');
    fee = Math.round(fee);
    const ask = A.askPrice(G, coach, p);
    if (fee < ask * 0.88) return no('rejected', { ask });
    if (fee < ask) return no('counter', { ask });
    if (B.bal(G, club.id) < fee) return no('no_funds', { ask });
    Game.moveClub(G, p, seller, club, fee);
    p.ct = 3;
    Game.news(G, 'n_bought', { name: p.n, club: seller.name, fee }, coach.id);
    return ok({ fee });
  };

  A.signFree = function (G, coach, pid) {
    const club = myClub(G, coach), p = G.players[pid];
    if (!club || !p || p.club) return no('bad');
    if (club.squad.length >= CFG.SQUAD_MAX) return no('squad_full');
    const wage = E.wageFor(p.ovr);
    const bonus = wage * 3;
    if (B.bal(G, club.id) < bonus) return no('no_funds', { cost: bonus });
    G.free.splice(G.free.indexOf(pid), 1);
    p.club = club.id; p.wage = wage; p.ct = 2;
    club.squad.push(pid);
    B.debit(G, club.id, bonus, 'signing');
    Game.news(G, 'n_signed', { name: p.n }, coach.id);
    return ok({ cost: bonus });
  };

  A.listPlayer = function (G, coach, pid, price) {
    const p = G.players[pid];
    if (!p || p.club !== coach.club) return no('bad');
    p.listed = Math.max(0, Math.round(price));
    return ok();
  };

  A.sellNow = function (G, coach, pid) {
    const club = myClub(G, coach), p = G.players[pid];
    if (!club || !p || p.club !== club.id) return no('bad');
    if (club.squad.length <= CFG.SQUAD_MIN) return no('squad_min');
    const price = Math.round((E.value(p) * 0.65 * (1 + 0.015 * coach.sk.neg)) / 100) * 100;
    B.credit(G, club.id, price, 'sale_fee');
    Game.releasePlayer(G, club, p, true);
    Game.news(G, 'n_sold_now', { name: p.n, fee: price }, coach.id);
    return ok({ price });
  };

  A.acceptOffer = function (G, coach, oid) {
    const i = G.offers.findIndex((o) => o.id === oid && o.coach === coach.id);
    if (i < 0) return no('gone');
    const o = G.offers[i];
    const club = myClub(G, coach), p = G.players[o.pid], buyer = G.clubs[o.club];
    if (!club || !p || p.club !== club.id) { G.offers.splice(i, 1); return no('gone'); }
    if (club.squad.length <= CFG.SQUAD_MIN) return no('squad_min');
    if (buyer.squad.length >= CFG.SQUAD_MAX || B.bal(G, buyer.id) < o.fee) { G.offers.splice(i, 1); return no('buyer_cant'); }
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
    if (p.ct >= 6) return no('max_contract');
    const wage = Math.round((E.wageFor(p.ovr) * (1 + 0.02 * years)) / 10) * 10;
    const bonus = wage * 2;
    if (B.bal(G, club.id) < bonus) return no('no_funds', { cost: bonus });
    B.debit(G, club.id, bonus, 'signing');
    p.wage = wage; p.ct = Math.min(6, p.ct + years);
    return ok({ wage, cost: bonus });
  };

  A.releaseCost = (p) => Math.round(p.wage * 28 * Math.max(0, p.ct - 1) * 0.4);
  A.release = function (G, coach, pid) {
    const club = myClub(G, coach), p = G.players[pid];
    if (!club || !p || p.club !== club.id) return no('bad');
    if (club.squad.length <= CFG.SQUAD_MIN) return no('squad_min');
    const cost = A.releaseCost(p);
    if (B.bal(G, club.id) < cost) return no('no_funds', { cost });
    if (cost) B.debit(G, club.id, cost, 'compensation');
    Game.releasePlayer(G, club, p, true);
    return ok({ cost });
  };

  A.search = function (G, coach, f) {
    f = f || {};
    const out = [];
    const source = f.free ? G.free.map((id) => G.players[id]) : Object.values(G.players).filter((p) => p.club && p.club !== coach.club);
    for (const p of source) {
      if (!p) continue;
      if (f.pos && p.pos !== f.pos) continue;
      if (f.minOvr && p.ovr < f.minOvr) continue;
      if (f.maxAge && p.age > f.maxAge) continue;
      if (f.maxPrice && A.askPrice(G, coach, p) > f.maxPrice) continue;
      if (f.div != null && f.div !== '' && p.club && G.clubs[p.club].div !== +f.div) continue;
      out.push(p);
    }
    out.sort((a, b) => (f.sort === 'pot' ? b.pot - a.pot : b.ovr - a.ovr));
    return out.slice(0, f.limit || 60);
  };

  // ---------- squad / lineup ----------
  A.setLineup = function (G, coach, l) {
    const L = coach.lineup;
    if (l.form && Game.FORMS[l.form]) L.form = l.form;
    if (l.tactic) L.tactic = l.tactic;
    if (l.auto != null) L.auto = !!l.auto;
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
  A.facilityCost = (club, key) => Math.round((CFG.facilityCost[club.facility[key]] * CFG.facDiv[club.div]) / 1000) * 1000;
  A.expandStadium = function (G, coach, steps) {
    const club = myClub(G, coach);
    if (!club) return no('no_club');
    steps = util.clamp(steps | 0, 1, 5);
    if (club.build) return no('building');
    if (club.cap + steps * A.expandStep(club) > 90000) return no('max_cap');
    const cost = A.stadiumCost(G, club, steps);
    if (B.bal(G, club.id) < cost) return no('no_funds', { cost });
    B.debit(G, club.id, cost, 'stadium');
    club.build = { seats: steps * A.expandStep(club), left: CFG.expandWeeks };
    return ok({ cost });
  };

  A.upgradeFacility = function (G, coach, key) {
    const club = myClub(G, coach);
    if (!club || !club.facility[key]) return no('bad');
    const lvl = club.facility[key];
    if (lvl >= 5) return no('max_level');
    const cost = A.facilityCost(club, key);
    if (B.bal(G, club.id) < cost) return no('no_funds', { cost });
    B.debit(G, club.id, cost, 'facility');
    club.facility[key]++;
    return ok({ cost });
  };

  A.takeLoan = function (G, coach, amount, seasons) { return coach.club ? B.takeLoan(G, coach.club, amount, seasons) : no('no_club'); };
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
      for (const p of squad) {
        if (G.offers.some((o) => o.pid === p.id)) continue;
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
      const id = R.weighted(cands, (x) => Math.exp(-(cap - Game.strength(G, G.clubs[x])) / 6));
      cands.splice(cands.indexOf(id), 1);
      coach.offers.push({ id: coach.nextOffer++, club: id, ttl: 6, seen: 0 });
      Game.news(G, 'n_job_offer', { club: G.clubs[id].name }, coach.id);
    }
  };

  A.sack = function (G, coach, resign) {
    const club = G.clubs[coach.club];
    club.human = 0;
    coach.club = null;
    coach.unemp = 0;
    coach.board = 60;
    coach.offers = [];
    if (resign) coach.rep = Math.max(0, coach.rep - 2);
    else { coach.sacked++; coach.rep = Math.max(0, coach.rep - 8); }
    Game.news(G, resign ? 'n_resigned' : 'n_sacked', { club: club.name }, coach.id);
    G.offers = G.offers.filter((o) => o.coach !== coach.id);
  };
  A.resign = function (G, coach) { if (!coach.club) return no('no_club'); A.sack(G, coach, true); return ok(); };

  A.acceptJob = function (G, coach, oid) {
    const o = coach.offers.find((x) => x.id === oid);
    if (!o) return no('gone');
    const club = G.clubs[o.club];
    if (club.human) { coach.offers = coach.offers.filter((x) => x !== o); return no('taken'); }
    if (coach.club) { G.clubs[coach.club].human = 0; coach.rep = Math.max(0, coach.rep - 2); }
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
      co.offers = co.offers.filter((o) => { o.ttl--; return o.ttl > 0 && !G.clubs[o.club].human; });
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
      if (!co.club) continue;
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
    for (const co of G.coaches) if (!co.club && co.offers.length === 0) A.genOffers(G, co, 2);
  };
})();
