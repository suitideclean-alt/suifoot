/* What the sponsor will pay for, and - the point of it - what it will not.
 *
 * A sponsor is a purse with a public door. These are the ways of getting at a purse through a door
 * that is meant to open for football: each is built as a real transaction, the way an attacker
 * would build it, and put to the same judge the service uses. */
require('../vendor/sui-3.0.1.js');
const { judge, limiter, MAX_BUDGET } = require('../tools/sponsor.js');
const { Transaction } = globalThis.SuiSDK;

let pass = 0, fail = 0;
const ok = (n, c, note) => { if (c) { pass++; console.log('  ok  ' + n); } else { fail++; console.log('  FAIL ' + n + (note ? '\n      ' + note : '')); } };

const PKG = '0x' + 'ab'.repeat(32), OTHER = '0x' + 'cd'.repeat(32), SHARED = { objectId: '0x' + '11'.repeat(32), initialSharedVersion: '5', mutable: false };
const me = '0x' + '77'.repeat(32);
const verdict = (build) => { const tx = new Transaction(); build(tx); return judge(tx.getData(), PKG); };

ok('a decision in this game is paid for', verdict((tx) => tx.moveCall({ target: PKG + '::decide::decide', arguments: [tx.sharedObjectRef(SHARED), tx.pure.u8(3)] })).ok);
ok('so is paying an entry fee: cut a coin, hand it over', verdict((tx) => {
  const [c] = tx.splitCoins(tx.object('0x' + '22'.repeat(32)), [tx.pure.u64(5)]);
  tx.moveCall({ target: PKG + '::entry::pay', arguments: [c] });
}).ok);

/* each of these is a way of emptying the sponsor, or using it for something that is not the game */
const no = (n, build) => { const v = verdict(build); ok('refused: ' + n, !v.ok, JSON.stringify(v)); };
no('a call into somebody else\'s package', (tx) => tx.moveCall({ target: OTHER + '::mint::all', arguments: [] }));
no('sending the sponsor\'s own coin to oneself', (tx) => tx.transferObjects([tx.gas], tx.pure.address(me)));
no('cutting a piece off the sponsor\'s coin', (tx) => { const [c] = tx.splitCoins(tx.gas, [tx.pure.u64(1_000_000_000)]); tx.transferObjects([c], tx.pure.address(me)); });
no('paying a game call with the sponsor\'s coin', (tx) => { const [c] = tx.splitCoins(tx.gas, [tx.pure.u64(1)]); tx.moveCall({ target: PKG + '::entry::pay', arguments: [c] }); });
no('merging into the sponsor\'s coin', (tx) => tx.mergeCoins(tx.gas, [tx.object('0x' + '22'.repeat(32))]));
no('a transfer of anything', (tx) => tx.transferObjects([tx.object('0x' + '22'.repeat(32))], tx.pure.address(me)));
no('publishing a package', (tx) => tx.publish({ modules: ['AA=='], dependencies: [] }));
no('nothing at all', () => {});
no('a very long one', (tx) => { for (let i = 0; i < 7; i++) tx.moveCall({ target: PKG + '::decide::decide', arguments: [tx.pure.u8(1)] }); });
ok('a call into this package with the address in capitals is still this package', verdict((tx) => tx.moveCall({ target: PKG.toUpperCase().replace('0X', '0x') + '::decide::decide', arguments: [tx.pure.u8(1)] })).ok);

/* rationing */
let t = 0;
const lim = limiter(() => t);
let allowed = 0; for (let i = 0; i < 100; i++) if (lim.allow('0xa').ok) allowed++;
ok('one person gets sixty an hour, not a hundred', allowed === 60, String(allowed));
ok('somebody else is not held up by him', lim.allow('0xb').ok);
t += 3600001;
ok('and the hour passes', lim.allow('0xa').ok);
ok('the ceiling on one transaction is small', MAX_BUDGET <= 100_000_000, String(MAX_BUDGET));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
