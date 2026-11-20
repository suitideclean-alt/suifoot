// How a person gets into the league. Joining is free and the club is drawn for you; buying is paid and
// narrow - never the top level, never a club doing well, never one somebody already runs.
const SF = require('./load.js');
const { Game, Market, CFG } = SF;

let pass = 0, fail = 0;
const t = (name, fn) => { try { fn(); pass++; console.log('  ok  ' + name); } catch (e) { fail++; console.log('FAIL  ' + name + '\n      ' + e.message); } };
const eq = (a, b, m) => { if (a !== b) throw new Error((m || '') + ` expected ${b} got ${a}`); };
const truthy = (a, m) => { if (!a) throw new Error(m || 'expected truthy'); };

const jogo = (seed) => Game.newGame({ seed: seed || 3, coaches: [{ name: 'A', role: 'both' }] });
/** somebody turning up with no club */
const novo = (G, id, role) => {
  const co = { id: id, name: id, club: null, role: role || 'coach', rep: 20, xp: 0, board: 60, jobWeeks: 0, sk: { train: 0, tact: 0, neg: 0, youth: 0 }, watch: [], goals: [], ach: {}, trophies: [] };
  G.coaches.push(co);
  return co;
};
const withShape = (shape, fn) => {
  const s0 = CFG.series;
  CFG.series = shape;
  try { return fn(); } finally { CFG.series = s0; }
};

t('a club nobody runs is free; one with a human is not', () => {
  const G = jogo();
  const meu = G.clubs[G.coaches[0].club];
  eq(Market.isFree(G, meu), false, 'my own club is not free;');
  const livre = Market.freeClubs(G);
  eq(livre.includes(meu.id), false, 'my club is not in the free list;');
  eq(livre.length, G.clubIds.length - 1, 'every other club is free;');
});

t('a newcomer is only ever given a club at the foot of the pyramid', () => {
  const G = jogo();
  const fundo = Market.bottomLevel();
  const pool = Market.joinable(G);
  truthy(pool.length > 0, 'there is somewhere to start;');
  for (const id of pool) eq(G.clubs[id].div, fundo, 'joinable club is at the foot;');
});

t('joining draws the club for you: same seed, same club', () => {
  // one at a time: the generator reads whichever world is current, so building both first would
  // leave them both drawing from the second one's stream
  const a = jogo(11); const ra = Market.join(a, novo(a, 'x1'));
  const b = jogo(11); const rb = Market.join(b, novo(b, 'x1'));
  truthy(ra.ok, 'joined;'); truthy(rb.ok, 'joined;');
  eq(ra.club, rb.club, 'the draw is the seeded one, not a free choice;');
  eq(a.clubs[ra.club].human, 'x1', 'the club now has its human;');
  eq(a.coaches.find((c) => c.id === 'x1').club, ra.club, 'and the person has the club;');
});

t('a person who already has a club cannot take another', () => {
  const G = jogo();
  const co = G.coaches[0];
  eq(Market.give(G, co, Market.joinable(G)[0]).err, 'already_has_club');
});

t('the same club cannot be taken twice', () => {
  const G = jogo();
  const alvo = Market.joinable(G)[0];
  truthy(Market.give(G, novo(G, 'x1'), alvo).ok);
  eq(Market.give(G, novo(G, 'x2'), alvo).err, 'taken');
});

t('the top level is not for sale at any price', () => withShape([1, 2, 4], () => {
  const G = jogo(21);
  Game.startSeason(G);
  const topo = G.clubIds.filter((id) => G.clubs[id].div === 0 && Market.isFree(G, G.clubs[id]));
  truthy(topo.length > 0, 'there are free clubs at the top;');
  eq(Market.buy(G, novo(G, 'x1', 'owner'), topo[0]).err, 'top_not_for_sale');
  for (const id of Market.buyable(G)) truthy(G.clubs[id].div > 0, 'nothing on sale is in the top level;');
}));

t('only the bottom half of a table is for sale', () => withShape([1, 2, 4], () => {
  const G = jogo(22);
  Game.startSeason(G);
  // put a real table in place: everyone in series 1 has played enough for it to count
  const serie = SF.Game.standings(G, 1);
  truthy(serie.length === CFG.PER_DIV, 'a full series;');
  serie.forEach((id, i) => { G.table[id] = { p: CFG.rankAfter, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: CFG.PER_DIV - i }; });
  const ordem = SF.Game.standings(G, 1);
  const primeiro = G.clubs[ordem[0]], ultimo = G.clubs[ordem[ordem.length - 1]];
  eq(Market.rank(G, primeiro), 1, 'the leader is first;');
  eq(Market.inBottomHalf(G, primeiro), false, 'the leader is not in the bottom half;');
  truthy(Market.inBottomHalf(G, ultimo), 'the last club is;');
  eq(Market.buy(G, novo(G, 'x1', 'owner'), primeiro.id).err, 'too_high', 'the leader is not for sale;');
  truthy(Market.buy(G, novo(G, 'x2', 'owner'), ultimo.id).ok, 'the last club is;');
}));

t('before enough has been played the table is ignored and last season counts', () => withShape([1, 2, 4], () => {
  const G = jogo(23);
  Game.startSeason(G);
  const id = G.clubIds.find((x) => G.clubs[x].div === 1 && Market.isFree(G, G.clubs[x]));
  const club = G.clubs[id];
  club.pos = 2; // finished second last season
  G.table[id] = { p: CFG.rankAfter - 1, w: 4, d: 0, l: 0, gf: 12, ga: 0, pts: 12 }; // top of a table that means nothing yet
  eq(Market.rank(G, club), 2, 'last season is what counts;');
  eq(Market.buy(G, novo(G, 'x1', 'owner'), id).err, 'too_high', 'a club that finished second is not for sale;');
  G.table[id].p = CFG.rankAfter; // now the table counts, and it is top of it
  eq(Market.rank(G, club), 1);
}));

t('a club that never finished a season is treated as mid-table', () => {
  const G = jogo(24);
  const id = Market.joinable(G)[0];
  const club = G.clubs[id];
  eq(club.pos, undefined, 'it has no finish behind it;');
  eq(Market.rank(G, club), Math.ceil(CFG.PER_DIV / 2), 'so it counts as mid-table;');
});

t('arriving mid-season costs nothing and draws nothing from the pool', () => {
  const G = jogo(25);
  G.week = 6;
  const r = Market.join(G, novo(G, 'x1', 'owner'));
  truthy(r.ok);
  eq(G.clubs[r.club].entry, 0, 'no entry fee this season;');
  eq(SF.Owner.entryPaid(G, G.clubs[r.club]), false, 'and so no claim on the prize pool;');
});

t('arriving at the start of a season is a normal entry', () => {
  const G = jogo(26);
  eq(G.week, 1);
  const r = Market.join(G, novo(G, 'x1', 'owner'));
  truthy(r.ok);
  eq(G.clubs[r.club].entry, undefined, 'the fee is still to be paid, not waived;');
});

t('when the foot is full the pyramid widens by a whole block', () => withShape([1, 2, 4], () => {
  const G = jogo(27);
  const antes = G.clubIds.length;
  for (const id of Market.joinable(G).slice()) G.clubs[id].human = 'npc'; // fill the foot
  truthy(Market.needsRoom(G), 'there is nowhere left to start;');
  const r = Market.grow(G);
  truthy(r.ok, 'it grew;');
  eq(CFG.series.join(','), '1,2,6', 'one new series under each series above;');
  eq(r.clubs, 2 * CFG.PER_DIV);
  eq(G.clubIds.length, antes + 2 * CFG.PER_DIV, 'the new clubs are in;');
  truthy(Market.joinable(G).length > 0, 'and there is room again;');
}));

t('widening keeps the same number going down everywhere in a level', () => withShape([1, 2, 4], () => {
  const G = jogo(28);
  Market.grow(G);
  Game.startSeason(G);
  const porNivel = {};
  G.sers.forEach((s, si) => { if (s.lvl === 1) (porNivel[s.lvl] = porNivel[s.lvl] || []).push(Game.downFrom(G, si)); });
  const n = porNivel[1][0];
  for (const d of porNivel[1]) eq(d, n, 'every series of the level relegates the same number;');
}));

t('the new clubs get fresh ids and names of their own', () => withShape([1, 2, 4], () => {
  const G = jogo(29);
  const antes = new Set(G.clubIds);
  Market.grow(G);
  const novos = G.clubIds.filter((id) => !antes.has(id));
  eq(novos.length, 2 * CFG.PER_DIV);
  eq(new Set(novos).size, novos.length, 'no id twice;');
  const nomes = G.clubIds.map((id) => G.clubs[id].name);
  eq(new Set(nomes).size, nomes.length, 'no name twice;');
  for (const id of novos) { truthy(G.clubs[id].squad.length > 0, 'the new club has players;'); truthy(G.clubs[id].ac, 'and a coach of its own;'); }
}));

t('names hold up past the short-name pool, which a wide pyramid goes through', () => withShape([1, 2, 4], () => {
  const G = jogo(31);
  for (let i = 0; i < 12; i++) truthy(Market.grow(G).ok, 'grew ' + i + ';'); // well past the 288 short names
  const nomes = G.clubIds.map((id) => G.clubs[id].name);
  truthy(nomes.length > 400, 'a big league; ' + nomes.length);
  eq(new Set(nomes).size, nomes.length, 'and still no name twice;');
  eq(new Set(G.clubIds).size, G.clubIds.length, 'nor any id;');
}));

t('the pyramid will not grow past the ceiling', () => withShape([1, CFG.maxSeries], () => {
  const G = jogo(30);
  eq(Market.grow(G).err, 'too_wide');
}));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
