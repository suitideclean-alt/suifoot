/* What the screen says is owed must be what the contract would take.
 *
 * The browser works out "does this club owe a fee, and until when" for itself, so that it never
 * offers a payment the contract would refuse or hides one it would accept. The contract's own
 * rules are in move/suifoot/tests/entry_tests.move; these are the same cases, as the screen sees
 * them. If one is changed, both must be. */
const SF = require('./load.js');
require('../src/chain.js');

let pass = 0, fail = 0;
const ok = (n, c, note) => { if (c) { pass++; console.log('  ok  ' + n); } else { fail++; console.log('  FAIL ' + n + (note ? '\n      ' + note : '')); } };
const owes = SF.Chain.owes;
const lg = (o) => Object.assign({ season: 1, week: 1, entryFee: 5e6, entryDue: 3 }, o);
const club = (o) => Object.assign({ owner: '0xa', paidFor: 0, takenIn: 1, takenWk: 1 }, o);

ok('a league with no fee owes nothing', owes(lg({ entryFee: 0 }), club()) === null);
ok('a club nobody runs owes nothing', owes(lg(), club({ owner: null })) === null);
ok('a running club owes the fee', owes(lg(), club()).fee === 5e6);
ok('a paid season is settled', owes(lg(), club({ paidFor: 1 })) === null);
ok('last season paid is not this season paid', owes(lg({ season: 2 }), club({ paidFor: 1, takenIn: 1 })) !== null);

/* the deadline: the league's own, or two matchdays after arriving, whichever is later */
ok('an old club is due at the league\'s matchday', owes(lg({ season: 2, week: 1 }), club({ takenIn: 1 })).by === 3);
ok('a newcomer before the deadline is due at the league\'s matchday', owes(lg(), club({ takenWk: 1 })).by === 3);
ok('a newcomer after the deadline is given two matchdays', owes(lg({ week: 10 }), club({ takenIn: 1, takenWk: 10 })).by === 12);

/* late means the contract would let somebody take it back: strictly after */
ok('on the last day it is not yet late', owes(lg({ week: 3 }), club()).late === false);
ok('the day after it is', owes(lg({ week: 4 }), club()).late === true);
ok('a newcomer is not late on arrival', owes(lg({ week: 10 }), club({ takenIn: 1, takenWk: 10 })).late === false);
ok('and is late once the grace is spent', owes(lg({ week: 13 }), club({ takenIn: 1, takenWk: 10 })).late === true);

/* a league that predates fees reads as no fee, rather than as a broken league */
const old = SF.Chain.league({ season: 1, week: 1, t0: 0, kickoffs: [], lock_before: 30, draw_before: 15, weeks_in_season: 34, bottom_level: 3, series_size: 18, rosters: [] });
ok('an older league has no fee', old.entryFee === 0 && owes(old, club()) === null);

/* the contract keeps these in a struct of their own, which arrives as an object; and a club made before
 * there were any reads as never paid, never taken, no tenure */
const base = { num: 1, name: 'x', level: 3, series: 0, balance: 1, fans: 1, capacity: 1, ticket_cents: 1, squad: [] };
const k = SF.Chain.club(Object.assign({ keeping: { fields: { paid: false, paid_for: '1', taken_in: '1', taken_wk: '4', tenure: '2' } } }, base), '0x1');
ok('the keeping record is read', k.paidFor === 1 && k.takenIn === 1 && k.takenWk === 4 && k.tenure === 2);
const o = SF.Chain.club(base, '0x1');
ok('a club without one reads as untouched', o.paidFor === 0 && o.tenure === 0);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
