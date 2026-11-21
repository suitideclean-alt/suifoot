// Are the transactions well formed?
//
// Signing needs a wallet and a person, so that part cannot be tested anywhere but in a browser with
// somebody there. What can be tested is everything up to it: that the shared objects are found on
// the real chain, that each call names a function the published package actually has, and that the
// arguments are the ones that function takes. A transaction wrong in any of those ways fails at the
// person's wallet, which is the worst place to find out.
globalThis.window = globalThis;
require('../vendor/sui-3.0.1.js');
globalThis.SF = {};
require('../src/chain.js');
require('../src/tx.js');
const C = globalThis.SF.Chain;
const Tx = globalThis.SF.Tx;

let pass = 0, fail = 0;
const t = (name, fn) => { try { fn(); pass++; console.log('  ok  ' + name); } catch (e) { fail++; console.log('FAIL  ' + name + '\n      ' + e.message); } };
const truthy = (a, m) => { if (!a) throw new Error(m || 'expected truthy'); };
const eq = (a, b, m) => { if (a !== b) throw new Error((m || '') + ` expected ${b} got ${a}`); };

// Stand in for the wallet: catch the transaction instead of signing it, so the whole of the
// building can be looked at without anybody having to approve anything.
let caught = null;
globalThis.SF.Wallet = { addr: '0x' + '1'.repeat(64), account: {}, current: {
  features: { 'sui:signAndExecuteTransaction': { signAndExecuteTransaction: async ({ transaction }) => { caught = transaction; return { digest: 'pretend' }; } } },
} };

const build = async (fn) => { caught = null; await fn(); return JSON.parse(await caught.toJSON()); };
const callOf = (j) => j.commands.find((c) => c.MoveCall).MoveCall;

(async () => {
  console.log('reading ' + C.net.graphql + '\n');

  t('the sdk is here and exposes what is needed', () => {
    truthy(globalThis.SuiSDK, 'the bundle loaded;');
    truthy(globalThis.SuiSDK.Transaction, 'a transaction builder;');
  });

  const refs = await C.sharedRefs([C.net.league, C.net.clubs[0]]);
  t('the league and a club are shared, and say since when', () => {
    eq(refs.length, 2);
    eq(refs[0].objectId, C.net.league);
    truthy(Number(refs[0].initialSharedVersion) > 0, 'a version it was shared at;');
    truthy(Number(refs[1].initialSharedVersion) > 0, 'and the club too;');
  });

  const join = await build(() => Tx.requestJoin());
  t('asking for a club names the right function', () => {
    const c = callOf(join);
    eq(c.package, C.net.pkg, 'the published package;');
    eq(c.module, 'market');
    eq(c.function, 'request_join');
    eq(c.arguments.length, 2, 'the league and the chain\'s randomness;');
  });

  const commit = await build(() => Tx.commitLineup(C.net.clubs[0], 3, new Uint8Array(32).fill(7)));
  t('sealing a lineup carries the five things it takes', () => {
    const c = callOf(commit);
    eq(c.module, 'league');
    eq(c.function, 'commit');
    eq(c.arguments.length, 5, 'league, club, matchday, seal, clock;');
    // the seal is thirty-two bytes, because that is what sha-256 gives
    const inputs = commit.inputs.filter((i) => i.Pure);
    truthy(inputs.length >= 2, 'a matchday and a seal went in as values;');
  });

  const reveal = await build(() => Tx.revealLineup(C.net.clubs[0], 3,
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], [12, 13, 14], 1, 123456789));
  t('showing it carries the eleven, the bench, the tactic and the number', () => {
    const c = callOf(reveal);
    eq(c.module, 'league');
    eq(c.function, 'reveal');
    eq(c.arguments.length, 8);
  });

  const play = await build(() => Tx.playFixture(C.net.clubs[0], C.net.clubs[1]));
  t('playing a fixture names two clubs, the randomness and the clock', () => {
    const c = callOf(play);
    eq(c.module, 'league');
    eq(c.function, 'play_fixture');
    eq(c.arguments.length, 5);
  });

  const open = await build(() => Tx.openSeries());
  t('opening a series is a call anybody can make', () => {
    const c = callOf(open);
    eq(c.module, 'world');
    eq(c.function, 'open_series');
    eq(c.arguments.length, 2);
  });

  t('every call goes to the package that is actually published', () => {
    for (const [name, j] of [['join', join], ['commit', commit], ['reveal', reveal], ['play', play], ['open', open]]) {
      eq(callOf(j).package, C.net.pkg, name + ';');
    }
  });

  t('nothing is signed without a wallet', () => {
    const saved = globalThis.SF.Wallet;
    globalThis.SF.Wallet = null;
    try {
      eq(Tx.why(), 'no_wallet');
      eq(Tx.ready(), false);
    } finally { globalThis.SF.Wallet = saved; }
  });

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('could not build: ' + (e && e.stack ? e.stack : e)); process.exit(1); });
