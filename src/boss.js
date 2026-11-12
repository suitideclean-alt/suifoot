/* SuiFoot owner business layer (v0.8): sponsors, merchandising, memberships, investment lines, stadium projects, partnership,
 * events, financing, fair play, club value, owner reputation and the owners' hall of fame.
 * Everything is plain JSON under club.boss (and co.own for the person). Money moves through the Bank ledger.
 * Only clubs run by a human with the role 'owner' use it; the computer owners only get a profile for the hall of fame. */
(function () {
  const SF = globalThis.SF;
  const { CFG, util, R } = SF;
  const B = SF.Bank, E = SF.Econ, O = SF.Owner;
  const Bo = (SF.Boss = {});

  const W = CFG.TOTAL_WEEKS;
  const BC = (Bo.CFG = {
    line: { acad: [0, 0.02, 0.045, 0.08], mkt: [0, 0.03, 0.065, 0.11], comm: [0, 0.02, 0.04, 0.07] }, // weekly cost per level, in units (tv + sponsor of the division)
    maxLine: 3,
    merch: { low: 0.9, normal: 1, premium: 1.15 }, merchSup: { low: 4, normal: 0, premium: -5 },
    member: { low: 0.85, normal: 1, high: 1.2 }, memberSup: { low: 3, normal: 0, high: -4 },
    proj: { roof: { gate: 0.06 }, lights: { gate: 0.04 }, museum: { inc: 0.04, sup: 2 }, med: { inj: 0.12 } },
    maxProj: 10, // levels per project; the price in units grows 45% per level after the second
    peHalf: 2,   // after level 2 each level counts half
    events: { max: 2 },
    stakeMax: 0.4, stakeDiscount: 0.85, buyback: 1.15,
    bondRate: 0.08, bondMax: 0.3,
    ffpPct: 0.1, ffpFine: 0.3,
    kitCost: 0.5, kitWeeks: 10,
    partnerFee: 0.04,
  });
  const PROJ = ['roof', 'lights', 'museum', 'med'];
  const LINES = ['acad', 'mkt', 'comm'];
  const EXEMPT = ['stadium', 'facility', 'academy', 'community', 'project', 'kit'];
  const BRANDS = ['Voltix', 'Aurum Bank', 'Nordlicht', 'Solmar Telecom', 'Kestrel Air', 'Brava Energy', 'Ostra Foods', 'Helio Motors', 'Quanta Pay', 'Lumen Retail', 'Tarsis Steel', 'Maré Beverages', 'Fjord Insurance', 'Pixel Arena'];
  const STYLES = ['shady', 'hothead', 'controller', 'gambler', 'builder', 'patron', 'loyal', 'steady'];

  const unit = (club) => CFG.tvWeekly[club.div] + CFG.sponsorWeekly[club.div];
  const round = (x, s) => Math.round(x / (s || 1)) * (s || 1);
  Bo.unit = unit;
  Bo.active = (G, club) => !!(club && club.human && club.owner) && ((G.coaches.find((c) => c.club === club.id) || {}).role === 'owner');
  const humanOf = (G, club) => G.coaches.find((c) => c.club === club.id) || null;

  // ---------- state ----------
  Bo.init = function (G, club) {
    if (!club.boss) {
      club.boss = { sup: 60, lines: { acad: 0, mkt: 0, comm: 0 }, merch: 'normal', member: 'normal', kitLeft: 0, kitUsed: 0, spon: null, offers: [], offerSeason: 0,
        proj: { roof: 0, lights: 0, museum: 0, med: 0 }, build: null, spent: 0, invest: [], bonds: [], partner: null, evN: 0, val: [], snap: null, wk: 0, ffp: { fines: 0 }, nid: 1, wm: 1, sm: 1, late: 0, df: 0, promos: 0, v0: null, log: [] };
    }
    return club.boss;
  };
  Bo.ensureOwner = function (G, co) {
    if (!co.own) co.own = { hon: 55, free: 50, mot: 50, pat: 50, amb: 50, sta: 50, orep: 50, hist: [], badges: [], reviews: [], approve: 0, decline: 0, fires: 0, seasonsOwned: 0, titles: 0, wealth0: null };
    return co.own;
  };
  const sfCopy = (G, id) => Object.assign({}, G.bank.sf[id] || {});

  // ---------- valuation ----------
  Bo.value = function (G, club) {
    const sq = util.sum(SF.Game.players(G, club).map((p) => E.value(p)));
    const stadium = club.cap * CFG.seatCost * 0.8;
    let fac = 0;
    for (const k of ['youth', 'train']) for (let i = 1; i < club.facility[k]; i++) fac += CFG.facStep(i) * CFG.facDiv[club.div] * 0.5;
    const b = club.boss;
    const proj = b ? b.spent * 0.8 : 0;
    const brand = unit(club) * W * 2 * SF.Q.sqrt(club.fans / CFG.fans[club.div]);
    const cash = Math.max(0, B.bal(G, club.id));
    const debt = B.debtOf(G, club.id) + (b ? util.sum(b.bonds.map((x) => x.due)) : 0);
    return Math.round(sq + stadium + fac + proj + brand + cash - debt);
  };
  /** the owner's share of the club (investors hold the rest) */
  Bo.stake = (club) => 1 - (club.boss ? util.sum(club.boss.invest.map((i) => i.pct)) : 0);
  Bo.netWorth = (G, co, club) => Math.round(Bo.value(G, club) * Bo.stake(club) + O.walletBal(G, co.id));

  // ---------- neglect (idle cash without reinvestment) ----------
  /** spending that counts as reinvesting in the club */
  const INVEST = ['facility', 'project', 'stadium', 'academy', 'marketing', 'community', 'signing', 'transfer_out', 'loan_fee_out', 'kit', 'event', 'scout', 'concert'];
  /** 0..1: how far the owner has let the club stagnate (sits on cash, does not reinvest). Drives fans, gate, sponsors, merch and squad morale down.
   *  Kept in club.nz so it also covers the 'both' role (owner + coach), which has no business layer. */
  Bo.neglect = (club) => (club && club.nz && club.nz.neg ? util.clamp(club.nz.neg / 100, 0, 1) : 0);
  /** 0..1: the club is in the red (scaled to its size): supporters, sponsors, gate and morale suffer. Combined with neglect. */
  Bo.stress = (club) => Math.max(Bo.neglect(club), club && club.nz && club.nz.red ? club.nz.red : 0);
  Bo.neglectOn = (G, club) => {
    if (!club || !club.human || !club.owner) return false;
    const co = humanOf(G, club);
    return !!co && (co.role === 'owner' || co.role === 'both');
  };
  Bo.neglectTick = function (G, club) {
    if (club && club.human && club.owner !== undefined) {
      const z0 = club.nz || (club.nz = { neg: 0, invR: 0, invPrev: 0, wk: 0, warned: 0 });
      z0.red = util.clamp(-B.bal(G, club.id) / (unit(club) * 32), 0, 0.5); // capped so that debt hurts without a death spiral
    }
    if (!Bo.neglectOn(G, club)) return;
    const z = club.nz;
    const sf = G.bank.sf[club.id] || {}, ts = (G.bank.tsf && G.bank.tsf[club.id]) || {};
    let inv = 0;
    for (const k of INVEST) inv += Math.abs(Math.min(0, sf[k] || 0)) + Math.abs(Math.min(0, ts[k] || 0));
    const delta = inv >= z.invPrev ? inv - z.invPrev : inv; // the season flows are reset every year
    z.invPrev = inv;
    z.invR = z.invR * 0.92 + delta;
    z.wk++;
    const u = unit(club), bal = Math.max(0, B.bal(G, club.id));
    const hoard = bal > u * 16, ok = z.invR >= u * 4;
    if (z.wk <= 8) return; // grace period
    if (hoard && !ok) z.neg = Math.min(100, z.neg + 0.6 + Math.min(0.6, (bal / (u * 16) - 1) * 0.15));
    else z.neg = Math.max(0, z.neg - (ok ? 2.5 : 1));
    if (z.neg >= 25 && !z.warned) { z.warned = 1; SF.Game.news(G, 'n_neglect', {}, club.human); }
    if (z.neg < 10) z.warned = 0;
  };

  // ---------- supporters ----------
  Bo.supTarget = function (G, club) {
    const b = club.boss, f = club.form || [];
    const avg = f.length ? util.avg(f) : 1.3;
    const ratio = club.price / CFG.refPrice[club.div];
    let t = 55 + (avg - 1.3) * 18 + util.clamp(-(ratio - 1) * 25, -12, 10);
    t += BC.merchSup[b.merch] + BC.memberSup[b.member] + b.lines.comm * 5 + Bo.pe(b.proj.museum) * BC.proj.museum.sup - 30 * Bo.stress(club);
    if (b.spon && b.spon.k === 'naming') t -= 8;
    return util.clamp(t, 5, 95);
  };
  /** what moves the supporters' mood right now, as [key, points] */
  Bo.supParts = function (G, club) {
    const b = club.boss, f = club.form || [], avg = f.length ? util.avg(f) : 1.3, ratio = club.price / CFG.refPrice[club.div];
    return [['results', Math.round((avg - 1.3) * 18)], ['tickets', Math.round(util.clamp(-(ratio - 1) * 25, -12, 10))], ['merch', BC.merchSup[b.merch]], ['members', BC.memberSup[b.member]],
      ['community', b.lines.comm * 5], ['museum', Bo.pe(b.proj.museum) * BC.proj.museum.sup], ['naming', b.spon && b.spon.k === 'naming' ? -8 : 0], ['neglect', -Math.round(30 * Bo.neglect(club))], ['debt', -Math.round(30 * Math.max(0, Bo.stress(club) - Bo.neglect(club)))]].filter((x) => x[1] !== 0);
  };
  Bo.attMult = function (club) {
    const b = club.boss, ng = 1 - 0.3 * Bo.stress(club);
    if (!b) return ng;
    let m = (0.85 + 0.3 * b.sup / 100) * (1 + BC.proj.roof.gate * Bo.pe(b.proj.roof) + BC.proj.lights.gate * Bo.pe(b.proj.lights));
    if (b.build) m *= 0.92; // works around the ground
    m *= ng;
    return m;
  };
  Bo.injMult = (club) => (club.boss ? Math.max(0.5, 1 - BC.proj.med.inj * Bo.pe(club.boss.proj.med)) : 1);
  Bo.acadPot = (club) => (club.boss ? club.boss.lines.acad * 1.4 : 0);
  Bo.acadExtra = (club) => (club.boss && club.boss.lines.acad >= 3 ? 1 : 0);

  // ---------- sponsors ----------
  const baseSponsor = (G, club) => {
    const co = humanOf(G, club);
    return CFG.sponsorWeekly[club.div] * SF.Q.sqrt(club.fans / CFG.fans[club.div]) * (co ? SF.Game.repSponsor(co.rep) : 1) * (1 - 0.4 * Bo.stress(club));
  };
  Bo.offers = function (G, club) {
    const b = Bo.init(G, club);
    if (b.offerSeason !== G.season || !b.offers.length) {
      const base = baseSponsor(G, club) * b.sm, names = R.shuffle(BRANDS.slice());
      const y = [1, 2, 3][R.int(0, 2)];
      b.offers = [
        { id: 1, k: 'fixed', name: names[0], w: round(base * (1 + 0.03 * (y - 1)) * R.range(0.97, 1.05), 10), win: 0, title: 0, years: y },
        { id: 2, k: 'bonus', name: names[1], w: round(base * 0.7 * R.range(0.97, 1.05), 10), win: round(base * 0.8 * R.range(0.95, 1.08), 10), title: round(base * 10, 100), years: 2 },
        { id: 3, k: 'naming', name: names[2], w: round(base * 1.2 * R.range(0.97, 1.05), 10), win: 0, title: 0, years: 4 },
      ];
      b.offerSeason = G.season;
    }
    return b.offers;
  };
  Bo.signSponsor = function (G, co, id) {
    const club = G.clubs[co.club], b = club && club.boss;
    if (!b || !Bo.active(G, club)) return { ok: false, err: 'owner_only' };
    if (b.spon) return { ok: false, err: 'has_sponsor' };
    const o = Bo.offers(G, club).find((x) => x.id === id);
    if (!o) return { ok: false, err: 'gone' };
    b.spon = { k: o.k, name: o.name, w: o.w, win: o.win, title: o.title, left: o.years * W, years: o.years };
    b.offers = b.offers.filter((x) => x.id !== id);
    SF.Game.news(G, 'n_sponsor_signed', { name: o.name }, co.id);
    return { ok: true };
  };
  Bo.sponsorBreakCost = (b) => (b.spon ? Math.round(b.spon.w * b.spon.left * 0.3) : 0);
  Bo.breakSponsor = function (G, co) {
    const club = G.clubs[co.club], b = club && club.boss;
    if (!b || !b.spon) return { ok: false, err: 'none' };
    const cost = Bo.sponsorBreakCost(b);
    if (B.bal(G, club.id) < cost) return { ok: false, err: 'no_funds' };
    B.debit(G, club.id, cost, 'fine');
    b.spon = null; Bo.track(G, co, 'breach');
    return { ok: true, cost };
  };
  /** the weekly sponsor income, called from the economy tick in place of the default */
  Bo.sponsor = function (G, club, base) {
    const b = club.boss;
    if (!b || !Bo.active(G, club)) return base * (1 - 0.4 * Bo.stress(club));
    const mk = (1 + 0.06 * b.lines.mkt) * (1 - 0.4 * Bo.stress(club));
    return b.spon ? b.spon.w * mk : base * 0.9 * b.sm * mk;
  };

  // ---------- weekly tick ----------
  Bo.econ = function (G, club) {
    Bo.neglectTick(G, club);
    if (!Bo.active(G, club)) return;
    const b = Bo.init(G, club), u = unit(club), co = humanOf(G, club);
    Bo.refresh(G, co, club);
    b.wk++;
    const ng = Bo.stress(club);
    // investment lines
    const kinds = { acad: 'academy', mkt: 'marketing', comm: 'community' };
    // the lines are investments, paid in SFOOT by the owner: with no SFOOT left the line is switched off
    for (const k of LINES) if (b.lines[k] > 0) {
      const lc = lineCost(club, k, b.lines[k]);
      if (SF.Owner.invCan(G, club, lc)) SF.Owner.invPay(G, club, lc, kinds[k]);
      else { b.lines[k] = 0; SF.Game.news(G, 'n_line_off', { k }, co.id); }
    }
    const sq = SF.Q.sqrt(club.fans / CFG.fans[club.div]);
    const f = club.form || [], avg = f.length ? util.avg(f) : 1.3, hype = 0.9 + 0.1 * avg;
    // merchandising and memberships
    const merch = u * 0.10 * sq * (1 + 0.15 * b.lines.mkt) * BC.merch[b.merch] * hype * (b.kitLeft > 0 ? 1.35 : 1) * (1 - 0.35 * ng);
    B.credit(G, club.id, Math.round(merch), 'merch');
    B.credit(G, club.id, Math.round(u * 0.12 * sq * BC.member[b.member] * (1 - 0.35 * ng)), 'members');
    if (b.proj.museum) B.credit(G, club.id, Math.round(u * BC.proj.museum.inc * Bo.pe(b.proj.museum)), 'museum');
    if (b.kitLeft > 0) b.kitLeft--;
    // sponsor deal: bonuses for wins, the term runs down
    if (b.spon) {
      const pts = O.matchPts(G, club);
      if (pts === 3 && b.spon.win) B.credit(G, club.id, b.spon.win, 'sponsor');
      if (--b.spon.left <= 0) { SF.Game.news(G, 'n_sponsor_end', { name: b.spon.name }, co.id); b.spon = null; }
    }
    // partnership fee goes to the partner club
    if (b.partner && G.clubs[b.partner.club]) B.transfer(G, club.id, b.partner.club, round(u * BC.partnerFee, 1), 'partner');
    // bonds: instalments
    for (const bd of b.bonds) {
      const pay = Math.min(bd.weekly, bd.due);
      if (B.bal(G, club.id) < pay) { b.late++; Bo.track(G, co, 'late'); }
      B.debit(G, club.id, pay, 'bond'); bd.due -= pay;
    }
    b.bonds = b.bonds.filter((x) => x.due > 0.5);
    // works
    if (b.build && --b.build.left <= 0) { b.proj[b.build.k]++; SF.Game.news(G, 'n_project_' + b.build.k, {}, co.id); b.build = null; }
    // supporters drift
    b.sup = util.clamp(b.sup + (Bo.supTarget(G, club) - b.sup) * 0.12, 0, 100);
  };

  /** wage and sponsor multipliers from the owner's reputation, used by hiring and sponsor offers */
  Bo.refresh = function (G, co, club) {
    const b = club.boss, o = Bo.ensureOwner(G, co);
    b.wm = round(1.2 - 0.3 * o.orep / 100, 0.001);
    b.sm = round(0.92 + 0.16 * o.orep / 100, 0.001);
  };

  // ---------- decisions ----------
  function lineCost(club, k, lvl) { return round(unit(club) * BC.line[k][lvl], 1); }
  Bo.lineCost = lineCost;
  Bo.setLine = function (G, co, k, lvl) {
    const club = G.clubs[co.club], b = club && club.boss;
    if (!b || !Bo.active(G, club) || !LINES.includes(k)) return { ok: false, err: 'bad' };
    b.lines[k] = util.clamp(Math.round(+lvl), 0, BC.maxLine);
    return { ok: true };
  };
  Bo.setMerch = function (G, co, v) { const b = G.clubs[co.club].boss; if (!BC.merch[v]) return { ok: false }; b.merch = v; return { ok: true }; };
  Bo.setMember = function (G, co, v) { const b = G.clubs[co.club].boss; if (!BC.member[v]) return { ok: false }; b.member = v; return { ok: true }; };
  Bo.kitCost = (club) => round(unit(club) * BC.kitCost, 100);
  Bo.specialKit = function (G, co) {
    const club = G.clubs[co.club], b = club && club.boss;
    if (!b || !Bo.active(G, club)) return { ok: false, err: 'owner_only' };
    if (b.kitUsed === G.season) return { ok: false, err: 'kit_used' };
    const cost = Bo.kitCost(club);
    if (!SF.Owner.invCan(G, club, cost)) return { ok: false, err: 'no_funds', sf: 1 };
    SF.Owner.invPay(G, club, cost, 'kit');
    b.kitLeft = BC.kitWeeks; b.kitUsed = G.season; b.spent += 0; b.sup = Math.min(100, b.sup + 2);
    return { ok: true };
  };
  Bo.MAXPROJ = BC.maxProj;
  /** a project level counts fully up to level 2 and half after that, so level 10 is strong but not absurd */
  Bo.pe = (n) => (n <= BC.peHalf ? n : BC.peHalf + (n - BC.peHalf) * 0.5);
  Bo.projUnits = (lv) => (lv === 0 ? 10 : lv === 1 ? 22 : Math.round(22 * SF.Q.pow(1.45, lv - 1)));
  Bo.projCost = (club, k) => { const b = club.boss; return round(unit(club) * Bo.projUnits(b.proj[k]), 1000); };
  Bo.startProject = function (G, co, k) {
    const club = G.clubs[co.club], b = club && club.boss;
    if (!b || !Bo.active(G, club) || !PROJ.includes(k)) return { ok: false, err: 'bad' };
    if (b.build || club.build) return { ok: false, err: 'busy' };
    if (b.proj[k] >= BC.maxProj) return { ok: false, err: 'max' };
    const cost = Bo.projCost(club, k);
    if (!SF.Owner.invCan(G, club, cost)) return { ok: false, err: 'no_funds', sf: 1 };
    SF.Owner.invPay(G, club, cost, 'project');
    b.spent += cost; b.build = { k, left: Math.min(14, 6 + b.proj[k]) };
    Bo.track(G, co, 'invest', { cost });
    return { ok: true, cost };
  };
  /** clubs of a lower division that agree to a partnership (they play there; a few youngsters develop each season) */
  Bo.partnerCandidates = (G, club) => G.clubIds.filter((id) => !G.clubs[id].human && G.clubs[id].div > club.div).sort((a, b2) => G.clubs[a].div - G.clubs[b2].div || (G.clubs[b2].fans - G.clubs[a].fans)).slice(0, 8);
  Bo.setPartner = function (G, co, id) {
    const club = G.clubs[co.club], b = club && club.boss;
    if (!b || !Bo.active(G, club)) return { ok: false, err: 'owner_only' };
    if (id == null) { b.partner = null; return { ok: true }; }
    if (!Bo.partnerCandidates(G, club).includes(id)) return { ok: false, err: 'bad' };
    b.partner = { club: id, since: G.season };
    return { ok: true };
  };
  Bo.EVENTS = { concert: { cost: 0.3 }, friendly: { cost: 0.3 }, tour: { cost: 1.5 } };
  Bo.eventCost = (club, k) => round(unit(club) * Bo.EVENTS[k].cost, 100);
  Bo.event = function (G, co, k) {
    const club = G.clubs[co.club], b = club && club.boss;
    if (!b || !Bo.active(G, club) || !Bo.EVENTS[k]) return { ok: false, err: 'bad' };
    if (b.evN >= BC.events.max) return { ok: false, err: 'max' };
    if (G.phase !== 'play') return { ok: false, err: 'phase' };
    const cost = Bo.eventCost(club, k), u = unit(club);
    if (!SF.Owner.invCan(G, club, cost)) return { ok: false, err: 'no_funds', sf: 1 };
    SF.Owner.invPay(G, club, cost, 'event');
    let inc = 0, note = '';
    if (k === 'concert') { inc = u * R.range(1.2, 2.4) * (1 + 0.1 * Bo.pe(b.proj.roof)); b.sup -= 3; if (R.chance(0.25)) { const rep = u * 1; B.debit(G, club.id, rep, 'event'); note = 'pitch'; } }
    if (k === 'friendly') { inc = u * R.range(0.8, 1.6); b.sup += 1; if (R.chance(0.15 * Bo.injMult(club))) { const p = R.pick(SF.Game.players(G, club)); if (p) { p.inj = Math.max(p.inj, R.int(2, 4)); note = 'inj'; } } }
    if (k === 'tour') { inc = u * R.range(1.5, 4); club.fans = Math.round(club.fans * 1.015); if (R.chance(0.25)) { b.sup -= 4; note = 'fans'; } }
    b.sup = util.clamp(b.sup, 0, 100);
    inc = Math.round(inc); B.credit(G, club.id, inc, 'event');
    b.evN++;
    SF.Game.news(G, 'n_event_' + k, { amt: inc - cost, note }, co.id);
    return { ok: true, inc, net: inc - cost, note };
  };

  // ---------- financing ----------
  Bo.stakeOffer = (G, club, pct) => Math.round(Bo.value(G, club) * pct * BC.stakeDiscount);
  Bo.sellStake = function (G, co, pct) {
    const club = G.clubs[co.club], b = club && club.boss;
    if (!b || !Bo.active(G, club)) return { ok: false, err: 'owner_only' };
    pct = Math.round(+pct * 100) / 100;
    if (!(pct > 0) || 1 - Bo.stake(club) + pct > BC.stakeMax + 1e-9) return { ok: false, err: 'stake_max' };
    const amt = Bo.stakeOffer(G, club, pct);
    B.credit(G, club.id, amt, 'investor');
    b.invest.push({ id: b.nid++, pct, paid: amt, s: G.season });
    return { ok: true, amt };
  };
  Bo.buybackCost = (G, club, inv) => Math.round(Bo.value(G, club) * inv.pct * BC.buyback);
  Bo.buyBack = function (G, co, id) {
    const club = G.clubs[co.club], b = club && club.boss;
    const inv = b && b.invest.find((x) => x.id === id);
    if (!inv) return { ok: false, err: 'gone' };
    const cost = Bo.buybackCost(G, club, inv);
    if (B.bal(G, club.id) < cost) return { ok: false, err: 'no_funds' };
    B.debit(G, club.id, cost, 'investor');
    b.invest = b.invest.filter((x) => x.id !== id);
    return { ok: true, cost };
  };
  Bo.bondMax = (G, club) => Math.max(0, Math.round(Bo.value(G, club) * BC.bondMax - util.sum(club.boss.bonds.map((x) => x.due))));
  Bo.bondQuote = (amt, years) => { const due = Math.round(amt * (1 + BC.bondRate * years)); return { due, weekly: Math.ceil(due / (years * W)) }; };
  Bo.issueBond = function (G, co, amt, years) {
    const club = G.clubs[co.club], b = club && club.boss;
    if (!b || !Bo.active(G, club)) return { ok: false, err: 'owner_only' };
    amt = Math.round(+amt); years = util.clamp(Math.round(+years) || 1, 1, 3);
    if (!(amt > 0) || amt > Bo.bondMax(G, club)) return { ok: false, err: 'bond_max' };
    const q = Bo.bondQuote(amt, years);
    B.credit(G, club.id, amt, 'bond');
    b.bonds.push({ id: b.nid++, amt, years, due: q.due, weekly: q.weekly, s: G.season });
    return { ok: true, due: q.due };
  };
  Bo.repayBond = function (G, co, id) {
    const club = G.clubs[co.club], b = club && club.boss;
    const bd = b && b.bonds.find((x) => x.id === id);
    if (!bd) return { ok: false, err: 'gone' };
    if (B.bal(G, club.id) < bd.due) return { ok: false, err: 'no_funds' };
    B.debit(G, club.id, bd.due, 'bond');
    b.bonds = b.bonds.filter((x) => x.id !== id);
    return { ok: true };
  };

  // ---------- data ----------
  const RECUR = new Set(['gate', 'gate_in', 'tv', 'sponsor', 'wages', 'upkeep', 'merch', 'members', 'museum', 'academy', 'marketing', 'community', 'partner_out', 'bond', 'coach_pay', 'coach_bonus', 'mgr_pay']);
  Bo.forecast = function (G, club) {
    const b = club.boss, led = G.bank.led[club.id] || [];
    const bal = B.bal(G, club.id);
    // last 8 weeks of recurring flows
    const byWeek = {};
    for (const e of led.slice(-400)) { if (!RECUR.has(e[2])) continue; const key = e[0] + '.' + e[1]; byWeek[key] = (byWeek[key] || 0) + e[3]; }
    const wks = Object.keys(byWeek).slice(-8);
    const avg = wks.length ? util.sum(wks.map((k) => byWeek[k])) / wks.length : 0;
    const left = Math.max(0, W - (b ? b.wk : 0));
    const end = Math.round(bal + avg * left);
    const zero = avg < 0 && bal > 0 ? Math.floor(bal / -avg) : null;
    return { avg: Math.round(avg), end, left, zero: zero != null && zero < left ? (b ? b.wk : 0) + zero : null, bal };
  };
  /** season flows so far, from the ledger since the season began */
  Bo.seasonFlows = function (G, club) {
    const b = club.boss, sf = G.bank.sf[club.id] || {}, sn = (b && b.snap) || {};
    const inc = {}, out = {};
    for (const k in sf) { const d = sf[k] - (sn[k] || 0); if (d > 0.5) inc[k] = d; else if (d < -0.5) out[k] = -d; }
    return { inc, out, totIn: util.sum(Object.values(inc)), totOut: util.sum(Object.values(out)) };
  };
  Bo.efficiency = function (G, club) {
    const f = Bo.seasonFlows(G, club), tb = G.table[club.id] || { pts: 0, gf: 0 };
    return { perPoint: tb.pts ? Math.round(f.totOut / tb.pts) : null, perGoal: tb.gf ? Math.round(f.totOut / tb.gf) : null, wageRatio: f.totIn ? (f.out.wages || 0) / f.totIn : 0 };
  };
  Bo.compare = function (G, club) {
    const ids = G.clubIds.filter((id) => G.clubs[id].div === club.div);
    const m = {
      wages: (cl) => util.sum(SF.Game.players(G, cl).map((p) => p.wage)),
      value: (cl) => util.sum(SF.Game.players(G, cl).map((p) => E.value(p))),
      balance: (cl) => B.bal(G, cl.id),
      debt: (cl) => B.debtOf(G, cl.id),
      fans: (cl) => cl.fans, cap: (cl) => cl.cap, price: (cl) => cl.price, strength: (cl) => SF.Game.strength(G, cl),
    };
    const out = {};
    for (const k in m) {
      const vals = ids.map((id) => m[k](G.clubs[id])), mine = m[k](club);
      out[k] = { mine, avg: util.avg(vals), rank: vals.filter((v) => v > mine).length + 1 };
    }
    return out;
  };
  Bo.squadReturn = function (G, club) {
    const pl = SF.Game.players(G, club).filter((p) => p.ap >= 3).map((p) => ({ p, perApp: Math.round(p.wage * W / Math.max(1, p.ap)), val: E.value(p) }));
    pl.sort((a, b2) => a.perApp - b2.perApp);
    return { best: pl.slice(0, 4), worst: pl.slice(-4).reverse() };
  };
  Bo.ffp = function (G, club) {
    const b = club.boss, fl = Bo.seasonFlows(G, club);
    let ex = 0;
    for (const k of EXEMPT) ex += fl.out[k] || 0;
    const net = fl.totIn - fl.totOut + ex, prev = (club.pl || [])[club.pl ? club.pl.length - 1 : 0];
    const limit = Math.round(((prev && prev.inc) || fl.totIn || unit(club) * W * 2) * BC.ffpPct);
    return { net: Math.round(net), limit, over: Math.max(0, Math.round(-net - limit)), fines: b.ffp.fines };
  };

  // ---------- advice ----------
  Bo.tips = function (G, club) {
    const b = club.boss, tips = [], fc = Bo.forecast(G, club), co = humanOf(G, club), own = Bo.ensureOwner(G, co);
    if (fc.zero != null && fc.zero - b.wk < 10) tips.push({ k: 'zero', sev: 3, x: { n: fc.zero - b.wk } });
    else if (fc.end < 0) tips.push({ k: 'endneg', sev: 2, x: { amt: fc.end } });
    const f = Bo.ffp(G, club);
    if (f.over > 0) tips.push({ k: 'ffp', sev: 3, x: { amt: f.over } });
    if (!b.spon && Bo.offers(G, club).length) tips.push({ k: 'sponsor', sev: 1, x: {} });
    if (b.sup < 40) tips.push({ k: 'sup', sev: 2, x: { n: Math.round(b.sup) } });
    if (!b.lines.acad && club.facility.youth >= 3) tips.push({ k: 'acad', sev: 1, x: {} });
    if (b.evN < BC.events.max && b.wk < 12) tips.push({ k: 'event', sev: 0, x: {} });
    if (fc.bal > unit(club) * W * 1.2 && fc.avg > 0) tips.push({ k: 'idle', sev: 1, x: {} });
    if (Bo.neglect(club) >= 0.2) tips.push({ k: 'neglect', sev: Bo.neglect(club) >= 0.6 ? 3 : 2, x: { n: Math.round(Bo.neglect(club) * 100) } });
    if (own.orep < 40) tips.push({ k: 'orep', sev: 2, x: { n: own.orep } });
    return tips;
  };

  // ---------- owner reputation ----------
  const clampA = (x) => util.clamp(x, 0, 100);
  Bo.track = function (G, co, kind, x) {
    if (!co) return;
    const o = Bo.ensureOwner(G, co);
    const d = (k, v) => { o[k] = clampA(o[k] + v); };
    if (kind === 'late') d('hon', -2);
    else if (kind === 'fine') d('hon', -6);
    else if (kind === 'breach') d('hon', -4);
    else if (kind === 'approve') { o.approve++; d('free', 1.2); }
    else if (kind === 'decline') { o.decline++; d('free', -1.2); }
    else if (kind === 'veto') d('free', -1);
    else if (kind === 'fire') { o.fires++; d('pat', -6); if (x && x.metObj) d('hon', -3); }
    else if (kind === 'mutual') d('pat', -2);
    else if (kind === 'contract' && x) d('mot', util.clamp((x.win / Math.max(1, x.wage) - 0.3) * 10, -3, 5));
    else if (kind === 'obj' && x) d('mot', x.gap <= 2 && x.gap >= -1 ? 2 : x.gap > 4 ? -3 : 0);
    else if (kind === 'invest') d('amb', 0.8);
    o.orep = Bo.orepOf(o);
  };
  Bo.orepOf = (o) => Math.round(clampA(util.avg([o.hon, o.free, o.mot, o.pat, o.amb, o.sta])));
  Bo.style = function (o) {
    if (o.hon < 35) return 'shady';
    if (o.pat < 35) return 'hothead';
    if (o.free < 35) return 'controller';
    if (o.amb >= 65 && o.sta < 45) return 'gambler';
    if (o.amb >= 65 && o.sta >= 55) return 'builder';
    if (o.free >= 65 && o.mot >= 60) return 'patron';
    if (o.pat >= 70) return 'loyal';
    return 'steady';
  };
  Bo.review = function (G, co, club, ac) {
    const o = Bo.ensureOwner(G, co);
    const score = (o.hon * 0.4 + o.free * 0.3 + o.mot * 0.3) / 100;
    o.reviews.push({ s: G.season, who: ac.name, stars: util.clamp(Math.round(1 + 4 * score), 1, 5) });
    if (o.reviews.length > 12) o.reviews.shift();
  };
  const badge = (o, id, s) => { if (!o.badges.some((x) => x.id === id)) o.badges.push({ id, s }); };

  // ---------- season rollover ----------
  Bo.seasonStart = function (G) {
    for (const co of O.ownerClubs(G)) {
      const club = G.clubs[co.club];
      if (!club) continue;
      const b = Bo.init(G, club), o = Bo.ensureOwner(G, co);
      b.wk = 0; b.evN = 0; b.late = 0; b.snap = sfCopy(G, club.id); b.offers = [];
      if (o.wealth0 == null) o.wealth0 = Bo.netWorth(G, co, club);
      if (b.v0 == null) b.v0 = Bo.value(G, club);
      Bo.refresh(G, co, club);
      Bo.offers(G, club);
    }
    Bo.ensureOwners(G);
  };
  Bo.migrate = function (G) {
    if (!G.divs) return;
    if (!G.owners || O.ownerClubs(G).some((c) => G.clubs[c.club] && !G.clubs[c.club].boss)) Bo.seasonStart(G);
  };
  Bo.seasonEnd = function (G) {
    for (const co of O.ownerClubs(G)) {
      const club = G.clubs[co.club];
      if (!club) continue;
      const b = Bo.init(G, club), o = Bo.ensureOwner(G, co), fl = Bo.seasonFlows(G, club);
      const net = fl.totIn - fl.totOut, rev = Math.max(1, fl.totIn);
      // fair play
      const f = Bo.ffp(G, club);
      if (f.over > 0) { const fine = Math.round(f.over * BC.ffpFine); B.debit(G, club.id, fine, 'fine'); b.ffp.fines += fine; SF.Game.news(G, 'n_ffp', { amt: fine }, co.id); Bo.track(G, co, 'fine'); }
      // investors share the profit
      if (net > 0) for (const inv of b.invest) { const div = Math.round(net * inv.pct); if (div > 0) B.debit(G, club.id, div, 'dividend'); }
      // fans follow the supporters' mood, the museum and marketing
      club.fans = Math.round(club.fans * (1 + (b.sup - 55) / 800 + 0.008 * b.lines.mkt + 0.004 * Bo.pe(b.proj.museum)));
      // partner club develops youngsters
      if (b.partner) {
        const youth = SF.Game.players(G, club).filter((p) => p.age <= 21).sort((a, c2) => a.ovr - c2.ovr).slice(0, 3);
        for (const p of youth) if (p.ovr < p.pot) p.ovr = Math.min(p.pot, p.ovr + 1);
        if (youth.length) SF.Game.news(G, 'n_partner_dev', { n: youth.length, club: G.clubs[b.partner.club].name }, co.id);
      }
      // reputation drift from the season's behaviour
      o.seasonsOwned++;
      const inv = EXEMPT.concat(['marketing']).reduce((s, k) => s + (fl.out[k] || 0), 0) / rev;
      const noDebt = B.bal(G, club.id) >= 0 && B.debtOf(G, club.id) === 0 && !b.bonds.length;
      const d = (k, v) => { o[k] = clampA(o[k] + v); };
      if (!b.late && !f.over) d('hon', 3);
      const ac = club.ac;
      if (ac && club.ac.hist) { const tenure = ac.hist.filter((h) => h.club === club.id).length; if (tenure >= 2) d('pat', 3); }
      d('amb', inv > 0.12 ? 4 : inv > 0.05 ? 1 : inv < 0.02 ? -3 : 0);
      d('sta', noDebt && net >= 0 ? 3 : net < 0 ? -2 : 0);
      const moods = SF.Game.players(G, club).map((p) => SF.Extras.mood(p)), mood = util.avg(moods);
      d('mot', mood > 60 ? 2 : mood < 40 ? -2 : 0);
      o.orep = Bo.orepOf(o);
      b.df = noDebt ? b.df + 1 : 0;
      if (club.nextDiv < club.div) b.promos++;
      if (club.pos === 1) o.titles++;
      // history and badges
      const val = Bo.value(G, club);
      b.val.push([G.season, val]); o.hist.push([G.season, o.orep]);
      if (b.val.length > 30) b.val.shift(); if (o.hist.length > 30) o.hist.shift();
      if (o.titles >= 1) badge(o, 'champion', G.season);
      if (b.proj.roof + b.proj.lights + b.proj.museum + b.proj.med >= 4) badge(o, 'builder', G.season);
      if (b.lines.acad >= 3 && club.facility.youth >= 4) badge(o, 'trainer', G.season);
      if (net >= 0 && club.pos <= 3) badge(o, 'balanced', G.season);
      if (ac && ac.hist.filter((h) => h.club === club.id).length >= 3) badge(o, 'loyal', G.season);
      if (b.promos >= 2) badge(o, 'savior', G.season);
      if (b.df >= 5) badge(o, 'debtfree', G.season);
      if (o.hon >= 85) badge(o, 'honest', G.season);
      b.log.push({ s: G.season, net: Math.round(net), val, fans: club.fans, sup: Math.round(b.sup), pos: club.pos });
      if (b.log.length > 30) b.log.shift();
      Bo.refresh(G, co, club);
    }
    Bo.ownersSeasonEnd(G);
  };

  // ---------- hall of fame: the computer owners and the ranking ----------
  Bo.ensureOwners = function (G) {
    if (!G.owners) G.owners = {};
    for (const id of G.clubIds) {
      const club = G.clubs[id];
      if (club.human || G.owners[id]) continue;
      G.owners[id] = { name: SF.World.playerName(), club: id, orep: R.int(35, 70), style: R.pick(STYLES), titles: 0, v0: Bo.value(G, club), val: Bo.value(G, club), s0: G.season, div0: club.div, wealth: 0 };
    }
  };
  Bo.ownersSeasonEnd = function (G) {
    Bo.ensureOwners(G);
    for (const id in G.owners) {
      const ow = G.owners[id], club = G.clubs[id];
      if (!club) continue;
      if (club.human) { delete G.owners[id]; continue; } // a person took the club: the computer owner steps down
      ow.val = Bo.value(G, club);
      if (club.pos === 1) ow.titles++;
      ow.orep = util.clamp(Math.round(ow.orep + (club.pos <= club.target ? 1.5 : -1.5) + R.range(-1, 1)), 15, 95);
    }
  };
  /** one row per owner: people and computer owners side by side */
  Bo.ranking = function (G) {
    Bo.ensureOwners(G);
    const rows = [];
    for (const id in G.owners) {
      const ow = G.owners[id], club = G.clubs[id];
      if (!club) continue;
      rows.push({ me: false, name: ow.name, club: id, val: ow.val, worth: ow.val, growth: ow.v0 ? ow.val / ow.v0 - 1 : 0, orep: ow.orep, titles: ow.titles, style: ow.style, div: club.div });
    }
    for (const co of O.ownerClubs(G)) {
      const club = G.clubs[co.club], o = Bo.ensureOwner(G, co), b = Bo.init(G, club);
      const val = Bo.value(G, club);
      rows.push({ me: true, name: co.name, club: club.id, val, worth: Bo.netWorth(G, co, club), growth: b.v0 ? val / b.v0 - 1 : 0, orep: o.orep, titles: o.titles, style: Bo.style(o), div: club.div });
    }
    return rows;
  };
  /** compact public profile: what a hall of fame (or the chain) would publish */
  Bo.profile = function (G, co) {
    const club = G.clubs[co.club], o = Bo.ensureOwner(G, co), b = club && club.boss;
    return { name: co.name, orep: o.orep, axes: { hon: o.hon, free: o.free, mot: o.mot, pat: o.pat, amb: o.amb, sta: o.sta }, style: Bo.style(o), badges: o.badges.map((x) => x.id), titles: o.titles, seasons: o.seasonsOwned, val: b ? b.val.slice() : [], reviews: o.reviews.slice() };
  };
})();
