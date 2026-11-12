// Owner business layer: sponsors, lines, projects, financing, fair play, reputation, hall of fame.
const SF = require('./load.js');
let pass = 0, fail = 0;
function t(name, fn) { try { fn(); pass++; console.log('  ok  ' + name); } catch (e) { fail++; console.log('FAIL  ' + name + '\n      ' + e.message); } }
const eq = (a, b, m) => { if (a !== b) throw new Error((m || '') + ` expected ${b} got ${a}`); };
const truthy = (a, m) => { if (!a) throw new Error(m || 'expected truthy'); };
const { Game, Bank: B, Owner: O, Boss: Bo } = SF;
const conserved = (G) => { eq(B.supply(G), B.totalBalances(G), 'money conserved'); eq(B.tsupply(G), B.ttotal(G), 'SFOOT conserved'); };
function setup(seed) {
  const G = Game.newGame({ seed: seed || 11, coaches: [{ name: 'A', role: 'owner' }] });
  SF.setG(G);
  const co = G.coaches[0], club = G.clubs[co.club];
  B.credit(G, club.id, 2000000, 'bailout');
  B.tcredit(G, SF.Owner.sfAcc(co.id), 2000000, 'grant');
  return { G, co, club };
}
const season = (G, co) => { let g = 0; while (G.phase === 'play' && g++ < 80) { Game.playWeekAuto(G); for (const a of G.approvals || []) if (a.status === 'open') O.decide(G, co, a.id, true); } };

t('owner clubs get a business profile with three sponsor offers', () => {
  const { G, co, club } = setup();
  truthy(club.boss, 'boss state'); eq(Bo.offers(G, club).length, 3);
  truthy(co.own && co.own.orep > 0, 'owner profile');
});
t('sponsor: sign, weekly income follows the deal, can be broken for a price', () => {
  const { G, co, club } = setup();
  const o = Bo.offers(G, club)[0];
  eq(Bo.signSponsor(G, co, o.id).ok, true); eq(Bo.signSponsor(G, co, 2).err, 'has_sponsor');
  const b0 = B.bal(G, club.id); Game.playWeekAuto(G);
  const sp = (G.bank.led[club.id] || []).filter((e) => e[2] === 'sponsor').slice(-1)[0];
  truthy(sp && Math.abs(sp[3] - o.w) < 2, 'sponsor income = deal ' + (sp && sp[3]) + ' vs ' + o.w);
  const cost = Bo.sponsorBreakCost(club.boss); truthy(cost > 0);
  eq(Bo.breakSponsor(G, co).ok, true); eq(club.boss.spon, null); conserved(G);
});
t('investment lines cost money every week and raise academy potential', () => {
  const { G, co, club } = setup();
  Bo.setLine(G, co, 'acad', 3); Bo.setLine(G, co, 'mkt', 2); Bo.setLine(G, co, 'comm', 1);
  Game.playWeekAuto(G);
  const k = (n) => (G.bank.tled[club.id] || []).filter((e) => e[2] === n).length;
  eq(k('academy') > 0 && k('marketing') > 0 && k('community') > 0, true, 'lines are debited in SFOOT');
  eq((G.bank.led[club.id] || []).some((e) => e[2] === 'academy'), false, 'and not in USD');
  truthy(Bo.acadPot(club) > 3 && Bo.acadExtra(club) === 1); conserved(G);
});
t('merch price and membership trade money for supporters happiness', () => {
  const { G, co, club } = setup();
  const base = Bo.supTarget(G, club);
  Bo.setMerch(G, co, 'premium'); Bo.setMember(G, co, 'high');
  truthy(Bo.supTarget(G, club) < base - 5, 'premium lowers the mood');
  Bo.setMerch(G, co, 'low'); Bo.setMember(G, co, 'low');
  truthy(Bo.supTarget(G, club) > base + 4, 'cheap raises the mood');
});
t('special kit: once per season, boosts merch for a while', () => {
  const { G, co, club } = setup();
  eq(Bo.specialKit(G, co).ok, true); eq(Bo.specialKit(G, co).err, 'kit_used'); eq(club.boss.kitLeft, 10);
});
t('stadium projects: cost, build time, then effect; one at a time', () => {
  const { G, co, club } = setup();
  const before = Bo.attMult(club);
  eq(Bo.startProject(G, co, 'roof').ok, true); eq(Bo.startProject(G, co, 'lights').err, 'busy');
  for (let i = 0; i < 14 && club.boss.build; i++) Game.playWeekAuto(G);
  eq(club.boss.proj.roof, 1); eq(club.boss.build, null);
  truthy(Bo.attMult(club) > before, 'roof raises the gate'); conserved(G);
  Bo.startProject(G, co, 'med'); for (let i = 0; i < 14 && club.boss.build; i++) Game.playWeekAuto(G);
  eq(club.boss.proj.med, 1); truthy(Bo.injMult(club) < 1);
});
t('partnership and events respect limits', () => {
  const { G, co, club } = setup();
  const c = Bo.partnerCandidates(G, club); truthy(c.length > 0 || club.div === 3, 'candidates');
  if (c.length) { eq(Bo.setPartner(G, co, c[0]).ok, true); const b0 = B.bal(G, c[0]); Game.playWeekAuto(G); truthy(B.bal(G, c[0]) !== b0, 'partner is paid'); }
  eq(Bo.event(G, co, 'concert').ok, true); eq(Bo.event(G, co, 'friendly').ok, true); eq(Bo.event(G, co, 'tour').err, 'max'); conserved(G);
});
t('financing: sell a stake (max 40%), pay dividends, buy it back; bonds are repaid in instalments', () => {
  const { G, co, club } = setup();
  const s = Bo.sellStake(G, co, 0.2); eq(s.ok, true); truthy(s.amt > 0);
  eq(Bo.sellStake(G, co, 0.3).err, 'stake_max');
  eq(Math.round(Bo.stake(club) * 100), 80);
  const inv = club.boss.invest[0], cost = Bo.buybackCost(G, club, inv); truthy(cost > s.amt * 0.99, 'buyback costs more');
  eq(Bo.buyBack(G, co, inv.id).ok, true); eq(club.boss.invest.length, 0);
  const max = Bo.bondMax(G, club); truthy(max > 0);
  eq(Bo.issueBond(G, co, max + 1000, 2).err, 'bond_max');
  const r = Bo.issueBond(G, co, 100000, 2); eq(r.ok, true); truthy(r.due > 100000);
  const bd = club.boss.bonds[0]; Game.playWeekAuto(G); truthy(bd.due < r.due, 'instalment paid');
  eq(Bo.repayBond(G, co, bd.id).ok, true); eq(club.boss.bonds.length, 0); conserved(G);
});
t('forecast, comparison and efficiency produce data', () => {
  const { G, co, club } = setup();
  for (let i = 0; i < 6; i++) Game.playWeekAuto(G);
  const f = Bo.forecast(G, club); truthy(typeof f.end === 'number' && f.left > 0);
  const c = Bo.compare(G, club); truthy(c.wages.avg > 0 && c.wages.rank >= 1);
  const e = Bo.efficiency(G, club); truthy(e.wageRatio >= 0);
  truthy(Bo.value(G, club) > 0);
});
t('fair play: heavy running deficit is fined, investments are exempt', () => {
  const { G, co, club } = setup();
  for (let i = 0; i < 10; i++) Game.playWeekAuto(G);
  B.debit(G, club.id, 3000000, 'wages'); // a deficit
  const f = Bo.ffp(G, club); truthy(f.over > 0, 'over the limit');
  const b1 = B.bal(G, club.id);
  const h0 = co.own.hon; season(G, co);
  truthy(club.boss.ffp.fines > 0, 'fined'); truthy(co.own.hon < h0 + 3, 'honesty hit'); conserved(G);
});
t('reputation: events move the six axes, style follows', () => {
  const { G, co } = setup();
  const o = co.own, f0 = o.free;
  Bo.track(G, co, 'decline'); Bo.track(G, co, 'decline'); truthy(o.free < f0);
  for (let i = 0; i < 12; i++) Bo.track(G, co, 'decline');
  eq(Bo.style(o), 'controller');
  for (let i = 0; i < 12; i++) Bo.track(G, co, 'late');
  eq(Bo.style(o), 'shady'); truthy(o.orep >= 0 && o.orep <= 100);
});
t('a bad reputation makes coaches and sponsors more expensive', () => {
  const { G, co, club } = setup();
  Bo.ensureOwner(G, co);
  co.own.hon = co.own.free = co.own.mot = co.own.pat = co.own.amb = co.own.sta = 10; co.own.orep = Bo.orepOf(co.own); Bo.refresh(G, co, club);
  const wBad = club.boss.wm, sBad = club.boss.sm;
  co.own.hon = co.own.free = co.own.mot = co.own.pat = co.own.amb = co.own.sta = 90; co.own.orep = Bo.orepOf(co.own); Bo.refresh(G, co, club);
  truthy(wBad > club.boss.wm && sBad < club.boss.sm, 'wm ' + wBad + '>' + club.boss.wm + ' sm ' + sBad + '<' + club.boss.sm);
});
t('a full season: history, badges, ranking with computer owners, public profile', () => {
  const { G, co, club } = setup(21);
  Bo.setLine(G, co, 'acad', 3); Bo.setLine(G, co, 'mkt', 2);
  season(G, co);
  truthy(club.boss.val.length === 1 && co.own.hist.length === 1, 'history');
  const rk = Bo.ranking(G); truthy(rk.length >= 40 && rk.filter((r) => r.me).length === 1, 'ranking has everybody: ' + rk.length);
  const pr = Bo.profile(G, co); truthy(pr.axes && pr.style && Array.isArray(pr.val));
  conserved(G);
  Game.newSeason(G); eq(club.boss.wk, 0, 'week counter reset'); truthy(Bo.offers(G, club).length === 3, 'new offers');
});
t('neglect: sitting on cash without reinvesting drags fans, gate, sponsors, merch and morale down; reinvesting keeps it at zero', () => {
  const a = setup(31), b = setup(31);
  // b keeps investing in lines and facilities every week
  const ids = (x) => x.club.squad.map((i) => x.G.players[i]);
  Bo.setLine(b.G, b.co, 'acad', 3); Bo.setLine(b.G, b.co, 'mkt', 3); Bo.setLine(b.G, b.co, 'comm', 3);
  let g = 0;
  while (a.G.phase === 'play' && g++ < 80) {
    Game.playWeekAuto(a.G); Game.playWeekAuto(b.G);
    for (const x of [a, b]) for (const ap of x.G.approvals || []) if (ap.status === 'open') O.decide(x.G, x.co, ap.id, true);
    if (b.G.week % 5 === 0) { try { SF.Actions.upgradeFacility(b.G, b.co, 'youth'); } catch (e) {} }
  }
  const na = Bo.neglect(a.club), nb = Bo.neglect(b.club);
  truthy(na > 0.3, 'idle owner neglect ' + na); truthy(nb < na, 'investing owner lower ' + nb + ' vs ' + na);
  truthy(a.club.boss.sup < b.club.boss.sup, 'supporters ' + a.club.boss.sup + ' vs ' + b.club.boss.sup);
  const m = (x) => ids(x).reduce((s, p) => s + p.mood, 0) / ids(x).length;
  truthy(m(a) < m(b), 'morale ' + m(a) + ' vs ' + m(b));
  a.club.nz.neg = 100; const att100 = Bo.attMult(a.club); a.club.nz.neg = 0; const att0 = Bo.attMult(a.club);
  truthy(att100 < att0 * 0.75, 'gate ' + att100 + ' vs ' + att0);
  a.club.nz.neg = 100; const s100 = Bo.sponsor(a.G, a.club, 1000); a.club.nz.neg = 0; const s0 = Bo.sponsor(a.G, a.club, 1000);
  truthy(s100 < s0 * 0.65, 'sponsor ' + s100 + ' vs ' + s0);
  conserved(a.G); conserved(b.G);
});
t('neglect also hits the owner+coach role', () => {
  const G = Game.newGame({ seed: 41, coaches: [{ name: 'B', role: 'both' }] }); SF.setG(G);
  const co = G.coaches[0], club = G.clubs[co.club]; B.credit(G, club.id, 2000000, 'bailout');
  let g = 0; while (G.phase === 'play' && g++ < 80) Game.playWeekAuto(G);
  truthy(Bo.neglect(club) > 0.3, 'both neglect ' + Bo.neglect(club));
  const a1 = Bo.attMult(club); club.nz.neg = 0; truthy(a1 < Bo.attMult(club), 'gate reduced');
  eq(Bo.sponsor(G, club, 1000), 1000, 'no neglect, base sponsor'); club.nz.neg = 100; truthy(Bo.sponsor(G, club, 1000) < 650, 'sponsor reduced');
  conserved(G);
});
t('old saves migrate: no boss state yet, it is created', () => {
  const { G, co, club } = setup(5);
  const s = JSON.parse(JSON.stringify(G)); delete s.owners; delete s.coaches[0].own;
  const g2 = Game.migrate ? Game.migrate(s) : s; SF.setG(g2);
  truthy(g2.clubs[g2.coaches[0].club].boss && g2.owners, 'created');
});

t('two currencies: investments are paid in SFOOT by the human owner, wages and transfers stay in USD', () => {
  const { G, co, club } = setup();
  const usd0 = B.bal(G, club.id), sf0 = O.sfBal(G, co.id);
  const r = SF.Actions.upgradeFacility(G, co, 'train');
  truthy(r.ok, 'upgrade works');
  eq(B.bal(G, club.id), usd0, 'USD untouched by an investment');
  eq(O.sfBal(G, co.id), sf0 - r.cost, 'SFOOT paid by the owner');
  const s2 = O.sfBal(G, co.id); G.bank.tok[O.sfAcc(co.id)] = 10;
  eq(SF.Actions.upgradeFacility(G, co, 'train').err, 'no_funds', 'no SFOOT, no investment even with USD');
  G.bank.tok[O.sfAcc(co.id)] = s2;
  const w0 = B.bal(G, club.id); Game.playWeekAuto(G);
  truthy(G.bank.led[club.id].some((e) => e[2] === 'wages'), 'wages are in USD');
  truthy(B.bal(G, club.id) !== w0); conserved(G);
});
t('two currencies: prizes are paid in SFOOT to a human owner; computer clubs burn theirs', () => {
  const { G, co, club } = setup();
  const sf0 = O.sfBal(G, co.id), usd0 = B.bal(G, club.id), min0 = G.bank.tminted;
  Game.income(G, club.id, 12345, 'prize');
  eq(O.sfBal(G, co.id), sf0 + 12345, 'owner gets the prize'); eq(B.bal(G, club.id), usd0, 'club USD untouched');
  const npc = G.clubIds.find((id) => !G.clubs[id].human);
  const m1 = G.bank.tminted; Game.income(G, npc, 9999, 'prize');
  eq(G.bank.tminted, m1, 'nothing minted for a computer club'); truthy((G.bank.tburnedPrize || 0) >= 9999, 'counted as burned');
  eq(G.bank.tminted - min0, 12345); conserved(G);
});
t('two currencies: a coach role (computer owner) invests from the club USD; a line without SFOOT switches off', () => {
  const G = Game.newGame({ seed: 4, coaches: [{ name: 'C', role: 'coach' }] }); const co = G.coaches[0], club = G.clubs[co.club];
  eq(O.payer(G, club), null, 'no human owner'); eq(O.sfBal(G, co.id), 0, 'a coach holds no SFOOT');
  const o = setup(); const { G: G2, co: co2, club: club2 } = o;
  Bo.setLine(G2, co2, 'acad', 2); G2.bank.tok[O.sfAcc(co2.id)] = 0;
  Game.playWeekAuto(G2);
  eq(club2.boss.lines.acad, 0, 'line switched off'); truthy(G2.news.some((n) => n.k === 'n_line_off'));
});
t('old saves migrate: SFOOT accounts are created with the starting grant for owners', () => {
  const G = Game.newGame({ seed: 6, coaches: [{ name: 'A', role: 'both' }] });
  const s = Game.serialize(G); const o = JSON.parse(s); delete o.bank.tok; delete o.bank.tminted; delete o.bank.tburned; delete o.chk;
  const g2 = Game.deserialize(JSON.stringify(o));
  eq(O.sfBal(g2, g2.coaches[0].id), SF.CFG.startSfoot);
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
