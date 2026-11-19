// Who owns a club, in a form the chain understands. Inside the game a person is a number; on chain
// the owner is an address, and one address holds one club.
const SF = require('./load.js');
const { Game, Id } = SF;

let pass = 0, fail = 0;
const t = (name, fn) => { try { fn(); pass++; console.log('  ok  ' + name); } catch (e) { fail++; console.log('FAIL  ' + name + '\n      ' + e.message); } };
const eq = (a, b, m) => { if (a !== b) throw new Error((m || '') + ` expected ${b} got ${a}`); };
const truthy = (a, m) => { if (!a) throw new Error(m || 'expected truthy'); };

const A1 = '0x' + 'a'.repeat(64);
const A2 = '0x' + 'b'.repeat(64);
const jogo = () => Game.newGame({ seed: 5, coaches: [{ name: 'Dono', role: 'owner' }, { name: 'Treina', role: 'coach' }] });

t('an address is written one way only', () => {
  eq(Id.norm('0x2'), '0x' + '0'.repeat(63) + '2', 'a short address is padded to 32 bytes;');
  eq(Id.norm('0xAbCd'), '0x' + '0'.repeat(60) + 'abcd', 'case is levelled;');
  eq(Id.norm('  ' + A1 + ' '), A1, 'spaces around it are ignored;');
  truthy(Id.same('0x2', '0x' + '0'.repeat(63) + '2'), 'the same address written two ways was read as two');
  eq(Id.short(A1), '0xaaaa…aaaa');
});

t('anything that is not an address is refused', () => {
  for (const v of ['', '0x', 'aaaa', '0xzz', '0x' + 'a'.repeat(65), 42, null, undefined, {}, [], true, '0x 1']) {
    eq(Id.norm(v), null, `accepted ${JSON.stringify(v)};`);
    eq(Id.valid(v), false);
  }
});

t('a person is tied to one address, and an address to one person', () => {
  const G = jogo();
  const [dono, treinador] = G.coaches;
  truthy(Id.bind(G, dono, A1).ok, 'the owner could not be tied to an address');
  eq(dono.addr, A1);
  eq(Id.byAddr(G, '0x' + 'A'.repeat(64)).id, dono.id, 'the address did not find its person however it was written;');
  // the same address cannot be two people
  const r = Id.bind(G, treinador, A1);
  truthy(!r.ok && r.err === 'address_taken', 'two people took the same address: ' + JSON.stringify(r));
  // and a person does not swap identity halfway
  const r2 = Id.bind(G, dono, A2);
  truthy(!r2.ok && r2.err === 'already_bound', 'the owner swapped address: ' + JSON.stringify(r2));
  truthy(Id.bind(G, dono, A1).already, 'binding the same address again should be a no-op');
});

t('a club points at the address of whoever owns it', () => {
  const G = jogo();
  const dono = G.coaches[0], club = G.clubs[dono.club];
  eq(Id.ownerOf(G, club), null, 'a club claimed an address before anyone was tied to one;');
  Id.bind(G, dono, A1);
  eq(Id.ownerOf(G, club), A1, 'the club does not point at its owner address;');
  eq(Id.clubsOf(G, A1).length, 1, 'the address does not hold exactly one club;');
});

t('one address, one club', () => {
  const G = jogo();
  const [dono, outro] = G.coaches;
  Id.bind(G, dono, A1); Id.bind(G, outro, A2);
  const clubeDoOutro = G.clubs[outro.club];
  const r = Id.transfer(G, clubeDoOutro, A1); // A1 already has one
  truthy(!r.ok && r.err === 'one_club_only', 'an address took a second club: ' + JSON.stringify(r));
});

t('a club changes hands by changing address', () => {
  const G = jogo();
  const dono = G.coaches[0], club = G.clubs[dono.club];
  Id.bind(G, dono, A1);
  // somebody new, with no club yet
  const novo = { id: 77, name: 'Novo', role: 'owner', club: null, sk: {}, lineup: {} };
  G.coaches.push(novo);
  Id.bind(G, novo, A2);
  truthy(Id.transfer(G, club, A2).ok, 'the club would not change hands');
  eq(Id.ownerOf(G, club), A2, 'the club still points at the old address;');
  eq(Id.clubsOf(G, A2).length, 1); eq(Id.clubsOf(G, A1).length, 0, 'the old owner kept the club;');
  truthy(!Id.transfer(G, club, '0xnope').ok, 'a club was handed to something that is not an address');
  truthy(!Id.transfer(G, club, '0x' + '9'.repeat(64)).ok, 'a club was handed to an address nobody holds');
});

t('addresses survive a save and the state root covers them', () => {
  const G = jogo();
  Id.bind(G, G.coaches[0], A1);
  const raiz = SF.State.root(G);
  const H = Game.deserialize(Game.serialize(G));
  eq(H.coaches[0].addr, A1, 'the address did not survive the save;');
  eq(Id.ownerOf(H, H.clubs[H.coaches[0].club]), A1);
  // and nobody can change hands quietly
  Id.bind(G, G.coaches[1], A2);
  truthy(SF.State.root(G) !== raiz, 'tying a new address did not change the state root');
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
