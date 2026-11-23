/* What the keeper does and, as much, what it leaves alone: a keeper that acts when nothing is due
 * is a keeper that costs gas for nothing, and one that acts twice is asking the contract to say no. */
const SF = require('./load.js');
require('../src/chain.js');
const { plan } = require('../tools/keeper.js');

let pass = 0, fail = 0;
const ok = (n, c, note) => { if (c) { pass++; console.log('  ok  ' + n); } else { fail++; console.log('  FAIL ' + n + (note ? '\n      ' + note : '')); } };

const H = 3600000, T0 = 1800000000000 - (1800000000000 % 86400000);
const lg = (o) => Object.assign({ season: 1, week: 1, t0: T0, kickoffs: [720, 1200], weeks: 50, manual: false,
  seeds: [], seasonFrom: [0], lockBefore: 30, drawBefore: 15, entryFee: 0, entryDue: 3 }, o);
const acts = (l, clubs, now) => plan(l, clubs || [], now).map((a) => a.do).join(',');

const noon = T0 + 12 * H, eight = T0 + 20 * H;
ok('before the whistle there is nothing to do', acts(lg(), [], noon - 60000) === '');
ok('at the whistle the matchday is drawn', acts(lg(), [], noon) === 'draw_week');
ok('long after, still just the one draw', acts(lg(), [], noon + 3 * H) === 'draw_week');
ok('a matchday already drawn is not drawn again', acts(lg({ week: 2, seeds: [7] }), [], noon + 3 * H) === '');
ok('the second matchday waits for its own whistle', acts(lg({ week: 2, seeds: [7] }), [], eight - 60000) === '');
ok('and is drawn at it', acts(lg({ week: 2, seeds: [7] }), [], eight) === 'draw_week');
ok('a season that has run out is turned', acts(lg({ week: 51, seeds: new Array(50).fill(1) }), [], eight + 99 * H) === 'next_season');
ok('the new season counts only its own draws', acts(lg({ season: 2, week: 1, seeds: new Array(50).fill(1), seasonFrom: [0, 50], t0: T0 + 25 * 86400000 }), [], T0 + 25 * 86400000 + 12 * H) === 'draw_week');
ok('by hand the keeper keeps no clock', acts(lg({ manual: true }), [], noon + 99 * H) === '');

/* unpaid clubs are taken back whether or not there is a clock */
const owing = { id: '0xc', num: 4, owner: '0xa', paidFor: 0, takenIn: 1, takenWk: 1 };
const fee = { entryFee: 5e6, entryDue: 3 };
ok('an owner past the deadline loses the club', acts(lg(Object.assign({ week: 5, seeds: [1,2,3,4], manual: true }, fee)), [owing], noon) === 'reclaim');
ok('on the last day to pay he does not', acts(lg(Object.assign({ week: 3, manual: true }, fee)), [owing], noon) === '');
ok('one who paid is left alone', acts(lg(Object.assign({ week: 9, manual: true }, fee)), [Object.assign({}, owing, { paidFor: 1 })], noon) === '');
ok('a club nobody runs is left alone', acts(lg(Object.assign({ week: 9, manual: true }, fee)), [Object.assign({}, owing, { owner: null })], noon) === '');
ok('a league that charges nothing takes nothing back', acts(lg({ week: 9, manual: true }), [owing], noon) === '');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
