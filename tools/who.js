// The league as the chain holds it, worked out the way a browser works it out.
//
// Reads the clubs, the decisions and the drawn numbers, runs the game on them, and prints what
// comes out - the table, who owns what, what has been refused. The same path the browser takes,
// so when this disagrees with a screen, one of the two is wrong and it is worth knowing which.
const path = require('path');
globalThis.SF = {};
for (const f of ['q', 'core', 'hash', 'calendar', 'identity', 'seal', 'market', 'bank', 'body',
  'world', 'match', 'game', 'owner', 'boss', 'actions', 'extras', 'chain', 'genesis', 'replay', 'bridge'])
  require(path.join(__dirname, '..', 'src', f + '.js'));
const SF = globalThis.SF;
const C = SF.Chain;

(async () => {
  if (process.env.PKG) C.net.pkg = process.env.PKG;
  if (process.env.LEAGUE) C.net.league = process.env.LEAGUE;
  if (process.env.CLUBS) C.net.clubs = process.env.CLUBS.trim().split(/\s+/);

  let world, decisions = [];
  for (let tries = 0; tries < 20; tries++) {
    try {
      world = await C.world();
      decisions = await C.decisions();
      if (world.clubs.length) break;
    } catch (e) { if (tries === 19) throw e; }
    await new Promise((r) => setTimeout(r, 3000));
  }

  const lg = world.league;
  console.log(`season ${lg.season} · week ${lg.week} · ${world.clubs.length} clubs · ${lg.free} free`);
  console.log(`drawn matchdays: ${(lg.seeds || []).length} · decisions: ${decisions.length}`);

  const G = SF.Replay.run(world, decisions);
  const played = Math.max(...G.clubIds.map((id) => G.table[id].p));
  console.log(`\nthe league, worked out: ${played} matchdays played`);
  const table = G.clubIds.slice().sort((a, b) => G.table[b].pts - G.table[a].pts || (G.table[b].gf - G.table[b].ga) - (G.table[a].gf - G.table[a].ga));
  for (const [i, id] of table.entries()) {
    const c = G.clubs[id], r = G.table[id];
    console.log(`  ${String(i + 1).padStart(2)}. ${c.name.padEnd(24)} ${String(r.p).padStart(2)}j ${String(r.pts).padStart(2)}pts ${r.gf}:${r.ga}  $${SF.Bank.bal(G, id).toLocaleString('en-US')}${c.chainOwner ? '  OWNED ' + c.chainOwner.slice(0, 8) : ''}`);
  }
  if (G.refused.length) {
    console.log(`\nrefused (${G.refused.length}):`);
    for (const r of G.refused.slice(0, 10)) console.log(`  club ${r.num} kind ${r.kind}: ${r.why}`);
  }
})().catch((e) => { console.log('failed: ' + e.message); process.exit(1); });
