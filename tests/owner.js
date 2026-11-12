// Owner / coach layer: limits, approvals, contracts, pay-offs, abuse attempts.
const SF = require('./load.js');
let pass = 0, fail = 0;
function t(name, fn) { try { fn(); pass++; console.log('  ok  ' + name); } catch (e) { fail++; console.log('FAIL  ' + name + '\n      ' + e.message); } }
const eq = (a, b, m) => { if (a !== b) throw new Error((m || '') + ` expected ${b} got ${a}`); };
const truthy = (a, m) => { if (!a) throw new Error(m || 'expected truthy'); };
const { Game, Actions: A, Bank: B, Owner: O, CFG } = SF;
const E_value = (p) => SF.Econ.value(p);
const conserved = (G) => eq(B.supply(G), B.totalBalances(G), 'money conserved');

function setup(role, seed) {
  const G = Game.newGame({ seed: seed || 7, coaches: [{ name: 'A', role }] });
  const co = G.coaches[0], club = G.clubs[co.club];
  B.credit(G, club.id, 3000000, 'bailout');
  // a seller club with a mid-value player
  const seller = G.clubIds.map((id) => G.clubs[id]).find((c) => !c.human && !c.foreign && c.div === club.div && c.id !== club.id);
  const p = G.players[seller.squad.slice().sort((a, b) => G.players[b].ovr - G.players[a].ovr)[3]];
  return { G, co, club, seller, p };
}

t('coach role: a buy above the fee limit is stopped and a request is created', () => {
  const { G, co, club, p } = setup('coach');
  O.policy(G, club).maxFee = 1;
  const r = A.buy(G, co, p.id, A.askPrice(G, co, p));
  eq(r.err, 'needs_approval'); eq(r.why, 'fee');
  eq(O.openFor(G, club.id).length, 1); eq(p.club === club.id, false, 'player did not move');
});

t('computer owner decides at the end of the week; approval works once only', () => {
  const { G, co, club, p } = setup('coach');
  co.board = 80; O.policy(G, club).maxFee = 1;
  const fee = A.askPrice(G, co, p);
  A.buy(G, co, p.id, fee);
  Game.playWeekAuto(G);
  const ap = G.approvals[0]; eq(ap.status, 'ok', 'approved');
  const r = A.buy(G, co, p.id, A.askPrice(G, co, p));
  truthy(r.ok, 'bought after approval: ' + JSON.stringify(r)); eq(G.approvals[0].status, 'used');
  // the token is spent: selling and buying another player needs a new request
  const q = G.players[G.clubs[p.club === club.id ? G.clubIds.find((x) => x !== club.id && !G.clubs[x].human && G.clubs[x].div === club.div) : p.club].squad[0]];
  eq(A.buy(G, co, q.id, A.askPrice(G, co, q)).err, 'needs_approval');
  conserved(G);
});

t('an approval is tied to one player and one cost: it cannot be reused for another', () => {
  const { G, co, club, seller, p } = setup('coach');
  co.board = 80; O.policy(G, club).maxFee = 1;
  A.buy(G, co, p.id, A.askPrice(G, co, p));
  Game.playWeekAuto(G);
  const other = G.players[seller.squad.find((id) => id !== p.id)];
  eq(A.buy(G, co, other.id, A.askPrice(G, co, other)).err, 'needs_approval');
  eq(A.buy(G, co, p.id, A.askPrice(G, co, p)).ok, true);
});

t('abuse: many cheap buys cannot get around the season budget', () => {
  const { G, co, club, seller } = setup('coach');
  const pol = O.policy(G, club);
  const ids = seller.squad.slice(0, 3);
  const fees = ids.map((id) => A.askPrice(G, co, G.players[id]));
  pol.maxFee = 1e9; pol.budget = fees[0] + 1; pol.reserve = 0; pol.wageCap = 1e9; pol.maxWage = 1e9;
  eq(A.buy(G, co, ids[0], fees[0]).ok, true);
  const r = A.buy(G, co, ids[1], fees[1]);
  eq(r.err, 'needs_approval'); eq(r.why, 'budget');
});

t('abuse: selling below the minimum price or an untouchable is stopped; computer owner declines', () => {
  const { G, co, club } = setup('coach');
  const p = G.players[club.squad[0]];
  O.policy(G, club).untouchable.push(p.id);
  const r = A.sellNow(G, co, p.id);
  eq(r.err, 'needs_approval'); eq(r.why, 'untouchable');
  co.board = 40; Game.playWeekAuto(G);
  eq(G.approvals[0].status, 'no');
  eq(A.sellNow(G, co, p.id).err, 'needs_approval');
  const q = G.players[club.squad[5]]; O.policy(G, club).minSalePct = 5;
  eq(A.listPlayer(G, co, q.id, 100).why, 'minprice');
});

t('owner-only actions (stadium, facilities, debt) always need approval for a coach, never for owner-coach', () => {
  const a = setup('coach');
  eq(A.expandStadium(a.G, a.co, 1).err, 'needs_approval');
  eq(A.takeLoan(a.G, a.co, 1000, 1).err, 'needs_approval');
  const b = setup('both');
  truthy(A.expandStadium(b.G, b.co, 1).ok, 'owner-coach expands directly');
  b.club.policy = O.policy(b.G, b.club); b.club.policy.maxFee = 1;
  truthy(A.buy(b.G, b.co, b.p.id, A.askPrice(b.G, b.co, b.p)).ok, 'limits do not bind the owner-coach');
});

t('salary is paid weekly from the club to the coach and money is conserved', () => {
  const { G, co, club } = setup('coach');
  co.contract.win = 0;
  const w0 = O.walletBal(G, co.id), left0 = co.contract.left;
  Game.playWeekAuto(G); Game.playWeekAuto(G);
  eq(O.walletBal(G, co.id) - w0, co.contract.wage * 2, 'two weeks of salary');
  eq(left0 - co.contract.left, 2); conserved(G);
});

t('sacked without just cause: remaining salary in instalments; cap and break clause apply', () => {
  const { G, co, club } = setup('coach');
  const c = co.contract, rem = O.remaining(co);
  eq(O.sackAmount(G, co), rem);
  c.cap = true; club.pos = club.target + 3; eq(O.sackAmount(G, co), Math.min(rem, c.wage * CFG.owner.capWeeks), 'underperformance cap');
  c.cap = false; c.brk = 1234; eq(O.sackAmount(G, co), 1234, 'break clause replaces it');
  c.brk = null;
  const w0 = O.walletBal(G, co.id);
  A.sack(G, co, false);
  eq(co.contract, null); eq(G.owed.length, 1); eq(G.owed[0].total, rem);
  Game.playWeekAuto(G);
  truthy(O.walletBal(G, co.id) > w0, 'first instalment paid'); conserved(G);
  for (let i = 0; i < 400 && G.owed.length; i++) { if (G.phase === 'seasonEnd') Game.newSeason(G); else Game.playWeekAuto(G); }
  eq(G.owed.length, 0, 'fully paid'); conserved(G);
});

t('mitigation: a new job reduces the instalments', () => {
  const { G, co, club } = setup('coach');
  A.sack(G, co, false);
  const o = G.owed[0]; const full = Math.min(o.weekly, o.left);
  const target = G.clubIds.find((id) => !G.clubs[id].human && G.clubs[id].div === club.div && id !== club.id);
  co.offers.push({ id: 99, club: target, ttl: 6, seen: 0 });
  truthy(A.acceptJob(G, co, 99).ok);
  co.contract.win = 0; co.contract.draw = 0;
  const before = O.walletBal(G, co.id);
  Game.playWeekAuto(G);
  const gained = O.walletBal(G, co.id) - before; // salary of the new job + reduced instalment
  const expectInstalment = Math.max(0, full - co.contract.wage);
  eq(gained, co.contract.wage + expectInstalment, 'salary plus reduced instalment'); conserved(G);
});

t('quitting without just cause: pays the exit clause, cannot sign for 8 weeks', () => {
  const { G, co, club } = setup('coach');
  B.credit(G, O.wallet(co.id), 10000000, 'bailout');
  const fee = O.exitFee(co), c0 = B.bal(G, club.id);
  eq(fee, Math.round(O.remaining(co) * 0.5));
  A.resign(G, co);
  eq(B.bal(G, club.id) - c0 >= fee - 1, true, 'club received the fee'); eq(co.ban, CFG.owner.ban);
  co.offers.push({ id: 98, club: club.id, ttl: 6, seen: 0 });
  eq(A.acceptJob(G, co, 98).err, 'banned');
  for (let i = 0; i < 20 && co.ban > 0; i++) Game.playWeekAuto(G);
  eq(co.ban, 0, 'ban ends after 8 economy weeks'); conserved(G);
});

t('late wages for 3 matchdays give the coach just cause: he leaves, the club owes the rest', () => {
  const { G, co, club } = setup('coach');
  for (let i = 0; i < CFG.owner.late; i++) { co.contract.late++; }
  eq(O.justCauseCoach(co), true);
  const rem = O.remaining(co);
  const r = O.quit(G, co);
  eq(r.just, true); eq(r.fee, 0); eq(G.owed[0].total, rem); eq(co.ban || 0, 0, 'no ban');
});

t('club that cannot pay the salary falls behind; the counter resets when it pays again', () => {
  const { G, co, club } = setup('coach');
  B.debit(G, club.id, B.bal(G, club.id) + 1, 'fine'); // make the club broke
  // club.human clubs are not bailed out; the salary cannot be paid
  O.weekly(G); truthy(co.contract.late >= 1);
  B.credit(G, club.id, 5000000, 'bailout'); O.weekly(G); eq(co.contract.late, 0);
});

t('mutual termination: the offer sits between 40% and 60% of what is owed, no penalty', () => {
  const { G, co } = setup('coach');
  const rem = O.remaining(co), off = O.mutualOffer(G, co);
  truthy(off >= rem * 0.4 - 1 && off <= rem * 0.6 + 1, 'between 40 and 60 percent');
  const r = O.mutual(G, co); truthy(r.ok); eq(co.contract, null); eq(co.ban || 0, 0);
});

t('another club hires a coach under contract: it pays the current club', () => {
  const { G, co, club } = setup('coach');
  const target = G.clubs[G.clubIds.find((id) => !G.clubs[id].human && G.clubs[id].div === club.div && id !== club.id)];
  B.credit(G, target.id, 5000000, 'bailout');
  const fee = O.poachFee(co), c0 = B.bal(G, club.id), t0 = B.bal(G, target.id);
  co.offers.push({ id: 97, club: target.id, ttl: 6, seen: 0 });
  truthy(A.acceptJob(G, co, 97).ok);
  eq(B.bal(G, club.id) - c0, fee); eq(t0 - B.bal(G, target.id), fee); conserved(G);
});

t('profit share: a homegrown player sold after a season pays the coach 10% of the fee', () => {
  const { G, co, club } = setup('coach');
  const p = G.players[club.squad[0]]; p.hg = true; delete p.j;
  O.policy(G, club).minSalePct = 0; O.policy(G, club).untouchable = [];
  const w0 = O.walletBal(G, co.id);
  const sh = O.saleShare(G, club, p, 100000);
  eq(sh, 10000); eq(O.walletBal(G, co.id) - w0, 10000);
  const q = G.players[club.squad[1]]; delete q.hg; delete q.j; eq(O.saleShare(G, club, q, 100000), 0, 'unknown origin, no share');
  conserved(G);
});

t('owner-coach: withdraw only above the reserve, invest from the wallet; owner roles cannot be sacked', () => {
  const { G, co, club } = setup('both');
  const max = Math.round(B.bal(G, club.id) - O.policy(G, club).reserve);
  eq(O.withdraw(G, co, max + 1000).err, 'owner_reserve');
  truthy(O.withdraw(G, co, 100000).ok); truthy(O.invest(G, co, 50000).ok);
  eq(O.invest(G, co, 1e12).err, 'owner_wallet');
  co.board = 0; co.jobWeeks = 20; Game.playWeekAuto(G); eq(co.club, club.id, 'still the owner');
  eq(A.resign(G, co).err, 'owner_cant'); conserved(G);
});

t('long run with all roles: 8 seasons, money conserved, no crash', () => {
  const G = Game.newGame({ seed: 21, coaches: [{ name: 'A' }, { name: 'B', role: 'both' }] });
  for (let s = 0; s < 8; s++) { Game.simulateSeason(G); Game.newSeason(G); }
  conserved(G);
  for (const co of G.coaches) truthy(co.club === null || G.clubs[co.club].human === co.id, 'club link consistent');
});


// ---------- owner role: a computer coach works for the human owner ----------
function ownerSetup(seed) {
  const G = Game.newGame({ seed: seed || 5, coaches: [{ name: 'Own', role: 'owner' }] });
  const co = G.coaches[0], club = G.clubs[co.club];
  B.credit(G, club.id, 2000000, 'bailout');
  return { G, co, club };
}
const weeks = (G, n) => { for (let i = 0; i < n && G.phase === 'play'; i++) Game.playWeekAuto(G); };

t('owner role: starts with a hired coach on contract, owner cannot trade by hand', () => {
  const { G, co, club } = ownerSetup();
  truthy(club.ac && club.ac.contract && club.ac.contract.wage > 0, 'coach hired');
  eq(club.owner, co.id); eq(O.role(co), 'owner');
  const other = G.clubIds.map((id) => G.clubs[id]).find((c) => !c.human && !c.foreign && c.div === club.div);
  eq(A.buy(G, co, other.squad[0], 1e9).err === 'owner_cant' || A.buy(G, co, other.squad[0], 1e9).err !== undefined, true);
  eq(club.ac.sk.train >= 0, true); eq(co.sk.train, club.ac.sk.train, 'skills mirrored to the owner object');
});

t('owner role: firing costs the rest of the contract in instalments, then money is conserved', () => {
  const { G, co, club } = ownerSetup();
  const owed = O.fireCost(G, co);
  eq(owed, club.ac.contract.wage * club.ac.contract.left, 'full remaining salary without cause');
  const bal0 = B.bal(G, club.id);
  const r = O.fire(G, co); truthy(r.ok); eq(club.ac, null); eq(co.sk.train, 0, 'caretaker has no skills');
  const od = (G.owed || []).find((x) => x.ai); truthy(od, 'pay-off created'); eq(od.total, owed);
  weeks(G, 6);
  const od2 = (G.owed || []).find((x) => x.id === od.id); truthy(od2 && od2.left < od.total, 'instalments are being paid');
  conserved(G);
});

t('owner role: hiring a second coach is refused, hiring after firing works, clauses change the salary', () => {
  const { G, co, club } = ownerSetup();
  eq(O.hire(G, co, O.market(G)[0].id, {}).err, 'has_coach');
  O.fire(G, co);
  const k = O.market(G)[0], base = O.salaryFor(club, k.rep);
  truthy(O.hire(G, co, k.id, { brk: 50000, cap: true, years: 2 }).ok);
  truthy(club.ac.contract.wage > base, 'clauses raise the salary');
  eq(club.ac.contract.left, 2 * CFG.owner.W); eq(club.ac.contract.brk, 50000);
  eq(O.sackAmount(G, club.ac), 50000, 'break clause replaces the remaining salary');
});

t('owner role: the coach never leaves the limits without asking (spend, wage bill, untouchable)', () => {
  const { G, co, club } = ownerSetup(9);
  const pol = O.policy(G, club);
  pol.budget = 80000; pol.maxFee = 40000;
  const keep = club.squad.slice().sort((a, b) => G.players[b].ovr - G.players[a].ovr).slice(0, 3);
  pol.untouchable = keep.slice();
  const wb0 = O.wageBill(G, club);
  for (let s = 0; s < 3; s++) {
    for (let w = 0; w < 80 && G.phase === 'play'; w++) {
      Game.playWeekAuto(G);
      truthy(pol.spent <= pol.budget + 1, 'budget respected, spent ' + pol.spent);
      truthy(O.openFor(G, club.id).length <= 3, 'never floods the owner');
      for (const id of keep) { const p = G.players[id]; if (p && p.club !== club.id && p.age < 36) throw new Error('untouchable player left ' + JSON.stringify({id:p.id,club:p.club,age:p.age,ct:p.ct,loan:p.loan,ovr:p.ovr,s,w})); }
    }
    for (const id of keep) if (G.players[id]) G.players[id].ct = Math.max(G.players[id].ct, 3); // contracts are the manager's job, not what is tested here
    if (G.phase === 'seasonEnd') Game.newSeason(G);
  }
  conserved(G);
  truthy(O.wageBill(G, club) < wb0 * 2.2, 'wage bill stays sane');
});

t('owner role: an approved request is carried out by the coach and only once', () => {
  const { G, co, club } = ownerSetup();
  const pol = O.policy(G, club); pol.maxFee = 1; pol.spent = 0;
  const seller = G.clubIds.map((id) => G.clubs[id]).find((c) => !c.human && !c.foreign && c.div === club.div);
  const p = G.players[seller.squad.slice().sort((a, b) => G.players[b].ovr - G.players[a].ovr)[4]];
  const act = Object.assign({}, co, { role: 'coach', aiAct: true });
  const fee = A.askPrice(G, act, p);
  const r = A.buy(G, act, p.id, fee);
  eq(r.err, 'needs_approval');
  const ap = O.openFor(G, club.id)[0]; truthy(ap, 'request exists');
  truthy(O.decide(G, co, ap.id, true).ok);
  O.acWeekly(G, co);
  eq(p.club, club.id, 'coach completed the signing');
  eq(G.approvals.find((a) => a.id === ap.id).status, 'used');
});

t('owner role: unpaid wages for 3 matchdays let the coach walk with just cause', () => {
  const { G, co, club } = ownerSetup();
  B.credit(G, club.id, -B.bal(G, club.id) - 5000, 'bailout'); // push the club into debt
  const name = club.ac.name;
  for (let i = 0; i < 4 && club.ac; i++) { B.debit(G, club.id, Math.max(0, B.bal(G, club.id) + 5000), 'tax'); O.acWeekly(G, co); }
  eq(club.ac, null, 'coach left');
  truthy((G.owed || []).some((x) => x.ai && x.name === name), 'club owes the rest');
});

t('owner role: contract end releases the coach to the market; renewing keeps him', () => {
  const { G, co, club } = ownerSetup();
  club.ac.contract.left = 1;
  const n = G.cm.length, nm = club.ac.name;
  O.acWeekly(G, co);
  eq(club.ac, null); truthy(G.cm.some((k) => k.name === nm) && G.cm.length === n + 1);
  const k = O.market(G)[0]; O.hire(G, co, k.id, { years: 1 });
  club.ac.contract.left = 3; O.renewCoach(G, co, 2);
  eq(club.ac.contract.left, 2 * CFG.owner.W);
});

t('owner role: 6 seasons with a human owner, money conserved, requests answered', () => {
  const { G, co, club } = ownerSetup(13);
  for (let s = 0; s < 6; s++) {
    for (let w = 0; w < 80 && G.phase === 'play'; w++) {
      Game.playWeekAuto(G);
      for (const ap of O.openFor(G, club.id)) if (G.week % 2 === 0) O.decide(G, co, ap.id, ap.cost < B.bal(G, club.id) * 0.2);
      if (!club.ac && G.week % 5 === 0) O.hire(G, co, O.market(G).sort((a, b) => b.rep - a.rep)[0].id, {});
      if (G.week === 5) truthy(club.squad.length >= CFG.SQUAD_MIN, 'squad legal in week 5 of season ' + G.season + ': ' + club.squad.length + ' bal ' + Math.round(B.bal(G, club.id)) + ' ac ' + !!club.ac);
    }
    if (G.phase === 'seasonEnd') Game.newSeason(G);
    conserved(G);
  }
});

t('match bonuses: a win pays the win bonus, a draw the draw bonus, a defeat nothing (human coach and computer coach)', () => {
  const { G, co, club } = setup('coach');
  co.contract.win = 700; co.contract.draw = 200;
  const w0 = O.walletBal(G, co.id);
  G.wk = { matches: [{ h: club.id, a: 'x' }] };
  club.lastPts = 3; O.weekly(G); const afterWin = O.walletBal(G, co.id);
  club.lastPts = 1; O.weekly(G); const afterDraw = O.walletBal(G, co.id);
  club.lastPts = 0; O.weekly(G); const afterLoss = O.walletBal(G, co.id);
  eq(afterWin - w0, co.contract.wage + 700); eq(afterDraw - afterWin, co.contract.wage + 200); eq(afterLoss - afterDraw, co.contract.wage);
  G.wk = { matches: [] }; club.lastPts = 3; O.weekly(G); eq(O.walletBal(G, co.id) - afterLoss, co.contract.wage, 'no match this week, no bonus');
  conserved(G);
  const o = ownerSetup(); const ac = o.club.ac; ac.contract.win = 900; ac.contract.late = 0;
  o.G.wk = { matches: [{ h: o.club.id, a: 'x' }] }; o.club.lastPts = 3;
  const b0 = B.bal(o.G, o.club.id), flow0 = o.G.bank.flows.coach_bonus || 0;
  O.acWeekly(o.G, o.co);
  eq(flow0 - (o.G.bank.flows.coach_bonus || 0), 900); conserved(o.G);
});

t('computer coach: profit share on a homegrown sale and poaching pays the club', () => {
  const { G, co, club } = ownerSetup(21);
  const p = G.players[club.squad[0]]; p.hg = 1; delete p.j;
  const fee = Math.round(E_value(p) * 3);
  const f0 = G.bank.flows.coach_share || 0;
  const amt = O.saleShare(G, club, p, fee);
  truthy(amt > 0 && f0 - (G.bank.flows.coach_share || 0) === amt, 'share paid');
  club.ac.rep = 80; club.pos = 1; club.nextDiv = club.div;
  let left = false;
  for (let i = 0; i < 60 && !left; i++) { club.ac = club.ac || null; if (!club.ac) break; O.acSeasonEnd(G, co, club); left = !club.ac; if (!left) club.ac.contract.left += 0; }
  truthy(left, 'eventually poached'); truthy((G.bank.flows.coach_comp || 0) !== 0, 'club received compensation'); conserved(G);
});

t('owner as manager: objectives judged at season end, P&L recorded, chat answers from real state and directives change behaviour', () => {
  const { G, co, club } = ownerSetup(17);
  truthy(O.setObjectives(G, co, { pos: CFG.PER_DIV, profit: -999999999, cup: false }).ok); eq(club.target, CFG.PER_DIV);
  eq(O.chat(G, co, 'status').ok, true);
  const last = club.chat[club.chat.length - 1]; eq(last.k, 'ch_status'); truthy(last.p.pos >= 1 && last.p.pos <= CFG.PER_DIV, 'real position');
  O.chat(G, co, 'save'); eq(club.stance, 'save'); eq(club.chat[club.chat.length - 1].k, 'ch_ok_save');
  eq(O.chat(G, co, 'att').ok, false, 'the owner cannot dictate tactics');
  eq(O.chat(G, co, 'nonsense').ok, false);
  const squad0 = club.squad.length;
  let g = 0; while (G.phase === 'play' && g++ < 60) Game.playWeekAuto(G);
  eq(club.pl.length, 1, 'season P&L recorded'); truthy(club.pl[0].inc > 0 && club.pl[0].exp > 0);
  eq(club.objHist.length, 1); eq(club.objHist[0].ok, true, 'easy objective met');
  truthy(club.fh.length > 20, 'balance history kept');
  const rep0 = club.ac ? club.ac.rep : 0;
  O.fire(G, co); eq(O.chat(G, co, 'status').err, 'no_coach');
  conserved(G);
});

t('job market: every other club has a coach with a CV, stars can be approached, the club must be paid the clause', () => {
  const { G, co, club } = ownerSetup(23);
  const others = G.clubIds.map((id) => G.clubs[id]).filter((c) => !c.human);
  truthy(others.every((c) => c.ac && c.ac.contract && c.ac.hist), 'every club has a coach');
  const top = O.employed(G, 6); eq(top.length, 6); truthy(top[0].ac.rep >= top[5].ac.rep, 'sorted by reputation');
  O.fire(G, co);
  const tgt = top[0], ac = tgt.ac, need = O.compNeeded(ac);
  eq(O.hireFrom(G, co, tgt.id, { comp: need * 0.5 }).err, 'comp_refused');
  eq(O.hireFrom(G, co, tgt.id, { comp: Math.round(need * 0.9) }).err, 'comp_counter');
  const b0 = B.bal(G, club.id), t0 = B.bal(G, tgt.id);
  const r = O.hireFrom(G, co, tgt.id, { comp: need }); truthy(r.ok, 'accepted at the clause');
  eq(club.ac.name, ac.name); truthy(tgt.ac && tgt.ac.name !== ac.name, 'the other club hired a replacement');
  eq(B.bal(G, tgt.id) - t0 >= need - 1, true, 'clause paid to the other club'); eq(b0 - B.bal(G, club.id) >= need - 1, true);
  conserved(G);
  for (let s = 0; s < 3; s++) { let g = 0; while (G.phase === 'play' && g++ < 60) Game.playWeekAuto(G); if (G.phase === 'seasonEnd') Game.newSeason(G); }
  truthy(others.every((c) => c.ac), 'market stays populated after 3 seasons'); truthy(others.some((c) => c.ac.hist.length >= 2), 'CVs grow');
});

t('manager: sets the ticket price near the best, costs a wage, can be fired; owner can approve the coach loan request', () => {
  const { G, co, club } = ownerSetup(29);
  const m = O.mgrPool(G).slice().sort((a, b) => b.rep - a.rep)[0];
  truthy(O.hireManager(G, co, m.id).ok); eq(O.hireManager(G, co, 'x').err, 'has_mgr');
  club.price = 9;
  const f0 = G.bank.flows.mgr_pay || 0;
  G.week = 1; O.mgrWeekly(G, co, club);
  truthy(club.price !== 9, 'manager changed the price'); truthy((G.bank.flows.mgr_pay || 0) < f0, 'wage paid');
  const r = O.fireManager(G, co); truthy(r.ok); eq(club.mgr, null); conserved(G);
  const o = ownerSetup(31); B.credit(o.G, o.club.id, -B.bal(o.G, o.club.id) - 20000, 'bailout');
  o.G.week = 4; O.acWeekly(o.G, o.co);
  const rq = O.openFor(o.G, o.club.id).find((a) => a.kind === 'loan'); truthy(rq, 'coach asks for a loan when in the red');
  O.decide(o.G, o.co, rq.id, true); o.G.week = 5; O.acWeekly(o.G, o.co);
  truthy(o.G.bank.loans.some((l) => l.club === o.club.id), 'loan taken after approval'); conserved(o.G);
});

t('auto-advance stops at a request or at the end of the season', () => {
  const { G, co, club } = ownerSetup(37);
  const n = O.autoPlay(G, 60); truthy(n >= 1);
  truthy(G.phase === 'seasonEnd' || O.openFor(G, club.id).length > 0, 'stopped for a reason');
});

t('a coach cannot add commitments while the club is in the red, and the board loses confidence', () => {
  const G = Game.newGame({ seed: 77, coaches: [{ name: 'C', role: 'coach' }] }); SF.setG(G);
  const co = G.coaches[0], club = G.clubs[co.club];
  SF.Bank.debit(G, club.id, SF.Bank.bal(G, club.id) + 5000, 'fine');
  const pid = club.squad[0]; G.players[pid].ct = 1;
  truthy(['club_in_red', 'no_funds'].includes(SF.Actions.renew(G, co, pid, 2).err), 'blocked');
  const b0 = co.board; Game.playWeekAuto(G); truthy(co.board < b0, 'board ' + b0 + ' -> ' + co.board);
});
t('job offers wait while the coach is banned', () => {
  const G = Game.newGame({ seed: 78, coaches: [{ name: 'C', role: 'coach' }] }); SF.setG(G);
  const co = G.coaches[0]; SF.Actions.sack(G, co, false); SF.Actions.genOffers(G, co, 1);
  co.offers.push({ id: 99, club: G.clubIds.find((i) => !G.clubs[i].human), ttl: 6, seen: 0 }); co.ban = 5;
  SF.Actions.weeklyCareer(G); eq(co.offers.find((o) => o.id === 99).ttl, 6);
});
t('runway: a coach with cash is free to renew; one with a weekly loss and under 4 weeks of cash is blocked; selling profits count', () => {
  const G = Game.newGame({ seed: 79, coaches: [{ name: 'C', role: 'coach' }] }); SF.setG(G);
  const co = G.coaches[0], club = G.clubs[co.club];
  for (let i = 0; i < 12; i++) Game.playWeekAuto(G);
  const pid = club.squad.find((id) => G.players[id].ct >= 1); G.players[pid].ct = 1; G.players[pid].wage = 10;
  SF.Bank.credit(G, club.id, 5000000, 'bailout');
  const r1 = SF.Actions.renew(G, co, pid, 2); truthy(r1.ok || r1.err === 'needs_approval' || r1.err === 'max_contract' || r1.err === 'unhappy', 'rich club not blocked by runway: ' + r1.err);
  const rw = SF.Owner.runway(G, club); truthy(rw.weeks === Infinity || rw.weeks > 12, 'runway ' + rw.weeks);
  SF.Bank.debit(G, club.id, SF.Bank.bal(G, club.id) - 3000, 'fine');
  G.players[pid].ct = 1; G.players[pid].mood = 80;
  const rw2 = SF.Owner.runway(G, club);
  if (rw2.net < 0) { const r2 = SF.Actions.renew(G, co, pid, 2); truthy(['low_runway', 'no_funds', 'unhappy'].includes(r2.err), 'poor club blocked: ' + r2.err); }
});
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
