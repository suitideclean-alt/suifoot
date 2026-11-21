// The twelve clubs of a matchday, in the order play_week wants them: home, away, home, away.
//
// The contract checks every pair against the fixture list, so a wrong order aborts rather than
// playing a match nobody scheduled. Working the order out here, from the same rotation the
// contract uses, is what lets a whole matchday go in one call.
globalThis.SF = {};
require('../src/chain.js');
const C = globalThis.SF.Chain;

(async () => {
  if (process.env.PKG) C.net.pkg = process.env.PKG;
  if (process.env.LEAGUE) C.net.league = process.env.LEAGUE;
  if (process.env.CLUBS) C.net.clubs = process.env.CLUBS.trim().split(/\s+/);

  /* A league and its clubs are on the chain the moment they are made, but the node that answers
   * questions about them indexes a little behind. Asking at once, as a deployment does, can get an
   * honest "no such object" for something that certainly exists. So wait for it rather than
   * concluding the series is empty. */
  let w, fx = [];
  for (let tries = 0; tries < 20; tries++) {
    try {
      w = await C.world();
      fx = C.fixtures(w, 0);
      if (fx.length) break;
    } catch (e) { if (tries === 19) throw e; }
    await new Promise((r) => setTimeout(r, 3000));
  }
  if (!fx.length) {
    const roster = (w.league.rosters || [])[0] || [];
    console.error(`no fixtures for week ${w.league.week}`);
    console.error(`  rosters: ${JSON.stringify(w.league.rosters)}`);
    console.error(`  clubs read: ${w.clubs.length}, nums ${w.clubs.map((c) => c.num).join(',')}`);
    console.error(`  pairs: ${JSON.stringify(C.pairs(roster, w.league.week))}`);
    process.exit(1);
  }
  const order = [];
  for (const m of fx) order.push(m.home.id, m.away.id);
  if (process.env.NAMES) for (const m of fx) console.error(`  ${m.home.name} v ${m.away.name}`);
  process.stdout.write(order.join(' '));
})().catch((e) => { console.error('failed: ' + e.message); process.exit(1); });
