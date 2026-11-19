// Canonical state: the same game must always produce the same bytes and the same root.
// This is what the online mode publishes on chain, so a load may not change anything.
const SF = require('./load.js');
const { Game, Hash, State, Bank: B } = SF;

let pass = 0, fail = 0;
const t = (name, fn) => { try { fn(); pass++; console.log('  ok  ' + name); } catch (e) { fail++; console.log('FAIL  ' + name + '\n      ' + e.message); } };
const eq = (a, b, m) => { if (a !== b) throw new Error((m || '') + ` expected ${b} got ${a}`); };
const truthy = (a, m) => { if (!a) throw new Error(m || 'expected truthy'); };

t('SHA-256 matches the published test vectors', () => {
  eq(Hash.sha256(''), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  eq(Hash.sha256('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  eq(Hash.sha256('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq'), '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1');
  eq(Hash.sha256('a'.repeat(1000000)), 'cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0');
  eq(Hash.sha256('ação').length, 64, 'accents hash to 32 bytes');
});

t('canonical JSON does not depend on the order fields were created in', () => {
  const a = { b: 1, a: { z: 1, y: [3, 2, { q: 1, p: 2 }] } };
  const b = { a: { y: [3, 2, { p: 2, q: 1 }], z: 1 }, b: 1 };
  eq(Hash.canon(a), Hash.canon(b));
  eq(Hash.canon({ x: undefined, y: 1 }), '{"y":1}', 'undefined is dropped, as JSON does');
  eq(Hash.canon({ n: NaN }), '{"n":null}', 'a non-finite number is written as null, as JSON does');
});

t('a Merkle proof shows one club belongs to the root, and a wrong one is refused', () => {
  const G = Game.newGame({ seed: 4, coaches: [{ name: 'A', role: 'both' }] });
  Game.playWeekAuto(G);
  const id = G.coaches[0].club;
  const pr = State.clubProof(G, id);
  truthy(pr, 'no proof for ' + id);
  eq(pr.root, State.root(G), 'the proof is against another root');
  truthy(Hash.verify(pr.leaf, pr.path, pr.root), 'the proof does not check out');
  truthy(!Hash.verify(Hash.sha256('outra coisa'), pr.path, pr.root), 'a forged leaf was accepted');
  // change one player and the root has to move
  const before = State.root(G);
  G.players[G.clubs[id].squad[0]].ovr += 1;
  truthy(State.root(G) !== before, 'the root did not move when a player changed');
});

t('a game that has only just started already saves as a fixed point', () => {
  // the catch this covers: a field created lazily (the toast queue) was missing from a brand new
  // save, the load put it there, and the second save came out eight bytes longer
  const G = Game.newGame({ seed: 3, coaches: [{ name: 'A', role: 'both' }] });
  const s1 = Game.serialize(G);
  const s2 = Game.serialize(Game.deserialize(s1));
  eq(s1, s2, 'a fresh game changed when it was loaded;');
  // and the same after a single week, before anything has had a chance to fill it
  const H = Game.newGame({ seed: 4, coaches: [{ name: 'A', role: 'both' }] });
  Game.playWeekAuto(H);
  const t1 = Game.serialize(H);
  eq(Game.serialize(Game.deserialize(t1)), t1, 'a game one week old changed when it was loaded;');
});

t('save, load, save gives exactly the same file', () => {
  for (const seed of [1, 7, 42]) {
    const G = Game.newGame({ seed, coaches: [{ name: 'A', role: 'both' }] });
    for (let i = 0; i < 6; i++) Game.playWeekAuto(G);
    const s1 = Game.serialize(G);
    const s2 = Game.serialize(Game.deserialize(s1));
    const s3 = Game.serialize(Game.deserialize(s2));
    eq(s1, s2, `seed ${seed}: the first load changed the save;`);
    eq(s2, s3, `seed ${seed}: a later load changed the save;`);
  }
});

t('a season played with a reload after every week ends exactly where one played straight through does', () => {
  const straight = () => { const G = Game.newGame({ seed: 9, coaches: [{ name: 'A', role: 'both' }] }); for (let i = 0; i < 25; i++) Game.playWeekAuto(G); return G; };
  const reloaded = () => { let G = Game.newGame({ seed: 9, coaches: [{ name: 'A', role: 'both' }] }); for (let i = 0; i < 25; i++) { Game.playWeekAuto(G); G = Game.deserialize(Game.serialize(G)); } return G; };
  const a = straight(); SF.setG(null);
  const b = reloaded();
  eq(State.root(b), State.root(a), 'the two states differ;');
  eq(Game.serialize(b), Game.serialize(a), 'the two saves differ;');
});

t('an edited save is flagged', () => {
  const G = Game.newGame({ seed: 11, coaches: [{ name: 'A', role: 'both' }] });
  Game.playWeekAuto(G);
  const s = Game.serialize(G);
  truthy(!Game.deserialize(s).unverified, 'a clean save was flagged');
  const edited = JSON.parse(s);
  edited.bank.acc[G.coaches[0].club] = 999999999;
  truthy(Game.deserialize(JSON.stringify(edited)).unverified, 'an edited save was not flagged');
});

t('the root covers every part of the state', () => {
  const G = Game.newGame({ seed: 12, coaches: [{ name: 'A', role: 'owner' }] });
  Game.playWeekAuto(G);
  const labels = State.parts(G).map(([l]) => l);
  eq(labels.filter((l) => l.startsWith('club:')).length, Object.keys(G.clubs).length, 'a club is missing from the root;');
  truthy(labels.includes('players:loose'), 'free agents are outside the root');
  truthy(labels.includes('rest'), 'the rest of the state is outside the root');
  // every change we can think of has to move the root
  const moves = {
    'club money': () => B.credit(G, G.clubIds[0], 10, 'gate'),
    'SFOOT': () => B.tcredit(G, 't:1', 10, 'prize'),
    'the week': () => { G.week++; },
    'a coach': () => { G.coaches[0].xp += 1; },
    'the table': () => { G.table[G.clubIds[0]].pts += 1; },
    'a free agent': () => { const id = G.free[0]; if (id) G.players[id].ovr += 1; },
    'the cup': () => { G.cup.round += 1; },
  };
  for (const [what, fn] of Object.entries(moves)) {
    const before = State.root(G);
    fn();
    truthy(State.root(G) !== before, 'changing ' + what + ' did not move the root');
  }
});

t('a save costs a sensible amount of time and space', () => {
  const G = Game.newGame({ seed: 13, coaches: [{ name: 'A', role: 'both' }] });
  Game.simulateSeason(G);
  const t0 = Date.now();
  const s = Game.serialize(G);
  const ms = Date.now() - t0;
  const t1 = Date.now();
  Game.deserialize(s);
  const msLoad = Date.now() - t1;
  console.log(`      (${(s.length / 1024).toFixed(0)} KB, gravar ${ms} ms, carregar ${msLoad} ms)`);
  truthy(ms < 2000, 'saving takes too long: ' + ms + ' ms');
  truthy(msLoad < 2000, 'loading takes too long: ' + msLoad + ' ms');
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
