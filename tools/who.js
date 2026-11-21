// Who owns what, and is anybody holding a ticket they never turned in?
globalThis.SF = {};
require('../src/chain.js');
const C = globalThis.SF.Chain;

require('../src/replay.js');
const path = require('path');
for (const f of ['q', 'core', 'hash', 'calendar', 'identity', 'seal', 'market', 'bank', 'body', 'world', 'match'])
  require(path.join(__dirname, '..', 'src', f + '.js'));

(async () => {
  if (process.env.PKG) C.net.pkg = process.env.PKG;
  if (process.env.LEAGUE) C.net.league = process.env.LEAGUE;
  if (process.env.CLUBS) C.net.clubs = process.env.CLUBS.trim().split(/\s+/);
  const genesis = await C.world();
  const out = globalThis.SF.Replay.run(genesis, null);
  const w = { league: genesis.league, clubs: out.clubs };
  console.log(`drawn matchdays: ${(genesis.league.seeds || []).length}`);
  for (const r of out.results.slice(-6)) {
    const h = w.clubs.find((c) => c.num === r.home), a = w.clubs.find((c) => c.num === r.away);
    console.log(`  ${h.name.padStart(22)} ${r.hg} - ${r.ag} ${a.name}`);
  }
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
