// Sealed lineups: nobody can read yours before the deadline, and nobody can change one after it.
const SF = require('./load.js');
const { Game, Seal, Cal, CFG } = SF;

let pass = 0, fail = 0;
const t = (name, fn) => { try { fn(); pass++; console.log('  ok  ' + name); } catch (e) { fail++; console.log('FAIL  ' + name + '\n      ' + e.message); } };
const eq = (a, b, m) => { if (a !== b) throw new Error((m || '') + ` expected ${b} got ${a}`); };
const truthy = (a, m) => { if (!a) throw new Error(m || 'expected truthy'); };

const QUANDO = Date.UTC(2026, 10, 23);
const monta = () => {
  const G = Game.newGame({ seed: 5, coaches: [{ name: 'A', role: 'both' }] });
  Cal.start(G, QUANDO);
  const club = G.clubs[G.coaches[0].club];
  const onze = Game.players(G, club).filter((p) => p.inj <= 0 && p.sus <= 0).slice(0, 18).map((p) => p.id);
  return { G, club, lineup: { xi: onze.slice(0, 11), bench: onze.slice(11, 18), form: '4-4-2', tactic: 'att' } };
};

t('the seal gives nothing away and changes with the smallest change', () => {
  const { lineup } = monta();
  const a = Seal.make(lineup, 'segredo');
  eq(a.length, 64, 'a seal is a sha-256;');
  eq(Seal.make(lineup, 'segredo'), a, 'the same lineup and number gave two different seals;');
  truthy(Seal.make(lineup, 'outro') !== a, 'the secret number does not change the seal');
  const trocado = JSON.parse(JSON.stringify(lineup)); trocado.tactic = 'def';
  truthy(Seal.make(trocado, 'segredo') !== a, 'changing the tactic does not change the seal');
  const ordem = JSON.parse(JSON.stringify(lineup)); const x = ordem.xi.pop(); ordem.xi.unshift(x);
  truthy(Seal.make(ordem, 'segredo') !== a, 'changing who starts does not change the seal');
});

t('before the deadline only a seal goes in, and the lineup is not in the save', () => {
  const { G, club, lineup } = monta();
  const selo = Seal.make(lineup, '42');
  truthy(Seal.commit(G, club.id, 1, selo, Cal.kickoff(G, 1) - 3600000).ok, 'the seal was refused');
  eq(Seal.state(G, club.id, 1), 'sealed');
  const gravado = Game.serialize(G);
  for (const id of lineup.xi) truthy(!gravado.includes('"xi":[' + id), 'the lineup leaked into the save');
  eq(Seal.lineupFor(G, club.id, 1), null, 'a sealed lineup was readable before the reveal;');
});

t('a seal is refused once the deadline has passed', () => {
  const { G, club, lineup } = monta();
  const selo = Seal.make(lineup, '42'), k = Cal.kickoff(G, 1);
  const r = Seal.commit(G, club.id, 1, selo, k - 29 * 60000); // lineups close 30 minutes before
  truthy(!r.ok && r.err === 'too_late', 'a seal landed after the deadline: ' + JSON.stringify(r));
  for (const mau of ['', 'abc', '0x' + 'a'.repeat(64), 'A'.repeat(64), null, 42, {}]) {
    truthy(!Seal.commit(G, club.id, 1, mau, k - 3600000).ok, 'accepted a seal of ' + JSON.stringify(mau));
  }
});

t('the reveal only counts if it makes the seal that was published', () => {
  const { G, club, lineup } = monta();
  const k = Cal.kickoff(G, 1), antes = k - 3600000, depois = k - 20 * 60000;
  Seal.commit(G, club.id, 1, Seal.make(lineup, '42'), antes);
  truthy(!Seal.reveal(G, club.id, 1, lineup, '42', antes).ok, 'a reveal was taken before the deadline');
  // the wrong secret number
  truthy(!Seal.reveal(G, club.id, 1, lineup, '43', depois).ok, 'a wrong number was accepted');
  // a different lineup under the same seal
  const outro = JSON.parse(JSON.stringify(lineup)); outro.tactic = 'def';
  const r = Seal.reveal(G, club.id, 1, outro, '42', depois);
  truthy(!r.ok && r.err === 'does_not_match', 'a swapped lineup was accepted: ' + JSON.stringify(r));
  // the real one
  truthy(Seal.reveal(G, club.id, 1, lineup, '42', depois).ok, 'the right reveal was refused');
  eq(Seal.state(G, club.id, 1), 'revealed');
  truthy(!Seal.reveal(G, club.id, 1, lineup, '42', depois).ok, 'it was revealed twice');
  truthy(!Seal.reveal(G, club.id, 1, lineup, '42', k + 1000).ok, 'a reveal was taken after the whistle');
});

t('what was revealed is what plays', () => {
  const { G, club, lineup } = monta();
  const k = Cal.kickoff(G, 1);
  Seal.commit(G, club.id, 1, Seal.make(lineup, '42'), k - 3600000);
  Seal.reveal(G, club.id, 1, lineup, '42', k - 20 * 60000);
  const spec = Game.specFor(G, club.id);
  eq(JSON.stringify(spec.xi), JSON.stringify(lineup.xi), 'the engine fielded another eleven;');
  eq(spec.tactic, 'att', 'the engine used another tactic;');
});

t('a revealed lineup is still checked: no borrowed players, no doubles', () => {
  const { G, club } = monta();
  const outroClube = G.clubIds.find((id) => id !== club.id);
  const roubados = G.clubs[outroClube].squad.slice(0, 11);
  const meu = Game.players(G, club).filter((p) => p.inj <= 0 && p.sus <= 0)[0].id;
  const mau = { xi: roubados.concat([meu, meu, meu]), bench: [], form: '4-4-2', tactic: 'bal' };
  const k = Cal.kickoff(G, 1);
  Seal.commit(G, club.id, 1, Seal.make(mau, 'x'), k - 3600000);
  const r = Seal.reveal(G, club.id, 1, mau, 'x', k - 20 * 60000);
  truthy(r.ok, 'the reveal itself should be accepted, the lineup is what gets cleaned: ' + JSON.stringify(r));
  eq(r.lineup.xi.length, 1, 'borrowed players and doubles were not thrown out;');
  eq(r.lineup.xi[0], meu, 'the one player left is not mine;');
});

t('whoever reveals nothing plays as he always would', () => {
  const { G, club, lineup } = monta();
  const semSelo = Game.specFor(G, club.id);
  Seal.commit(G, club.id, 1, Seal.make(lineup, '42'), Cal.kickoff(G, 1) - 3600000);
  const soSelado = Game.specFor(G, club.id);
  eq(JSON.stringify(soSelado.xi), JSON.stringify(semSelo.xi), 'a sealed but unrevealed lineup changed the eleven;');
});

t('the seals are swept once the matchdays are gone', () => {
  const { G, club, lineup } = monta();
  for (const w of [1, 2, 3]) Seal.commit(G, club.id, w, Seal.make(lineup, String(w)), Cal.kickoff(G, w) - 3600000);
  eq(Object.keys(Seal.all(G)).length, 3);
  Seal.sweep(G, 3);
  eq(Object.keys(Seal.all(G)).length, 1, 'the old matchdays were not swept;');
  eq(Seal.state(G, club.id, 3), 'sealed', 'the current matchday was swept away;');
});

t('with no calendar the seals still work, they just have no deadline', () => {
  const G = Game.newGame({ seed: 7, coaches: [{ name: 'A', role: 'both' }] });
  const club = G.clubs[G.coaches[0].club];
  const onze = Game.players(G, club).filter((p) => p.inj <= 0).slice(0, 11).map((p) => p.id);
  const l = { xi: onze, bench: [], form: '4-4-2', tactic: 'def' };
  truthy(Seal.commit(G, club.id, 1, Seal.make(l, 's')).ok, 'an undated game refused a seal');
  truthy(Seal.reveal(G, club.id, 1, l, 's').ok, 'an undated game refused a reveal');
  eq(Game.specFor(G, club.id).tactic, 'def');
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
