// Can a client actually read the league off the chain?
//
// Everything else in this suite runs on numbers held in memory. This one goes out to the Sui
// testnet and reads the league standing there, through the very file the browser loads: the same
// RPC methods, the same field names, the same parsing. If the contract's fields are ever renamed or
// the node's answers change shape, this is what says so.
//
// It needs the network, so it is not part of `npm test`. The workflow runs it.
globalThis.SF = {};
require('../src/chain.js');
const C = globalThis.SF.Chain;

let pass = 0, fail = 0;
const t = (name, fn) => { try { fn(); pass++; console.log('  ok  ' + name); } catch (e) { fail++; console.log('FAIL  ' + name + '\n      ' + e.message); } };
const truthy = (a, m) => { if (!a) throw new Error(m || 'expected truthy'); };
const eq = (a, b, m) => { if (a !== b) throw new Error((m || '') + ` expected ${b} got ${a}`); };

(async () => {
  console.log('reading ' + C.net.graphql);
  const started = Date.now();
  const w = await C.world();
  console.log(`  answered in ${Date.now() - started} ms\n`);

  t('the league is a league', () => {
    const l = w.league;
    truthy(l.season >= 1, 'a season;');
    truthy(l.week >= 1, 'a matchday;');
    truthy(l.t0 > 0, 'a first day;');
    eq(l.kickoffs.length, 2, 'two kickoffs a day;');
    eq(l.kickoffs[0], 720, 'noon UTC;');
    eq(l.kickoffs[1], 1200, 'eight in the evening;');
    eq(l.lockBefore, 30, 'lineups close half an hour out;');
    eq(l.drawBefore, 15, 'and the draw is a quarter of an hour out;');
  });

  t('the clubs came back whole', () => {
    truthy(w.clubs.length >= 2, 'more than one club; got ' + w.clubs.length);
    for (const c of w.clubs) {
      truthy(c.name && c.name.length > 2, 'a name;');
      eq(c.name, C.clubName(c.num), 'the name the number gives;');
      eq(c.squad.length, 22, c.name + ' has a squad;');
      truthy(c.capacity > 0, 'a ground;');
      truthy(c.fans > 0, 'somebody watching;');
      truthy(c.balance > 0, 'money in the bank;');
    }
  });

  t('the men are footballers', () => {
    for (const c of w.clubs) {
      const keepers = c.squad.filter((p) => p.pos === 'GK').length;
      eq(keepers, 2, c.name + ' has two keepers;');
      for (const p of c.squad) {
        truthy(p.age >= 16 && p.age <= 40, 'a plausible age: ' + p.age);
        truthy(p.ovr >= 25 && p.ovr <= 94, 'a plausible rating: ' + p.ovr);
        truthy(p.pot >= p.ovr, 'a ceiling no lower than the floor;');
        truthy(p.name.includes(' '), 'a name with two parts: ' + p.name);
        truthy(['gent', 'pro', 'hard'].includes(p.temper), 'a temperament;');
      }
    }
  });

  t('every man has a name of his own', () => {
    const seen = new Map();
    for (const c of w.clubs) for (const p of c.squad) {
      if (seen.has(p.name)) throw new Error(`${p.name} is both ${seen.get(p.name)} and ${p.num}`);
      seen.set(p.name, p.num);
    }
    console.log(`      (${seen.size} men, ${seen.size} names)`);
  });

  t('the table sorts the way the contract sorts it', () => {
    const table = C.table(w.clubs);
    for (let i = 1; i < table.length; i++) {
      const a = table[i - 1], b = table[i];
      truthy(a.points >= b.points, 'points first;');
      if (a.points === b.points) truthy((a.gf - a.ga) >= (b.gf - b.ga), 'then goal difference;');
    }
  });

  t('the calendar is the contract\'s calendar', () => {
    const l = w.league;
    const DAY = 86400000, H = 3600000;
    eq(C.kickoff(l, 1), l.t0 + 12 * H, 'the first whistle;');
    eq(C.kickoff(l, 2), l.t0 + 20 * H, 'the second that day;');
    eq(C.kickoff(l, 3), l.t0 + DAY + 12 * H, 'and the next day;');
    eq(C.phase(l, 1, C.kickoff(l, 1) - 31 * 60000), 'open');
    eq(C.phase(l, 1, C.kickoff(l, 1) - 30 * 60000), 'locked');
    eq(C.phase(l, 1, C.kickoff(l, 1) - 15 * 60000), 'drawn');
    eq(C.phase(l, 1, C.kickoff(l, 1)), 'played');
  });

  t('the league knows who is in which series', () => {
    const roster = (w.league.rosters || [])[0] || [];
    eq(roster.length, w.clubs.length, 'every club is on the list;');
    for (const c of w.clubs) truthy(roster.includes(c.num), c.name + ' is on it;');
  });

  t('a season of twelve is twenty-two matchdays, six matches each', () => {
    const roster = w.league.rosters[0];
    eq(C.weeksFor(roster.length), (roster.length - 1) * 2, 'everyone meets everyone twice;');
    for (let week = 1; week <= C.weeksFor(roster.length); week++) {
      const ps = C.pairs(roster, week);
      eq(ps.length, roster.length / 2, 'matchday ' + week + ';');
      const seen = new Set();
      for (const [h, a] of ps) {
        truthy(h !== a, 'nobody plays himself;');
        truthy(!seen.has(h) && !seen.has(a), 'nor twice in a day, matchday ' + week + ';');
        seen.add(h); seen.add(a);
      }
      eq(seen.size, roster.length, 'and nobody sits one out;');
    }
  });

  t('every pairing comes up once at each ground across the season', () => {
    const roster = w.league.rosters[0];
    const count = new Map();
    for (let week = 1; week <= C.weeksFor(roster.length); week++) {
      for (const [h, a] of C.pairs(roster, week)) count.set(h + '-' + a, (count.get(h + '-' + a) || 0) + 1);
    }
    eq(count.size, roster.length * (roster.length - 1), 'every ordered pair;');
    for (const [pair, n] of count) eq(n, 1, pair + ';');
  });

  const fx = C.fixtures(w, 0);
  console.log('\n  matchday ' + w.league.week + ', as the fixtures give it:');
  for (const m of fx) console.log(`    ${m.home.name.padStart(22)}  v  ${m.away.name}`);
  console.log('  (played by hand: ' + (w.league.manual ? 'yes' : 'no, by the clock') + ')');

  const table = C.table(w.clubs);
  console.log('\n  the league, as the chain holds it:');
  for (const [i, c] of table.entries()) {
    console.log(`    ${i + 1}. ${c.name.padEnd(24)} ${String(c.played).padStart(2)}j ${String(c.points).padStart(2)}pts  ${c.gf}:${c.ga}  $${c.balance.toLocaleString('en-US')}`);
  }
  const best = table[0].squad.slice().sort((a, b) => b.ovr - a.ovr)[0];
  console.log(`\n  best man at ${table[0].name}: ${best.name}, ${best.pos}, ${best.age}, rated ${best.ovr} of a possible ${best.pot}`);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('could not read the chain: ' + e.message); process.exit(1); });
