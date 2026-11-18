// Golden vectors: exact (bit-level) outputs that every port of the engine (Rust/wasm, fixed-point Move, zkVM) must reproduce.
//   node tests/vectors.js          verify against docs/vectors/engine.json
//   node tests/vectors.js --write  regenerate it (only when the rules change on purpose)
const fs = require('fs'), path = require('path');
const SF = require('./load.js');
const { Game, Q } = SF;
const FILE = path.join(__dirname, '..', 'docs', 'vectors', 'engine.json');
const bits = (x) => { const b = Buffer.alloc(8); b.writeDoubleBE(x); return b.toString('hex'); };

function mathVectors() {
  const xs = [-20, -5.5, -1, -0.25, 0, 0.065, 0.11, 0.4, 1, 2.5, 7.123, 30];
  const out = { exp: {}, ln: {}, sqrt: {}, cos: {}, pow: {} };
  for (const x of xs) out.exp[x] = bits(Q.exp(x));
  for (const x of [0.001, 0.5, 1, 1.5, 2, 10, 123.456, 98765]) { out.ln[x] = bits(Q.ln(x)); out.sqrt[x] = bits(Q.sqrt(x)); }
  for (const x of [0, 0.3, 1.5707963267948966, 2, 3.141592653589793, 4.5, 6]) out.cos[x] = bits(Q.cos(x));
  for (const [a, b] of [[1.06, 46], [1.45, 9], [0.75, 1.1], [3.2, 0.6]]) out.pow[a + '^' + b] = bits(Q.pow(a, b));
  return out;
}
const fnv1a = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h; };

/* One season under one role. The digest has to cover everything a port could get wrong, so it takes in the
 * league table, both currencies, the knockout competitions, every player and every coach - not just the table.
 * The three roles are run because they drive different code: a human coach, the business layer of an owner,
 * and both at once. */
function digest(seed, role) {
  const G = Game.newGame({ seed, coaches: [{ name: 'V', role }] });
  SF.setG(G);
  let g = 0;
  while (G.phase === 'play' && g++ < 90) Game.playWeekAuto(G);
  const table = G.clubIds.map((id) => [id, G.table[id].pts, G.table[id].gf, G.table[id].ga]);
  const bal = G.clubIds.map((id) => Math.round(SF.Bank.bal(G, id)));
  const tok = Object.keys(G.bank.tok || {}).sort().map((k) => [k, G.bank.tok[k]]);
  const players = Object.keys(G.players).map(Number).sort((a, b) => a - b)
    .map((id) => { const p = G.players[id]; return [id, p.ovr, p.pot, p.age, p.g, p.ap, p.inj, p.sus]; });
  const coaches = G.coaches.map((c) => [c.id, c.rep, c.board, c.xp, c.club || '']);
  const clubs = G.clubIds.map((id) => { const c = G.clubs[id]; return [id, c.pos, c.fans, c.cap, c.price, c.cupRound]; });
  const parts = JSON.stringify({ table, bal, tok, clubs, players, coaches, cup: G.cup.winner, euro: G.eu.winner });
  return {
    seed, role, fnv1a: fnv1a(parts), season: G.season,
    supply: SF.Bank.supply(G), tsupply: SF.Bank.tsupply(G), treasury: SF.Owner.treasuryBal(G),
    cup: G.cup.winner, euro: G.eu.winner,
    top3: table.slice().sort((a, b) => b[1] - a[1]).slice(0, 3),
  };
}
const runs = [];
for (const seed of [3, 11, 42]) for (const role of ['coach', 'owner', 'both']) runs.push(digest(seed, role));
const cur = { note: 'Golden vectors for the SuiFoot engine. Doubles are IEEE-754 big-endian hex.', rules: SF.CFG.rules, math: mathVectors(), seasons: runs };

if (process.argv.includes('--write')) { fs.writeFileSync(FILE, JSON.stringify(cur, null, 1)); console.log('written', FILE); process.exit(0); }
const exp = JSON.parse(fs.readFileSync(FILE, 'utf8'));
const a = JSON.stringify(exp), b = JSON.stringify(JSON.parse(JSON.stringify(cur)));
if (a !== b) {
  for (const k of Object.keys(cur.math)) if (JSON.stringify(exp.math[k]) !== JSON.stringify(cur.math[k])) console.log('math differs:', k);
  cur.seasons.forEach((s, i) => { if (JSON.stringify(s) !== JSON.stringify(exp.seasons[i])) console.log('season differs: seed', s.seed, s.role, s.fnv1a, 'expected', (exp.seasons[i] || {}).fnv1a); });
  console.log('FAIL golden vectors changed'); process.exit(1);
}
console.log('ok  golden vectors (' + Object.keys(cur.math).length + ' math groups, ' + cur.seasons.length + ' seasons across 3 roles)');
