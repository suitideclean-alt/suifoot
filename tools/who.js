// Who owns what in the league on chain, read through the very file the browser loads.
globalThis.SF = {};
require('../src/chain.js');
const C = globalThis.SF.Chain;

(async () => {
  const w = await C.world();
  const lg = w.league;
  console.log(`season ${lg.season} · week ${lg.week} · ${w.clubs.length} clubs · ${lg.free} still free`);
  console.log(`played by hand: ${lg.manual ? 'yes' : 'no'}`);
  for (const c of w.clubs) {
    console.log(`  ${c.name.padEnd(24)} ${c.owner ? 'OWNED by ' + c.owner : 'free'}`);
  }
  const fx = C.fixtures(w, 0);
  console.log(`\nmatchday ${lg.week}:`);
  for (const m of fx) console.log(`  ${m.home.name.padStart(22)}  v  ${m.away.name}`);
})().catch((e) => { console.log('failed: ' + e.message); process.exit(1); });
