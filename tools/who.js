// Who owns what, and is anybody holding a ticket they never turned in?
globalThis.SF = {};
require('../src/chain.js');
const C = globalThis.SF.Chain;

(async () => {
  const w = await C.world();
  const lg = w.league;
  console.log(`season ${lg.season} · week ${lg.week} · ${lg.free} still free`);
  for (const c of w.clubs) if (c.owner) console.log(`  OWNED ${c.name} by ${c.owner}`);

  // the shape of the ticket question, proved against an address that holds none
  const none = await C.tickets('0x' + 'ab57c3d9'.repeat(8));
  console.log(`ticket query works; an unused address holds ${none.length}`);

  const who = process.env.ADDR;
  if (who) {
    const ts = await C.tickets(who);
    console.log(`\n${who}`);
    console.log(`  SUI: ${(await C.gas(who)) / 1e9}`);
    console.log(`  tickets: ${ts.length}`);
    for (const t of ts) {
      const club = w.clubs.find((c) => c.id === t.club);
      console.log(`    ticket ${t.id} -> ${club ? club.name : t.club}`);
    }
  }
})().catch((e) => { console.log('failed: ' + e.message); process.exit(1); });
